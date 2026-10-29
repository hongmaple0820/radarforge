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
import { PenLine, Play, Loader2, RefreshCw, Lightbulb, FileText, CheckCircle2, XCircle } from "lucide-react"

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
    const [r, i] = await Promise.all([
      fetch("/api/runs").then((x) => x.json()),
      fetch("/api/ideas").then((x) => x.json()),
    ])
    setRuns(r.runs ?? [])
    setPersonas(r.personas ?? [])
    setThemes(r.themes ?? [])
    setIdeas(i.ideas ?? [])
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
        body: JSON.stringify({ ideaTitle, ideaAngle, persona, theme }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      await refresh()
      setSelectedId(json.id)
      toast({ title: "六步流水线已启动", description: "brief → claims → 初稿 → 审稿 → 封面 → 排版" })
    } catch (e) {
      toast({ title: "启动失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setStarting(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* 新建运行 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><PenLine className="h-4 w-4 text-amber-500" />图文线 · 六步流水线</CardTitle>
          <p className="text-[11px] text-muted-foreground">brief 任务书 → claims 联网取证（Industry=news · d30）→ 人格初稿 → 五维审稿 → 封面 → 微信排版（18 主题）</p>
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
