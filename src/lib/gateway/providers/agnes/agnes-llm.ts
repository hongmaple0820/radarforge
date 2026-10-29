// ============================================================
// agnes-llm.ts —— Agnes 文本模型 provider（OpenAI 兼容 chat）
// 免费模型 agnes-2.5-flash / agnes-3.0-flash；走账号池取号
// ============================================================

import type { ChatMessage, HealthReport, LLMProvider } from "../../types"
import { getSettings, peekSettings } from "@/lib/settings"
import { acquireImageSlot, accountBaseUrl, reportFailure, reportSuccess } from "./pool"

export const agnesLlm: LLMProvider = {
  kind: "LLM",
  name: "agnes-llm",
  label: "Agnes 免费文本（多账号池）",
  notes: "OpenAI 兼容 chat/completions；agnes-2.5/3.0-flash 免费额度，多账号轮询扩容",
  isConfigured() {
    const s = peekSettings()?.agnes
    return Boolean(s?.enabled && s.accounts.some((a) => a.enabled && a.apiKey))
  },
  async chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string> {
    const s = await getSettings(true)
    if (!s.agnes.enabled) throw new Error("Agnes 未启用（设置中心 → Agnes 账号池）")
    const { slot, reason } = await acquireImageSlot(s.agnes)
    if (!slot) throw new Error(`Agnes 账号池无可用账号：${reason ?? "未知"}`)
    try {
      const res = await fetch(`${accountBaseUrl(slot.account)}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${slot.account.apiKey}`,
        },
        body: JSON.stringify({
          model: s.agnes.chatModel,
          messages,
          temperature: opts?.temperature ?? 0.7,
        }),
        signal: AbortSignal.timeout(120_000),
      })
      if (res.status === 401 || res.status === 403) {
        reportFailure(slot.account, "auth")
        throw new Error(`Agnes 密钥无效（${res.status}，账号 ${slot.account.label}）`)
      }
      if (res.status === 429) {
        reportFailure(slot.account, "rate-limit")
        throw new Error(`Agnes 限频（429，账号 ${slot.account.label}；建议多账号扩容）`)
      }
      if (!res.ok) {
        reportFailure(slot.account, "error")
        throw new Error(`Agnes chat 失败：HTTP ${res.status}`)
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] }
      reportSuccess(slot.account)
      const out = json.choices?.[0]?.message?.content ?? ""
      if (!out) throw new Error("Agnes 返回空内容")
      return out
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
        detail: `${s.agnes.chatModel} · 池 ${s.agnes.accounts.filter((a) => a.enabled && a.apiKey).length} 号`,
      }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
