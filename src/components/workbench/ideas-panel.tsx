'use client'

/**
 * 选题池面板（工作流 2.0 的起点）
 *
 * 雷达资讯卡片「加选题」→ 入池 → 状态流转（new → shortlist → writing → published / dropped）
 * 数据来自 /api/ideas，面板挂载时自取数（Tabs 切换即刷新）。
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { Lightbulb, Plus, Trash2, ExternalLink, Inbox, RefreshCw } from 'lucide-react'

interface IdeaItem {
  id: string
  title: string
  angle: string | null
  source: string
  sourceRef: string | null
  score: number | null
  status: string
  createdAt: string
}

const STATUS_META: Record<string, { label: string; chip: string }> = {
  new: { label: '新入池', chip: 'border-teal-200 bg-teal-50 text-teal-700' },
  shortlist: { label: '入选', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  writing: { label: '撰写中', chip: 'border-amber-200 bg-amber-50 text-amber-700' },
  published: { label: '已发布', chip: 'border-slate-800 bg-slate-800 text-white' },
  dropped: { label: '已放弃', chip: 'border-slate-200 bg-slate-100 text-slate-400' },
}

const STATUS_ORDER = ['new', 'shortlist', 'writing', 'published', 'dropped']

const SOURCE_LABEL: Record<string, string> = {
  radar: '雷达选题',
  manual: '手动录入',
  agent: 'Agent 推荐',
}

export function IdeasPanel() {
  const { toast } = useToast()
  const [ideas, setIdeas] = useState<IdeaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<string>('all')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/ideas')
      const data = await res.json()
      if (data.ok) setIdeas(data.ideas as IdeaItem[])
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: ideas.length }
    for (const s of STATUS_ORDER) c[s] = ideas.filter((i) => i.status === s).length
    return c
  }, [ideas])

  const filtered = filter === 'all' ? ideas : ideas.filter((i) => i.status === filter)

  async function addIdea() {
    const t = title.trim()
    if (!t) return
    setSubmitting(true)
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, source: 'manual' }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: '添加失败', description: data.message, variant: 'destructive' })
        return
      }
      setTitle('')
      toast({ title: '选题已入池', description: t.slice(0, 40) })
      await load()
    } catch (e) {
      toast({ title: '添加失败', description: (e as Error)?.message, variant: 'destructive' })
    } finally {
      setSubmitting(false)
    }
  }

  async function updateStatus(id: string, status: string) {
    // 乐观更新，失败回滚
    const prev = ideas.find((i) => i.id === id)?.status
    setIdeas((list) => list.map((i) => (i.id === id ? { ...i, status } : i)))
    try {
      const res = await fetch(`/api/ideas/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      const data = await res.json()
      if (!data.ok) throw new Error(data.message)
    } catch (e) {
      setIdeas((list) => list.map((i) => (i.id === id && prev ? { ...i, status: prev } : i)))
      toast({ title: '状态更新失败', description: (e as Error)?.message, variant: 'destructive' })
    }
  }

  async function remove(id: string) {
    setIdeas((list) => list.filter((i) => i.id !== id))
    try {
      const res = await fetch(`/api/ideas/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) throw new Error(data.message)
    } catch (e) {
      toast({ title: '删除失败', description: (e as Error)?.message, variant: 'destructive' })
      await load()
    }
  }

  return (
    <div className="space-y-4">
      {/* 工具条：录入 + 状态筛选 */}
      <Card className="border-slate-200 bg-white shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !submitting && addIdea()}
              placeholder="想到一个选题？直接输入标题入池…"
              className="h-9 flex-1 border-slate-300 focus-visible:ring-teal-500"
              maxLength={300}
            />
            <Button
              size="sm"
              className="h-9 gap-1 bg-teal-600 hover:bg-teal-700"
              onClick={addIdea}
              disabled={submitting || !title.trim()}
            >
              <Plus className="h-4 w-4" />
              入池
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(['all', ...STATUS_ORDER] as const).map((s) => {
              const active = filter === s
              const label = s === 'all' ? '全部' : STATUS_META[s]?.label ?? s
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setFilter(s)}
                  className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'border-slate-800 bg-slate-800 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-teal-300 hover:text-teal-700'
                  }`}
                >
                  {label}
                  <span className={active ? 'text-slate-300' : 'text-slate-400'}>{counts[s] ?? 0}</span>
                </button>
              )
            })}
            <Button
              size="sm"
              variant="ghost"
              className="ml-auto h-7 gap-1 px-2 text-[11px] text-slate-500 hover:text-teal-700"
              onClick={load}
              disabled={loading}
            >
              <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 列表 */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="border-slate-200 bg-white shadow-none">
              <CardContent className="space-y-2.5 p-4 sm:p-5">
                <Skeleton className="h-5 w-2/3" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-1/2" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed border-slate-300 bg-white shadow-none">
          <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
            <Inbox className="h-8 w-8 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">
              {filter === 'all' ? '选题池还是空的' : '该状态下暂无选题'}
            </p>
            <p className="text-xs text-slate-400">
              在「资讯雷达」页点击资讯卡片上的「加选题」，或上方直接录入
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="max-h-[calc(100vh-22rem)] space-y-3 overflow-y-auto pr-1">
          {filtered.map((idea) => (
            <Card
              key={idea.id}
              className={`border-slate-200 bg-white shadow-none transition-all hover:border-teal-300 ${
                idea.status === 'dropped' ? 'opacity-60' : ''
              }`}
            >
              <CardContent className="space-y-2 p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  {idea.sourceRef ? (
                    <a
                      href={idea.sourceRef}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[15px] font-semibold leading-snug text-slate-900 decoration-teal-400 decoration-2 underline-offset-4 hover:underline"
                    >
                      {idea.title}
                      <ExternalLink className="ml-1.5 inline h-3.5 w-3.5 text-slate-400" />
                    </a>
                  ) : (
                    <p className="text-[15px] font-semibold leading-snug text-slate-900">{idea.title}</p>
                  )}
                  <div className="flex items-center gap-1.5">
                    {idea.score !== null && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                        <Lightbulb className="h-3 w-3 text-amber-500" />
                        {idea.score}
                      </span>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 text-slate-400 hover:text-red-500"
                      onClick={() => remove(idea.id)}
                      aria-label="删除选题"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                {idea.angle && (
                  <p className="line-clamp-2 text-sm leading-relaxed text-slate-600">{idea.angle}</p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_META[idea.status]?.chip ?? 'border-slate-200 bg-slate-50 text-slate-600'
                    }`}
                  >
                    {STATUS_META[idea.status]?.label ?? idea.status}
                  </span>
                  <Badge variant="outline" className="border-slate-200 bg-slate-50 text-[11px] font-normal text-slate-500">
                    {SOURCE_LABEL[idea.source] ?? idea.source}
                  </Badge>

                  <div className="ml-auto flex items-center gap-2">
                    <span className="text-[11px] text-slate-400">
                      {new Date(idea.createdAt).toLocaleDateString('zh-CN')}
                    </span>
                    <Select value={idea.status} onValueChange={(v) => updateStatus(idea.id, v)}>
                      <SelectTrigger className="h-7 w-[104px] border-slate-300 text-[11px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_ORDER.map((s) => (
                          <SelectItem key={s} value={s} className="text-xs">
                            {STATUS_META[s]?.label ?? s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
