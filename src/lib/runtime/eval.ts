// ============================================================
// eval.ts —— 固定评测集评分引擎（P0 质量管线 L5 度量层）
// 学 G-Eval（2303.16634）：CoT + 分维度量表打分，替代 ROUGE 类
// 表面重叠指标；裁判尽量换 LLM 家族（自我偏好对策）。
// 「先建度量，再动刀」——一切 prompt 调优都以此为回归基线。
// ============================================================

import { db } from "@/lib/db"
import { chatRetry, chatVia, pickCrossFamilyReviewer, resolveDraftLlmName } from "@/lib/gateway"
import type { ChatMessage } from "@/lib/gateway/types"
import { extractJson } from "./json"
import { parseReview, DIMS, type Review } from "./skills/radar-review"
import { assertionStats, type AssertionStats } from "./skills/radar-verify"
import { getPersona } from "./skills/radar-write"

export interface EvalScores {
  accuracy: number
  viewpoint: number
  usefulness: number
  voice: number
  readability: number
}

export interface EvalComment {
  dim: string
  comment: string
}

export interface EvalScoreResult {
  runId: string
  ideaTitle: string
  mode: string // REAL | DEMO（搜索模式，如实记录）
  wordCount: number
  version: number
  scores: EvalScores
  comments: EvalComment[]
  average: number
  judge: { provider: string; crossFamily: boolean; note: string }
  assertions: AssertionStats | null // 原子断言核验统计（verify 步骤产物）
  illustrations: { planned: number; inserted: number } | null
  reviewAverage: number | null // 流水线内审稿均分（对照）
  gate: { pass: boolean; target: number; gaps: string[] }
}

export const EVAL_TARGET_AVERAGE = 8.0 // P0 验收目标：评测集五维均分 ≥8.0

