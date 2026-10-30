// ============================================================
// radar-review —— 五维审稿 skill（学 wewrite 编辑飞轮）
// 准确 / 观点 / 有用 / 合声 / 好读，JSON 评分
// P0 升级：跨家族审稿 ≤2 轮 + 成对比较裁决（防「越改越差」）
// —— LLM-as-a-Judge 综述（2411.15594）的三个系统性偏差对策：
//    自我偏好 → 裁判换供应商家族；位置偏差 → A/B 交换位置各评一次；
//    过度修改漂移 → 修订上限 2 轮 + 成对比较只在接受修订更优时通过
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"

export interface ReviewScores {
  accuracy: number // 准确：事实与来源
  viewpoint: number // 观点：判断力与锋利度
  usefulness: number // 有用：可操作性
  voice: number // 合声：与人格一致
  readability: number // 好读：行文节奏
}

export interface Review {
  scores: ReviewScores
  comments: { dim: string; comment: string }[]
  average: number
}

const DIMS: { key: keyof ReviewScores; label: string; ask: string }[] = [
  { key: "accuracy", label: "准确", ask: "事实是否有来源支撑、有无编造或过度推断" },
  { key: "viewpoint", label: "观点", ask: "是否有清晰敢表态的判断，还是和稀泥" },
  { key: "usefulness", label: "有用", ask: "读者读完能带走什么" },
  { key: "voice", label: "合声", ask: "文风与人格设定是否一致" },
  { key: "readability", label: "好读", ask: "节奏、句长、小节切分是否舒适" },
]

export function reviewMessages(markdown: string, personaLabel: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是一名严格的技术编辑，按五个维度给文章打分（0-10，允许小数）。评分要有区分度，不要全给 7。",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{`,
        `  "scores": { "accuracy": 0, "viewpoint": 0, "usefulness": 0, "voice": 0, "readability": 0 },`,
        `  "comments": [`,
        ...DIMS.map((d) => `    { "dim": "${d.label}", "comment": "一句话意见，指出最具体的问题" },`),
        `  ]`,
        `}`,
        `维度定义：`,
        ...DIMS.map((d) => `- ${d.label}：${d.ask}`),
        `人格设定：${personaLabel}（voice 维度对照此标准）`,
      ].join("\n"),
    },
    { role: "user", content: markdown.slice(0, 9000) },
  ]
}

export function reviseMessages(markdown: string, review: Review): ChatMessage[] {
  const problems = review.comments
    .filter((c) => review.scores[c.dim as keyof ReviewScores] !== undefined && review.scores[c.dim as keyof ReviewScores] < 8)
    .map((c) => `${c.dim}（${review.scores[c.dim as keyof ReviewScores]}/10）：${c.comment}`)
    .join("\n")
  return [
    {
      role: "system",
      content:
        "你是原文作者本人。按审稿意见修订文章：只改有问题的地方，保持整体结构与文风稳定，保留所有 [n] 引用。输出修订后的完整 Markdown（不要解释、不要 diff）。",
    },
    { role: "user", content: `【审稿意见】\n${problems || "整体偏弱，全面强化一次"}\n\n【原文】\n${markdown}` },
  ]
}

export function parseReview(raw: unknown): Review | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const scoresRaw = (obj.scores ?? {}) as Record<string, unknown>
  const scores = {} as ReviewScores
  let valid = true
  for (const d of DIMS) {
    const v = Number(scoresRaw[d.key])
    if (!Number.isFinite(v)) {
      valid = false
      break
    }
    scores[d.key] = Math.min(10, Math.max(0, v))
  }
  if (!valid) return null
  const comments = Array.isArray(obj.comments)
    ? (obj.comments as { dim?: string; comment?: string }[])
        .filter((c) => c && c.dim && c.comment)
        .map((c) => ({ dim: String(c.dim), comment: String(c.comment) }))
    : []
  const average = DIMS.reduce((s, d) => s + scores[d.key], 0) / DIMS.length
  return { scores, comments, average: Math.round(average * 10) / 10 }
}

export { DIMS }

// ---------- 成对比较（pairwise，交换位置防位置偏差） ----------

export interface PairwiseInput {
  original: string
  revised: string
  /** 审稿意见摘要（裁判知道「改」的目标是什么） */
  reviewSummary: string
}

/**
 * 成对比较裁判。orientation=false 时 A=原文 B=修订稿；
 * orientation=true 时交换（A=修订稿 B=原文）。
 * 输出 winner: "A" | "B" | "tie"（按 orientation 归一化回「修订稿是否更优」由调用方处理）
 */
export function pairwiseMessages(input: PairwiseInput, orientation: boolean): ChatMessage[] {
  const a = orientation ? input.revised : input.original
  const b = orientation ? input.original : input.revised
  const aLabel = orientation ? "修订稿" : "原文"
  const bLabel = orientation ? "原文" : "修订稿"
  return [
    {
      role: "system",
      content: [
        "你是严格的第三方内容编辑，裁决两版稿件哪版更好。不知道也不关心哪版是谁写的。",
        "评判标准（按重要性）：① 事实与引用严谨（编造/无据陈述最严重）② 论点清晰敢表态 ③ 结构与节奏 ④ 与人格设定一致。",
        "注意：不要因篇幅更长就偏袒某版；先指出各自最具体的优缺点再下结论。",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{ "winner": "A" | "B" | "tie", "reason": "一句话最关键的裁决理由", "aWeakness": "A 版最具体的问题", "bWeakness": "B 版最具体的问题" }`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        input.reviewSummary ? `本次修订目标：${input.reviewSummary.slice(0, 300)}` : "",
        "",
        `【A 版（${aLabel}）】`,
        a.slice(0, 8000),
        "",
        `【B 版（${bLabel}）】`,
        b.slice(0, 8000),
      ]
        .filter(Boolean)
        .join("\n"),
    },
  ]
}

export interface PairwiseVerdict {
  winner: "A" | "B" | "tie"
  reason: string
}

export function parsePairwise(raw: unknown): PairwiseVerdict | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const winner = String(o.winner ?? "").toUpperCase()
  if (winner !== "A" && winner !== "B" && winner !== "TIE") return null
  return {
    winner: winner === "TIE" ? "tie" : (winner as "A" | "B"),
    reason: String(o.reason ?? "").slice(0, 200),
  }
}

/** 审稿意见摘要（喂给成对裁判当「修订目标」） */
export function reviewSummary(review: Review): string {
  return review.comments
    .filter((c) => review.scores[c.dim as keyof ReviewScores] !== undefined && review.scores[c.dim as keyof ReviewScores] < 8)
    .map((c) => `${c.dim}：${c.comment}`)
    .join("；")
    .slice(0, 300)
}
