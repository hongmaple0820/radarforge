"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { MdView } from "./md-view"
import { Radar, Plus, Trash2, RefreshCw, ExternalLink, Newspaper, MessageSquarePlus, Loader2 } from "lucide-react"

interface Topic { id: string; name: string; keywords: string; description: string; createdAt: string; _count?: { reports: number; ideas: number } }
interface Claim { id: string; idx: number; quote: string; sourceTitle: string; sourceUrl: string; sourceSite: string; sourceDate: string }
interface Report { id: string; title: string; content: string; mode: string; provider: string; createdAt: string; topic?: { name: string } | null; claims: Claim[]; _count?: { claims: number } }

export function RadarPanel() {
  const { toast } = useToast()
  const [topics, setTopics] = useState<Topic[]>([])
  const [reports, setReports] = useState<Report[]>([])
  const [current, setCurrent] = useState<Report | null>(null)
  const [newTopic, setNewTopic] = useState({ name: "", keywords: "" })
  const [query, setQuery] = useState("")
  const [generating, setGenerating] = useState(false)

  const refresh = useCallback(async () => {
    const [t, r] = await Promise.all([fetch("/api/topics").then((x) => x.json()), fetch("/api/morning-report").then((x) => x.json())])
    setTopics(t.topics ?? [])
    setReports(r.reports ?? [])
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

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
      const topicId = query.trim().startsWith("@") ? undefined : undefined
      const body: Record<string, string> = {}
      const t = topics.find((x) => x.name === query)
      if (t) body.topicId = t.id
      else body.query = query || "AI 大模型 最新进展"
      void topicId
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

  return (
    <div className="grid lg:grid-cols-[320px_1fr] gap-4">
      {/* 左列：话题 + 快速生成 */}
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
            <ScrollArea className="max-h-56">
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
              <Input placeholder="检索词或点击左侧话题" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && generate()} />
              <Button onClick={generate} disabled={generating} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
                {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Newspaper className="h-4 w-4" />}
                生成早报
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
            <ScrollArea className="max-h-72">
              <div className="space-y-1.5">
                {reports.length === 0 && <p className="text-xs text-muted-foreground py-3 text-center">还没有早报</p>}
                {reports.map((r) => (
                  <button key={r.id} onClick={() => openReport(r.id)} className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${current?.id === r.id ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "hover:border-amber-200"}`}>
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="flex items-center gap-1.5 mt-1">
                      <Badge variant={r.mode === "REAL" ? "default" : "secondary"} className={`text-[9px] px-1 py-0 ${r.mode === "REAL" ? "bg-emerald-600" : ""}`}>{r.mode === "REAL" ? "真实" : "演示"}</Badge>
                      <span className="text-[10px] text-muted-foreground">{r._count?.claims ?? r.claims?.length ?? 0} 条引用 · {new Date(r.createdAt).toLocaleDateString("zh-CN")}</span>
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* 右列：早报正文 + claims 溯源 */}
      <Card className="min-h-[600px]">
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
              <p className="text-sm">选择左侧历史早报，或生成一份新早报</p>
            </div>
          )}
          {current && (
            <div className="grid xl:grid-cols-[1fr_280px] gap-4">
              <ScrollArea className="h-[560px] pr-3">
                <MdView content={current.content} />
              </ScrollArea>
              <div>
                <div className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1"><ExternalLink className="h-3 w-3" />claims 来源账本（{current.claims.length}）</div>
                <ScrollArea className="h-[560px]">
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
    </div>
  )
}
