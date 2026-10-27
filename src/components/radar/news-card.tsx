'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ExternalLink, Clock } from 'lucide-react'
import type { WsaPage } from '@/lib/wsa'

/** 解析元宝搜索返回的多种日期格式: 2026-10-27 09:15:00 / 2025/02/26 09:37:00 */
function parseDate(raw: string): Date | null {
  if (!raw) return null
  const normalized = raw.replace(/\//g, '-')
  const d = new Date(normalized.replace(' ', 'T'))
  return isNaN(d.getTime()) ? null : d
}

/** 相对时间: 今天 09:15 / 昨天 14:22 / 3 天前 */
function relativeTime(d: Date): string {
  const now = new Date()
  const sameDay = d.toDateString() === now.toDateString()
  const yesterday = new Date(now.getTime() - 86400000).toDateString() === d.toDateString()
  const hm = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  if (sameDay) return `今天 ${hm}`
  if (yesterday) return `昨天 ${hm}`
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (days < 30) return `${days} 天前`
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

function ScoreBadge({ score }: { score: number }) {
  const pct = Math.round(score * 100)
  const tone =
    score >= 0.92
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : score >= 0.85
        ? 'bg-teal-50 text-teal-700 border-teal-200'
        : 'bg-slate-100 text-slate-600 border-slate-200'
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${tone}`}>
      相关度 {pct}%
    </span>
  )
}

/** 信源头像: favicon 加载失败时回退为站点首字圆形头像 */
function SiteAvatar({ site, favicon }: { site: string; favicon?: string }) {
  const [failed, setFailed] = useState(false)
  const letter = (site || '?').trim().charAt(0)
  if (!favicon || failed) {
    return (
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-600 text-[11px] font-semibold text-white">
        {letter}
      </span>
    )
  }
  return (
    <img
      src={favicon}
      alt={`${site} 图标`}
      className="h-6 w-6 shrink-0 rounded-full object-cover"
      onError={() => setFailed(true)}
    />
  )
}

export function NewsCard({ page, index }: { page: WsaPage; index: number }) {
  const date = parseDate(page.date)

  return (
    <Card className="group border-slate-200 bg-white shadow-none transition-all hover:border-teal-300 hover:shadow-md">
      <CardContent className="p-4 sm:p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
          <span className="inline-flex select-none items-center justify-center rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-medium text-slate-500">
            {String(index + 1).padStart(2, '0')}
          </span>
          <SiteAvatar site={page.site} favicon={page.favicon} />
          <span className="font-medium text-slate-700">{page.site || '未知站点'}</span>
          {date && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {relativeTime(date)}
            </span>
          )}
          <span className="ml-auto">
            <ScoreBadge score={page.score ?? 0} />
          </span>
        </div>

        <a
          href={page.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block text-[15px] font-semibold leading-snug text-slate-900 decoration-teal-400 decoration-2 underline-offset-4 hover:underline sm:text-base"
        >
          {page.title}
          <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 text-slate-400 opacity-0 transition-opacity group-hover:opacity-100" />
        </a>

        <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-slate-600">{page.passage}</p>

        <p className="mt-2 truncate text-[11px] text-slate-400">{page.url}</p>
      </CardContent>
    </Card>
  )
}
