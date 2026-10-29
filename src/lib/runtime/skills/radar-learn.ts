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

// ============================================================
// 文风学习（学 wewrite exemplar 范文库）：
// 粘贴范文 → LLM 提炼「文风指纹」→ 范文库 → 初稿注入
// 安全条款（allowed_uses）：仅结构与节奏校准，
// 观点 / 句子 / 比喻 / 个人经历一律不得复用。
// ============================================================

export interface StyleExemplarFingerprint {
  structure: string // 结构骨架（开头→推进→收尾的套路）
  rhythm: string // 句式节奏（长短句比例、标点密度、断句习惯）
  lexicon: string // 词汇偏好（高频连接词、口头禅、领域黑话）
  rhetoric: string // 修辞密度（比喻/排比/设问的频率与用法）
  voice: string // 语气与人称（对读者说话的方式）
  endings: string // 收尾习惯（金句/呼吁/留白/循环）
}

export interface StyleExemplar {
  id: string
  name: string
  source: string // 来源说明（URL 或「用户粘贴」）
  createdAt: string
  words: number
  fingerprint: StyleExemplarFingerprint
}

export function exemplarMessages(name: string, content: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是一名文风分析师（学 wewrite 的 exemplar 范文库）。用户给出一篇范文，请提炼它的「文风指纹」，供之后的初稿做结构与节奏校准。",
        "铁律：",
        "- 只描述风格特征，不复述、不引用范文中的任何具体观点、句子、比喻或个人经历",
        "- 每个维度 1~2 句具体可执行的描述（「怎么做」而不是「很好」）",
        "- 客观克制：这是给另一个写作者的校准说明，不是文学评论",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{`,
        `  "structure": "结构骨架：开头怎么起（1句）→ 主体怎么推进（小节切分方式）→ 收尾怎么落",`,
        `  "rhythm": "句式节奏：长短句比例、断句与标点习惯、段落密度",`,
        `  "lexicon": "词汇偏好：高频连接词、口头禅、语气词、领域用词倾向",`,
        `  "rhetoric": "修辞密度：比喻/排比/设问/对比的出现频率与典型用法",`,
        `  "voice": "语气与人称：第几人称、对读者的称呼与说话距离、情绪浓度",`,
        `  "endings": "收尾习惯：金句收束/行动呼吁/留白/回扣开头的哪种",`,
        `}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: `档案名：${name}\n\n范文（节选）：\n${content.slice(0, 6000)}`,
    },
  ]
}

export function parseExemplar(raw: unknown): StyleExemplarFingerprint | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const fp: StyleExemplarFingerprint = {
    structure: String(o.structure ?? "").slice(0, 200),
    rhythm: String(o.rhythm ?? "").slice(0, 200),
    lexicon: String(o.lexicon ?? "").slice(0, 200),
    rhetoric: String(o.rhetoric ?? "").slice(0, 200),
    voice: String(o.voice ?? "").slice(0, 200),
    endings: String(o.endings ?? "").slice(0, 200),
  }
  const filled = Object.values(fp).filter((v) => v.length > 10).length
  return filled >= 3 ? fp : null
}

/** 初稿注入块（安全条款：仅校准结构与节奏） */
export function exemplarPrompt(ex: StyleExemplar): string {
  const f = ex.fingerprint
  return [
    `【文风校准 ·「${ex.name}」（仅结构与节奏，安全条款见末行）】`,
    `- 结构骨架：${f.structure}`,
    `- 句式节奏：${f.rhythm}`,
    `- 词汇偏好：${f.lexicon}`,
    `- 修辞密度：${f.rhetoric}`,
    `- 语气人称：${f.voice}`,
    `- 收尾习惯：${f.endings}`,
    "安全条款：以上仅用于校准结构与节奏。范文中的观点、数据、句子、比喻、个人经历一律禁止复用；与铁律冲突时以铁律为准。",
  ].join("\n")
}
