// ============================================================
// agnes-video.ts —— Agnes 视频模型 provider（异步三件套）
// 协议族（学 dsh imagegen-video 的 agnes 家族 + dsh-agnes-multimodal
// 的实测差异）：提交 POST /videos → 轮询取 url。两上游仓库对轮询端点
// 描述不一致（/v1/videos/{id} 取 metadata.url vs /agnesapi 取顶层 url），
// 故做成「可配置模板」：pollPath 支持 /videos/{id} 与 /agnesapi 两种，
// 解析兼容 metadata.url / url / video_url 三种字段。
// 每账号 1 任务/分钟（acquireVideoSlot 记账）；无远程取消。
// ============================================================

import type { HealthReport, VideoGenerateRequest, VideoProvider, VideoTask } from "../../types"
import { getSettings, peekSettings } from "@/lib/settings"
import { acquireVideoSlot, accountBaseUrl, reportFailure, reportSuccess } from "./pool"

interface SubmitResponse {
  id?: string
  video_id?: string
  task_id?: string
  error?: string
  message?: string
}

interface PollResponse {
  status?: string
  state?: string
  url?: string
  video_url?: string
  metadata?: { url?: string }
  error?: string
  message?: string
  progress?: number
}

function extractTaskId(json: SubmitResponse): string | undefined {
  return json.id ?? json.video_id ?? json.task_id
}

function extractUrl(json: PollResponse): string | undefined {
  return json.url ?? json.video_url ?? json.metadata?.url
}

function mapStatus(raw: string | undefined): VideoTask["status"] {
  const s = (raw ?? "").toLowerCase()
  if (["completed", "success", "succeeded", "done"].includes(s)) return "completed"
  if (["failed", "error", "cancelled", "canceled"].includes(s)) return "failed"
  if (["queued", "pending", "created", "submitted"].includes(s)) return "queued"
  if (["running", "processing", "generating", "in_progress"].includes(s)) return "running"
  return "unknown"
}

