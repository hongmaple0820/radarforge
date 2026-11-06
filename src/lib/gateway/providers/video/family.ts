// ============================================================
// family.ts —— 视频协议族抽象（C3，学 dsh-imagegen-video 协议族）
// id 前缀判族 + 别名归一 + 能力元数据（分辨率/时长/模式/远程取消）
// + 每族独立请求整形器/轮询解析器。
// 三族：agnes（已接通）/ ark-seedance（方舟 Seedance，本期只留
// 协议整形器不接 key）/ openai-compat（通用 OpenAI 兼容回退）。
// 能力元数据是 UI 提前拦截（分辨率/时长超限收起选项而非提交吃
// 400）与提交端钳制的单一事实源。
// ============================================================

import type { VideoGenerateRequest, VideoTaskStatus } from "../../types"

export type VideoFamilyId = "agnes" | "ark-seedance" | "openai-compat"

export interface VideoFamilyMeta {
  id: VideoFamilyId
  label: string
  /** 协议要点（设置卡/通道卡提示用） */
  notes: string
  /** 支持的生成模式 */
  modes: ("text" | "keyframe" | "reference")[]
  /** 时长范围（秒；提交端钳制） */
  seconds: { min: number; max: number }
  /** 分辨率档位 */
  resolutions: ("720P" | "1080P")[]
  /** 是否支持远程取消（Agnes 不支持：等自然完成） */
  remoteCancel: boolean
  /** 本期是否已接通（agnes=true；ark-seedance 只留接口不接 key） */
  wired: boolean
}

const AGNES_META: VideoFamilyMeta = {
  id: "agnes",
  label: "Agnes 协议族",
  notes: "提交 POST /videos → 轮询（/videos/{id} 与 /agnesapi 双端点兼容）→ 取 url 下载；first_frame dataURI 走 keyframe 模式",
  modes: ["text", "keyframe", "reference"],
  seconds: { min: 4, max: 12 },
  resolutions: ["720P", "1080P"],
  remoteCancel: false,
  wired: true,
}

const ARK_META: VideoFamilyMeta = {
  id: "ark-seedance",
  label: "方舟 Seedance 协议族",
  notes: "提交 POST /contents/generations/tasks → 轮询 GET /contents/generations/tasks/{id} → content.video_url；提示词与参考图放 content 数组（role: first_frame/last_frame/reference_image），比例字段 ratio，分辨率小写——本期只留协议整形器，未接 key",
  modes: ["text", "keyframe", "reference"],
  seconds: { min: 4, max: 15 },
  resolutions: ["720P", "1080P"],
  remoteCancel: true,
  wired: false,
}

const COMPAT_META: VideoFamilyMeta = {
  id: "openai-compat",
  label: "通用 OpenAI 兼容协议族",
  notes: "提交 POST /videos → 轮询 GET /videos/{id} → GET /videos/{id}/content 取产物（dsh 通用回退协议）；未配置自定义端点时不可用",
  modes: ["text", "keyframe"],
  seconds: { min: 4, max: 12 },
  resolutions: ["720P"],
  remoteCancel: true,
  wired: false,
}

/** 判族（id 前缀 + 别名归一）：agnes-* / doubao-seedance-*|seedance* / 其余 openai-compat */
export function detectVideoFamily(modelId: string | undefined | null): VideoFamilyId {
  const id = (modelId ?? "").trim().toLowerCase()
  if (!id) return "agnes"
  if (id.startsWith("agnes")) return "agnes"
  if (id.startsWith("doubao-seedance") || id.startsWith("seedance") || id.startsWith("ark-")) return "ark-seedance"
  return "openai-compat"
}

export function videoFamilyMeta(family: VideoFamilyId): VideoFamilyMeta {
  return family === "agnes" ? AGNES_META : family === "ark-seedance" ? ARK_META : COMPAT_META
}

/** 按模型 id 直取（设置卡渲染当前模型的族能力） */
export function videoFamilyForModel(modelId: string | undefined | null): VideoFamilyMeta {
  return videoFamilyMeta(detectVideoFamily(modelId))
}

/** API 透出清单（UI 能力元数据源） */
export function videoFamilyList(): VideoFamilyMeta[] {
  return [AGNES_META, ARK_META, COMPAT_META]
}

/** 时长钳制（规划只收紧不放大：上限取族上限与请求值的较小者） */
export function clampSeconds(family: VideoFamilyId, seconds: number): number {
  const m = videoFamilyMeta(family)
  return Math.min(m.seconds.max, Math.max(m.seconds.min, Math.round(seconds) || m.seconds.min))
}

// ---------- 请求整形器（每族独立） ----------

export interface ShapeOptions {
  model: string
  /** 设置卡分辨率预设（族不支持时整形器自行降档） */
  resolution: string
}

