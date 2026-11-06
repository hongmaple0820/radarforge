// ============================================================
// agnes-video.ts —— Agnes 视频模型 provider（异步三件套）
// 协议整形/轮询解析已下沉 family.ts（C3 协议族抽象）：本文件只
// 保留 Agnes 特有的账号池取号、双端点轮询模板与错误上报。
// 双上游仓库对轮询端点描述不一致（/v1/videos/{id} 取
// metadata.url vs /agnesapi 取顶层 url），故保留「可配置模板」：
// 两端点依次尝试。每账号 1 任务/分钟（acquireVideoSlot 记账）；
// 无远程取消。模型 id 非agnes 协议族时显式报错（C3 守卫）。
// ============================================================

import type { HealthReport, VideoGenerateRequest, VideoProvider, VideoTask } from "../../types"
import { getSettings, peekSettings } from "@/lib/settings"
import { acquireVideoSlot, accountBaseUrl, reportFailure, reportSuccess } from "./pool"
import { detectVideoFamily, parseAgnesPoll, shapeAgnesSubmit, videoFamilyMeta } from "../video/family"

interface SubmitResponse {
  id?: string
  video_id?: string
  task_id?: string
  error?: string
  message?: string
}

function extractTaskId(json: SubmitResponse): string | undefined {
  return json.id ?? json.video_id ?? json.task_id
}

/** C3 族守卫：视频模型清单可能混入其它协议族 id（如 doubao-seedance-*），提交前显式拦截 */
function assertAgnesFamily(model: string): void {
  const family = detectVideoFamily(model)
  if (family !== "agnes") {
    const meta = videoFamilyMeta(family)
    throw new Error(`模型「${model}」属于${meta.label}（${meta.notes}）——不能经 Agnes 端点提交，请在设置中心换用 agnes-* 模型或等待该协议族接入`)
  }
}

export const agnesVideo: VideoProvider = {
  kind: "VIDEO",
  name: "agnes-video",
  label: "Agnes 免费视频模型（多账号池）",
  notes: "agnes-video-2.5-flash（720P/1080P · 4-12s）；每账号 1 任务/分钟；text/keyframe/reference 三模式（keyframe=AI 首帧 i2v 主轨）",
  isConfigured() {
    const s = peekSettings()?.agnes
    return Boolean(s?.enabled && s.accounts.some((a) => a.enabled && a.apiKey))
  },
  async submitVideo(req: VideoGenerateRequest): Promise<VideoTask> {
    const s = await getSettings(true)
    if (!s.agnes.enabled) throw new Error("Agnes 未启用（设置中心 → Agnes 账号池）")
    // P1-5：模型从视频通道卡收敛配置（回退 Agnes 池旧字段保兼容）
    const model = s.video.model || s.agnes.videoModel
    assertAgnesFamily(model)
    // 真机实测补强：503 video_queue_full / 429 / 5xx 时换号重试（视频队列按账号隔离，
    // 换个账号往往就能提交）；401/403 认证类直接报错不重试。上限 = 活跃账号数（≤4）。
    const activeAccounts = s.agnes.accounts.filter((a) => a.enabled && a.apiKey)
    const maxAttempts = Math.max(1, Math.min(4, activeAccounts.length))
    let lastQueueErr: Error | null = null
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const { slot, reason, waitMs } = await acquireVideoSlot(s.agnes)
      if (!slot) {
        throw new Error(
          `Agnes 视频通道繁忙：${reason ?? "未知"}${waitMs > 0 ? `（约 ${Math.ceil(waitMs / 1000)}s 后有账号释放）` : ""}${lastQueueErr ? `；前次：${lastQueueErr.message.slice(0, 80)}` : ""}；可增加账号扩容或切回本地渲染`,
        )
      }
      try {
        // C3：请求整形下沉协议族模块（mode/seconds/size/first_frame/images）
        const body = shapeAgnesSubmit(req, { model, resolution: s.video.resolution })
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
        if (res.status === 429 || res.status === 503 || (res.status >= 500 && res.status !== 501)) {
          // 可换号类：上报限频/错误 → 换下一个账号再试（队列按账号隔离）
          reportFailure(slot.account, res.status === 429 ? "rate-limit" : "error")
          const text = await res.text().catch(() => "")
          lastQueueErr = new Error(`HTTP ${res.status} ${text.slice(0, 100)}（账号 ${slot.account.label}）`)
          continue
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
        // 真机实测补强：记住提交账号（任务按账号隔离，轮询须用同一账号密钥）
        return { id: taskId, status: "queued", remoteTaskId: taskId, accountRef: slot.account.id }
      } catch (e) {
        if ((e as Error).message.includes("fetch failed")) reportFailure(slot.account, "error")
        throw e
      }
    }
    throw new Error(`Agnes 视频提交失败（已试 ${maxAttempts} 个账号）：${lastQueueErr?.message ?? "全部账号不可用"}`)
  },
  async getVideoTask(remoteTaskId: string, accountRef?: string): Promise<VideoTask> {
    const s = await getSettings(true)
    // 真机实测补强：任务按账号隔离 → 轮询优先用提交账号（accountRef），
    // 找不到（已删除/停用）才回退第一个可用账号（旧任务兼容）
    const account =
      (accountRef && s.agnes.accounts.find((a) => a.id === accountRef && a.enabled && a.apiKey)) ||
      s.agnes.accounts.find((a) => a.enabled && a.apiKey) ||
      null
    if (!account) throw new Error("Agnes 账号池为空")
    const base = accountBaseUrl(account)
    // 双端点模板兼容：先 /videos/{id}（OpenAI 风格），404/解析失败再试 /agnesapi?video_id=
    const model = s.video.model || s.agnes.videoModel
    const endpoints = [
      `${base}/videos/${encodeURIComponent(remoteTaskId)}`,
      `${base.replace(/\/v1$/, "")}/agnesapi?video_id=${encodeURIComponent(remoteTaskId)}&model_name=${encodeURIComponent(model)}`,
    ]
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
        const json = (await res.json()) as Record<string, unknown>
        reportSuccess(account)
        // C3：轮询解析下沉协议族模块（metadata.url / url / video_url 兼容）
        const parsed = parseAgnesPoll(json)
        return {
          id: remoteTaskId,
          status: parsed.status,
          remoteTaskId,
          resultUrl: parsed.resultUrl,
          error: parsed.error,
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
        detail: `${s.video.model || s.agnes.videoModel} · 720P/1080P · 4-12s · keyframe i2v`,
      }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
