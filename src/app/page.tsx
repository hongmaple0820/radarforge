'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { useToast } from '@/hooks/use-toast'
import { TopicBar, type TopicItem } from '@/components/radar/topic-bar'
import { ControlPanel, type SearchControls } from '@/components/radar/control-panel'
import { NewsCard } from '@/components/radar/news-card'
import { StatsPanel, type SearchMeta } from '@/components/radar/stats-panel'
import { BriefingPanel } from '@/components/radar/briefing-panel'
import { IdeasPanel } from '@/components/workbench/ideas-panel'
import { ExtensionsPanel } from '@/components/workbench/extensions-panel'
import { StudioPanel } from '@/components/workbench/studio-panel'
import { Radar, RefreshCw, SearchX, TriangleAlert, Lightbulb, Blocks, PenLine } from 'lucide-react'
import type { WsaPage } from '@/lib/wsa'

interface SearchState {
  pages: WsaPage[]
  meta: SearchMeta | null
  loading: boolean
  error: string | null
  queriedTopic: string
}

export default function Home() {
  const { toast } = useToast()

  const [topics, setTopics] = useState<TopicItem[]>([])
  const [activeTopic, setActiveTopic] = useState('')
  const [controls, setControls] = useState<SearchControls>({ freshness: 'd7', mode: 0, industry: '', cnt: 10 })
  const [sort, setSort] = useState<'score' | 'time'>('score')

  const [search, setSearch] = useState<SearchState>({
    pages: [],
    meta: null,
    loading: false,
    error: null,
    queriedTopic: '',
  })

  const [briefing, setBriefing] = useState<string | null>(null)
  const [briefingLoading, setBriefingLoading] = useState(false)
  const [briefingTopic, setBriefingTopic] = useState('')

  const requestIdRef = useRef(0)

  /** 加载话题列表 */
  const loadTopics = useCallback(async () => {
    try {
      const res = await fetch('/api/topics')
      const data = await res.json()
      if (data.ok) {
        setTopics(data.topics)
        return data.topics as TopicItem[]
      }
    } catch {
      /* ignore */
    }
    return null
  }, [])

  useEffect(() => {
    loadTopics().then((list) => {
      if (list && list.length > 0) setActiveTopic((prev) => prev || list[0].name)
    })
  }, [loadTopics])

  /** 触发元宝搜索 */
  const doSearch = useCallback(
    async (topic: string, c: SearchControls) => {
      if (!topic) return
      const myId = ++requestIdRef.current
      setSearch((s) => ({ ...s, loading: true, error: null, queriedTopic: topic }))
      setBriefing(null)

      try {
        const res = await fetch('/api/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: topic, mode: c.mode, cnt: c.cnt, industry: c.industry, freshness: c.freshness }),
        })
        const data = await res.json()
        if (myId !== requestIdRef.current) return // 过期响应丢弃

        if (!data.ok) {
          setSearch((s) => ({ ...s, loading: false, error: data.message || '搜索失败', pages: [] }))
          return
        }
        setSearch({
          pages: data.pages as WsaPage[],
          meta: { mock: data.mock, latencyMs: data.latencyMs, requestId: data.requestId, version: data.version },
          loading: false,
          error: null,
          queriedTopic: topic,
        })
      } catch (e) {
        if (myId !== requestIdRef.current) return
        setSearch((s) => ({ ...s, loading: false, error: (e as Error)?.message || '网络异常', pages: [] }))
      }
    },
    []
  )

  // 话题或检索参数变化 → 自动重新搜索
  useEffect(() => {
    if (activeTopic) doSearch(activeTopic, controls)
  }, [activeTopic, controls, doSearch])

  async function handleAddTopic(name: string): Promise<string | null> {
    try {
      const res = await fetch('/api/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      })
      const data = await res.json()
      if (!data.ok) return data.message || '创建失败'
      const list = await loadTopics()
      if (list) setActiveTopic(data.topic.name)
      toast({ title: '话题已添加', description: `开始追踪「${data.topic.name}」` })
      return null
    } catch (e) {
      return (e as Error)?.message || '创建失败'
    }
  }

  async function handleDeleteTopic(t: TopicItem) {
    try {
      const res = await fetch(`/api/topics?id=${t.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: '删除失败', description: data.message, variant: 'destructive' })
        return
      }
      const list = await loadTopics()
      if (list && activeTopic === t.name && list.length > 0) {
        setActiveTopic(list[0].name)
      }
    } catch (e) {
      toast({ title: '删除失败', description: (e as Error)?.message, variant: 'destructive' })
    }
  }

  /** 雷达资讯卡片一键入池（工作流 2.0：雷达 → 选题池） */
  async function handleAddIdea(page: WsaPage) {
    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: page.title,
          angle: (page.passage || '').slice(0, 200),
          source: 'radar',
          sourceRef: page.url,
          score: Math.round((page.score ?? 0) * 100),
        }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: '未能入池', description: data.message || '该选题可能已在池中' })
        return
      }
      toast({ title: '已加入选题池', description: page.title.slice(0, 48) })
    } catch (e) {
      toast({ title: '未能入池', description: (e as Error)?.message, variant: 'destructive' })
    }
  }

  async function handleGenerateBriefing() {
    if (search.pages.length === 0 || !search.queriedTopic) return
    setBriefingLoading(true)
    setBriefingTopic(search.queriedTopic)
    try {
      const res = await fetch('/api/briefing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: search.queriedTopic, pages: search.pages }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: '早报生成失败', description: data.message, variant: 'destructive' })
        setBriefing(null)
      } else {
        setBriefing(data.briefing)
      }
    } catch (e) {
      toast({ title: '早报生成失败', description: (e as Error)?.message, variant: 'destructive' })
    } finally {
      setBriefingLoading(false)
    }
  }

  // 排序
  const sortedPages = [...search.pages].sort((a, b) => {
    if (sort === 'score') return (b.score ?? 0) - (a.score ?? 0)
    return new Date((b.date || '').replace(/\//g, '-')).getTime() - new Date((a.date || '').replace(/\//g, '-')).getTime()
  })

  const modeBadge =
    search.meta === null ? null : search.meta.mock ? (
      <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        演示模式 · 未配置 WSA_API_KEY
      </span>
    ) : (
      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
        元宝搜索 · 真实调用
      </span>
    )

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* 顶栏 */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-600 text-white shadow-sm">
              <Radar className="h-5 w-5" />
            </span>
            <div>
              <h1 className="text-base font-bold leading-tight text-slate-900 sm:text-lg">AI 资讯雷达</h1>
              <p className="text-[11px] leading-tight text-slate-500">
                基于腾讯云元宝搜索 SearchPro 的资讯追踪与早报生成
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">{modeBadge}</div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-6">
        <Tabs defaultValue="radar" className="space-y-5">
          <TabsList className="grid h-10 w-full max-w-xl grid-cols-4 rounded-lg border border-slate-200 bg-white p-1">
            <TabsTrigger
              value="radar"
              className="gap-1.5 rounded-md text-xs font-medium data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <Radar className="h-3.5 w-3.5" />
              资讯雷达
            </TabsTrigger>
            <TabsTrigger
              value="ideas"
              className="gap-1.5 rounded-md text-xs font-medium data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <Lightbulb className="h-3.5 w-3.5" />
              选题池
            </TabsTrigger>
            <TabsTrigger
              value="studio"
              className="gap-1.5 rounded-md text-xs font-medium data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <PenLine className="h-3.5 w-3.5" />
              创作台
            </TabsTrigger>
            <TabsTrigger
              value="extensions"
              className="gap-1.5 rounded-md text-xs font-medium data-[state=active]:bg-slate-800 data-[state=active]:text-white"
            >
              <Blocks className="h-3.5 w-3.5" />
              扩展体系
            </TabsTrigger>
          </TabsList>

          <TabsContent value="radar" className="space-y-5">
            {/* 话题栏 */}
        <section aria-label="话题追踪">
          {topics.length === 0 ? (
            <div className="flex gap-2">
              <Skeleton className="h-8 w-24 rounded-full" />
              <Skeleton className="h-8 w-28 rounded-full" />
              <Skeleton className="h-8 w-24 rounded-full" />
            </div>
          ) : (
            <TopicBar
              topics={topics}
              activeTopic={activeTopic}
              onSelect={(t) => setActiveTopic(t.name)}
              onDelete={handleDeleteTopic}
              onAdd={handleAddTopic}
            />
          )}
        </section>

        {/* 控制面板 + 状态栏 */}
        <section aria-label="搜索控制">
          <Card className="border-slate-200 bg-white shadow-none">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <ControlPanel controls={controls} onChange={setControls} />

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span className="font-mono text-[11px]">
                    Query: <span className="font-semibold text-teal-700">{search.queriedTopic || activeTopic || '…'}</span>
                  </span>
                  {search.meta && (
                    <span className="hidden font-mono text-[11px] text-slate-400 sm:inline">
                      Freshness={controls.freshness} · Mode={controls.mode}
                      {controls.industry ? ` · Industry=${controls.industry}` : ''} · Cnt={controls.cnt}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <ToggleGroup
                    type="single"
                    value={sort}
                    onValueChange={(v) => v && setSort(v as 'score' | 'time')}
                    className="gap-1"
                  >
                    <ToggleGroupItem
                      value="score"
                      className="h-7 px-2.5 text-[11px] data-[state=on]:bg-slate-800 data-[state=on]:text-white"
                    >
                      按相关度
                    </ToggleGroupItem>
                    <ToggleGroupItem
                      value="time"
                      className="h-7 px-2.5 text-[11px] data-[state=on]:bg-slate-800 data-[state=on]:text-white"
                    >
                      按时间
                    </ToggleGroupItem>
                  </ToggleGroup>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1 border-slate-300 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700"
                    onClick={() => doSearch(activeTopic, controls)}
                    disabled={search.loading || !activeTopic}
                  >
                    <RefreshCw className={`h-3 w-3 ${search.loading ? 'animate-spin' : ''}`} />
                    重新检索
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </section>

        {/* 错误提示 */}
        {search.error && (
          <Alert variant="destructive">
            <TriangleAlert className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-2">
              <span>{search.error}</span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto h-7 border-red-300 text-[11px] hover:bg-red-50"
                onClick={() => doSearch(activeTopic, controls)}
              >
                重试
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* 主体: 资讯流 + 侧栏 */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          <section aria-label="资讯列表" className="space-y-3 lg:col-span-8">
            {search.loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="border-slate-200 bg-white shadow-none">
                  <CardContent className="space-y-2.5 p-4 sm:p-5">
                    <Skeleton className="h-3 w-40" />
                    <Skeleton className="h-5 w-11/12" />
                    <Skeleton className="h-3 w-full" />
                    <Skeleton className="h-3 w-4/5" />
                  </CardContent>
                </Card>
              ))
            ) : sortedPages.length > 0 ? (
              sortedPages.map((p, i) => (
                <NewsCard key={`${p.url}-${i}`} page={p} index={i} onAddIdea={handleAddIdea} />
              ))
            ) : (
              !search.error && (
                <Card className="border-dashed border-slate-300 bg-white shadow-none">
                  <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                    <SearchX className="h-8 w-8 text-slate-300" />
                    <p className="text-sm font-medium text-slate-500">当前时效范围内没有检索到资讯</p>
                    <p className="text-xs text-slate-400">试试放宽「时效范围」或切换「信源模式」后重新检索</p>
                  </CardContent>
                </Card>
              )
            )}
          </section>

          <aside className="space-y-5 lg:col-span-4" aria-label="统计与早报">
            <StatsPanel pages={search.pages} meta={search.meta} />
            <BriefingPanel
              topic={briefingTopic || activeTopic}
              briefing={briefing}
              loading={briefingLoading}
              onGenerate={handleGenerateBriefing}
            />
          </aside>
        </div>
          </TabsContent>

          <TabsContent value="ideas" className="space-y-5">
            <IdeasPanel />
          </TabsContent>

          <TabsContent value="studio" className="space-y-5">
            <StudioPanel />
          </TabsContent>

          <TabsContent value="extensions" className="space-y-5">
            <ExtensionsPanel />
          </TabsContent>
        </Tabs>
      </main>

      <footer className="mt-auto border-t border-slate-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 text-center text-[11px] leading-relaxed text-slate-400 sm:px-6">
          数据来源: 腾讯云元宝搜索 SearchPro API（全网公开资源 + 腾讯内容生态）｜ Next.js 16 + TypeScript + Prisma 构建
          <br />
          资讯雷达 2.0 · 工作台：选题池 · 创作台（Agent 运行时 + 编辑飞轮）· 模型网关 · Skills · MCP
        </div>
      </footer>
    </div>
  )
}
