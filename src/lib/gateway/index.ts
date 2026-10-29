// ============================================================
// 模型网关 · 调度入口
// - 启动注册内置 provider
// - searchWithFallback: 真实 → 演示 降级链（返回实际 mode）
// - 健康巡检结果写 ProviderRecord
// ============================================================

import { db } from "@/lib/db"
import { registry } from "./registry"
import { GatewayError } from "./types"
import type { ChatMessage, HealthReport, ProviderDescriptor, SearchRequest, SearchResult } from "./types"
import { demoSearch } from "./providers/demo-search"
import { yuanbaoSearch } from "./providers/yuanbao-search"
import { zaiImage } from "./providers/zai-image"
import { zaiLlm } from "./providers/zai-llm"
import { customOpenaiLlm } from "./providers/custom-openai"
import { agnesLlm } from "./providers/agnes/agnes-llm"
import { agnesImage } from "./providers/agnes/agnes-image"
import { agnesVideo } from "./providers/agnes/agnes-video"
import { piAiLlm } from "./providers/pi-ai-llm"
import { getSettings } from "@/lib/settings"

// ---------- 启动注册内置 provider ----------
let registered = false
export function ensureBuiltinProviders(): void {
  if (registered) return
  registry.register(yuanbaoSearch)
  registry.register(demoSearch)
  registry.register(zaiLlm)
  registry.register(customOpenaiLlm)
  registry.register(agnesLlm)
  registry.register(piAiLlm)
  registry.register(zaiImage)
  registry.register(agnesImage)
  registry.register(agnesVideo)
  void getSettings() // 预热设置缓存（同步 isConfigured 可见）
  registered = true
}

ensureBuiltinProviders()

// ---------- 类型守卫 ----------
function asSearch(name: string) {
  const p = registry.get(name)
  if (p.kind !== "SEARCH") throw new GatewayError(`Provider "${name}" 不是 SEARCH 类型（实际 ${p.kind}）`, "PROTOCOL_ERROR")
  return p
}

// ---------- 搜索：降级链 ----------
export interface GatewaySearchResponse {
  mode: "REAL" | "DEMO"
  provider: string
  results: SearchResult[]
  fallbackReason?: string
}

export async function searchWithFallback(req: SearchRequest): Promise<GatewaySearchResponse> {
  const chain = ["yuanbao-search", "demo-search"]
  let lastError = ""
  for (const name of chain) {
    const p = asSearch(name)
    if (!p.isConfigured()) {
      lastError = `${name} 未配置密钥`
      await recordCall(name, false, 0, lastError)
      continue
    }
    const t0 = Date.now()
    try {
      const results = await p.search(req)
      await recordCall(name, true, Date.now() - t0)
      const isDemo = name === "demo-search"
      return {
        mode: isDemo ? "DEMO" : "REAL",
        provider: name,
        results,
        fallbackReason: isDemo && lastError ? lastError : undefined,
      }
    } catch (e) {
      lastError = `${name}: ${(e as Error).message}`
      await recordCall(name, false, Date.now() - t0, (e as Error).message)
    }
  }
  throw new GatewayError(`搜索降级链全部失败（${lastError}）`, "ALL_PROVIDERS_FAILED")
}

// ---------- LLM（设置中心可切换：agnes 免费池 / pi-ai 统一引擎 / 自定义 OpenAI 兼容 / 内置 SDK） ----------
export async function chat(messages: ChatMessage[], opts?: { temperature?: number }): Promise<string> {
  const s = await getSettings()
  const useAgnes = s.llm.mode === "agnes" && s.agnes.enabled && s.agnes.accounts.some((a) => a.enabled && a.apiKey)
  const usePiAi = s.llm.mode === "pi-ai" && s.llm.piProvider && s.llm.model
  const useCustom = s.llm.mode === "custom" && s.llm.baseUrl && s.llm.apiKey
  const name = useAgnes ? "agnes-llm" : usePiAi ? "pi-ai-llm" : useCustom ? "custom-openai-llm" : "zai-llm"
  const p = registry.get(name)
  if (p.kind !== "LLM") throw new GatewayError(`${name} 注册异常`, "PROTOCOL_ERROR")
  const t0 = Date.now()
  try {
    const out = await p.chat(messages, opts)
    await recordCall(name, true, Date.now() - t0)
    return out
  } catch (e) {
    await recordCall(name, false, Date.now() - t0, (e as Error).message)
    // Agnes / pi-ai / 自定义模型失败 → 自动回退内置引擎，绝不炸流水线
    if (useAgnes || useCustom || usePiAi) {
      const t1 = Date.now()
      const out = await zaiLlm.chat(messages, opts)
      await recordCall("zai-llm", true, Date.now() - t1, `回退（${name} 失败：${(e as Error).message.slice(0, 80)}）`)
      return out
    }
    throw e
  }
}