/** Agnes 家族请求体（现行协议原样迁入：mode/seconds 字符串/size/aspect_ratio/first_frame/images） */
export function shapeAgnesSubmit(req: VideoGenerateRequest, opts: ShapeOptions): Record<string, unknown> {
  const fam = videoFamilyMeta("agnes")
  const size = fam.resolutions.includes(opts.resolution as "720P" | "1080P") ? opts.resolution : "720P"
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: req.prompt,
    mode: req.mode,
    seconds: String(clampSeconds("agnes", req.seconds)),
    size,
  }
  if (req.aspectRatio) body.aspect_ratio = req.aspectRatio
  if (req.firstFrame) body.first_frame = req.firstFrame
  if (req.images?.length) body.images = req.images
  return body
}

/** 方舟 Seedance 家族请求体：content 数组 + role 参考图 + ratio（本期不接 key，仅契约） */
export function shapeArkSubmit(req: VideoGenerateRequest, opts: ShapeOptions): Record<string, unknown> {
  const fam = videoFamilyMeta("ark-seedance")
  const resolution = (fam.resolutions.includes(opts.resolution as "720P" | "1080P") ? opts.resolution : "720P").toLowerCase()
  const content: Record<string, unknown>[] = [{ type: "text", text: req.prompt }]
  if (req.firstFrame) content.push({ type: "image_url", image_url: { url: req.firstFrame }, role: "first_frame" })
  for (const img of req.images ?? []) content.push({ type: "image_url", image_url: { url: img }, role: "reference_image" })
  const body: Record<string, unknown> = {
    model: opts.model,
    content,
    // 方舟分辨率小写（如 720p），比例字段 ratio
    resolution,
    duration: String(clampSeconds("ark-seedance", req.seconds)),
  }
  if (req.aspectRatio) body.ratio = req.aspectRatio
  return body
}

/** 通用 OpenAI 兼容家族请求体（dsh 通用回退：prompt/seconds/size） */
export function shapeCompatSubmit(req: VideoGenerateRequest, opts: ShapeOptions): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: opts.model,
    prompt: req.prompt,
    seconds: clampSeconds("openai-compat", req.seconds),
    size: opts.resolution === "1080P" ? "1080P" : "720P",
  }
  if (req.aspectRatio) body.aspect_ratio = req.aspectRatio
  if (req.firstFrame) body.first_frame = req.firstFrame
  return body
}

/** 统一整形入口（按族分发） */
export function shapeVideoSubmit(family: VideoFamilyId, req: VideoGenerateRequest, opts: ShapeOptions): Record<string, unknown> {
  return family === "agnes" ? shapeAgnesSubmit(req, opts) : family === "ark-seedance" ? shapeArkSubmit(req, opts) : shapeCompatSubmit(req, opts)
}

// ---------- 轮询解析器（每族独立） ----------

export interface ParsedPoll {
  status: VideoTaskStatus
  resultUrl?: string
  error?: string
}

function mapStatus(raw: string | undefined): VideoTaskStatus {
  const s = (raw ?? "").toLowerCase()
  if (["completed", "success", "succeeded", "done"].includes(s)) return "completed"
  if (["failed", "error", "cancelled", "canceled"].includes(s)) return "failed"
  if (["queued", "pending", "created", "submitted"].includes(s)) return "queued"
  if (["running", "processing", "generating", "in_progress"].includes(s)) return "running"
  return "unknown"
}

/** Agnes 家族轮询解析（metadata.url / url / video_url 三字段兼容；status/state 双字段） */
export function parseAgnesPoll(json: Record<string, unknown>): ParsedPoll {
  const status = mapStatus(String(json.status ?? json.state ?? ""))
  const metadata = json.metadata as { url?: string } | undefined
  const resultUrl = (json.url ?? json.video_url ?? metadata?.url) as string | undefined
  const error = status === "failed" ? String(json.error ?? json.message ?? "生成失败") : undefined
  if (status === "completed" && !resultUrl) return { status: "running" }
  return { status: status === "unknown" && resultUrl ? "completed" : status, resultUrl, error }
}

/** 方舟家族轮询解析：任务级 status + content.video_url */
export function parseArkPoll(json: Record<string, unknown>): ParsedPoll {
  const status = mapStatus(String(json.status ?? json.state ?? ""))
  const content = json.content as Record<string, unknown> | undefined
  const resultUrl = content?.video_url as string | undefined
  return { status, resultUrl, error: status === "failed" ? String(json.error ?? json.task_error ?? "生成失败") : undefined }
}

/** 通用兼容家族轮询解析：status + url/video_url */
export function parseCompatPoll(json: Record<string, unknown>): ParsedPoll {
  const status = mapStatus(String(json.status ?? json.state ?? ""))
  const resultUrl = (json.url ?? json.video_url ?? (json.metadata as { url?: string } | undefined)?.url) as string | undefined
  return { status, resultUrl, error: status === "failed" ? String(json.error ?? json.message ?? "生成失败") : undefined }
}

/** 统一轮询解析入口（按族分发） */
export function parseVideoPoll(family: VideoFamilyId, json: Record<string, unknown>): ParsedPoll {
  return family === "agnes" ? parseAgnesPoll(json) : family === "ark-seedance" ? parseArkPoll(json) : parseCompatPoll(json)
}
