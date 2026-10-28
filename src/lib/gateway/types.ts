/**
 * 模型网关 v1 —— Provider 统一接口定义
 *
 * 借鉴 dsh 协议族适配器思想：
 *  - 每类模型能力（LLM / Search / Image / Video）各自实现 Provider 接口
 *  - 统一注册到运行时注册表，支持热插拔（后续插件包 origin='plugin'）
 *  - 每个 Provider 必须实现 healthCheck（对应 dsh 的 GET /models 零成本探活思想）
 *  - 未注册 / 未配置时明确报错，绝不静默降级到错误协议
 */

export type ProviderKind = 'llm' | 'search' | 'image' | 'video'

export interface ProviderInfo {
  id: string
  kind: ProviderKind
  name: string
  description?: string
  /** builtin = 随代码内置；plugin = 外部注册（为插件市场预留） */
  origin: 'builtin' | 'plugin'
}

export interface HealthReport {
  ok: boolean
  latencyMs: number
  detail?: string
  checkedAt: string
}

/** 检索类 Provider 入参（与元宝搜索 SearchPro 参数对齐，供多引擎复用） */
export interface SearchRequest {
  query: string
  mode?: number
  cnt?: number
  industry?: string
  freshness?: string
  site?: string
}

export interface SearchHit {
  title: string
  url: string
  site: string
  date: string
  passage: string
  score: number
}

export interface SearchResponse {
  hits: SearchHit[]
  latencyMs: number
  requestId: string
  /** true = 演示数据（未配置 Key 的降级路径） */
  mock: boolean
}

export interface SearchProvider {
  info: ProviderInfo
  /** 动态判断是否具备真实调用条件（如环境变量 Key 是否配置） */
  isConfigured(): boolean
  healthCheck(): Promise<HealthReport>
  search(req: SearchRequest): Promise<SearchResponse>
}

/** LLM 对话类 Provider */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface LlmRequest {
  messages: ChatMessage[]
  maxTokens?: number
  temperature?: number
}

export interface LlmResponse {
  content: string
  latencyMs: number
  model?: string
}

export interface LlmProvider {
  info: ProviderInfo
  isConfigured(): boolean
  healthCheck(): Promise<HealthReport>
  complete(req: LlmRequest): Promise<LlmResponse>
}

/**
 * 生成类任务（图像 / 视频）统一走「提交 + 轮询」协议族
 * （对应 dsh: Agnes POST /v1/videos + 轮询、Seedance 方舟任务查询）
 * v1 只定义接口占位，Phase 3 落地首批实现
 */
export interface GenTaskInfo {
  taskId: string
  status: 'queued' | 'running' | 'succeeded' | 'failed'
  /** 产物 URL 列表（图片 / 视频地址） */
  output?: string[]
  error?: string
}

export interface ImageProvider {
  info: ProviderInfo
  isConfigured(): boolean
  healthCheck(): Promise<HealthReport>
  generate(prompt: string, opts?: Record<string, unknown>): Promise<GenTaskInfo>
}

export interface VideoProvider {
  info: ProviderInfo
  isConfigured(): boolean
  healthCheck(): Promise<HealthReport>
  submit(prompt: string, opts?: Record<string, unknown>): Promise<{ taskId: string }>
  poll(taskId: string): Promise<GenTaskInfo>
}

export type AnyProvider = SearchProvider | LlmProvider | ImageProvider | VideoProvider

/** 供 API 序列化输出的 Provider 概要 */
export interface ProviderSummary extends ProviderInfo {
  configured: boolean
}

export function summarize(p: AnyProvider): ProviderSummary {
  return { ...p.info, configured: p.isConfigured() }
}
