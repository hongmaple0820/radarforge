// ============================================================
// /api/ideas/refresh —— AI 刷新灵感（手动触发 / 自动化任务）
// 燃料（按优先级聚合，不再硬依赖雷达+早报）：
//   可选方向 > 雷达话题 > 近期早报标题 > RSS 近期条目标题
// 只做「新增」：与近 7 天池内标题去重，从不修改/删除既有
// 选题（用户手选与历史永不被覆盖）。
// ============================================================

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatRetry } from "@/lib/gateway"
import { extractJson } from "@/lib/runtime/json"
import { getSettings, styleProfilePrompt } from "@/lib/settings"

/** 429 → 人话（配额边界不裸抛堆栈式报错） */
function friendlyError(e: unknown): { message: string; status: number } {
  const msg = (e as Error).message ?? ""
  if (/429|Too many requests/i.test(msg)) {
    return { message: "LLM 配额受限（429）：稍后重试即可——选题燃料与入库链路均正常，仅生成这步在等配额", status: 503 }
  }
  return { message: msg, status: 500 }
}

export async function POST(req: Request) {
  try {
    const t0 = Date.now()
    const body = (await req.json().catch(() => ({}))) as { direction?: string }
    const direction = (body.direction ?? "").trim().slice(0, 120)

    // ---- 燃料聚合（三类，任一非空即可起火）----
    const topics = await db.topic.findMany({ where: { active: true }, take: 8 })
    const reports = await db.report.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { title: true } })
    const rssItems = await db.feedItem.findMany({
      where: { createdAt: { gte: new Date(Date.now() - 3 * 864e5) } },
      orderBy: { createdAt: "desc" },
      take: 15,
      select: { title: true, summary: true, feed: { select: { name: true } } },
    })

    if (!direction && topics.length === 0 && reports.length === 0 && rssItems.length === 0) {
      return NextResponse.json(
        {
          error:
            "灵感刷新缺燃料：加一个雷达话题、生成一份早报、或刷新一次 RSS 信源，任一即可（也可在下方方向框里直接填想写的领域）",
        },
        { status: 400 },
      )
    }

    const s = await getSettings()
    const style = styleProfilePrompt(s.style)

    const system = [
      "你是自媒体选题策划。基于给定情报线索，生成 6 条新鲜选题。",
      style ? `\n【创作者风格定位（选题必须贴合）】\n${style}` : "",
      "要求：",
      "- 每条选题给一个敢表态的角度，不追热点空话",
      "- 标题 ≤30 字，角度一句话说清切入点和反常识之处",
      "- score 为选题潜力 1~10（有区分度，不要全 8 分）",
      "严格输出 JSON（不要 markdown 代码块）：",
      `{ "ideas": [ { "title": "...", "angle": "...", "score": 8 } ] }`,
    ]
      .filter(Boolean)
      .join("\n")

    const user = [
      direction ? `【指定方向】\n${direction}（选题须围绕该方向展开）` : "",
      topics.length > 0 ? `【雷达话题（创作者持续关注的领域）】\n${topics.map((t) => `- ${t.name}${t.keywords ? `（${t.keywords}）` : ""}`).join("\n")}` : "",
      reports.length > 0 ? `【近期早报标题（已覆盖的情报，避免撞题）】\n${reports.map((r) => `- ${r.title}`).join("\n")}` : "",
      rssItems.length > 0
        ? `【RSS 近期条目（最新行业动态，可提炼但要换角度）】\n${rssItems.map((i) => `- ${i.title}${i.summary ? `｜${i.summary.slice(0, 60)}` : ""}`).join("\n")}`
        : "",
      "请生成 6 条不与上述重复的新选题。",
    ]
      .filter(Boolean)
      .join("\n\n")

    // temperature 0.85 偶发整体非 JSON 输出 → 降温重试一次（0.7 → 0.3 保守档）
    let parsed: { ideas?: { title?: string; angle?: string; score?: number }[] } | null = null
    for (const temp of [0.7, 0.3]) {
      const raw = await chatRetry(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: temp },
      )
      parsed = extractJson<{ ideas?: { title?: string; angle?: string; score?: number }[] }>(raw)
      if (parsed?.ideas?.length) break
    }
    const ideas = (parsed?.ideas ?? [])
      .map((x) => ({
        title: String(x.title ?? "").trim().slice(0, 120),
        angle: String(x.angle ?? "").trim().slice(0, 300),
        score: Math.min(10, Math.max(1, Number(x.score) || 0)),
      }))
      .filter((x) => x.title.length > 4)
      .slice(0, 6)

    if (ideas.length === 0) {
      return NextResponse.json({ error: "本次未生成有效选题（LLM 返回解析失败），请重试" }, { status: 502 })
    }

    // 去重：与近 7 天选题池标题高重复的跳过（只新增，不动既有）
    const recent = await db.idea.findMany({ where: { createdAt: { gte: new Date(Date.now() - 7 * 864e5) } }, select: { title: true } })
    const seen = new Set(recent.map((r) => r.title))
    const fresh = ideas.filter((x) => !seen.has(x.title))
    if (fresh.length === 0) {
      return NextResponse.json({ created: 0, message: "本次生成的选题与池内高度重复，已跳过（宁缺毋滥）" })
    }

    // 关联到第一个话题（有则）
    const topicId = topics[0]?.id ?? null
    await db.idea.createMany({ data: fresh.map((x) => ({ ...x, status: "new", source: "ai", topicId })) })

    return NextResponse.json({
      created: fresh.length,
      skipped: ideas.length - fresh.length,
      fuels: { direction: direction || undefined, topics: topics.length, reports: reports.length, rss: rssItems.length },
      ideas: fresh,
      latencyMs: Date.now() - t0,
      message: `AI 刷新完成：新增 ${fresh.length} 条选题${fresh.length < ideas.length ? `（${ideas.length - fresh.length} 条重复跳过）` : ""}——只新增不覆盖，池内既有选题不受影响`,
    })
  } catch (e) {
    const { message, status } = friendlyError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
