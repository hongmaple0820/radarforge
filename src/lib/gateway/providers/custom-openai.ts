// ============================================================
// custom-openai-llm —— 自定义模型 Provider（OpenAI 兼容协议）
// baseUrl/apiKey/model 全部来自设置中心（DB 动态读取，改完即生效）
// 兼容：DeepSeek / Moonshot / Qwen(DashScope兼容模式) / OpenAI / 本地 Ollama 等
// ============================================================

import { getSettings, peekSettings } from "@/lib/settings"
import type { ChatMessage, HealthReport, LLMProvider } from "../types"

function normalizeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/chat\/completions$/, "")
}

async function chatCompletions(
  messages: ChatMessage[],
  opts?: { temperature?: number },
): Promise<string> {
  const s = await getSettings()
  if (!s.llm.baseUrl || !s.llm.apiKey) {
    throw new Error("自定义模型未配置（设置中心 → 模型服务 → LLM）")
  }
  const url = `${normalizeBase(s.llm.baseUrl)}/chat/completions`
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${s.llm.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: s.llm.model || "gpt-4o-mini",
      messages,
      temperature: opts?.temperature ?? 0.7,
      stream: false,
    }),
    signal: AbortSignal.timeout(60000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`自定义 LLM HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ""}`)
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    error?: { message?: string }
  }
  if (json.error?.message) throw new Error(json.error.message)
  return json.choices?.[0]?.message?.content ?? ""
}

export const customOpenaiLlm: LLMProvider = {
  kind: "LLM",
  name: "custom-openai-llm",
  label: "自定义模型（OpenAI 兼容）",
  notes: "设置中心配置 baseUrl/apiKey/model 后启用；DeepSeek、Moonshot、通义、OpenAI、Ollama 等均可接入",
  // 同步窥视缓存（缓存未预热时保守返回 false；healthCheckAll 会先调 getSettings）
  isConfigured(): boolean {
    const s = peekSettings()
    return Boolean(s && s.llm.mode === "custom" && s.llm.baseUrl && s.llm.apiKey)
  },
  async chat(messages, opts) {
    return chatCompletions(messages, opts)
  },
  async health(): Promise<HealthReport> {
    const t0 = Date.now()
    try {
      const s = await getSettings() // 预热缓存，保证 isConfigured 同步可见
      if (s.llm.mode !== "custom" || !s.llm.baseUrl || !s.llm.apiKey) {
        return { status: "unknown", latencyMs: 0, detail: "未启用自定义模型（当前走内置引擎）" }
      }
      const reply = await chatCompletions([{ role: "user", content: "回复两个字：正常" }], { temperature: 0 })
      return {
        status: reply ? "healthy" : "degraded",
        latencyMs: Date.now() - t0,
        detail: reply ? `连通正常（${s.llm.model || "默认模型"}）：${reply.slice(0, 20)}` : "空回复",
      }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
