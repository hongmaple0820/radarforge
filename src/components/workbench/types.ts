/** 工作台共享类型（Phase 2 创作台） */

export interface StepRecord {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'skipped' | 'failed'
  detail?: string
  latencyMs?: number
}

export interface SourceItem {
  title: string
  url: string
  site: string
  date?: string
}

export interface ClaimRecord {
  id: string
  claimType: string
  text: string
  query?: string | null
  sourceJson: SourceItem[] | null
  verified: boolean | null
}

export interface ArticleRecord {
  id: string
  runId: string
  version: number
  target: 'wechat' | 'csdn' | 'xiaohongshu'
  format: string
  content: string
  html?: string | null
  note?: string | null
  createdAt: string
}

export interface ReviewScores {
  accuracy: number
  viewpoint: number
  usefulness: number
  voice: number
  readability: number
}

export interface ReviewRecordItem {
  id: string
  scores: ReviewScores
  summary: string
  suggestions: string[]
  verdict: 'pass' | 'revise'
}

export interface AssetRecord {
  id: string
  kind: string
  provider?: string | null
  path: string
  costCents: number
}

export interface PublishRecordItem {
  id: string
  platform: string
  mode: string
  note?: string | null
  createdAt: string
}

export interface RunDetail {
  id: string
  ideaId: string | null
  title: string
  kind: string
  persona: string
  theme: string
  withCover: boolean
  status: 'pending' | 'running' | 'blocked' | 'done' | 'failed'
  steps: StepRecord[] | null
  error?: string | null
  createdAt: string
  idea?: { title: string; angle?: string | null; sourceRef?: string | null } | null
  claims: ClaimRecord[]
  articles: ArticleRecord[]
  reviews: ReviewRecordItem[]
  assets: AssetRecord[]
  publishes: PublishRecordItem[]
}

export interface RunListItem {
  id: string
  title: string
  status: 'pending' | 'running' | 'blocked' | 'done' | 'failed'
  persona: string
  theme: string
  withCover: boolean
  steps: StepRecord[] | null
  error?: string | null
  createdAt: string
  articleChars: number
  articleNote: string | null
  reviewScores: ReviewScores | null
  reviewVerdict: string | null
  claimCount: number
}

export interface PersonaItem {
  id: string
  name: string
  desc: string
}

export interface ThemeItem {
  id: string
  name: string
  desc: string
}

export interface LearnRuleItem {
  id: string
  ruleText: string
  examples: Array<{ before: string; after: string }> | null
  status: 'proposed' | 'active' | 'dismissed'
  hits: number
  createdAt: string
}

export const PERSONA_NAMES: Record<string, string> = {
  'midnight-friend': '午夜朋友',
  'cold-analyst': '冷静分析师',
  'tech-coder': '技术老手',
  'warm-teacher': '耐心的老师',
  'sharp-editor': '犀利主笔',
  storyteller: '叙事者',
  'pragmatic-doer': '实干派',
}

export const CLAIM_TYPE_NAMES: Record<string, string> = {
  fact: '事实',
  inference: '推断',
  opinion: '观点',
  experience: '经验',
}

export const REVIEW_DIMENSION_NAMES: Array<{ key: keyof ReviewScores; name: string }> = [
  { key: 'accuracy', name: '准确' },
  { key: 'viewpoint', name: '观点' },
  { key: 'usefulness', name: '有用' },
  { key: 'voice', name: '合声' },
  { key: 'readability', name: '好读' },
]

export const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending: { label: '排队中', cls: 'border-slate-200 bg-slate-50 text-slate-600' },
  running: { label: '运行中', cls: 'border-teal-200 bg-teal-50 text-teal-700' },
  blocked: { label: '待人工', cls: 'border-amber-200 bg-amber-50 text-amber-700' },
  done: { label: '已完成', cls: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  failed: { label: '失败', cls: 'border-red-200 bg-red-50 text-red-700' },
}