export const agnesVideo: VideoProvider = {
  kind: "VIDEO",
  name: "agnes-video",
  label: "Agnes 免费视频模型（多账号池）",
  notes: "agnes-video-2.5-flash（720P · 4-12s）；每账号 1 任务/分钟；text/keyframe/reference 三模式",
  isConfigured() {
    const s = peekSettings()?.agnes
    return Boolean(s?.enabled && s.accounts.some((a) => a.enabled && a.apiKey))
  },
  async submitVideo(req: VideoGenerateRequest): Promise<VideoTask> {
    const s = await getSettings(true)
    if (!s.agnes.enabled) throw new Error("Agnes 未启用（设置中心 → Agnes 账号池）")
    const { slot, reason, waitMs } = await acquireVideoSlot(s.agnes)
    if (!slot) {
      throw new Error(
        `Agnes 视频通道繁忙：${reason ?? "未知"}${waitMs > 0 ? `（约 ${Math.ceil(waitMs / 1000)}s 后有账号释放）` : ""}；可增加账号扩容或切回本地渲染`,
      )
    }
    try {
      const body: Record<string, unknown> = {
        model: s.agnes.videoModel,
        prompt: req.prompt,
        mode: req.mode,
        seconds: String(Math.min(12, Math.max(4, Math.round(req.seconds)))),
        size: "720P",
      }
      if (req.aspectRatio) body.aspect_ratio = req.aspectRatio
      if (req.firstFrame) body.first_frame = req.firstFrame
      if (req.images?.length) body.images = req.images
      const res = await fetch(`${accountBaseUrl(slot.account)}/videos`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${slot.account.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      })
      if (res.status === 401 || res.status === 403) {
        reportFailure(slot.account, "auth")
        throw new Error(`Agnes 密钥无效（${res.status}，账号 ${slot.account.label}）`)
      }
      if (res.status === 429) {
        reportFailure(slot.account, "rate-limit")
        throw new Error(`Agnes 视频限频（429，账号 ${slot.account.label}；每账号 1 任务/分钟）`)
      }
      if (!res.ok) {
        reportFailure(slot.account, "error")
        const text = await res.text().catch(() => "")
        throw new Error(`Agnes 视频提交失败：HTTP ${res.status} ${text.slice(0, 120)}`)
      }
      const json = (await res.json()) as SubmitResponse
      reportSuccess(slot.account)
      const taskId = extractTaskId(json)
      if (!taskId) throw new Error(`Agnes 视频提交未返回任务 id（${json.message ?? json.error ?? "无字段"}）`)
      return { id: taskId, status: "queued", remoteTaskId: taskId }
    } catch (e) {
      if ((e as Error).message.includes("fetch failed")) reportFailure(slot.account, "error")
      throw e
    }
  },
  async getVideoTask(remoteTaskId: string): Promise<VideoTask> {
    const s = await getSettings(true)
    const account = s.agnes.accounts.find((a) => a.enabled && a.apiKey) ?? null
    if (!account) throw new Error("Agnes 账号池为空")
    const base = accountBaseUrl(account)
    // 双端点模板兼容：先 /videos/{id}（OpenAI 风格），404/解析失败再试 /agnesapi?video_id=
    const endpoints = [`${base}/videos/${encodeURIComponent(remoteTaskId)}`, `${base.replace(/\/v1$/, "")}/agnesapi?video_id=${encodeURIComponent(remoteTaskId)}&model_name=${encodeURIComponent(s.agnes.videoModel)}`]
    let lastError = ""
    for (const url of endpoints) {
      try {
        const res = await fetch(url, {
          headers: { Authorization: `Bearer ${account.apiKey}` },
          signal: AbortSignal.timeout(20_000),
        })
        if (res.status === 404) {
          lastError = "404"
          continue
        }
        if (!res.ok) {
          reportFailure(account, res.status === 429 ? "rate-limit" : "error")
          return { id: remoteTaskId, status: "unknown", remoteTaskId, error: `HTTP ${res.status}` }
        }
        const json = (await res.json()) as PollResponse
        reportSuccess(account)
        const status = mapStatus(json.status ?? json.state)
        const resultUrl = extractUrl(json)
        if (status === "completed" && !resultUrl) {
          return { id: remoteTaskId, status: "running", remoteTaskId }
        }
        return {
          id: remoteTaskId,
          status: status === "unknown" && resultUrl ? "completed" : status,
          remoteTaskId,
          resultUrl,
          error: status === "failed" ? (json.error ?? json.message ?? "生成失败") : undefined,
        }
      } catch (e) {
        lastError = (e as Error).message
      }
    }
    return { id: remoteTaskId, status: "unknown", remoteTaskId, error: `轮询失败：${lastError}` }
  },
  async cancelVideoTask(): Promise<{ supported: boolean; message?: string }> {
    // dsh 协议族标注 REMOTE_CANCEL: unsupported —— Agnes 无远程取消
    return { supported: false, message: "Agnes 视频任务不支持远程取消（等待自然完成即可，不占本地线程）" }
  },
  async health(): Promise<HealthReport> {
    const s = await getSettings(true)
    const account = s.agnes.accounts.find((a) => a.enabled && a.apiKey) ?? null
    if (!account) return { status: "down", latencyMs: 0, error: "账号池为空" }
    const t0 = Date.now()
    try {
      const res = await fetch(`${accountBaseUrl(account)}/models`, {
        headers: { Authorization: `Bearer ${account.apiKey}` },
        signal: AbortSignal.timeout(8000),
      })
      return {
        status: res.ok || res.status === 429 ? "healthy" : res.status === 401 ? "down" : "degraded",
        latencyMs: Date.now() - t0,
        error: res.ok ? undefined : `HTTP ${res.status}`,
        detail: `${s.agnes.videoModel} · 720P · 4-12s`,
      }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
