// ============================================================
// /api/ideas/refresh —— AI 刷新灵感（手动触发）
// 雷达话题 + 近期早报标题 + 风格定位 → LLM 生成新选题入池
// ============================================================

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatRetry } from "@/lib/gateway"
import { extractJson } from "@/lib/runtime/json"
import { getSettings, styleProfilePrompt } from "@/lib/settings"

export async function POST() {
  try {
    const t0 = Date.now()
    const topics = await db.topic.findMany({ where: { active: true }, take: 8 })
    const reports = await db.report.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { title: true } })
    const s = await getSettings()
    const style = styleProfilePrompt(s.style)

    if (topics.length === 0 && reports.length === 0) {
      return NextResponse.json({ error: "还没有雷达话题和早报——先在「雷达」页添加话题并生成一份早报，灵感刷新才有燃料" }, { status: 400 })
    }

    const system = [
      "你是自媒体选题策划。基于雷达监测话题与近期情报，生成 6 条新鲜选题。",
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
      topics.length > 0 ? `【雷达话题】\n${topics.map((t) => `- ${t.name}${t.keywords ? `（${t.keywords}）` : ""}`).join("\n")}` : "",
      reports.length > 0 ? `【近期早报标题】\n${reports.map((r) => `- ${r.title}`).join("\n")}` : "",
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

    // 去重：与近 7 天选题池标题高重复的跳过
    const recent = await db.idea.findMany({ where: { createdAt: { gte: new Date(Date.now() - 7 * 864e5) } }, select: { title: true } })
    const seen = new Set(recent.map((r) => r.title))
    const fresh = ideas.filter((x) => !seen.has(x.title))
    if (fresh.length === 0) {
      return NextResponse.json({ created: 0, message: "本次生成的选题与池内高度重复，已跳过（宁缺毋滥）" })
    }

    // 关联到第一个话题（有则）
    const topicId = topics[0]?.id ?? null
    await db.idea.createMany({ data: fresh.map((x) => ({ ...x, status: "new", topicId })) })

    return NextResponse.json({
      created: fresh.length,
      skipped: ideas.length - fresh.length,
      ideas: fresh,
      latencyMs: Date.now() - t0,
      message: `AI 刷新完成：新增 ${fresh.length} 条选题${fresh.length < ideas.length ? `（${ideas.length - fresh.length} 条重复跳过）` : ""}`,
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
