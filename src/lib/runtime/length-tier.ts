// ============================================================
// length-tier —— 篇幅三档（内容质量升级方案 A2）
// short 快讯 1200~2000 / medium 标准深度 2500~4000（默认，用户拍板）
// / deep 封面级长文 4500~8000
// 四处钳制点统一到这里：初稿字数铁律、大纲节数字数指令、
// parseOutline 每节 words 钳制、MAX_SECTIONS 上限。
// ============================================================

export type LengthTierId = "short" | "medium" | "deep"

export interface LengthTier {
  id: LengthTierId
  label: string
  desc: string
  /** 全文总字数区间 */
  totalMin: number
  totalMax: number
  /** 小节数区间 */
  sectionsMin: number
  sectionsMax: number
  /** 每节字数预算钳制区间 */
  sectionWordsMin: number
  sectionWordsMax: number
  /** 每节字数缺省值（解析失败/缺字段时） */
  sectionWordsDefault: number
  /** 上下文滚动窗：近几节保留较长摘要 */
  contextFullSections: number
  /** 近节摘要长度（字符） */
  contextFullChars: number
  /** 更早节的短摘要长度（字符） */
  contextBriefChars: number
  /** B6 配图密度分档：正文插图张数区间（数据卡+意境图合计） */
  illustrationsMin: number
  illustrationsMax: number
}

export const LENGTH_TIERS: LengthTier[] = [
  {
    id: "short",
    label: "短篇快讯",
    desc: "1200~2000 字 · 4~6 节，快讯/日报节奏",
    totalMin: 1200,
    totalMax: 2000,
    sectionsMin: 4,
    sectionsMax: 6,
    sectionWordsMin: 100,
    sectionWordsMax: 500,
    sectionWordsDefault: 300,
    contextFullSections: 2,
    contextFullChars: 600,
    contextBriefChars: 200,
    illustrationsMin: 1,
    illustrationsMax: 2,
  },
  {
    id: "medium",
    label: "标准深度",
    desc: "2500~4000 字 · 6~9 节，默认深度资讯",
    totalMin: 2500,
    totalMax: 4000,
    sectionsMin: 6,
    sectionsMax: 9,
    sectionWordsMin: 200,
    sectionWordsMax: 700,
    sectionWordsDefault: 450,
    contextFullSections: 2,
    contextFullChars: 800,
    contextBriefChars: 240,
    illustrationsMin: 2,
    illustrationsMax: 3,
  },
  {
    id: "deep",
    label: "封面级长文",
    desc: "4500~8000 字 · 8~14 节，封面级深度稿",
    totalMin: 4500,
    totalMax: 8000,
    sectionsMin: 8,
    sectionsMax: 14,
    sectionWordsMin: 300,
    sectionWordsMax: 1200,
    sectionWordsDefault: 600,
    contextFullSections: 2,
    contextFullChars: 900,
    contextBriefChars: 260,
    illustrationsMin: 3,
    illustrationsMax: 5,
  },
]

const DEFAULT_TIER: LengthTierId = "medium"

/** 解析档位（非法/缺失回退 medium，与设置默认一致）；无参调用 = 取产品默认档 */
export function resolveLengthTier(id?: string | null): LengthTier {
  return LENGTH_TIERS.find((t) => t.id === id) ?? LENGTH_TIERS.find((t) => t.id === DEFAULT_TIER)!
}

/** 插图密度规则文本（B6：注入插图规划 prompt） */
export function tierIllustrationRule(tier: LengthTier): string {
  return `${tier.illustrationsMin}~${tier.illustrationsMax} 张`
}

/** 初稿/单遍生成的字数铁律文本（注入 prompt 的第 4 条铁律位） */
export function tierWordRule(tier: LengthTier): string {
  return `字数 ${tier.totalMin}~${tier.totalMax} 字，Markdown 格式：# 标题 / ## 小节 / 段落。`
}

/** 大纲指令：节数字数规则行 */
export function tierOutlineRule(tier: LengthTier): string {
  return `${tier.sectionsMin}~${tier.sectionsMax} 个小节`
}

/** 大纲指令：合计字数规则行 */
export function tierTotalWordsRule(tier: LengthTier): string {
  return `合计 ${tier.totalMin}~${tier.totalMax}`
}

/** 大纲指令：每节字数规则行 */
export function tierSectionWordsRule(tier: LengthTier): string {
  return `每节 ${tier.sectionWordsMin}~${tier.sectionWordsMax}`
}

/** parseOutline 每节 words 钳制（档位驱动，替代旧 100~500 硬编码） */
export function clampSectionWords(words: unknown, tier: LengthTier): number {
  const n = Math.round(Number(words))
  if (!Number.isFinite(n)) return tier.sectionWordsDefault
  return Math.min(tier.sectionWordsMax, Math.max(tier.sectionWordsMin, n))
}

/** parseOutline 小节数上限（档位驱动，替代旧 MAX_SECTIONS=8） */
export function maxSections(tier: LengthTier): number {
  return tier.sectionsMax
}

/**
 * 逐节字数校验：是否需要带反馈重生一次。
 * 容差带：实际字数 < 预算 65% 或 > 预算 160% → 重生（一次为限，防配额浪费）。
 */
export function sectionWordNeedsRetry(target: number, actualChars: number): boolean {
  const actual = Math.max(0, actualChars)
  // 空文/空串是「生成失败」类，由上游短文检查（<50 字硬错）处理，不在此误报为字数带偏离
  if (actual <= 0) return false
  return actual < Math.round(target * 0.65) || actual > Math.round(target * 1.6)
}

/** 数正文字符（与 Article.wordCount 同口径：去空白） */
export function countWords(text: string): number {
  return text.replace(/\s/g, "").length
}

/**
 * 上下文滚动窗（deep 档防上下文撑爆的底座）：
 * 近 contextFullSections 节保留 contextFullChars 字符，更早的节压到 contextBriefChars。
 * 返回与 bodies 等长的「摘要视图」数组（原顺序）。
 */
export function rollingContext(bodies: string[], tier: LengthTier): string[] {
  const n = bodies.length
  return bodies.map((body, i) => {
    const isRecent = n - i <= tier.contextFullSections
    const cap = isRecent ? tier.contextFullChars : tier.contextBriefChars
    return body.slice(0, cap)
  })
}
