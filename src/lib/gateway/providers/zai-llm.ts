/**
 * 内建 LLMProvider：Z.ai GLM（z-ai-web-dev-sdk）
 *
 * 1.0 的 /api/briefing 已在用它生成早报；网关化后统一收口，
 * 后续新增 OpenAI / Anthropic / DeepSeek 等 Provider 时走同一 LlmProvider 接口。
 */

import ZAI from 'z-ai-web-dev-sdk'
import type { HealthReport, LlmProvider, LlmRequest, LlmResponse } from '../types'

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>
let cached: ZaiClient | null = null

async function getClient(): Promise<ZaiClient> {
  if (!cached) cached = await ZAI.create()
  return cached
}

export const zaiLlmProvider: LlmProvider = {
  info: {
    id: 'zai-llm',
    kind: 'llm',
    name: 'Z.ai GLM（内建）',
    description: '运行环境自带的 GLM 系列模型，承担早报生成 / 选题打分 / 审稿等文本任务',
    origin: 'builtin',
  },
  isConfigured: () => true,
  async healthCheck(): Promise<HealthReport> {
    const started = Date.now()
    try {
      const zai = await getClient()
      const completion = await zai.chat.completions.create({
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 8,
        thinking: { type: 'disabled' },
      })
      const content = completion.choices[0]?.message?.content ?? ''
      return {
        ok: content.trim().length > 0,
        latencyMs: Date.now() - started,
        detail: content.trim() ? '对话链路正常' : '返回内容为空',
        checkedAt: new Date().toISOString(),
      }
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        detail: (e as Error)?.message || 'SDK 初始化失败',
        checkedAt: new Date().toISOString(),
      }
    }
  },
  async complete(req: LlmRequest): Promise<LlmResponse> {
    const started = Date.now()
    const zai = await getClient()
    const completion = await zai.chat.completions.create({
      messages: req.messages,
      temperature: req.temperature,
      max_tokens: req.maxTokens,
      thinking: { type: 'disabled' },
    })
    const content = completion.choices[0]?.message?.content ?? ''
    if (!content.trim()) throw new Error('LLM 返回内容为空')
    return { content, latencyMs: Date.now() - started, model: completion.model }
  },
}
