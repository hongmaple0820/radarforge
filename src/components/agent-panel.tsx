"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { useToast } from "@/hooks/use-toast"
import { MdView } from "./md-view"
import {
  Bot, Play, Search, RefreshCw, MessageSquarePlus, CheckCircle2, XCircle, Loader2, Circle, Clock, Sparkles,
  Info, Power, Trash2, Download, ShieldCheck, ShieldAlert, Upload, FolderTree,
} from "lucide-react"

// ---------- 类型（P2-1：/api/skills 全量清单——含来源/合规/停用态） ----------

interface ComplianceIssue { rule: string; message: string; severity: "error" | "warn" }
interface Compliance { ok: boolean; errors: ComplianceIssue[]; warnings: ComplianceIssue[] }

interface Skill {
  id: string
  name: string
  description: string
  bodyPreview: string
  source: "product" | "user"
  disabled: boolean
  compliance: Compliance
  allowedTools: string[]
}

interface SkillDetail {
  id: string
  source: "product" | "user"
  dir: string
  disabled: boolean
  compliance: Compliance
  frontmatter: Record<string, unknown>
  raw: string
  tree: { path: string; size: number }[]
  treeTruncated: boolean
}

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
  const fileRef = useRef<HTMLInputElement>(null)

  // P2-1 安装管理态
  const [installUrl, setInstallUrl] = useState("")
  const [installing, setInstalling] = useState(false)
  const [detail, setDetail] = useState<SkillDetail | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [toggling, setToggling] = useState<string | null>(null)

  const refreshSkills = useCallback(async () => {
    const json = await fetch("/api/skills").then((x) => x.json())
    if (json.ok) {
      const list = json.skills as Skill[]
      setSkills(list)
      // 已选技能被停用/卸载 → 清选择
      setSelected((prev) => (prev && list.some((s) => s.id === prev.id && !s.disabled) ? { ...prev, ...list.find((s) => s.id === prev.id)! } : null))
    }
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

  // ---------- P2-1：安装（URL / zip 上传） ----------

  const doInstallUrl = async () => {
    if (!installUrl.trim()) {
      toast({ title: "请填写技能包 URL" })
      return
    }
    setInstalling(true)
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "install-url", url: installUrl.trim() }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message)
      toast({ title: "安装完成", description: json.message })
      setInstallUrl("")
      void refreshSkills()
    } catch (e) {
      toast({ title: "安装失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setInstalling(false)
    }
  }

  const doInstallFile = async (file: File) => {
    setInstalling(true)
    try {
      const form = new FormData()
      form.append("file", file)
      const res = await fetch("/api/skills/install", { method: "POST", body: form })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message)
      toast({ title: "安装完成", description: json.message })
      void refreshSkills()
    } catch (e) {
      toast({ title: "安装失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setInstalling(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  // ---------- P2-1：启停 / 卸载 / 详情 ----------

  const doToggle = async (skill: Skill) => {
    setToggling(skill.id)
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "toggle", id: skill.id, disabled: !skill.disabled }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message)
      toast({ title: json.ok ? "状态已更新" : "失败", description: json.message })
      void refreshSkills()
    } catch (e) {
      toast({ title: "启停失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setToggling(null)
    }
  }

  const doUninstall = async (skill: Skill) => {
    if (!window.confirm(`确认卸载用户技能 "${skill.id}"？目录文件将被删除（产品库技能不受影响）。`)) return
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "uninstall", id: skill.id }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message)
      toast({ title: "已卸载", description: json.message })
      void refreshSkills()
    } catch (e) {
      toast({ title: "卸载失败", description: (e as Error).message, variant: "destructive" })
    }
  }

  const openDetail = async (id: string) => {
    setDetailLoading(true)
    setDetail(null)
    try {
      const res = await fetch(`/api/skills/detail?id=${encodeURIComponent(id)}`)
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.message)
      setDetail(json.skill as SkillDetail)
    } catch (e) {
      toast({ title: "详情读取失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setDetailLoading(false)
    }
  }

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

  const enabledCount = skills.filter((s) => !s.disabled).length

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr_340px] gap-4">
      {/* 左：Skills 目录 + 安装管理（P2-1） */}
      <Card className="flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-amber-500" />Skills 目录</span>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void refreshSkills()} title="重新扫描（含合规校验）"><RefreshCw className="h-3 w-3" /></Button>
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder={`搜索 ${skills.length} 个技能…`} value={skillQuery} onChange={(e) => setSkillQuery(e.target.value)} className="h-8 pl-7 text-xs" />
            </div>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Agent Skills 开放标准 · 产品库 db/skills（{skills.filter((s) => s.source === "product").length}）+ 用户自装位（{skills.filter((s) => s.source === "user").length}）· 候选池 {enabledCount} 个
          </p>
        </CardHeader>
        <CardContent className="pt-0 flex-1">
          {/* P2-1 安装盒：URL / zip 双通道 */}
          <div className="rounded-md border border-dashed border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/10 p-2 space-y-1.5 mb-2">
            <div className="flex items-center gap-1.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
              <Download className="h-3 w-3" />安装技能
            </div>
            <div className="flex gap-1.5">
              <Input
                placeholder="zip 直链或 GitHub tree 页地址"
                value={installUrl}
                onChange={(e) => setInstallUrl(e.target.value)}
                className="h-7 text-[11px] font-mono"
                onKeyDown={(e) => e.key === "Enter" && void doInstallUrl()}
              />
              <Button size="sm" className="h-7 px-2.5 bg-amber-500 hover:bg-amber-600 text-white shrink-0" onClick={() => void doInstallUrl()} disabled={installing}>
                {installing ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
              </Button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => fileRef.current?.click()} disabled={installing}>
                <Upload className="h-3 w-3 mr-1" />上传 zip
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void doInstallFile(f)
                }}
              />
              <span className="text-[9px] text-muted-foreground">SKILL.md 在 zip 根或一层子目录；装完即合规校验</span>
            </div>
          </div>

          <ScrollArea className="h-[470px]">
            <div className="space-y-1.5 pr-2">
              {filtered.map((s) => (
                <div
                  key={s.id}
                  className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${selected?.id === s.id ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "hover:border-amber-200"} ${s.disabled ? "opacity-55" : ""}`}
                >
                  <button
                    className="w-full text-left"
                    onClick={() => {
                      if (s.disabled) {
                        toast({ title: `「${s.name}」已停用`, description: "点右侧电源图标重新启用后才能启动 Run" })
                        return
                      }
                      setSelected(s)
                    }}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs font-semibold truncate">{s.name}</span>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-500 dark:bg-transparent">
                        {s.source === "user" ? "自装" : "产品库"}
                      </span>
                      {s.disabled && <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 text-amber-600 border-amber-300">停用</Badge>}
                      {!s.compliance.ok ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 text-red-600 border-red-300" title={s.compliance.errors.map((e) => e.message).join("；")}>
                          <ShieldAlert className="h-2.5 w-2.5 mr-0.5" />不合规
                        </Badge>
                      ) : s.compliance.warnings.length > 0 ? (
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 text-amber-600 border-amber-300" title={s.compliance.warnings.map((w) => w.message).join("；")}>
                          <ShieldAlert className="h-2.5 w-2.5 mr-0.5" />{s.compliance.warnings.length} 提示
                        </Badge>
                      ) : (
                        <span title="agentskills.io 规范合规" className="inline-flex shrink-0"><ShieldCheck className="h-3 w-3 text-emerald-600" /></span>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground line-clamp-2 mt-0.5">{s.description || s.bodyPreview}</div>
                  </button>
                  <div className="flex items-center gap-0.5 mt-1 pt-1 border-t border-dashed border-slate-100 dark:border-slate-800">
                    <Button variant="ghost" size="icon" className="h-5 w-5" title="详情（SKILL.md 全文 + 目录结构 + 合规）" onClick={() => void openDetail(s.id)}>
                      <Info className="h-3 w-3" />
                    </Button>
                    <Button variant="ghost" size="icon" className={`h-5 w-5 ${s.disabled ? "text-muted-foreground" : "text-emerald-600"}`} title={s.disabled ? "启用（进入候选池）" : "停用（移出候选池，文件保留）"} disabled={toggling === s.id} onClick={() => void doToggle(s)}>
                      {toggling === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Power className="h-3 w-3" />}
                    </Button>
                    {s.source === "user" && (
                      <Button variant="ghost" size="icon" className="h-5 w-5 text-muted-foreground hover:text-red-600" title="卸载（删除用户位目录）" onClick={() => void doUninstall(s)}>
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
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
              {selected && <span className="ml-1 text-[10px]">（{selected.compliance.ok ? "合规技能" : "注意：该技能存在合规问题"}，指令将注入 system prompt）</span>}
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

      {/* P2-1：技能详情抽屉（SKILL.md 全文 + 目录结构 + 合规报告） */}
      <Sheet open={!!detail || detailLoading} onOpenChange={(v) => { if (!v) { setDetail(null); setDetailLoading(false) } }}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto p-0">
          {/* Radix 无障碍要求：DialogContent 必须有 DialogTitle（加载态也需存在） */}
          {detailLoading && (
            <>
              <SheetTitle className="sr-only">技能详情加载中</SheetTitle>
              <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground text-sm">
                <Loader2 className="h-4 w-4 animate-spin" />读取技能详情…
              </div>
            </>
          )}
          {detail && (
            <>
              <SheetHeader className="pb-2 border-b">
                <SheetTitle className="flex items-center gap-2 text-base">
                  <span className="truncate">{detail.id}</span>
                  <Badge variant="outline" className="text-[10px] shrink-0">{detail.source === "user" ? "用户自装" : "产品库"}</Badge>
                  {detail.disabled && <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 shrink-0">已停用</Badge>}
                </SheetTitle>
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  {detail.compliance.ok ? (
                    <span className="inline-flex items-center gap-1 text-emerald-600 font-medium"><ShieldCheck className="h-3.5 w-3.5" />agentskills.io 规范合规</span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-red-600 font-medium"><ShieldAlert className="h-3.5 w-3.5" />{detail.compliance.errors.length} 项合规错误</span>
                  )}
                  {detail.compliance.warnings.length > 0 && <span>{detail.compliance.warnings.length} 项提示</span>}
                </div>
              </SheetHeader>
              <div className="p-4 space-y-4 text-sm">
                {/* 合规明细 */}
                {(detail.compliance.errors.length > 0 || detail.compliance.warnings.length > 0) && (
                  <div className="space-y-1.5">
                    {detail.compliance.errors.map((e, i) => (
                      <div key={i} className="rounded-md bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 px-2.5 py-1.5 text-[11px] text-red-700 dark:text-red-400">
                        <span className="font-mono text-[9px] mr-1 opacity-60">{e.rule}</span>{e.message}
                      </div>
                    ))}
                    {detail.compliance.warnings.map((w, i) => (
                      <div key={i} className="rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                        <span className="font-mono text-[9px] mr-1 opacity-60">{w.rule}</span>{w.message}
                      </div>
                    ))}
                  </div>
                )}
                {/* 目录结构 */}
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold mb-1.5"><FolderTree className="h-3.5 w-3.5 text-muted-foreground" />目录结构</div>
                  <div className="rounded-md border bg-muted/30 p-2 font-mono text-[10px] leading-relaxed max-h-40 overflow-y-auto">
                    {detail.tree.map((f) => (
                      <div key={f.path} className="flex justify-between gap-2">
                        <span className={f.path.endsWith("/") ? "text-muted-foreground font-semibold" : ""}>{f.path}</span>
                        {!f.path.endsWith("/") && <span className="text-muted-foreground shrink-0">{f.size}B</span>}
                      </div>
                    ))}
                    {detail.treeTruncated && <div className="text-muted-foreground pt-1">（超过 200 项已截断）</div>}
                  </div>
                </div>
                {/* SKILL.md 全文 */}
                <div>
                  <div className="text-xs font-semibold mb-1.5">SKILL.md 全文</div>
                  <div className="rounded-md border bg-muted/30 p-3">
                    <ScrollArea className="max-h-[420px]">
                      <pre className="text-[11px] font-mono whitespace-pre-wrap break-words leading-relaxed">{detail.raw}</pre>
                    </ScrollArea>
                  </div>
                </div>
                {/* 安装位 */}
                <div className="text-[10px] text-muted-foreground font-mono break-all">安装位：{detail.dir}</div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
