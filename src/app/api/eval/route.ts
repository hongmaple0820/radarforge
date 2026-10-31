import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { EVAL_TOPICS, evalTopicsMeta } from "@/lib/runtime/eval-topics"
import { scoreArticleRun } from "@/lib/runtime/eval"
import { PROMPT_VARIANTS, resolveTuneInstruction, applyVariant, clearTune, aggregateTuneReport } from "@/lib/runtime/tune"

// GET /api/eval —— 评测集题库 + 元信息 + 最近评分 + 调优状态（P1 p15）
export async function GET() {
  try {
    const recent = await db.asset.findMany({
      where: { role: "eval-score" },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
    const tune = await resolveTuneInstruction()
    return NextResponse.json({
      topics: EVAL_TOPICS,
      meta: evalTopicsMeta(),
      recentScores: recent.map((a) => ({
        runId: a.runId,
        at: a.createdAt,
        provider: a.provider,
        ...(JSON.parse(a.meta || "{}") as Record<string, unknown>),
      })),
      tune: {
        active: tune,
        variants: PROMPT_VARIANTS.map((v) => ({ key: v.key, label: v.label, hypothesis: v.hypothesis, instructionPreview: v.instruction.slice(0, 80) })),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/eval —— score 评分 ｜ tune-apply 应用变体 ｜ tune-clear 回基线 ｜ tune-aggregate 聚合报告
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; runId?: string; variantKey?: string; note?: string; scores?: unknown; topics?: unknown }
    if (body.action === "score") {
      if (!body.runId) return NextResponse.json({ error: "参数：{ action: \"score\", runId }" }, { status: 400 })
      const result = await scoreArticleRun(body.runId)
      return NextResponse.json({ result })
    }
    if (body.action === "tune-apply") {
      if (!body.variantKey) return NextResponse.json({ error: "参数：{ action: \"tune-apply\", variantKey }" }, { status: 400 })
      const tune = await applyVariant(body.variantKey, body.note)
      return NextResponse.json({ tune, message: `已应用变体 ${body.variantKey}（后续 run 的初稿指令即生效；v0 = 回基线）` })
    }
    if (body.action === "tune-clear") {
      await clearTune()
      return NextResponse.json({ message: "已清除调优，回到 v0 基线" })
    }
    if (body.action === "tune-aggregate") {
      const report = aggregateTuneReport({ topics: (body.topics as string[]) ?? [], scores: (body.scores as { variant: string; runId: string; topicId: string; average: number; scores: Record<string, number>; wordCount: number }[]) ?? [] })
      return NextResponse.json({ report })
    }
    return NextResponse.json({ error: "参数：{ action: \"score\" | \"tune-apply\" | \"tune-clear\" | \"tune-aggregate\" }" }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
