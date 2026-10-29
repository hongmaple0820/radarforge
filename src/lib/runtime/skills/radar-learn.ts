// ============================================================
// radar-learn —— 编辑飞轮 skill（学 wewrite 谨慎升级策略）
// 用户改稿 → diff → LLM 提炼候选规则（proposed）
// 重复出现或用户明确确认才升级 active（宁缺毋滥）
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"

/** 行级 diff：找出被改的段落（轻量实现，够用） */
export interface DiffChunk {
  kind: "changed" | "removed" | "added"
  before: string
  after: string
}

export function diffMarkdown(before: string, after: string): DiffChunk[] {
  const a = before.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const b = after.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean)
  const chunks: DiffChunk[] = []
  const setB = new Set(b)
  const setA = new Set(a)
  // 变更：前后都存在相似段落
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i] && !setB.has(a[i])) {
      chunks.push({ kind: "changed", before: a[i], after: b[i] })
    }
  }
  // 删除：旧段落完全消失
  for (const p of a) {
    if (!setB.has(p) && !chunks.some((c) => c.before === p)) {
      chunks.push({ kind: "removed", before: p, after: "" })
    }
  }
  // 新增：新段落凭空出现
  for (const p of b) {
    if (!setA.has(p) && !chunks.some((c) => c.after === p)) {
      chunks.push({ kind: "added", before: "", after: p })
    }
  }
  return chunks
}

export function learnMessages(diff: DiffChunk[]): ChatMessage[] {
  const pairs = diff
    .slice(0, 8)
    .map((c, i) => `【修改 ${i + 1}·${c.kind}】\n原：${c.before.slice(0, 300) || "（无）"}\n改：${c.after.slice(0, 300) || "（删除）"}`)
    .join("\n\n")
  return [
    {
      role: "system",
      content: [
        "你是一名写作风格分析师。用户修改了自己的 AI 生成文章，请从修改 diff 中提炼「稳定写作规则」。",
        "规则要求：",
        "- 每条规则必须是可执行的具体写作指令（句式/结构/用词/排版层面），不是空泛口号",
        "- 只提炼在修改中清晰可见的倾向，宁缺毋滥",
        "- 最多 3 条",
        "严格输出 JSON：",
        `{ "rules": [ { "rule": "具体规则文本", "rationale": "从哪处修改看出来的一句话依据" } ] }`,
      ].join("\n"),
    },
    { role: "user", content: pairs },
  ]
}

export function parseRules(raw: unknown): { rule: string; rationale: string }[] {
  if (!raw || typeof raw !== "object") return []
  const arr = (raw as { rules?: unknown }).rules
  if (!Array.isArray(arr)) return []
  return arr
    .map((r) => {
      const o = r as { rule?: string; rationale?: string }
      return { rule: String(o?.rule ?? "").trim(), rationale: String(o?.rationale ?? "").trim() }
    })
    .filter((r) => r.rule.length > 5 && r.rule.length < 300)
    .slice(0, 3)
}

// ---------- 相似度（防重复激活） ----------

/** 字符 bigram 集合（轻量中文相似度，够用不引依赖） */
function bigrams(s: string): Set<string> {
  const t = s.replace(/[\s。，、；：？！「」（）,.:;!?""'（）]/g, "")
  const out = new Set<string>()
  for (let i = 0; i < t.length - 1; i++) out.add(t.slice(i, i + 2))
  return out
}

/** Jaccard 相似度（0~1） */
export function similarity(a: string, b: string): number {
  const A = bigrams(a)
  const B = bigrams(b)
  if (A.size === 0 || B.size === 0) return 0
  let inter = 0
  for (const g of A) if (B.has(g)) inter++
  return inter / (A.size + B.size - inter)
}

/** 在既有规则中找高相似的（阈值 0.55），用于 proposed 确认时防重复激活 */
export function findSimilar(rule: string, existing: { id: string; rule: string }[], threshold = 0.55): { id: string; rule: string } | null {
  let best: { id: string; rule: string; score: number } | null = null
  for (const e of existing) {
    const score = similarity(rule, e.rule)
    if (score >= threshold && (!best || score > best.score)) best = { ...e, score }
  }
  return best ? { id: best.id, rule: best.rule } : null
}