// ---------- LLM 瞬时故障重试（网络抖动 / 超时 / 5xx：流水线长链路必备） ----------
const TRANSIENT = /fetch failed|timeout|timed out|aborted|ECONNRESET|ECONNREFUSED|EAI_AGAIN|ENOTFOUND|socket hang up|network|502|503|504/i

export async function chatRetry(
  messages: ChatMessage[],
  opts?: { temperature?: number },
  tries = 3,
): Promise<string> {
  let lastErr: unknown = null
  for (let i = 0; i < tries; i++) {
    try {
      return await chat(messages, opts)
    } catch (e) {
      lastErr = e
      const msg = (e as Error).message ?? ""
      if (!TRANSIENT.test(msg) || i === tries - 1) throw e
      await new Promise((r) => setTimeout(r, 900 * (i + 1)))
    }
  }
  throw lastErr
}

// ---------- 健康巡检 ----------
export async function healthCheckAll(): Promise<
  (ProviderDescriptor & { status: string; lastLatency: number; lastError: string; calls: number; fails: number; lastCheckedAt: string | null })[]
> {
  ensureBuiltinProviders()
  await getSettings(true) // 穿透刷新设置，确保 configured 标志与 DB 一致
  const reports = new Map<string, HealthReport>()
  await Promise.all(
    registry.list().map(async (d) => {
      try {
        const p = registry.get(d.name)
        const r = await p.health?.()
        if (r) reports.set(d.name, r)
      } catch (e) {
        reports.set(d.name, { status: "down", latencyMs: 0, error: (e as Error).message })
      }
    }),
  )

  const out: (ProviderDescriptor & { status: string; lastLatency: number; lastError: string; calls: number; fails: number; lastCheckedAt: string | null })[] = []
  for (const d of registry.list()) {
    const r = reports.get(d.name)
    if (r) {
      await db.providerRecord.upsert({
        where: { name: d.name },
        update: {
          status: r.status,
          lastLatency: r.latencyMs,
          lastError: r.error ?? "",
          lastChecked: new Date(),
          configured: d.configured,
        },
        create: {
          kind: d.kind,
          name: d.name,
          builtin: d.builtin,
          configured: d.configured,
          status: r.status,
          lastLatency: r.latencyMs,
          lastError: r.error ?? "",
          lastChecked: new Date(),
          notes: d.notes,
        },
      })
    }
    const rec = await db.providerRecord.findUnique({ where: { name: d.name } })
    out.push({
      ...d,
      status: r?.status ?? rec?.status ?? "unknown",
      lastLatency: r?.latencyMs ?? rec?.lastLatency ?? 0,
      lastError: r?.error ?? rec?.lastError ?? "",
      calls: rec?.calls ?? 0,
      fails: rec?.fails ?? 0,
      lastCheckedAt: (r ? new Date() : rec?.lastChecked)?.toISOString() ?? null,
    })
  }
  return out
}

// ---------- 调用统计（写 DB，失败不阻塞主流程） ----------
async function recordCall(name: string, ok: boolean, latencyMs: number, error?: string): Promise<void> {
  try {
    const d = registry.list().find((x) => x.name === name)
    await db.providerRecord.upsert({
      where: { name },
      update: {
        calls: { increment: 1 },
        fails: ok ? undefined : { increment: 1 },
        lastLatency: latencyMs,
        lastError: error ?? "",
        status: ok ? "healthy" : "degraded",
        lastChecked: new Date(),
      },
      create: {
        kind: d?.kind ?? "SEARCH",
        name,
        builtin: d?.builtin ?? true,
        configured: d?.configured ?? true,
        status: ok ? "healthy" : "degraded",
        lastLatency: latencyMs,
        lastError: error ?? "",
        calls: 1,
        fails: ok ? 0 : 1,
        lastChecked: new Date(),
        notes: d?.notes ?? "",
      },
    })
  } catch {
    // 统计失败不影响主流程
  }
}

export { registry }
