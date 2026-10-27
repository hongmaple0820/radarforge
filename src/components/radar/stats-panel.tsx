'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Gauge, Newspaper, Timer, Landmark } from 'lucide-react'
import type { WsaPage } from '@/lib/wsa'

export interface SearchMeta {
  mock: boolean
  latencyMs: number
  requestId: string
  version: string
}

/** 信源分布 + 本次调用指标 */
export function StatsPanel({ pages, meta }: { pages: WsaPage[]; meta: SearchMeta | null }) {
  // 站点分布统计
  const siteCount = new Map<string, number>()
  for (const p of pages) {
    const key = (p.site || '未知站点').trim()
    siteCount.set(key, (siteCount.get(key) ?? 0) + 1)
  }
  const siteRank = [...siteCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
  const maxCount = siteRank[0]?.[1] ?? 1

  const avgScore = pages.length
    ? Math.round((pages.reduce((s, p) => s + (p.score ?? 0), 0) / pages.length) * 100)
    : 0

  const stats = [
    { icon: Newspaper, label: '结果条数', value: `${pages.length}`, hint: '本次返回' },
    { icon: Gauge, label: '平均相关度', value: pages.length ? `${avgScore}%` : '—', hint: 'score 均值' },
    {
      icon: Timer,
      label: '检索耗时',
      value: meta ? `${(meta.latencyMs / 1000).toFixed(2)}s` : '—',
      hint: '端到端',
    },
    { icon: Landmark, label: '信源站点', value: `${siteCount.size}`, hint: '去重后' },
  ]

  return (
    <Card className="border-slate-200 bg-white shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">本次调用指标</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="grid grid-cols-2 gap-2">
          {stats.map((s) => (
            <div key={s.label} className="rounded-lg bg-slate-50 p-2.5">
              <p className="flex items-center gap-1 text-[11px] text-slate-500">
                <s.icon className="h-3 w-3" />
                {s.label}
              </p>
              <p className="mt-0.5 font-mono text-lg font-semibold text-slate-900">{s.value}</p>
              <p className="text-[10px] text-slate-400">{s.hint}</p>
            </div>
          ))}
        </div>

        {siteRank.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-medium text-slate-500">信源分布</p>
            <div className="space-y-1.5">
              {siteRank.map(([site, count]) => (
                <div key={site} className="flex items-center gap-2">
                  <span className="w-20 shrink-0 truncate text-[11px] text-slate-600" title={site}>
                    {site}
                  </span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-teal-500"
                      style={{ width: `${(count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="w-4 shrink-0 text-right font-mono text-[11px] text-slate-400">{count}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {meta && (
          <div className="border-t border-slate-100 pt-3">
            <p className="break-all font-mono text-[10px] leading-relaxed text-slate-400">
              RequestId: {meta.requestId || '—'}
              <br />
              Version: {meta.version}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
