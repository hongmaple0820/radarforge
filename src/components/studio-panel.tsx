"use client"

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { RunDetail } from "./run-detail"
import { PenLine, Play, Loader2, RefreshCw, Lightbulb, FileText, CheckCircle2, XCircle, BookOpen, Sparkles, Trash2 } from "lucide-react"

interface RunItem {
  id: string
  ideaTitle: string
  persona: string
  theme: string
  status: string
  mode: string
  createdAt: string
  _count?: { claims: number; articles: number; assets: number; publishes: number }
}
interface PersonaInfo { id: string; label: string; desc: string }
interface ThemeInfo { id: string; label: string; category: string; description: string }
interface IdeaItem { id: string; title: string; angle: string; status: string }
interface ExemplarItem { id: string; name: string; source: string; createdAt: string; words: number; fingerprint: { structure: string; rhythm: string; lexicon: string; rhetoric: string; voice: string; endings: string } }

/** seed：情报中心「去创作」送来的选题（自动填入并聚焦） */
export function StudioPanel({ seed }: { seed?: { title: string; angle: string } | null }) {
  const { toast } = useToast()
  const [runs, setRuns] = useState<RunItem[]>([])
  const [personas, setPersonas] = useState<PersonaInfo[]>([])
  const [themes, setThemes] = useState<ThemeInfo[]>([])
  const [ideas, setIdeas] = useState<IdeaItem[]>([])
  const [ideaTitle, setIdeaTitle] = useState("")
  const [ideaAngle, setIdeaAngle] = useState("")
  const [persona, setPersona] = useState("cold-analyst")
  const [theme, setTheme] = useState("professional-clean")
  // 文风校准（学 wewrite exemplar）
  const [exemplars, setExemplars] = useState<ExemplarItem[]>([])
  const [exemplarId, setExemplarId] = useState("")
  const [showLearn, setShowLearn] = useState(false)
  const [exName, setExName] = useState("")
  const [exContent, setExContent] = useState("")
  const [learning, setLearning] = useState(false)
  const [starting, setStarting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  // 情报中心送来的选题种子 → 填入表单
  useEffect(() => {
    if (seed?.title) {
      setIdeaTitle(seed.title)
      setIdeaAngle(seed.angle ?? "")
    }
  }, [seed])

  const refresh = useCallback(async () => {
    const [r, i, e] = await Promise.all([
      fetch("/api/runs").then((x) => x.json()),
      fetch("/api/ideas").then((x) => x.json()),
      fetch("/api/style-exemplars").then((x) => x.json()),
    ])
    setRuns(r.runs ?? [])
    setPersonas(r.personas ?? [])
    setThemes(r.themes ?? [])
    setIdeas(i.ideas ?? [])
    setExemplars(e.exemplars ?? [])
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(t)
  }, [refresh])

  // 轮询进行中的 run
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running" || r.status === "queued")
    if (!hasRunning) return
    const t = setInterval(() => void refresh(), 4000)
    return () => clearInterval(t)
  }, [runs, refresh])

  const start = async () => {
    if (!ideaTitle.trim()) return
    setStarting(true)
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaTitle, ideaAngle, persona, theme, exemplarId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      await refresh()
      setSelectedId(json.id)
      toast({ title: "九步流水线已启动", description: "brief → claims → 大纲 → 分节初稿 → 审稿 → 断言 → 配图 → 封面 → 排版" })
    } catch (e) {
      toast({ title: "启动失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setStarting(false)
    }
  }

  // 学习新文风：粘贴范文 → LLM 提炼指纹入库（学 wewrite exemplar）
  const learnExemplar = async () => {
    setLearning(true)
    try {
      const res = await fetch("/api/style-exemplars", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: exName, content: exContent }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      await refresh()
      setExemplarId(json.exemplar.id)
      setShowLearn(false)
      setExName("")
      setExContent("")
      toast({ title: "文风档案已入库", description: json.message })
    } catch (e) {
      toast({ title: "文风学习失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setLearning(false)
    }
  }

  const deleteExemplar = async (id: string) => {
    try {
      const res = await fetch(`/api/style-exemplars?id=${id}`, { method: "DELETE" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (exemplarId === id) setExemplarId("")
      await refresh()
      toast({ title: "已删除", description: json.message })
    } catch (e) {
      toast({ title: "删除失败", description: (e as Error).message, variant: "destructive" })
    }
  }

  return (
    <div className="space-y-4">
      {/* 新建运行 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><PenLine className="h-4 w-4 text-amber-500" />图文线 · 九步流水线</CardTitle>
          <p className="text-[11px] text-muted-foreground">brief → claims 取证 → 大纲先行 → 分节初稿 → 跨家族审稿（成对比较）→ 原子断言核验 → 正文配图 → 封面 → 微信排版</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_170px_130px_auto] gap-2">
            <Input placeholder="选题标题，如：具身智能融资观察" value={ideaTitle} onChange={(e) => setIdeaTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && start()} />
            <select value={persona} onChange={(e) => setPersona(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs">
              {personas.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
            <select value={theme} onChange={(e) => setTheme(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs max-w-[150px]" aria-label="排版主题">
              {Object.entries(
                themes.reduce<Record<string, ThemeInfo[]>>((acc, t) => {
                  ;(acc[t.category] ??= []).push(t)
                  return acc
                }, {}),
              ).map(([cat, list]) => (
                <optgroup key={cat} label={cat}>
                  {list.map((t) => (
                    <option key={t.id} value={t.id}>{t.id}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <Button onClick={start} disabled={!ideaTitle.trim() || starting} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              启动流水线
            </Button>
          </div>
          <Textarea placeholder="切入角度（可选，引导任务书生成）" value={ideaAngle} onChange={(e) => setIdeaAngle(e.target.value)} rows={2} />
          {/* 文风校准（学 wewrite exemplar：粘贴范文提炼指纹 → 初稿仅结构节奏校准） */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <BookOpen className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">文风校准：</span>
              <select value={exemplarId} onChange={(e) => setExemplarId(e.target.value)} className="h-7 text-[11px] border rounded-md bg-background px-2 max-w-[180px]" aria-label="文风校准档案">
                <option value="">不校准（默认）</option>
                {exemplars.map((x) => (
                  <option key={x.id} value={x.id}>{x.name}（{x.words} 字）</option>
                ))}
              </select>
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => setShowLearn(!showLearn)}>
                <Sparkles className="h-3 w-3 mr-0.5" />学习新文风
              </Button>
              {exemplarId && exemplars.find((x) => x.id === exemplarId) && (
                <Button size="sm" variant="ghost" className="h-6 text-[10px] px-1.5 text-muted-foreground" onClick={() => deleteExemplar(exemplarId)}>
                  <Trash2 className="h-3 w-3" />删除该档案
                </Button>
              )}
              {exemplarId && <span className="text-[10px] text-amber-600">仅校准结构与节奏（安全条款内置）</span>}
            </div>
            {showLearn && (
              <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-2.5 space-y-2">
                <div className="flex items-center gap-2">
                  <Input placeholder="档案名，如：某专栏作者风" value={exName} onChange={(e) => setExName(e.target.value)} className="h-7 text-xs max-w-[220px]" />
                  <span className="text-[10px] text-muted-foreground">{exContent.length} 字（200~20000）</span>
                  <Button size="sm" className="h-7 text-[11px] bg-amber-500 hover:bg-amber-600 text-white ml-auto" onClick={learnExemplar} disabled={learning || !exName.trim() || exContent.trim().length < 200}>
                    {learning ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                    提炼文风指纹
                  </Button>
                </div>
                <Textarea placeholder="粘贴 200 字以上的范文（结构/节奏/用词最具代表性的部分）。指纹只描述风格特征，不会复用观点与句子" value={exContent} onChange={(e) => setExContent(e.target.value)} rows={4} />
                {exemplars.length > 0 && (
                  <p className="text-[10px] text-muted-foreground">已有 {exemplars.length} 个档案：{exemplars.map((x) => x.name).join(" · ")}</p>
                )}
              </div>
            )}
          </div>
          {ideas.filter((i) => i.status === "new").length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Lightbulb className="h-3 w-3" />选题池：</span>
              {ideas.filter((i) => i.status === "new").slice(0, 4).map((i) => (
                <button key={i.id} onClick={() => setIdeaTitle(i.title)} className="text-[10px] border rounded-full px-2 py-0.5 hover:border-amber-400 hover:text-amber-600 transition-colors truncate max-w-[220px]">
                  {i.title}
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 看板 or 详情 */}
      {selectedId ? (
        <RunDetail runId={selectedId} onBack={() => { setSelectedId(null); void refresh() }} />
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>Run 看板（{runs.length}）</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void refresh()}><RefreshCw className="h-3 w-3" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[560px]">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 pr-2">
                {runs.length === 0 && (
                  <div className="col-span-full flex flex-col items-center py-12 text-muted-foreground">
                    <FileText className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">还没有创作任务——输入选题启动第一条流水线</p>
                  </div>
                )}
                <AnimatePresence>
                  {runs.map((r) => (
                    <motion.button
                      key={r.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => setSelectedId(r.id)}
                      className="text-left rounded-lg border p-3 space-y-2 hover:border-amber-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold leading-snug line-clamp-2">{r.ideaTitle}</span>
                        <Badge variant={r.status === "done" ? "default" : r.status === "error" ? "destructive" : "secondary"} className={`shrink-0 ${r.status === "done" ? "bg-emerald-600" : r.status === "running" ? "animate-pulse" : ""}`}>
                          {r.status === "done" ? <CheckCircle2 className="h-3 w-3 mr-0.5" /> : r.status === "error" ? <XCircle className="h-3 w-3 mr-0.5" /> : r.status === "running" ? <Loader2 className="h-3 w-3 mr-0.5 animate-spin" /> : null}
                          {r.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{r.persona}</Badge>
                        <Badge variant={r.mode === "REAL" ? "default" : "secondary"} className={`text-[9px] px-1 py-0 ${r.mode === "REAL" ? "bg-emerald-600" : ""}`}>{r.mode === "REAL" ? "真实" : "演示"}</Badge>
                        {r._count?.claims ? <span>{r._count.claims} claims</span> : null}
                        {r._count?.articles ? <span>{r._count.articles} 稿</span> : null}
                        {r._count?.publishes ? <span className="text-amber-600">已发布</span> : null}
                        <span className="ml-auto">{new Date(r.createdAt).toLocaleString("zh-CN")}</span>
                      </div>
                    </motion.button>
                  ))}
                </AnimatePresence>
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
