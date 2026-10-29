// ============================================================
// radar-review —— 五维审稿 skill（学 wewrite 编辑飞轮）
// 准确 / 观点 / 有用 / 合声 / 好读，JSON 评分
// 不过关 → revise 修订一轮
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
