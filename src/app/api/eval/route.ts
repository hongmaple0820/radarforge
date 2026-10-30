import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { EVAL_TOPICS, evalTopicsMeta } from "@/lib/runtime/eval-topics"
import { scoreArticleRun } from "@/lib/runtime/eval"

// GET /api/eval —— 评测集题库 + 元信息 + 最近评分记录
export async function GET() {
  try {
    const recent = await db.asset.findMany({
      where: { role: "eval-score" },
      orderBy: { createdAt: "desc" },
      take: 20,
    })
    return NextResponse.json({
      topics: EVAL_TOPICS,
      meta: evalTopicsMeta(),
      recentScores: recent.map((a) => ({
        runId: a.runId,
        at: a.createdAt,
        provider: a.provider,
        ...(JSON.parse(a.meta || "{}") as Record<string, unknown>),
      })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/eval —— { action: "score", runId } 对已完成 run 做 G-Eval 式评分
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; runId?: string }
    if (body.action !== "score" || !body.runId) {
      return NextResponse.json({ error: "参数：{ action: \"score\", runId }" }, { status: 400 })
    }
    const result = await scoreArticleRun(body.runId)
    return NextResponse.json({ result })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
