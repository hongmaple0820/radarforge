/**
 * 内建 SearchProvider：腾讯云元宝搜索 SearchPro
 *
 * 复用 1.0 的 src/lib/wsa.ts（含演示模式降级），
 * 使「资讯雷达 1.0 代码零废弃」——它直接成为模型网关的第一个检索 Provider。
 */

import { hasApiKey, searchWsa, WsaApiError } from '@/lib/wsa'
import type { HealthReport, SearchProvider, SearchRequest, SearchResponse } from '../types'

async function probe(): Promise<HealthReport> {
  const started = Date.now()
  const checkedAt = new Date().toISOString()
  if (!hasApiKey()) {
    return { ok: false, latencyMs: 0, detail: '未配置 WSA_API_KEY，当前为演示数据模式', checkedAt }
  }
  try {
    // 最小成本探活：轻量真实查询一次
    const r = await searchWsa({ query: '腾讯', cnt: 10 })
    return {
      ok: !r.mock,
      latencyMs: Date.now() - started,
      detail: r.mock ? '返回了演示数据' : `真实检索成功（requestId=${r.requestId.slice(0, 18)}…）`,
      checkedAt,
    }
  } catch (e) {
    const detail = e instanceof WsaApiError ? `${e.code}: ${e.message}` : (e as Error)?.message
    return { ok: false, latencyMs: Date.now() - started, detail, checkedAt }
  }
}

export const wsaSearchProvider: SearchProvider = {
  info: {
    id: 'wsa-search',
    kind: 'search',
    name: '腾讯元宝搜索 SearchPro',
    description:
      '全网公开网页 + 腾讯内容生态检索，支持 Freshness / Mode / Industry / Site 参数化过滤，资讯雷达的情报引擎',
    origin: 'builtin',
  },
  isConfigured: () => hasApiKey(),
  healthCheck: probe,
  async search(req: SearchRequest): Promise<SearchResponse> {
    const r = await searchWsa({
      query: req.query,
      mode: req.mode,
      cnt: req.cnt,
      industry: req.industry,
      freshness: req.freshness,
      site: req.site,
    })
    return {
      hits: r.pages.map((p) => ({
        title: p.title,
        url: p.url,
        site: p.site,
        date: p.date,
        passage: p.passage,
        score: p.score ?? 0,
      })),
      latencyMs: r.latencyMs,
      requestId: r.requestId,
      mock: r.mock,
    }
  },
}
