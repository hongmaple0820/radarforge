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

// ---------- PATCH：启用/停用源 ----------
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; active?: boolean }
    if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
    const feed = await db.sourceFeed.update({ where: { id: body.id }, data: { active: body.active ?? true } })
    return NextResponse.json({ feed })
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
