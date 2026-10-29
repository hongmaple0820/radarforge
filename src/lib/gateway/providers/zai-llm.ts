// ============================================================
// z-ai LLM Provider —— z-ai-web-dev-sdk（仅后端）
// ============================================================

import type { ChatMessage, HealthReport, LLMProvider } from "../types"

export const zaiLlm: LLMProvider = {
  kind: "LLM",
  name: "zai-llm",
  label: "Z.ai LLM（z-ai-web-dev-sdk）",
  notes: "平台内置文本生成引擎：早报撰写 / run 执行 / 审稿均经由此 provider",
  isConfigured: () => true, // 沙箱内 SDK 免密钥
  async chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string> {
    const { default: ZAI } = await import("z-ai-web-dev-sdk")
    const zai = await ZAI.create()
    const response = await zai.chat.completions.create({
      messages,
      stream: false,
      thinking: { type: "disabled" },
      temperature: opts?.temperature ?? 0.7,
    })
    return response.choices?.[0]?.message?.content ?? ""
  },
  async health(): Promise<HealthReport> {
    const t0 = Date.now()
    try {
      const reply = await this.chat(
        [
          { role: "user", content: "回复两个字：正常" },
        ],
        { temperature: 0 },
      )
      return {
        status: reply ? "healthy" : "degraded",
        latencyMs: Date.now() - t0,
        detail: reply ? `探活回复: ${reply.slice(0, 20)}` : "空回复",
      }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
