"use client"

// ============================================================
// rss-panel.tsx —— RSS 信源面板（P1 p14 · 情报中心信源层）
// 24 个默认 AI 资讯源（首访自动播种）+ 自定义源；全量刷新走
// 双粒度新鲜度 + SimHash 跨源去重；条目一键转选题池，完成
// 「信源 → 选题 → 创作」动线。逐源诚实留痕：ok/error/pending
// 状态灯 + 失败原因人话化。
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { Rss, RefreshCw, Loader2, Plus, Trash2, ExternalLink, ArrowRightCircle, CircleDot, CircleX, CircleDashed } from "lucide-react"

interface FeedInfo {
  id: string
  name: string
  url: string
  category: string
  active: boolean
  lastFetchedAt: string | null
  lastStatus: string
  lastError: string
  lastItemCount: number
  _count?: { items: number }
}
interface FeedItemInfo {
  id: string
  title: string
  url: string
  site: string
  summary: string
  publishedAt: string | null
  createdAt: string
  status: string
  feed: { name: string; category: string }
}
interface SourceStats { total: number; active: number; ok: number; error: number; pending: number; items: number; promoted: number }

const STATUS_ICON: Record<string, { icon: typeof CircleDot; cls: string; label: string }> = {
  ok: { icon: CircleDot, cls: "text-emerald-500", label: "正常" },
  error: { icon: CircleX, cls: "text-red-400", label: "失败" },
  partial: { icon: CircleDot, cls: "text-amber-500", label: "部分" },
  pending: { icon: CircleDashed, cls: "text-muted-foreground", label: "未拉取" },
}

