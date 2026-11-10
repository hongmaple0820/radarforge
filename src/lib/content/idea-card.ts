// ============================================================
// idea-card —— 选题卡纯函数层（S4 选题采访器）
// frontier 轮次纪律的产品化落点：采访问题（受众/边界/证据可得性）
// 经用户作答蒸馏成选题卡，随 run 创建透传，brief 步按卡写作。
// 纯函数零依赖（不 import db/settings/fs）——客户端向导与服务端
// 路由共用，蒸馏逻辑单一事实源（先例：settings-panel 直引
// lib/runtime/length-tier 的客户端安全 import）。
// 提示词人格与协议文案住 db/skills/topic-interviewer/SKILL.md
// （ADR-0007 唯一事实源）；本模块只持数据校验与组装。
// ============================================================

/** 采访问题维度（选题卡三字段的一一对应） */
export type InterviewDimension = "audience" | "boundary" | "evidence"

export interface InterviewQuestion {
  id: string // q1…qn 连续编号
  dimension: InterviewDimension
  question: string
  recommended: string // frontier 纪律：每问必带推荐答案
}

/** 采访作答留痕（问题 + 用户最终作答；answer 预填推荐可改） */
export interface InterviewQa extends InterviewQuestion {
  answer: string
}

export interface IdeaCard {
  audience: string // 目标受众（蒸馏自 audience 维度作答）
  boundary: string // 适用边界（蒸馏自 boundary 维度作答）
  evidence: string // 证据可得性（蒸馏自 evidence 维度作答）
  qa?: InterviewQa[] // 留痕（可选；入库前由 validateIdeaCard 钳制）
}

const DIMENSIONS: readonly InterviewDimension[] = ["audience", "boundary", "evidence"]
const MIN_QUESTIONS = 5
const MAX_QUESTIONS = 8
const FIELD_MAX = 500
const QA_MAX = 8
const QA_FIELD_MAX = 200

function isDimension(v: unknown): v is InterviewDimension {
  return typeof v === "string" && (DIMENSIONS as readonly string[]).includes(v)
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

/** 解包协议示形 {"questions": [...]} 的包裹对象；非该形态返回 null */
function unwrapQuestions(raw: unknown): unknown[] | null {
  if (typeof raw !== "object" || raw === null) return null
  const q = (raw as Record<string, unknown>).questions
  return Array.isArray(q) ? q : null
}

/** qa 单条清洗（钳长 + 维度非法回退 audience；distill 与 validate 共用，避免重复） */
function cleanQaItem(raw: unknown): InterviewQa | null {
  if (typeof raw !== "object" || raw === null) return null
  const q = raw as Record<string, unknown>
  return {
    id: str(q.id).slice(0, 40),
    dimension: isDimension(q.dimension) ? q.dimension : "audience",
    question: str(q.question).slice(0, QA_FIELD_MAX),
    recommended: str(q.recommended).slice(0, QA_FIELD_MAX),
    answer: str(q.answer).slice(0, QA_FIELD_MAX),
  }
}

/**
 * 问题协议校验（拒收不硬凑）：5~8 问、三维度全覆盖、
 * 每问 id/question/recommended 非空。任一违反返回 null。
 * 输入是已解析的 JSON 值（JSON 抽取在调用侧，见 runtime/json）。
 * 接受两种顶层形态：裸数组，或 SKILL.md 协议示形的 {"questions": [...]} 包裹
 * （LLM 按协议示形输出的是包裹对象——两者等价合法）。
 */
export function parseInterviewQuestions(raw: unknown): InterviewQuestion[] | null {
  const items = Array.isArray(raw) ? raw : unwrapQuestions(raw)
  if (!items) return null
  if (items.length < MIN_QUESTIONS || items.length > MAX_QUESTIONS) return null
  const seen = new Set<string>()
  const out: InterviewQuestion[] = []
  for (const item of items) {
    if (typeof item !== "object" || item === null) return null
    const q = item as Record<string, unknown>
    if (!isDimension(q.dimension)) return null
    if (!str(q.id).trim() || !str(q.question).trim() || !str(q.recommended).trim()) return null
    seen.add(q.dimension)
    out.push({
      id: str(q.id).trim().slice(0, 40),
      dimension: q.dimension,
      question: str(q.question).trim(),
      recommended: str(q.recommended).trim(),
    })
  }
  for (const d of DIMENSIONS) if (!seen.has(d)) return null
  return out
}

/**
 * 蒸馏：按维度归并作答（「；」连接非空答案），qa 全量随卡留痕。
 * 三维度蒸馏后全空 → null（无有效作答不算卡）。
 */
export function distillIdeaCard(qa: InterviewQa[]): IdeaCard | null {
  const merged: Record<InterviewDimension, string[]> = { audience: [], boundary: [], evidence: [] }
  for (const item of qa) {
    if (!isDimension(item.dimension)) continue
    const a = str(item.answer).trim()
    if (a) merged[item.dimension].push(a)
  }
  const card: IdeaCard = {
    audience: merged.audience.join("；"),
    boundary: merged.boundary.join("；"),
    evidence: merged.evidence.join("；"),
    qa: qa
      .slice(0, QA_MAX)
      .map(cleanQaItem)
      .filter((x): x is InterviewQa => x !== null),
  }
  if (!card.audience && !card.boundary && !card.evidence) return null
  return card
}

/**
 * 卡入参校验（API 边界）：三字段 trim 后非空、各钳 500；
 * qa ≤8 条、逐字符串截 200。任一字段空白 → null（拒收不硬凑）。
 */
export function validateIdeaCard(raw: unknown): IdeaCard | null {
  if (typeof raw !== "object" || raw === null) return null
  const r = raw as Record<string, unknown>
  const audience = str(r.audience).trim()
  const boundary = str(r.boundary).trim()
  const evidence = str(r.evidence).trim()
  if (!audience || !boundary || !evidence) return null
  let qa: InterviewQa[] | undefined
  if (Array.isArray(r.qa) && r.qa.length > 0) {
    const cleaned: InterviewQa[] = []
    for (const item of r.qa) {
      const c = cleanQaItem(item)
      if (c) cleaned.push(c)
      if (cleaned.length >= QA_MAX) break
    }
    qa = cleaned.length > 0 ? cleaned : undefined
  }
  return {
    audience: audience.slice(0, FIELD_MAX),
    boundary: boundary.slice(0, FIELD_MAX),
    evidence: evidence.slice(0, FIELD_MAX),
    qa,
  }
}

/**
 * brief 注入帧（沿 style_block 先例：ts 组装脚手架帧、SKILL.md 持
 * {{idea_card_block}} 占位符——无卡渲染空串，路径字节级不变）。
 * 句子级纪律文案住帧内（卡优先于 brief 自行推断），由 ADR-0009 记录
 * 为 style_block 同款的既存模式延伸。
 */
export function ideaCardBlock(card: IdeaCard): string {
  return [
    "\n【选题卡（用户采访确认）】",
    `- 目标受众：${card.audience}`,
    `- 适用边界：${card.boundary}`,
    `- 证据可得性：${card.evidence}`,
    "任务书的 targetReader 与 boundary 以选题卡表述为准（用户已确认，优先于你的自行推断）；claims 中 fact 型主张围绕证据可得性列出的可核实来源组织。",
    "",
  ].join("\n")
}
