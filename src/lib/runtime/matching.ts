// ============================================================
// matching.ts —— 关键词重合度匹配（claims 取证与原子断言核验共用）
// 分词：拉丁/数字词（小写）+ CJK 二元组（中文无空格，
// 词级 token 会整句成一个词导致重合度恒 0 —— 修复于 10b8ced）
// 命中判定：重合度 ≥2 视为相关（离线用例见 scripts/test-claim-match.mjs）
// ============================================================

export interface MatchResult {
  /** 重合 token 命中数 */
  hits: number
  /** 主张侧 token 总数（诊断用） */
  claimTokens: number
}

/** 分词：拉丁/数字词 + CJK bigram */
export function tokenize(s: string): string[] {
  const out: string[] = []
  for (const m of s.match(/[A-Za-z0-9][A-Za-z0-9_.-]*/g) ?? []) out.push(m.toLowerCase())
  const cjk = (s.match(/[\u4e00-\u9fff]+/g) ?? []).join("")
  for (let i = 0; i < cjk.length - 1; i++) out.push(cjk.slice(i, i + 2))
  return out
}

/** 计算一条主张与一段检索文本的重合度 */
export function overlap(claim: string, text: string): MatchResult {
  const claimTokens = new Set(tokenize(claim))
  const hay = new Set(tokenize(text))
  let hits = 0
  for (const t of claimTokens) if (hay.has(t)) hits++
  return { hits, claimTokens: claimTokens.size }
}

export interface SearchCandidate {
  title: string
  passage: string
  url?: string
  site?: string
  date?: string
}

export interface BestMatchResult<T extends SearchCandidate> {
  best: T | null
  hits: number
  ranked: { item: T; hits: number }[]
}

/** 对检索结果按重合度排序，返回最优命中（阈值 MIN_HITS 由调用方判断） */
export function bestMatch<T extends SearchCandidate>(claim: string, results: T[]): BestMatchResult<T> {
  const ranked = results
    .map((item) => ({ item, hits: overlap(claim, `${item.title} ${item.passage.slice(0, 400)}`).hits }))
    .sort((a, b) => b.hits - a.hits)
  const top = ranked[0] ?? null
  return { best: top?.item ?? null, hits: top?.hits ?? 0, ranked }
}

/** 命中阈值：≥2 个重合 token 才视为「找到来源」 */
export const MIN_HITS = 2
