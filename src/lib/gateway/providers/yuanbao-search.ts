// ============================================================
// 元宝搜索 Provider（真实）—— 腾讯云 SearchPro
// POST https://api.wsa.cloud.tencent.com/SearchPro
// Authorization: Bearer sk-xxx   参数为 PascalCase: {Query, Count}
// ============================================================

import { getSettings, peekSettings } from "@/lib/settings"
import type { HealthReport, SearchProvider, SearchRequest, SearchResult } from "../types"

const ENDPOINT = "https://api.wsa.cloud.tencent.com/SearchPro"

interface WsaPage {
  title?: string
  url?: string
  site?: string
  date?: string
  passage?: string
  content?: string
  score?: number
}

function normalize(p: WsaPage): SearchResult {
  const passage = (p.passage || p.content || "").slice(0, 400)
  return {
    title: (p.title || "（无标题）").slice(0, 120),
    url: p.url || "",
    site: p.site || "",
    date: p.date || "",
    passage,
    score: p.score ?? 0,
  }
}

/** Pages 数组元素为字符串化的 JSON，需二次解析 */
function toPage(raw: unknown): WsaPage {
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as WsaPage
    } catch {
      return {}
    }
  }
  return (raw ?? {}) as WsaPage
}

export const yuanbaoSearch: SearchProvider = {
  kind: "SEARCH",
  name: "yuanbao-search",
  label: "元宝搜索（腾讯云 SearchPro）",
  notes: "真实联网检索，四层集成中的取证引擎：Freshness 增量 / claims 核对 / 视频数据卡 / d30 回访。密钥可在设置中心更换（DB 优先，环境变量兦底）",
  isConfigured(): boolean {
    const s = peekSettings()
    return Boolean(s?.search.apiKey || process.env.WSA_API_KEY)
  },
  async search(req: SearchRequest): Promise<SearchResult[]> {
    // 密钥解析优先级：设置中心（DB）> 环境变量
    const s = await getSettings()
    const key = s.search.apiKey || process.env.WSA_API_KEY
    if (!key) throw new Error("搜索密钥未配置（设置中心 → 模型服务 → AI 搜索，或环境变量 WSA_API_KEY）")
    // Cnt 仅接受 10/20/30/40/50，非法值被静默吞错 → 钳制到最近合法值
    const LEGAL = [10, 20, 30, 40, 50]
    const raw = req.count ?? 10
    const cnt = LEGAL.reduce((best, v) => (Math.abs(v - raw) < Math.abs(best - raw) ? v : best), 10)
    const body: Record<string, unknown> = {
      Query: req.query,
      Count: cnt,
    }
    if (req.industry && req.industry !== "none") body.Industry = req.industry
    if (req.freshness && req.freshness !== "none") body.Freshness = req.freshness
    if (req.mode) body.Mode = req.mode
    // 瞬时容错：密钥新建后腾讯云后台分片传播需数分钟、且偶发限速误报
    // UnauthorizedOperation——同一查询间隔 1.2s 重试两次，避免流水线轻易降级 DEMO
    const MAX_RETRY = 2
    for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`SearchPro HTTP ${res.status}`)
      const json = (await res.json()) as {
        Response?: { Error?: { Code: string; Message: string }; Pages?: unknown[] }
      }
      const resp = json.Response ?? {}
      if (resp.Error) {
        const transient = resp.Error.Code === "UnauthorizedOperation" || resp.Error.Code === "RequestLimitExceeded"
        if (transient && attempt < MAX_RETRY) {
          await new Promise((r) => setTimeout(r, 1200))
          continue
        }
        throw new Error(`SearchPro ${resp.Error.Code}: ${resp.Error.Message}`)
      }
      const pages = (resp.Pages ?? []).map(toPage)
      return pages.map(normalize)
    }
    throw new Error("SearchPro 重试后仍失败")
  },
  async health(): Promise<HealthReport> {
    const t0 = Date.now()
    try {
      await getSettings() // 预热设置缓存，保证 isConfigured 同步可见
      if (!this.isConfigured()) {
        return { status: "down", latencyMs: 0, error: "搜索密钥未配置（设置中心或环境变量）" }
      }
      // 零成本探活：空查询会返回 InternalError（协议存活但业务错误），
      // 带 1 条最小查询则真实命中——用最小成本验证全链路
      const results = await this.search({ query: "AI", count: 1 })
      return {
        status: results.length > 0 ? "healthy" : "degraded",
        latencyMs: Date.now() - t0,
        detail: `探活返回 ${results.length} 条`,
      }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
