"use client"

// ============================================================
// intel-panel —— 情报中心（雷达 × 灵感池融合）
// 一条动线：话题雷达 → AI 搜索（写前情报）→ 早报（claims 溯源）
// → 选题池（AI 刷新 / 搜索一键转选题 / 早报转选题）→ 去创作
// 融合理由：雷达产出情报、灵感池消费情报，本是上下游。
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { MdView } from "./md-view"
import { Radar, Plus, Trash2, RefreshCw, ExternalLink, Newspaper, MessageSquarePlus, Loader2, Search, Lightbulb, Star, CircleDot, CheckCheck, Sparkles, Send } from "lucide-react"

interface Topic { id: string; name: string; keywords: string; description: string; createdAt: string; _count?: { reports: number; ideas: number } }
interface Claim { id: string; idx: number; quote: string; sourceTitle: string; sourceUrl: string; sourceSite: string; sourceDate: string }
interface Report { id: string; title: string; content: string; mode: string; provider: string; createdAt: string; topic?: { name: string } | null; claims: Claim[]; _count?: { claims: number } }
interface Idea { id: string; title: string; angle: string; score: number; status: string; createdAt: string; topic?: { name: string } | null }
interface SearchHit { title: string; url: string; site: string; date: string; passage: string }

const STATUS_META: Record<string, { label: string; icon: typeof Lightbulb; className: string }> = {
  new: { label: "新选题", icon: Lightbulb, className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300" },
  picked: { label: "已采纳", icon: CircleDot, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300" },
  done: { label: "已完成", icon: CheckCheck, className: "bg-muted text-muted-foreground border-border" },
}

/** 「去创作」回调：把选题送进图文线（由 page 层路由到创作台） */
export function IntelPanel({ onGoCreate }: { onGoCreate?: (title: string, angle: string) => void }) {
  const { toast } = useToast()
  // 雷达区
  const [topics, setTopics] = useState<Topic[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [current, setCurrent] = useState<Report | null>(null)
  const [newTopic, setNewTopic] = useState({ name: "", keywords: "" })
  const [query, setQuery] = useState("")
  const [generating, setGenerating] = useState(false)
  // 搜索区（写前情报）
  const [searchQ, setSearchQ] = useState("")
  const [searching, setSearching] = useState(false)
  const [hits, setHits] = useState<SearchHit[]>([])
  const [searchMode, setSearchMode] = useState<"" | "REAL" | "DEMO">("")
  const [adopting, setAdopting] = useState<string | null>(null)
  // 灵感池区
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [newIdea, setNewIdea] = useState({ title: "", angle: "" })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    const [t, r, i] = await Promise.all([
      fetch("/api/topics").then((x) => x.json()),
      fetch("/api/morning-report").then((x) => x.json()),
      fetch("/api/ideas").then((x) => x.json()),
    ])
    setTopics(t.topics ?? [])
    setReports(r.reports ?? [])
    setIdeas(i.ideas ?? [])
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(t)
  }, [refresh])

  // ---------- 雷达 ----------
  const addTopic = async () => {
    if (!newTopic.name.trim()) return
    const res = await fetch("/api/topics", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(newTopic) })
    if (res.ok) {
      setNewTopic({ name: "", keywords: "" })
      void refresh()
      toast({ title: "话题已添加" })
    } else {
      toast({ title: "添加失败", variant: "destructive" })
    }
  }

  const removeTopic = async (id: string) => {
    await fetch(`/api/topics?id=${id}`, { method: "DELETE" })
    void refresh()
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const body: Record<string, string> = {}
      const t = topics.find((x) => x.name === query)
      if (t) body.topicId = t.id
      else body.query = query || "AI 大模型 最新进展"
      const res = await fetch("/api/morning-report", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "生成失败")
      await refresh()
      if (json.report) await openReport(json.report.id)
      toast({
        title: `早报已生成（${json.searchMode === "REAL" ? "真实检索" : "演示模式"}）`,
        description: `证据 ${json.evidenceCount} 条 · provider: ${json.provider}`,
      })
    } catch (e) {
      toast({ title: "生成失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setGenerating(false)
    }
  }

  const openReport = async (id: string) => {
    const json = await fetch(`/api/morning-report?id=${id}`).then((x) => x.json())
    setCurrent(json.report ?? null)
  }

  const sendFeedback = async () => {
    if (!current) return
    const comment = window.prompt("对这份早报的改进意见（写入 inbox，反哺下期编辑）：")
    if (!comment) return
    await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "report", targetId: current.id, comment }) })
    toast({ title: "反馈已写入 inbox" })
  }

  // ---------- AI 搜索（写前情报，从创作台归位至此） ----------
  const doSearch = async () => {
    if (!searchQ.trim()) return
    setSearching(true)
    setHits([])
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: searchQ, count: 8 }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setHits(json.results ?? [])
      setSearchMode(json.mode ?? "")
      if ((json.results ?? []).length === 0) toast({ title: "无结果", description: "换个检索词试试" })
    } catch (e) {
      toast({ title: "搜索失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setSearching(false)
    }
  }

  const adoptHit = async (hit: SearchHit) => {
    setAdopting(hit.url)
    try {
      const res = await fetch("/api/agent/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "create_idea",
          input: { title: hit.title.slice(0, 100), angle: `信源：${hit.site}${hit.date ? `（${hit.date.slice(0, 10)}）` : ""}。${hit.passage.slice(0, 120)}` },
        }),
      })
      if (!res.ok) throw new Error("入池失败")
      toast({ title: "已转入选题池", description: hit.title.slice(0, 40) })
      await refresh()
    } catch (e) {
      toast({ title: "转选题失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setAdopting(null)
    }
  }

  // ---------- 早报转选题 ----------
  const reportToIdea = async (report: Report) => {
    try {
      const res = await fetch("/api/agent/tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "create_idea",
          input: { title: report.title.slice(0, 100), angle: `来自早报《${report.title.slice(0, 40)}》（${report._count?.claims ?? report.claims?.length ?? 0} 条证据）。${report.content.replace(/[#*\n]/g, " ").slice(0, 100)}` },
        }),
      })
      if (!res.ok) throw new Error("入池失败")
      toast({ title: "早报已转选题", description: report.title.slice(0, 40) })
      await refresh()
    } catch (e) {
      toast({ title: "转选题失败", description: (e as Error).message, variant: "destructive" })
    }
  }

  // ---------- 灵感池 ----------
  const add = async () => {
    if (!newIdea.title.trim()) return
    await fetch("/api/agent/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "create_idea", input: { title: newIdea.title, angle: newIdea.angle } }),
    })
    setNewIdea({ title: "", angle: "" })
    void refresh()
    toast({ title: "选题已入池" })
  }

  const advance = async (idea: Idea) => {
    const next = idea.status === "new" ? "picked" : idea.status === "picked" ? "done" : "new"
    await fetch("/api/ideas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, status: next }) })
    void refresh()
  }

  const remove = async (id: string) => {
    await fetch(`/api/ideas?id=${id}`, { method: "DELETE" })
    void refresh()
  }

  const refreshIdeas = async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/ideas/refresh", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: json.message ?? "刷新完成", description: json.created ? `新增 ${json.created} 条` : undefined })
      await refresh()
    } catch (e) {
      toast({ title: "刷新失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 顶部：AI 搜索（写前情报，归位情报中心） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Search className="h-4 w-4 text-sky-600" />AI 搜索 · 情报入口
            {searchMode && <Badge variant={searchMode === "REAL" ? "default" : "secondary"} className={`text-[9px] ${searchMode === "REAL" ? "bg-emerald-600" : ""}`}>{searchMode === "REAL" ? "真实联网" : "演示"}</Badge>}
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">AI 搜索做情报底座：搜线索 → 一键转选题 → 进创作台出稿（密钥在设置中心更换）</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex gap-2">
            <Input
              placeholder="检索词，如：具身智能 融资"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <Button onClick={doSearch} disabled={!searchQ.trim() || searching} variant="outline" className="shrink-0">
              {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              搜索
            </Button>
          </div>
          {hits.length > 0 && searchMode === "DEMO" && (
            <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-2 text-[11px] text-amber-800 dark:text-amber-300 leading-relaxed">
              ⚠️ 当前为<b>演示数据</b>（内置静态样本，非真实联网）。元宝搜索密钥未配置或不可用——到「设置中心 → 模型服务 → AI 搜索」填入 SearchPro 密钥后即可恢复真实检索，情报/早报/流水线将全部回到 REAL 模式。
            </div>
          )}
          {hits.length > 0 && (
            <ScrollArea className="max-h-52">
              <div className="space-y-1.5 pr-2">
                {hits.map((h, i) => (
                  <div key={h.url || i} className="rounded-md border px-2.5 py-2 space-y-1 hover:border-sky-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <a href={h.url} target="_blank" rel="noreferrer" className="text-xs font-medium leading-snug hover:text-sky-600 flex items-start gap-0.5 min-w-0">
                        {h.title}<ExternalLink className="h-3 w-3 shrink-0 mt-0.5 ml-0.5 text-muted-foreground" />
                      </a>
                      <Button size="sm" variant="outline" className="h-6 text-[10px] shrink-0" onClick={() => adoptHit(h)} disabled={adopting === h.url}>
                        {adopting === h.url ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}转选题
                      </Button>
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-1 leading-snug">{h.passage}</p>
                    <div className="text-[9px] text-muted-foreground">{h.site}{h.date ? ` · ${h.date.slice(0, 10)}` : ""}</div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr_340px] gap-4">
        {/* 左列：话题雷达 + 历史早报 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base"><Radar className="h-4 w-4 text-amber-500" />话题雷达</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <Input placeholder="话题名，如：具身智能" value={newTopic.name} onChange={(e) => setNewTopic({ ...newTopic, name: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addTopic()} />
                <Button size="icon" onClick={addTopic}><Plus className="h-4 w-4" /></Button>
              </div>
              <Input placeholder="关键词（逗号分隔，可选）" value={newTopic.keywords} onChange={(e) => setNewTopic({ ...newTopic, keywords: e.target.value })} onKeyDown={(e) => e.key === "Enter" && addTopic()} />
              <ScrollArea className="max-h-48">
                <div className="space-y-1.5">
                  {topics.length === 0 && <p className="text-xs text-muted-foreground py-3 text-center">暂无话题，添加一个开始追踪</p>}
                  {topics.map((t) => (
                    <motion.div key={t.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between group rounded-md border px-2.5 py-2 hover:border-amber-300 transition-colors">
                      <button className="text-left flex-1 min-w-0" onClick={() => setQuery(t.name)}>
                        <div className="text-sm font-medium truncate">{t.name}</div>
                        {t.keywords && <div className="text-[11px] text-muted-foreground truncate">{t.keywords}</div>}
                      </button>
                      <span className="text-[10px] text-muted-foreground mr-1.5 shrink-0">{t._count?.reports ?? 0} 期</span>
                      <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => removeTopic(t.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </motion.div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex gap-2">
                <Input placeholder="检索词或点击上方话题" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && generate()} />
                <Button onClick={generate} disabled={generating} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
                  {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Newspaper className="h-4 w-4" />}
                  早报
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">真实检索（元宝 SearchPro）→ LLM 撰写 → [n] 逐条溯源落账</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center justify-between">
                <span>历史早报</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void refresh()}><RefreshCw className="h-3 w-3" /></Button>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="max-h-64">
                <div className="space-y-1.5">
                  {reports.length === 0 && <p className="text-xs text-muted-foreground py-3 text-center">还没有早报</p>}
                  {reports.map((r) => (
                    <div key={r.id} className={`rounded-md border transition-colors ${current?.id === r.id ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "hover:border-amber-200"}`}>
                      <button onClick={() => openReport(r.id)} className="w-full text-left px-2.5 py-2">
                        <div className="text-sm font-medium truncate">{r.title}</div>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge variant={r.mode === "REAL" ? "default" : "secondary"} className={`text-[9px] px-1 py-0 ${r.mode === "REAL" ? "bg-emerald-600" : ""}`}>{r.mode === "REAL" ? "真实" : "演示"}</Badge>
                          <span className="text-[10px] text-muted-foreground">{r._count?.claims ?? r.claims?.length ?? 0} 条引用 · {new Date(r.createdAt).toLocaleDateString("zh-CN")}</span>
                        </div>
                      </button>
                      <div className="px-2.5 pb-1.5 flex justify-end">
                        <Button size="sm" variant="ghost" className="h-5 text-[9px] px-1.5 text-muted-foreground hover:text-amber-600" onClick={() => reportToIdea(r)}>
                          <Send className="h-2.5 w-2.5 mr-0.5" />转选题
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </div>

        {/* 中列：早报详情 + claims 溯源 */}
        <Card className="min-h-[560px]">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base truncate">{current ? current.title : "早报详情"}</CardTitle>
              {current && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={current.mode === "REAL" ? "default" : "secondary"} className={current.mode === "REAL" ? "bg-emerald-600" : ""}>{current.mode === "REAL" ? "真实检索" : "演示模式"}</Badge>
                  <Badge variant="outline" className="text-[10px]">{current.provider || "-"}</Badge>
                  <Button variant="outline" size="sm" onClick={sendFeedback}><MessageSquarePlus className="h-3.5 w-3.5 mr-1" />反馈</Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!current && (
              <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
                <Newspaper className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">生成一份早报，或选择左侧历史早报</p>
              </div>
            )}
            {current && (
              <div className="grid grid-cols-1 lg:grid-cols-[1fr_240px] gap-4">
                <ScrollArea className="h-[520px] pr-3">
                  <MdView content={current.content} />
                </ScrollArea>
                <div>
                  <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><ExternalLink className="h-3 w-3" />claims 来源账本（{current.claims.length}）</div>
                  <ScrollArea className="h-[520px]">
                    <div className="space-y-1.5 pr-2">
                      {current.claims.map((c) => (
                        <a key={c.id} href={c.sourceUrl} target="_blank" rel="noreferrer" className="block rounded-md border px-2.5 py-2 hover:border-amber-300 transition-colors group">
                          <div className="flex items-center gap-1.5">
                            <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-400 text-amber-600 dark:text-amber-400">[{c.idx}]</Badge>
                            <span className="text-[10px] text-muted-foreground truncate">{c.sourceSite || "来源"}</span>
                          </div>
                          <div className="text-xs font-medium mt-1 line-clamp-2 group-hover:text-amber-600 transition-colors">{c.sourceTitle}</div>
                          {c.sourceDate && <div className="text-[10px] text-muted-foreground mt-0.5">{c.sourceDate.slice(0, 10)}</div>}
                        </a>
                      ))}
                      {current.claims.length === 0 && <p className="text-xs text-muted-foreground py-4 text-center">本期无引用</p>}
                    </div>
                  </ScrollArea>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 右列：选题池（灵感池，融合完成） */}
        <Card className="min-h-[560px]">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-amber-500" />选题池</CardTitle>
            <p className="text-[11px] text-muted-foreground">雷达情报 → 选题 → 创作台执行（一条动线）</p>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex gap-2">
              <Input placeholder="选题标题" value={newIdea.title} onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
              <Button size="icon" onClick={add} disabled={!newIdea.title.trim()}><Plus className="h-4 w-4" /></Button>
            </div>
            <Button onClick={refreshIdeas} disabled={refreshing} variant="outline" className="w-full">
              {refreshing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1 text-amber-500" />}
              AI 刷新灵感
            </Button>
            <p className="text-[10px] text-muted-foreground leading-snug">基于雷达话题 + 近期早报 + 风格定位自动生成；与近 7 天池内选题自动去重</p>
            <ScrollArea className="max-h-[420px]">
              <div className="space-y-2 pr-2">
                {ideas.length === 0 && (
                  <div className="flex flex-col items-center py-10 text-muted-foreground">
                    <Lightbulb className="h-7 w-7 mb-2 opacity-30" />
                    <p className="text-xs">池子为空：AI 刷新 / 搜索转选题 / 早报转选题</p>
                  </div>
                )}
                {ideas.map((idea) => {
                  const meta = STATUS_META[idea.status] ?? STATUS_META.new
                  const Icon = meta.icon
                  return (
                    <motion.div key={idea.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="group rounded-lg border p-2.5 space-y-1.5 hover:border-amber-300 transition-colors">
                      <div className="flex items-start justify-between gap-2">
                        <div className="text-[13px] font-semibold leading-snug">{idea.title}</div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {idea.score > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                              <Star className="h-3 w-3 fill-current" />{idea.score}
                            </span>
                          )}
                          <Button variant="ghost" size="icon" className="h-5 w-5 opacity-0 group-hover:opacity-100" onClick={() => remove(idea.id)}><Trash2 className="h-3 w-3" /></Button>
                        </div>
                      </div>
                      {idea.angle && <p className="text-[10px] text-muted-foreground line-clamp-2">{idea.angle}</p>}
                      <div className="flex items-center justify-between gap-1.5">
                        <Badge variant="outline" className={`text-[9px] gap-1 ${meta.className}`}>
                          <Icon className="h-3 w-3" />
                          {meta.label}
                        </Badge>
                        <div className="flex items-center gap-1">
                          {onGoCreate && (
                            <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={() => onGoCreate(idea.title, idea.angle)}>
                              <Send className="h-2.5 w-2.5 mr-0.5" />去创作
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-5 text-[9px] px-1.5" onClick={() => advance(idea)}>
                            {idea.status === "new" ? "采纳" : idea.status === "picked" ? "完成" : "重开"}
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
