// ============================================================
// 模型网关 · Provider 插件体系（学 dsh：协议族适配器 + 未识别明确报错）
// 四类能力：LLM / SEARCH / IMAGE / VIDEO
// ============================================================

export type ProviderKind = "LLM" | "SEARCH" | "IMAGE" | "VIDEO"

export type ProviderStatus = "healthy" | "degraded" | "down" | "unknown"

export interface HealthReport {
  status: ProviderStatus
  latencyMs: number
  error?: string
  detail?: string
}

// ---------- SEARCH ----------

export interface SearchRequest {
  query: string
  /** 合法值：10/20/30/40/50（SearchPro 的 Cnt 只接受这五个值，传其他会被静默吞错） */
  count?: number
  /** d1/d7/d30 时间窗 */
  freshness?: "d1" | "d7" | "d30" | "none"
  /** 信源行业：news 限定新闻机构 / gov 强制党政机关信源 */
  industry?: "news" | "gov" | "none"
  /** 1=垂类 VR 卡（天气/股价/金价） 2=混合信源 */
  mode?: 1 | 2
}

export interface SearchResult {
  title: string
  url: string
  site: string
  date: string
  passage: string
  score: number
}

export interface SearchProvider {
  kind: "SEARCH"
  name: string
  label: string
  notes: string
  /** 密钥/配置是否就绪——不就绪的 provider 不进入降级链 */
  isConfigured(): boolean
  search(req: SearchRequest): Promise<SearchResult[]>
  /** 零成本探活（不发真实查询） */
  health?(): Promise<HealthReport>
}

// ---------- LLM ----------

export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LLMProvider {
  kind: "LLM"
  name: string
  label: string
  notes: string
  isConfigured(): boolean
  chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string>
  health?(): Promise<HealthReport>
}

// ---------- IMAGE ----------

export interface ImageGenerateRequest {
  prompt: string
  /** 参考图（dataURL 或 URL，多图编辑/融合） */
  referenceImages?: string[]
  size?: string
}

export interface ImageGenerateResult {
  /** dataURL（data:image/png;base64,...）或远程 URL */
  images: string[]
  provider: string
}

export interface ImageProvider {
  kind: "IMAGE"
  name: string
  label: string
  notes: string
  isConfigured(): boolean
  /** 同步生图（OpenAI 兼容 images/generations 协议族） */
  generate?(req: ImageGenerateRequest): Promise<ImageGenerateResult>
  health?(): Promise<HealthReport>
}

// ---------- VIDEO ----------
// 异步三件套（学 dsh VideoTaskQueue：提交 → 轮询 → 取产物，绝不阻塞 HTTP 请求线程）

export interface VideoGenerateRequest {
  prompt: string
  /** text 纯文生视频 / keyframe 首帧引导 / reference 参考图 */
  mode: "text" | "keyframe" | "reference"
  seconds: number
  aspectRatio?: string
  /** 首帧图（keyframe 模式；dataURL/URL） */
  firstFrame?: string
  /** 参考图（reference 模式） */
  images?: string[]
}

export type VideoTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled" | "unknown"

export interface VideoTask {
  id: string
  status: VideoTaskStatus
  /** 供应商任务 id（轮询凭据） */
  remoteTaskId?: string
  /** 完成后的产物地址（下载后转本地） */
  resultUrl?: string
  error?: string
  /** 已等待秒数（前端展示进度感） */
  waitedSeconds?: number
}

export interface VideoProvider {
  kind: "VIDEO"
  name: string
  label: string
  notes: string
  isConfigured(): boolean
  /** 提交视频生成任务（立即返回，不等待完成） */
  submitVideo?(req: VideoGenerateRequest): Promise<VideoTask>
  /** 查询任务状态 */
  getVideoTask?(remoteTaskId: string): Promise<VideoTask>
  /** 尽力取消（供应商不支持时返回 unsupported 提示） */
  cancelVideoTask?(remoteTaskId: string): Promise<{ supported: boolean; message?: string }>
  health?(): Promise<HealthReport>
}

export type AnyProvider = SearchProvider | LLMProvider | ImageProvider | VideoProvider

export interface ProviderDescriptor {
  kind: ProviderKind
  name: string
  label: string
  notes: string
  builtin: boolean
  configured: boolean
}

/** 网关统一错误：未识别 provider / 全链失败时明确报错（不静默吞掉） */
export class GatewayError extends Error {
  constructor(
    message: string,
    public code: "PROVIDER_NOT_FOUND" | "NOT_CONFIGURED" | "ALL_PROVIDERS_FAILED" | "PROTOCOL_ERROR",
  ) {
    super(message)
  }
}
