"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { MdView } from "./md-view"
import { Bot, Play, Search, RefreshCw, MessageSquarePlus, CheckCircle2, XCircle, Loader2, Circle, Clock, Sparkles } from "lucide-react"

interface Skill { id: string; name: string; description: string; bodyPreview: string; bodyLength: number }
interface RunStep { name: string; status: "pending" | "running" | "done" | "error"; detail: string; latencyMs: number }
interface Run { id: string; skillId: string; skillName: string; input: string; status: string; mode: string; steps: string; output: string; error: string; createdAt: string; inboxItems?: { id: string; comment: string; createdAt: string }[] }

const STEP_LABELS: Record<string, string> = {
  "load-skill": "加载技能",
  context: "上下文组装",
  generate: "生成产出",
  review: "五维审稿",
  finalize: "落库产出",
}

export function AgentPanel() {
  const { toast } = useToast()
  const [skills, setSkills] = useState<Skill[]>([])
  const [skillQuery, setSkillQuery] = useState("")
  const [selected, setSelected] = useState<Skill | null>(null)
  const [input, setInput] = useState("")
  const [runs, setRuns] = useState<Run[]>([])
  const [current, setCurrent] = useState<Run | null>(null)
  const [starting, setStarting] = useState(false)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const refreshSkills = useCallback(async (force = false) => {
    const json = await fetch(`/api/agent/skills${force ? "?force=1" : ""}`).then((x) => x.json())
    setSkills(json.skills ?? [])
  }, [])

  const refreshRuns = useCallback(async () => {
    const json = await fetch("/api/agent/runs").then((x) => x.json())
    setRuns(json.runs ?? [])
  }, [])

  useEffect(() => {
    void refreshSkills()
    void refreshRuns()
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refreshSkills, refreshRuns])

  // 轮询进行中的 run
  useEffect(() => {
    if (!current || (current.status !== "running" && current.status !== "queued")) return
    pollRef.current = setInterval(async () => {
      const json = await fetch(`/api/agent/runs/${current.id}`).then((x) => x.json())
      if (json.run) {
        setCurrent(json.run)
        if (json.run.status === "done" || json.run.status === "error") {
          if (pollRef.current) clearInterval(pollRef.current)
          void refreshRuns()
          if (json.run.status === "done") toast({ title: "Run 执行完成", description: `${json.run.skillName} · 模式 ${json.run.mode}` })
        }
      }
    }, 2000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [current?.id, current?.status])

  const filtered = skills.filter(
    (s) =>
      !skillQuery ||
      s.name.toLowerCase().includes(skillQuery.toLowerCase()) ||
      s.description.toLowerCase().includes(skillQuery.toLowerCase()) ||
      s.id.toLowerCase().includes(skillQuery.toLowerCase()),
  )

  const startRun = async () => {
    if (!selected || !input.trim()) return
    setStarting(true)
    try {
      const res = await fetch("/api/agent/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skillId: selected.id, input }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setInput("")
      await refreshRuns()
      const detail = await fetch(`/api/agent/runs/${json.id}`).then((x) => x.json())
      setCurrent(detail.run)
      toast({ title: "Agent Run 已启动", description: `技能：${selected.name}` })
    } catch (e) {
      toast({ title: "启动失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setStarting(false)
    }
  }

  const openRun = async (id: string) => {
    const json = await fetch(`/api/agent/runs/${id}`).then((x) => x.json())
    setCurrent(json.run ?? null)
  }

  const sendFeedback = async () => {
    if (!current) return
    const comment = window.prompt("对本次产出的改进意见（写入 inbox，反哺下次执行）：")
    if (!comment) return
    await fetch("/api/inbox", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType: "run", targetId: current.id, comment }) })
    const json = await fetch(`/api/agent/runs/${current.id}`).then((x) => x.json())
    setCurrent(json.run)
    toast({ title: "反馈已写入 inbox" })
  }

  let steps: RunStep[] = []
  try {
    steps = current ? (JSON.parse(current.steps) as RunStep[]) : []
  } catch {
    steps = []
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr_340px] gap-4">
      {/* 左：Skills 热加载目录 */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" />Skills 热加载</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void refreshSkills(true)} title="强制重新扫描 SKILL.md"><RefreshCw className="h-3 w-3" /></Button>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="搜索 69 个技能…" value={skillQuery} onChange={(e) => setSkillQuery(e.target.value)} className="h-8 pl-7 text-xs" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">扫描 skills/*/SKILL.md（开放标准，即装即用）</p>
        </CardHeader>
        <CardContent className="pt-0 flex-1">
          <ScrollArea className="h-[560px]">
            <div className="space-y-1.5 pr-2">
              {filtered.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${selected?.id === s.id ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "hover:border-amber-200"}`}
                >
                  <div className="text-xs font-semibold truncate">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{s.description || s.bodyPreview}</div>
                </button>
              ))}
              {filtered.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">无匹配技能</p>}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* 中：任务输入 + run 执行 */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Bot className="h-4 w-4 text-amber-500" />Agent 运行时</CardTitle>
        </CardHeader>
        <CardContent className="pt-0 flex-1 space-y-3">
          <div className="rounded-lg border border-dashed p-3 space-y-2">
            <div className="text-xs text-muted-foreground">
              已选技能：<span className="text-foreground font-semibold">{selected ? selected.name : "（点左侧选择）"}</span>
              {selected && <span className="ml-1 text-[10px]">（{selected.bodyLength} 字符指令将注入 system prompt）</span>}
            </div>
            <Textarea placeholder="任务输入，如：写一篇关于「具身智能融资升温」的公众号文章" value={input} onChange={(e) => setInput(e.target.value)} rows={3} />
            <Button onClick={startRun} disabled={!selected || !input.trim() || starting} className="w-full bg-amber-500 hover:bg-amber-600 text-white whitespace-normal h-auto py-2">
              {starting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              启动 Run（load-skill → context → generate → review → finalize）
            </Button>
          </div>

          {current && (
            <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border p-3 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-semibold truncate">{current.skillName || current.skillId}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{current.input}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Badge variant={current.status === "done" ? "default" : current.status === "error" ? "destructive" : "secondary"} className={current.status === "done" ? "bg-emerald-600" : current.status === "error" ? "" : current.status === "running" ? "animate-pulse" : ""}>
                    {current.status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {current.status}
                  </Badge>
                  {current.mode && <Badge variant="outline" className="text-[9px]">{current.mode}</Badge>}
                </div>
              </div>

              {/* 五步进度 */}
              <div className="space-y-1">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {s.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" /> : s.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 shrink-0" /> : s.status === "error" ? <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />}
                    <span className={s.status === "pending" ? "text-muted-foreground/60" : "font-medium"}>{STEP_LABELS[s.name] ?? s.name}</span>
                    <span className="text-[10px] text-muted-foreground truncate flex-1">{s.detail}</span>
                    {s.latencyMs > 0 && <span className="text-[10px] text-muted-foreground shrink-0 flex items-center gap-0.5"><Clock className="h-2.5 w-2.5" />{s.latencyMs}ms</span>}
                  </div>
                ))}
              </div>

              {current.error && <div className="text-xs text-red-500 rounded bg-red-50 dark:bg-red-950/30 px-2 py-1.5">{current.error}</div>}

              {current.output && (
                <ScrollArea className="h-72 rounded-md border bg-muted/30 p-3">
                  <MdView content={current.output} />
                </ScrollArea>
              )}

              <div className="flex items-center justify-between">
                <Button variant="outline" size="sm" onClick={sendFeedback}><MessageSquarePlus className="h-3.5 w-3.5 mr-1" />写反馈到 inbox</Button>
                {current.inboxItems && current.inboxItems.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">{current.inboxItems.length} 条反馈</span>
                )}
              </div>
              {current.inboxItems && current.inboxItems.length > 0 && (
                <div className="space-y-1">
                  {current.inboxItems.map((it) => (
                    <div key={it.id} className="text-[11px] rounded bg-muted/50 px-2 py-1 border-l-2 border-amber-400">
                      <span className="text-muted-foreground mr-1">{new Date(it.createdAt).toLocaleString("zh-CN")}</span>
                      {it.comment}
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* 右：Run 历史 */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center justify-between">
            <span>Run 历史</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void refreshRuns()}><RefreshCw className="h-3 w-3" /></Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ScrollArea className="h-[600px]">
            <div className="space-y-1.5 pr-2">
              {runs.length === 0 && <p className="text-xs text-muted-foreground py-6 text-center">还没有 Run</p>}
              <AnimatePresence>
                {runs.map((r) => (
                  <motion.button
                    key={r.id}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => openRun(r.id)}
                    className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${current?.id === r.id ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "hover:border-amber-200"}`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-medium truncate min-w-0 flex-1">{r.skillName || r.skillId}</span>
                      <Badge variant={r.status === "done" ? "default" : r.status === "error" ? "destructive" : "secondary"} className={`text-[9px] px-1 py-0 shrink-0 ${r.status === "done" ? "bg-emerald-600" : ""}`}>{r.status}</Badge>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">{r.input}</div>
                    <div className="text-[10px] text-muted-foreground/70 mt-0.5">{new Date(r.createdAt).toLocaleString("zh-CN")}</div>
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
