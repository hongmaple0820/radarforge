import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { ensureDefaultFeeds, refreshFeeds, promoteItemToIdea } from "@/lib/sources/rss"

export const dynamic = "force-dynamic"

// ---------- GET：源列表 + 统计 + 最近条目（首次访问自动播种默认源） ----------
export async function GET() {
  const added = await ensureDefaultFeeds()
  const feeds = await db.sourceFeed.findMany({
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
    include: { _count: { select: { items: true } } },
  })
  const items = await db.feedItem.findMany({
    where: { status: "new" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { feed: { select: { name: true, category: true } } },
  })
  const okCount = feeds.filter((f) => f.lastStatus === "ok").length
  return NextResponse.json({
    feeds,
    items,
    stats: {
      total: feeds.length,
      active: feeds.filter((f) => f.active).length,
      ok: okCount,
      error: feeds.filter((f) => f.lastStatus === "error").length,
      pending: feeds.filter((f) => f.lastStatus === "pending").length,
      items: await db.feedItem.count(),
      promoted: await db.feedItem.count({ where: { status: "promoted" } }),
      seededNow: added,
    },
  })
}

// ---------- POST：refresh（全量刷新）/ promote（转选题）/ add（加源） ----------
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; itemId?: string; name?: string; url?: string; category?: string; limit?: number }
    const action = body.action ?? "refresh"

    if (action === "refresh") {
      const results = await refreshFeeds({ limit: body.limit && body.limit > 0 ? body.limit : undefined })
      const inserted = results.reduce((s, r) => s + r.inserted, 0)
      return NextResponse.json({
        results,
        summary: {
          feeds: results.length,
          ok: results.filter((r) => r.status === "ok").length,
          error: results.filter((r) => r.status === "error").length,
          inserted,
          stale: results.reduce((s, r) => s + r.stale, 0),
          known: results.reduce((s, r) => s + r.known, 0),
          duplicates: results.reduce((s, r) => s + r.duplicates, 0),
        },
        message: `${results.length} 个源已刷新：新增 ${inserted} 条（${results.filter((r) => r.status === "error").length} 个源失败已留痕）`,
      })
    }

    if (action === "promote") {
      if (!body.itemId) return NextResponse.json({ error: "itemId 不能为空" }, { status: 400 })
      const out = await promoteItemToIdea(body.itemId)
      return NextResponse.json({ ...out, message: `已转选题：「${out.title.slice(0, 40)}」` })
    }

    if (action === "add") {
      const name = (body.name ?? "").trim()
      const url = (body.url ?? "").trim()
      if (!name || !url) return NextResponse.json({ error: "name 和 url 不能为空" }, { status: 400 })
      if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "url 必须以 http(s):// 开头" }, { status: 400 })
      const exists = await db.sourceFeed.findUnique({ where: { url } })
      if (exists) return NextResponse.json({ error: "该源已存在" }, { status: 400 })
      const feed = await db.sourceFeed.create({
        data: { name: name.slice(0, 60), url: url.slice(0, 500), category: (body.category ?? "自定义").slice(0, 20) },
      })
      return NextResponse.json({ feed, message: "已添加，点「刷新全部」验证连通性" })
    }

    return NextResponse.json({ error: `未知 action：${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// ---------- PATCH：启停 / 编辑源（P0-2 子集更新） ----------
// body: { id, active? }                          → 启停（原有语义）
// body: { id, name? / url? / category? / proxyUrl? } → 编辑任意子集
//   - url 变更：保留 http(s) 前缀 + 查重校验，更新后触发一次定向重抓验证
//     （复用 refreshFeeds 的 feedIds 定向刷新；失败不阻断保存，仅在 recheck 留痕）
//   - proxyUrl：空串 = 清除按源代理；非空须 http(s):// 前缀
//   - 历史条目全部保留（对比删除重建的级联丢失）
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as {
      id?: string
      active?: boolean
      name?: string
      url?: string
      category?: string
      proxyUrl?: string
    }
    if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
    const existing = await db.sourceFeed.findUnique({ where: { id: body.id } })
    if (!existing) return NextResponse.json({ error: "源不存在（可能已删除，请刷新列表）" }, { status: 404 })

    // ---- 启停（原有语义，无编辑字段时走此分支） ----
    const hasEdit = ["name", "url", "category", "proxyUrl"].some((k) => body[k as keyof typeof body] !== undefined)
    if (!hasEdit) {
      if (typeof body.active !== "boolean") {
        return NextResponse.json({ error: "没有可更新字段（active 或 name/url/category/proxyUrl 至少其一）" }, { status: 400 })
      }
      const feed = await db.sourceFeed.update({ where: { id: body.id }, data: { active: body.active } })
      return NextResponse.json({ feed })
    }

    // ---- 编辑（子集更新；启停与编辑可并存） ----
    const data: { active?: boolean; name?: string; url?: string; category?: string; proxyUrl?: string } = {}
    if (typeof body.active === "boolean") data.active = body.active

    if (body.name !== undefined) {
      const name = body.name.trim()
      if (!name) return NextResponse.json({ error: "名称不能为空" }, { status: 400 })
      data.name = name.slice(0, 60)
    }

    let urlChanged = false
    if (body.url !== undefined) {
      const url = body.url.trim()
      if (!url) return NextResponse.json({ error: "url 不能为空" }, { status: 400 })
      if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: "url 必须以 http(s):// 开头" }, { status: 400 })
      if (url !== existing.url) {
        const dup = await db.sourceFeed.findUnique({ where: { url } })
        if (dup && dup.id !== body.id) return NextResponse.json({ error: "该 url 已被其他源使用" }, { status: 400 })
        data.url = url.slice(0, 500)
        urlChanged = true
      }
    }

    if (body.category !== undefined) data.category = body.category.trim().slice(0, 20) || "自定义"

    if (body.proxyUrl !== undefined) {
      const proxy = body.proxyUrl.trim()
      if (proxy && !/^https?:\/\//i.test(proxy)) {
        return NextResponse.json({ error: "代理地址必须以 http(s):// 开头（如 http://127.0.0.1:7890），留空则清除" }, { status: 400 })
      }
      data.proxyUrl = proxy.slice(0, 300)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "没有实际变更（与现有值相同）" }, { status: 400 })
    }

    const feed = await db.sourceFeed.update({ where: { id: body.id }, data })

    // ---- url 变更 → 定向重抓验证（不阻断保存，结果进 recheck） ----
    let recheck: { status: string; fetched: number; error: string } | undefined
    if (urlChanged) {
      try {
        const [r] = await refreshFeeds({ feedIds: [body.id], perFeedTimeoutMs: 15_000 })
        recheck = r
          ? { status: r.status, fetched: r.fetched, error: r.error }
          : { status: "skipped", fetched: 0, error: "源已停用，未重抓（启用后再验证）" }
      } catch (e) {
        recheck = { status: "error", fetched: 0, error: (e as Error).message.slice(0, 160) }
      }
    }

    return NextResponse.json({
      feed,
      ...(recheck ? { recheck } : {}),
      message: urlChanged
        ? recheck?.status === "ok"
          ? `已保存并重抓验证：抓到 ${recheck.fetched} 条（历史条目全部保留）`
          : `已保存（历史条目保留）；新地址重抓未成功：${recheck?.error?.slice(0, 80) ?? "未知"}——可点「刷新全部」重试`
        : "已保存（历史条目全部保留）",
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// ---------- DELETE：删源（级联删条目） ----------
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
  await db.sourceFeed.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
