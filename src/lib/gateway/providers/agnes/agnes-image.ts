// ============================================================
// agnes-image.ts —— Agnes 图片模型 provider（images/generations）
// 免费模型 agnes-image-2.1/2.5-flash；支持参考图数组（编辑/融合）
// 协议：POST /images/generations {model, prompt, extra_body:{image:[...]}, size}
// ============================================================

import type { HealthReport, ImageGenerateRequest, ImageGenerateResult, ImageProvider } from "../../types"
import { getSettings, peekSettings } from "@/lib/settings"
import { acquireImageSlot, accountBaseUrl, reportFailure, reportSuccess } from "./pool"

export const agnesImage: ImageProvider = {
  kind: "IMAGE",
  name: "agnes-image",
  label: "Agnes 免费生图（多账号池）",
  notes: "agnes-image-2.1/2.5-flash 免费额度；1K 尺寸 10 RPM/账号，多账号扩容；支持参考图编辑",
  isConfigured() {
    const s = peekSettings()?.agnes
    return Boolean(s?.enabled && s.accounts.some((a) => a.enabled && a.apiKey))
  },
  async generate(req: ImageGenerateRequest): Promise<ImageGenerateResult> {
    const s = await getSettings(true)
    if (!s.agnes.enabled) throw new Error("Agnes 未启用（设置中心 → Agnes 账号池）")
    const { slot, reason, waitMs } = await acquireImageSlot(s.agnes)
    if (!slot) {
      throw new Error(`Agnes 账号池无可用账号：${reason ?? "未知"}${waitMs > 0 ? `（${Math.ceil(waitMs / 1000)}s 后释放）` : ""}`)
    }
    try {
      const body: Record<string, unknown> = {
        model: s.agnes.imageModel,
        prompt: req.prompt,
        response_format: "url",
      }
      if (req.size) body.size = req.size
      if (req.referenceImages?.length) body.image = req.referenceImages
      const res = await fetch(`${accountBaseUrl(slot.account)}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${slot.account.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(180_000),
      })
      if (res.status === 401 || res.status === 403) {
        reportFailure(slot.account, "auth")
        throw new Error(`Agnes 密钥无效（${res.status}，账号 ${slot.account.label}）`)
      }
      if (res.status === 429) {
        reportFailure(slot.account, "rate-limit")
        throw new Error(`Agnes 生图限频（429，账号 ${slot.account.label}）`)
      }
      if (!res.ok) {
        reportFailure(slot.account, "error")
        throw new Error(`Agnes 生图失败：HTTP ${res.status}`)
      }
      const json = (await res.json()) as { data?: { url?: string; b64_json?: string }[] }
      reportSuccess(slot.account)
      const images = (json.data ?? [])
        .map((d) => (d.b64_json ? `data:image/png;base64,${d.b64_json}` : d.url))
        .filter((x): x is string => Boolean(x))
      if (images.length === 0) throw new Error("Agnes 生图返回空")
      return { images, provider: "agnes-image" }
    } catch (e) {
      if ((e as Error).message.includes("fetch failed")) reportFailure(slot.account, "error")
      throw e
    }
  },
  async health(): Promise<HealthReport> {
    const s = await getSettings(true)
    const { slot } = await acquireImageSlot(s.agnes)
    if (!slot) return { status: "down", latencyMs: 0, error: "账号池为空" }
    const t0 = Date.now()
    try {
      const res = await fetch(`${accountBaseUrl(slot.account)}/models`, {
        headers: { Authorization: `Bearer ${slot.account.apiKey}` },
        signal: AbortSignal.timeout(8000),
      })
      return {
        status: res.ok || res.status === 429 ? "healthy" : res.status === 401 ? "down" : "degraded",
        latencyMs: Date.now() - t0,
        error: res.ok ? undefined : `HTTP ${res.status}`,
        detail: `${s.agnes.imageModel}`,
      }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
