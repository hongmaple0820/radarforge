import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatRetry, searchWithFallback } from "@/lib/gateway"

// ---------- GET: 列表 / 详情 ----------
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (id) {
    const report = await db.report.findUnique({ where: { id }, include: { claims: true, topic: true } })
    if (!report) return NextResponse.json({ error: "报告不存在" }, { status: 404 })
    return NextResponse.json({ report })
  }
  const reports = await db.report.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    include: { topic: true, _count: { select: { claims: true } } },
  })
  return NextResponse.json({ reports })
}

// ---------- POST: 生成早报 ----------
// 方向三选一：topicId（点话题）> query（自由方向）> 都空 → AI 自主链
// 自主链：雷达话题关键词聚合 → RSS 近期热点作补充证据 → 泛方向兜底
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { topicId?: string; query?: string; count?: number }

    // 1) 确定检索词：话题关键词 > 话题名 > 直接 query
    let query = (body.query ?? "").trim()
    let topicId: string | null = null
    let topicName = ""
    if (body.topicId) {
      const topic = await db.topic.findUnique({ where: { id: body.topicId } })
      if (topic) {
        topicId = topic.id
        topicName = topic.name
        query = (topic.keywords || topic.name).split(/[，,、\s]+/).slice(0, 3).join(" ")
      }
    }

    // 2) AI 自主模式（无 topicId 且无 query）
    let autonomous = false
    let rssHits: { title: string; site: string; date: string; summary: string }[] = []
    if (!query) {
      autonomous = true
      const activeTopics = await db.topic.findMany({ where: { active: true }, take: 5 })
      if (activeTopics.length > 0) {
        // 雷达话题关键词聚合（创作者兴趣即方向）
        topicName = activeTopics.map((t) => t.name).join("、").slice(0, 60)
        query = activeTopics
          .flatMap((t) => (t.keywords || t.name).split(/[，,、\s]+/).filter(Boolean))
          .slice(0, 4)
          .join(" ")
      } else {
        query = "AI 大模型 最新进展"
      }
      // RSS 近期热点作为补充证据（真实动态喂给编辑，不额外耗 LLM）
      const items = await db.feedItem.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 2 * 864e5) } },
        orderBy: { createdAt: "desc" },
        take: 10,
        include: { feed: { select: { name: true } } },
      })
      rssHits = items.map((i) => ({ title: i.title, site: i.feed.name, date: i.publishedAt ? new Date(i.publishedAt).toISOString().slice(0, 10) : "", summary: i.summary.slice(0, 160) }))
    }

    // 3) 检索（网关降级链）
    const search = await searchWithFallback({ query, count: body.count ?? 8 })

    // 4) LLM 生成早报（[n] 引用契约）
    const evidence = search.results
      .map((r, i) => `[${i + 1}] ${r.title}｜${r.site}｜${r.date}\n    ${r.passage.slice(0, 220)}`)
      .join("\n")
    const system = [
      `你是一名专业的 AI 资讯早报编辑。基于下方检索证据，为自媒体创作者生成一份「AI 资讯早报」。`,
      `格式要求（Markdown）：`,
      `# 早报标题（抓眼球但不标题党）`,
      `## 今日要闻`,
      `3-5 条要闻，每条：**小标题** + 2-3 句话摘要 + 结尾标注 [n] 引用编号`,
      `## 编辑点评`,
      `一段 2-3 句话：指出对创作者的选题机会`,
      `硬性规则：`,
      `- 每条要闻必须至少一个 [n] 编号，编号对应证据块，禁止编造`,
      `- 证据不足的地方写「据证据不足，待核实」，不要脑补数据`,
      `- mode=DEMO 时在文末加一行说明「⚠ 本期基于演示数据生成（上游检索降级）」`,
    ].join("\n")
    const user = [
      autonomous ? `本期为 AI 自主选题（未指定方向）：从证据里挑最有信息量的角度组织早报` : `话题：${topicName || query}`,
      `检索词：${query}（provider=${search.provider}，mode=${search.mode}）`,
      ``,
      `检索证据：`,
      evidence,
      ...(rssHits.length > 0
        ? [
            ``,
            `RSS 近期热点（选题氛围参考，不作为 [n] 证据）：`,
            rssHits.map((h) => `- ${h.title}（${h.site}${h.date ? ` · ${h.date}` : ""}）`).join("\n"),
          ]
        : []),
    ].join("\n")

    const content = await chatRetry(
      [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      { temperature: 0.5 },
    )
    if (!content) throw new Error("LLM 返回空内容")

    // 4) 解析 [n] → claims 账本落库
    const report = await db.report.create({
      data: {
        topicId,
        title: content.match(/^#\s+(.+)$/m)?.[1]?.slice(0, 120) ?? `${topicName || query} · AI 早报`,
        content,
        mode: search.mode,
        provider: search.provider,
      },
    })
    const seen = new Set<number>()
    for (const m of content.matchAll(/([^\n]{0,80})\[(\d{1,2})\]/g)) {
      const idx = Number(m[2])
      if (idx >= 1 && idx <= search.results.length && !seen.has(idx)) {
        seen.add(idx)
        const r = search.results[idx - 1]
        await db.claim.create({
          data: {
            reportId: report.id,
            idx,
            quote: m[1].trim().slice(-60),
            sourceTitle: r.title,
            sourceUrl: r.url,
            sourceSite: r.site,
            sourceDate: r.date,
            kind: "FACT",
          },
        })
      }
    }

    const full = await db.report.findUnique({ where: { id: report.id }, include: { claims: true } })
    return NextResponse.json({
      report: full,
      searchMode: search.mode,
      provider: search.provider,
      evidenceCount: search.results.length,
      autonomous,
      query,
      message: autonomous ? `AI 自主选题（方向：${query}）` : undefined,
    })
  } catch (e) {
    const msg = (e as Error).message ?? ""
    // 429 → 人话（配额边界不裸抛）
    if (/429|Too many requests/i.test(msg)) {
      return NextResponse.json({ error: "LLM 配额受限（429）：稍后重试即可——检索与证据链路正常，仅撰写这步在等配额" }, { status: 503 })
    }
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
