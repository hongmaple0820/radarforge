// ============================================================
// z-ai LLM Provider —— z-ai-web-dev-sdk（仅后端）
// 429 退避重试：内置引擎配额按窗口结算，突发密集调用（如连续跑
// 全量回归）会短暂触顶；间隔重试 ×2 可让流水线扛过瞬时限流，
// 避免整条 run 直接 status=error。
// ============================================================

import type { ChatMessage, HealthReport, LLMProvider } from "../types"

const RETRY_DELAYS_MS = [2_500, 6_000]

function isTransient(e: unknown): boolean {
  const msg = (e as Error)?.message ?? ""
  return msg.includes("429") || msg.toLowerCase().includes("too many requests")
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const zaiLlm: LLMProvider = {
  kind: "LLM",
  name: "zai-llm",
  label: "Z.ai LLM（z-ai-web-dev-sdk）",
  notes: "平台内置文本生成引擎：早报撰写 / run 执行 / 审稿均经由此 provider",
  isConfigured: () => true, // 沙箱内 SDK 免密钥
  async chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string> {
    const { default: ZAI } = await import("z-ai-web-dev-sdk")
    const zai = await ZAI.create()
    let lastErr: unknown
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      if (attempt > 0) await sleep(RETRY_DELAYS_MS[attempt - 1])
      try {
        const response = await zai.chat.completions.create({
          messages,
          stream: false,
          thinking: { type: "disabled" },
          temperature: opts?.temperature ?? 0.7,
        })
        return response.choices?.[0]?.message?.content ?? ""
      } catch (e) {
        lastErr = e
        if (!isTransient(e)) throw e // 非瞬时限流错误不重试
      }
    }
    throw lastErr
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
