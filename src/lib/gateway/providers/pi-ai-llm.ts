// ============================================================
// pi-ai-llm.ts —— pi-ai 统一多供应商 LLM 引擎 provider
// @mariozechner/pi-ai（MIT）：30+ 供应商统一 API（openai / anthropic /
// google / deepseek / groq / kimi / minimax / moonshot / openrouter /
// xai / zai…），模型目录自带 baseUrl 与成本表。
// 用户点名引入：「pi-ai 这个框架本身就有 LLM 接入的支持」——
// 以供应商方式接入：设置中心选 mode=pi-ai + provider + model + key，
// 失败自动回退内置引擎（与 agnes/custom 同链路语义）。
// ============================================================

import type { ChatMessage, HealthReport, LLMProvider } from "../types"
import { getSettings, peekSettings } from "@/lib/settings"

/** settings.llm.mode === "pi-ai" 时是否具备调用条件 */
function piAiReady(): boolean {
  const s = peekSettings()
  if (!s || s.llm.mode !== "pi-ai") return false
  return Boolean(s.llm.piProvider && s.llm.model)
}

export const piAiLlm: LLMProvider = {
  kind: "LLM",
  name: "pi-ai-llm",
  label: "pi-ai 统一引擎（30+ 供应商）",
  notes: "@mariozechner/pi-ai 统一多供应商 LLM API：openai / anthropic / google / deepseek / groq / kimi / openrouter / xai…",
  isConfigured() {
    return piAiReady()
  },
  async chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string> {
    const s = await getSettings(true)
    if (s.llm.mode !== "pi-ai" || !s.llm.piProvider || !s.llm.model) {
      throw new Error("pi-ai 模式未配置完整（设置中心 → AI 大模型 → pi-ai 统一引擎）")
    }
    // 动态 import：把 pi-ai 排除在非必要加载路径之外
    const pi = await import("@mariozechner/pi-ai")
    const t0 = Date.now()

    // 构造模型：已知供应商走注册表（带 baseUrl/成本），未知 id 或 custom baseUrl 手工建
    let model: unknown
    const providers = pi.getProviders() as string[]
    const known = providers.includes(s.llm.piProvider)
    if (known && !s.llm.baseUrl) {
      // getModel 对目录外 id 返回 undefined（不抛错）——必须防护，否则 completeSimple 读 model.api 崩溃
      let m = pi.getModel(s.llm.piProvider as never, s.llm.model as never) as unknown
      if (!m) {
        // 目录内宽松匹配：前缀 / 去日期后缀（如 claude-3-5-sonnet → claude-3-5-sonnet-20240620）
        const catalog = pi.getModels(s.llm.piProvider as never) as { id: string }[]
        const want = s.llm.model.toLowerCase()
        m =
          catalog.find((x) => x.id.toLowerCase() === want) ??
          catalog.find((x) => x.id.toLowerCase().startsWith(want)) ??
          catalog.find((x) => x.id.toLowerCase().split("-20")[0] === want.split("-20")[0])
      }
      if (m) {
        model = m
      } else {
        const catalog = pi.getModels(s.llm.piProvider as never) as { id: string }[]
        throw new Error(
          `模型 "${s.llm.model}" 不在 ${s.llm.piProvider} 目录（${catalog.length} 个模型，如 ${catalog.slice(0, 3).map((x) => x.id).join(" / ")}）。可换目录内 id，或填 Base URL 走自定义端点`,
        )
      }
    } else {
      // 自定义 OpenAI 兼容端点（或注册表外 model id）：手工构造 Model 对象
      const base = s.llm.baseUrl || "https://api.openai.com/v1"
      model = {
        id: s.llm.model,
        name: s.llm.model,
        api: "openai-completions",
        provider: (known ? s.llm.piProvider : "custom-openai") as never,
        baseUrl: base,
        reasoning: false,
        input: ["text"],
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        contextWindow: 128_000,
        maxTokens: 8192,
      } as never
    }

    // Context：system 消息抽成 systemPrompt（pi-ai 语义）
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n")
    const rest = messages.filter((m) => m.role !== "system")
    const context = {
      ...(system ? { systemPrompt: system } : {}),
      messages: rest.map((m) => ({ role: m.role, content: [{ type: "text", text: m.content }] })),
    } as never

    const assistant = (await pi.completeSimple(model as never, context, {
      apiKey: s.llm.apiKey || undefined,
      temperature: opts?.temperature,
      maxTokens: 4096,
    })) as unknown as { content: { type: string; text?: string }[] }

    const text = (assistant.content ?? [])
      .filter((c) => c.type === "text" && c.text)
      .map((c) => c.text)
      .join("\n")
      .trim()
    if (!text) throw new Error("pi-ai 返回空内容")
    void t0
    return text
  },
  async health(): Promise<HealthReport> {
    const s = await getSettings(true)
    const ready = s.llm.mode === "pi-ai" && s.llm.piProvider && s.llm.model
    if (!ready) return { status: "unknown", latencyMs: 0, detail: "pi-ai 模式未配置（provider/model 缺失）" }
    const t0 = Date.now()
    try {
      const pi = await import("@mariozechner/pi-ai")
      const count = pi.getModels(s.llm.piProvider as never).length
      return {
        status: "healthy",
        latencyMs: Date.now() - t0,
        detail: `${s.llm.piProvider} 目录 ${count} 模型 · 当前 ${s.llm.model}（连通性以真实调用为准）`,
      }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