/** G-Eval 式评分 prompt：锚定量表 + 反偏差指令 + CoT 内化 */
export function gevalMessages(input: {
  markdown: string
  ideaTitle: string
  personaLabel: string
  briefSummary: string
}): ChatMessage[] {
  const anchor = DIMS.map((d) => `- ${d.label}：${d.ask}`).join("\n")
  return [
    {
      role: "system",
      content: [
        "你是独立的内容质量评测员（G-Eval 式多维量表）。对照评分锚点逐步分析后打分，评分要有区分度。",
        "",
        "【评分锚点（0-10，允许小数）】",
        "9~10：该维度达到可直接付费订阅的专业水准，几乎无可挑剔",
        "8~8.9：优秀，仅有微小瑕疵，不需要修改即可发布",
        "7~7.9：合格，有明确但可修复的问题",
        "6~6.9：勉强及格，问题明显",
        "<6：不合格，该维度构成阅读障碍或可信度风险",
        "",
        "【维度定义】",
        anchor,
        `人格设定：${input.personaLabel}（voice 维度对照此标准）`,
        "",
        "【反偏差指令】",
        "- 不要把分数聚在 7 附近装稳重；好就是 8+，差就低于 7",
        "- 不要因篇幅长而加分；不要因小节多而加分——看内容密度与推进",
        "- 发现编造来源、无据数字、虚构事件：accuracy 直接 ≤4",
        "严格输出 JSON（不要 markdown 代码块、不要输出分析过程）：",
        `{`,
        `  "scores": { "accuracy": 0, "viewpoint": 0, "usefulness": 0, "voice": 0, "readability": 0 },`,
        `  "comments": [`,
        ...DIMS.map((d) => `    { "dim": "${d.label}", "comment": "一句话：最具体的优点或问题" },`),
        `  ]`,
        `}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `选题：${input.ideaTitle}`,
        input.briefSummary ? `任务书摘要：${input.briefSummary.slice(0, 400)}` : "",
        "",
        input.markdown.slice(0, 12000),
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]
}

function briefSummaryOf(brief: Record<string, unknown> | null): string {
  if (!brief) return ""
  const parts = [brief.targetReader, brief.coreJudgment, brief.realProblem]
    .map((x) => String(x ?? ""))
    .filter(Boolean)
  return parts.join("｜").slice(0, 400)
}

/** 对一个已完成 run 做 G-Eval 式评分（含断言统计与门禁判定） */
export async function scoreArticleRun(runId: string): Promise<EvalScoreResult> {
  const run = await db.agentRun.findUnique({
    where: { id: runId },
    include: {
      articles: { orderBy: { version: "asc" } },
      reviews: { orderBy: { round: "asc" } },
      assets: { where: { role: "inline" } },
    },
  })
  if (!run || run.kind !== "article") throw new Error("run 不存在或不是图文线 run")
  const latest = run.articles[run.articles.length - 1]
  if (!latest?.markdown) throw new Error("没有可评分的成稿")

  let artifacts: Record<string, unknown> = {}
  try {
    artifacts = JSON.parse(run.artifacts || "{}") as Record<string, unknown>
  } catch {
    /* ignore */
  }
  const brief = (artifacts.brief ?? null) as Record<string, unknown> | null
  const persona = getPersona(run.persona)

  // 裁判换家族（写作家族 → 评测家族；回退后如实改标，绝不冒充跨家族）
  const draftName = resolveDraftLlmName()
  const reviewer = pickCrossFamilyReviewer(draftName)
  let judgeUsed = reviewer.provider
  let judgeCross = reviewer.crossFamily

  let review: Review | null = null
  for (const temp of [0.2, 0.1]) {
    const msgs = gevalMessages({
      markdown: latest.markdown,
      ideaTitle: run.ideaTitle,
      personaLabel: persona.label,
      briefSummary: briefSummaryOf(brief),
    })
    let raw: string
    if (reviewer.crossFamily && judgeCross) {
      raw = await chatVia(reviewer.provider, msgs, { temperature: temp }).catch(() => {
        judgeUsed = draftName
        judgeCross = false // 裁判家族故障 → 回退主链路，如实改标
        return chatRetry(msgs, { temperature: temp })
      })
    } else {
      raw = await chatRetry(msgs, { temperature: temp })
    }
    review = parseReview(extractJson(raw))
    if (review) break
  }
  if (!review) throw new Error("G-Eval 评分解析失败（两档温度重试后仍不合格式）")

  // 原子断言统计（verify 步骤产物，artifacts.assertions）
  const a = (artifacts.assertions ?? null) as { total?: number; verified?: number; gateBlocked?: boolean } | null
  const assertions =
    a && typeof a.total === "number" && typeof a.verified === "number"
      ? assertionStats(a.verified, a.total)
      : null

  const illus = (artifacts.illustrations ?? null) as { planned?: number; inserted?: number } | null
  const illustrations = illus ? { planned: Number(illus.planned ?? 0), inserted: Number(illus.inserted ?? 0) } : null

  const reviewAverage = run.reviews.length > 0 ? run.reviews[run.reviews.length - 1].average : null

  // 门禁：对照 P0 目标（五维均分 ≥8.0；最低维不低于 7）
  const gaps: string[] = []
  if (review.average < EVAL_TARGET_AVERAGE) gaps.push(`五维均分 ${review.average} < 目标 ${EVAL_TARGET_AVERAGE}`)
  for (const d of DIMS) {
    if (review.scores[d.key] < 7) gaps.push(`${d.label} ${review.scores[d.key]} < 7`)
  }
  if (assertions?.gateBlocked) gaps.push(`断言无据率 ${(assertions.unsupportedRate * 100).toFixed(0)}% > ${(assertions.threshold * 100).toFixed(0)}%`)

  const result: EvalScoreResult = {
    runId,
    ideaTitle: run.ideaTitle,
    mode: run.mode,
    wordCount: latest.wordCount,
    version: latest.version,
    scores: review.scores,
    comments: review.comments,
    average: review.average,
    judge: { provider: judgeUsed, crossFamily: judgeCross, note: judgeCross ? reviewer.note : `裁判 ${reviewer.provider} 调用失败 → 回退 ${draftName}（同家族）` },
    assertions,
    illustrations,
    reviewAverage,
    gate: { pass: gaps.length === 0, target: EVAL_TARGET_AVERAGE, gaps },
  }

  // 留痕（Asset，失败不阻断评分返回）
  await db.asset
    .create({
      data: {
        runId,
        kind: "text",
        role: "eval-score",
        provider: `geval:${judgeUsed}${judgeCross ? "(跨家族)" : "(同家族)"}`,
        path: "",
        meta: JSON.stringify({
          average: review.average,
          scores: review.scores,
          gate: result.gate,
          assertions: result.assertions,
          version: latest.version,
          wordCount: latest.wordCount,
        }),
      },
    })
    .catch(() => {})

  return result
}
