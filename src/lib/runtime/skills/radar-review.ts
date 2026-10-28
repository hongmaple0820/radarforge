/**
 * radar-review —— 五维审稿 skill（wewrite 审稿机制的自研版）
 *
 * 五个维度：准确（事实与引用）/ 观点（判断质量）/ 有用（行动价值）/
 * 合声（人格一致性）/ 好读（节奏与可读性）。任一维度 < 6 分则 verdict=revise。
 */

import type { ChatMessage } from '@/lib/gateway/types'

export interface ReviewScores {
  accuracy: number
  viewpoint: number
  usefulness: number
  voice: number
  readability: number
}

export interface ReviewResult {
  scores: ReviewScores
  summary: string
  suggestions: string[]
  verdict: 'pass' | 'revise'
}

export const REVIEW_DIMENSIONS: Array<{ key: keyof ReviewScores; name: string; desc: string }> = [
  { key: 'accuracy', name: '准确', desc: '事实主张是否有来源支撑、编号引用是否真实对应' },
  { key: 'viewpoint', name: '观点', desc: '核心判断是否清晰可辩、是否诚实处理了反方' },
  { key: 'usefulness', name: '有用', desc: '读者读完能否带走可执行的东西' },
  { key: 'voice', name: '合声', desc: '是否与既定写作人格的声线一致' },
  { key: 'readability', name: '好读', desc: '节奏、段落长度、开头是否抓人' },
]

export function buildReviewMessages(args: {
  title: string
  personaName: string
  personaRules: string[]
  markdown: string
  claimsDigest: string
}): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是挑剔但公允的内容编辑。对文章做五维审稿，输出严格 JSON（不要解释文字）。评分 0~10，半分允许（如 7.5）。任何维度低于 6.0 则 verdict 为 revise。',
    },
    {
      role: 'user',
      content: `审稿对象
- 标题：${args.title}
- 既定人格：${args.personaName}（${args.personaRules.join('；')}）

主张账本摘要（核对 [n] 引用是否对应、事实是否有支撑）：
${args.claimsDigest || '（无外部事实主张）'}

正文 Markdown：
${args.markdown}

输出 JSON：
{
  "scores": { "accuracy": 0, "viewpoint": 0, "usefulness": 0, "voice": 0, "readability": 0 },
  "summary": "总评（80 字内，像真人编辑的口吻）",
  "suggestions": ["具体、可执行的修改意见（每条 40 字内）"],
  "verdict": "pass 或 revise"
}
suggestions 给 2~5 条；verdict=pass 时也要给建议（锦上添花型）。`,
    },
  ]
}

export function normalizeReview(raw: {
  scores?: Record<string, unknown>
  summary?: unknown
  suggestions?: unknown
  verdict?: unknown
}): ReviewResult {
  const num = (v: unknown): number => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''))
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(10, Math.round(n * 10) / 10))
  }
  const scores: ReviewScores = {
    accuracy: num(raw.scores?.accuracy),
    viewpoint: num(raw.scores?.viewpoint),
    usefulness: num(raw.scores?.usefulness),
    voice: num(raw.scores?.voice),
    readability: num(raw.scores?.readability),
  }
  const suggestions = Array.isArray(raw.suggestions)
    ? raw.suggestions.filter((s) => typeof s === 'string' && s.trim()).slice(0, 6)
    : []
  const verdict: 'pass' | 'revise' =
    raw.verdict === 'pass' && Object.values(scores).every((s) => s >= 6) ? 'pass' : 'revise'
  return {
    scores,
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : '（审稿总评缺失）',
    suggestions,
    verdict,
  }
}