export function RssPanel() {
  const { toast } = useToast()
  const [feeds, setFeeds] = useState<FeedInfo[]>([])
  const [items, setItems] = useState<FeedItemInfo[]>([])
  const [stats, setStats] = useState<SourceStats | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [promoting, setPromoting] = useState<string | null>(null)
  const [newFeed, setNewFeed] = useState({ name: "", url: "" })
  const [adding, setAdding] = useState(false)

  const refresh = useCallback(async () => {
    const j = await fetch("/api/sources").then((x) => x.json()).catch(() => null)
    if (!j) return
    setFeeds(j.feeds ?? [])
    setItems(j.items ?? [])
    setStats(j.stats ?? null)
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(t)
  }, [refresh])

  const doRefresh = async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({
        title: "信源刷新完成",
        description: json.message,
      })
      await refresh()
    } catch (e) {
      toast({ title: "刷新失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setRefreshing(false)
    }
  }

  const doPromote = async (itemId: string) => {
    setPromoting(itemId)
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "promote", itemId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "已转选题池", description: json.message })
      await refresh()
    } catch (e) {
      toast({ title: "转选题失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setPromoting(null)
    }
  }

  const doAdd = async () => {
    setAdding(true)
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add", name: newFeed.name, url: newFeed.url }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "信源已添加", description: json.message })
      setNewFeed({ name: "", url: "" })
      await refresh()
    } catch (e) {
      toast({ title: "添加失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAdding(false)
    }
  }

  const doDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/sources?id=${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      await refresh()
      toast({ title: "已删除信源（级联清条目）" })
    } catch (e) {
      toast({ title: "删除失败", description: (e as Error).message, variant: "destructive" })
    }
  }

  const toggleActive = async (id: string, active: boolean) => {
    try {
      const res = await fetch("/api/sources", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, active }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      await refresh()
    } catch (e) {
      toast({ title: "切换失败", description: (e as Error).message, variant: "destructive" })
    }
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-1.5">
          <span className="flex items-center gap-1.5">
            <Rss className="h-4 w-4 text-sky-500" />RSS 信源（{feeds.length}）
          </span>
          <span className="flex items-center gap-1.5 font-normal">
            {stats && (
              <>
                <Badge variant="outline" className="text-[9px] text-emerald-600 border-emerald-300">{stats.ok} 正常</Badge>
                {stats.error > 0 && <Badge variant="outline" className="text-[9px] text-red-500 border-red-300">{stats.error} 失败</Badge>}
                <Badge variant="outline" className="text-[9px]">{stats.items} 条目</Badge>
                {stats.promoted > 0 && <Badge variant="outline" className="text-[9px] text-amber-600 border-amber-300">{stats.promoted} 转选题</Badge>}
              </>
            )}
            <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={doRefresh} disabled={refreshing}>
              {refreshing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <RefreshCw className="h-3 w-3 mr-1" />}
              刷新全部
            </Button>
          </span>
        </CardTitle>
        <p className="text-[10px] text-muted-foreground">
          24 个默认 AI 资讯源（中文 8 + 英文 16）自动播种；抓取 → 双粒度新鲜度过滤 → SimHash 跨源去重 → 条目一键转选题池
        </p>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* 源墙（状态灯 + 分类） */}
        <div className="rounded-lg border bg-muted/30 p-2 max-h-40 overflow-y-auto">
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-1.5">
            {feeds.map((f) => {
              const st = STATUS_ICON[f.lastStatus] ?? STATUS_ICON.pending
              const StIcon = st.icon
              return (
                <div key={f.id} className="group flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-[10px]" title={f.lastError ? `失败原因：${f.lastError}` : `${f.url}｜累计 ${f._count?.items ?? 0} 条`}>
                  <button onClick={() => void toggleActive(f.id, !f.active)} title={f.active ? "停用（刷新时跳过）" : "启用"} className="shrink-0">
                    <StIcon className={`h-3 w-3 ${f.active ? st.cls : "text-muted-foreground/30"}`} />
                  </button>
                  <span className={`truncate ${f.active ? "" : "text-muted-foreground/40 line-through"}`}>{f.name}</span>
                  <span className="text-muted-foreground/60 shrink-0 ml-auto">{f._count?.items ?? 0}</span>
                  {f.active && (
                    <button onClick={() => void doDelete(f.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500 shrink-0" title="删除该源">
                      <Trash2 className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              )
            })}
            {feeds.length === 0 && <div className="col-span-full text-xs text-muted-foreground text-center py-3">首次访问自动播种 24 个默认源…</div>}
          </div>
          {/* 失败源提示（诚实降级） */}
          {feeds.some((f) => f.lastStatus === "error") && (
            <p className="text-[9px] text-red-500/80 mt-1.5">
              ⚠ {feeds.filter((f) => f.lastStatus === "error").length} 个源拉取失败（悬停看原因）：沙箱外网受限或源失效，失败不阻断其他源，恢复后点「刷新全部」重试
            </p>
          )}
        </div>

        {/* 添加自定义源 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <Plus className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <Input placeholder="源名称" value={newFeed.name} onChange={(e) => setNewFeed((s) => ({ ...s, name: e.target.value }))} className="h-7 text-[11px] w-32" />
          <Input placeholder="RSS/Atom URL（http(s)://）" value={newFeed.url} onChange={(e) => setNewFeed((s) => ({ ...s, url: e.target.value }))} className="h-7 text-[11px] flex-1 min-w-[180px] font-mono" />
          <Button size="sm" variant="outline" className="h-7 text-[10px] shrink-0" onClick={doAdd} disabled={adding || !newFeed.name.trim() || !newFeed.url.trim()}>
            {adding ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : null}添加
          </Button>
        </div>

        {/* 最近条目（转选题闭环） */}
        <div>
          <div className="flex items-center gap-1.5 mb-1.5">
            <span className="text-[11px] font-medium">最近条目（去重后）</span>
            <span className="text-[10px] text-muted-foreground">→ 一键转选题池 → 去创作</span>
          </div>
          <ScrollArea className="max-h-56 pr-2">
            <div className="space-y-1.5">
              {items.map((it) => (
                <div key={it.id} className="rounded-md border px-2 py-1.5 space-y-1 hover:border-sky-300 transition-colors">
                  <div className="flex items-start gap-1.5">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 border-sky-300 text-sky-600 dark:text-sky-400 max-w-[90px] truncate">{it.feed.name}</Badge>
                    <p className="text-[11px] font-medium leading-snug line-clamp-2 flex-1">{it.title}</p>
                  </div>
                  {it.summary && <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">{it.summary}</p>}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[9px] text-muted-foreground">{it.publishedAt ? new Date(it.publishedAt).toLocaleDateString("zh-CN") : new Date(it.createdAt).toLocaleDateString("zh-CN")}</span>
                    {it.url && (
                      <a href={it.url} target="_blank" rel="noreferrer" className="text-[9px] text-muted-foreground hover:text-sky-600 flex items-center gap-0.5 truncate max-w-[160px]">
                        <ExternalLink className="h-2.5 w-2.5 shrink-0" />{it.site}
                      </a>
                    )}
                    <button
                      onClick={() => void doPromote(it.id)}
                      disabled={promoting === it.id}
                      className="ml-auto text-[10px] text-amber-600 hover:text-amber-700 dark:text-amber-400 flex items-center gap-0.5 disabled:opacity-50"
                    >
                      {promoting === it.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRightCircle className="h-3 w-3" />}
                      转选题
                    </button>
                  </div>
                </div>
              ))}
              {items.length === 0 && (
                <div className="flex flex-col items-center py-4 text-muted-foreground">
                  <Rss className="h-5 w-5 mb-1 opacity-30" />
                  <p className="text-xs">暂无条目——点「刷新全部」拉取最新资讯（沙箱外网受限时会诚实留痕失败原因）</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
      </CardContent>
    </Card>
  )
}
