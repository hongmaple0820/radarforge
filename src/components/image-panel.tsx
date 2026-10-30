"use client"

// ============================================================
// image-panel —— 纯图线工作台（第三条产线）
// 主题 → LLM 构图方案（概念组，风格统一）→ zai-image 批量生成
// 用途预设（公众号封面 / 小红书组图 / 通用方图）× 5 种风格 × 1~9 张
// 画廊式产出：图注 / 下载 / 打开原图 / 复制画廊 Markdown
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { ImageIcon, Play, Loader2, RefreshCw, Copy, Download, ExternalLink, CheckCircle2, XCircle, Circle, Clock, Wand2 } from "lucide-react"

interface ImageRunItem {
  id: string
  ideaTitle: string
  ideaAngle: string
  status: string
  createdAt: string
  _count?: { assets: number }
}
interface UsageInfo { id: string; label: string; size: string; desc: string }
interface StyleInfo { id: string; label: string }
interface RunStep { name: string; status: "pending" | "running" | "done" | "error" | "skipped"; detail: string; latencyMs: number }
interface GalleryAsset { id: string; path: string; role: string; meta: string; error: string; createdAt: string }

const STEP_LABELS: Record<string, string> = { plan: "构图方案", gen: "批量生图" }

export function ImagePanel() {
  const { toast } = useToast()
  const [runs, setRuns] = useState<ImageRunItem[]>([])
  const [usages, setUsages] = useState<UsageInfo[]>([])
  const [styles, setStyles] = useState<StyleInfo[]>([])
  const [subject, setSubject] = useState("")
  const [usage, setUsage] = useState("general-square")
  const [style, setStyle] = useState("modern-flat")
  const [count, setCount] = useState(3)
  const [starting, setStarting] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<{ steps: RunStep[]; images: GalleryAsset[]; output: string; status: string; error: string } | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const json = await fetch("/api/image-runs").then((x) => x.json())
      setRuns(json.runs ?? [])
      setUsages(json.usages ?? [])
      setStyles(json.styles ?? [])
    } catch {
      /* 列表失败静默，下次轮询恢复 */
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(t)
  }, [refresh])

  const loadRun = useCallback(async (id: string) => {
    setLoadingDetail(true)
    try {
      const json = await fetch(`/api/runs/${id}`).then((x) => x.json())
      const run = json.run as
        | {
            status: string
            error: string
            steps: string
            output: string
            assets: { id: string; kind: string; role: string; path: string; meta: string; error: string; createdAt: string }[]
          }
        | null
      if (!run) return
      let steps: RunStep[] = []
      try {
        steps = JSON.parse(run.steps) as RunStep[]
      } catch {
        steps = []
      }
      const images = run.assets.filter((a) => a.kind === "image" && a.path && (a.role === "hero" || a.role.startsWith("card-")))
      setDetail({ steps, images, output: run.output ?? "", status: run.status, error: run.error ?? "" })
    } finally {
      setLoadingDetail(false)
    }
  }, [])

  useEffect(() => {
    if (selectedId) void loadRun(selectedId)
    else setDetail(null)
  }, [selectedId, loadRun])

  // 轮询进行中的 run（列表 + 详情）
  useEffect(() => {
    const hasRunning = runs.some((r) => r.status === "running" || r.status === "queued") || detail?.status === "running" || detail?.status === "queued"
    if (!hasRunning) return
    const t = setInterval(() => {
      void refresh()
      if (selectedId) void loadRun(selectedId)
    }, 3000)
    return () => clearInterval(t)
  }, [runs, detail, refresh, selectedId, loadRun])

  const start = async () => {
    if (!subject.trim()) return
    setStarting(true)
    try {
      const res = await fetch("/api/image-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, usage, style, count }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      await refresh()
      setSelectedId(json.id)
      const u = usages.find((x) => x.id === usage)
      toast({ title: "纯图线已启动", description: `构图方案 → ${count} 张批量生图（${u?.size ?? ""}）` })
    } catch (e) {
      toast({ title: "启动失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setStarting(false)
    }
  }

  const copyGallery = async () => {
    if (!detail?.output) return
    await navigator.clipboard.writeText(detail.output)
    toast({ title: "画廊 Markdown 已复制", description: "含全部图注与图片链接，可粘贴到笔记/文档" })
  }

  const selectedRun = runs.find((r) => r.id === selectedId)

  return (
    <div className="space-y-4">
      {/* 新建纯图任务 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><ImageIcon className="h-4 w-4 text-sky-500" />纯图线 · 主题生图画廊</CardTitle>
          <p className="text-[11px] text-muted-foreground">主题 → LLM 构图方案（概念组，风格统一）→ zai-image 批量生成 → 画廊（下载 / 复制 Markdown）。生图降级留痕不阻断</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            placeholder="主题或画面描述，如：具身智能走进工厂——机器人与产线协作的一组概念图"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            rows={2}
          />
          <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)_110px_auto] gap-2">
            <select value={usage} onChange={(e) => setUsage(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="用途">
              {usages.map((u) => (
                <option key={u.id} value={u.id}>{u.label}（{u.size}）</option>
              ))}
            </select>
            <select value={style} onChange={(e) => setStyle(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="风格">
              {styles.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="张数">
              {Array.from({ length: 9 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>{n} 张</option>
              ))}
            </select>
            <Button onClick={start} disabled={!subject.trim() || starting} className="bg-sky-500 hover:bg-sky-600 text-white shrink-0">
              {starting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              生成图片组
            </Button>
          </div>
          {usages.find((u) => u.id === usage) && (
            <p className="text-[10px] text-muted-foreground">{usages.find((u) => u.id === usage)!.desc}</p>
          )}
        </CardContent>
      </Card>

      {/* 画廊 or 看板 */}
      {selectedId ? (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5 min-w-0">
                <Wand2 className="h-3.5 w-3.5 text-sky-500 shrink-0" />
                <span className="truncate">{selectedRun?.ideaTitle ?? detail?.output.match(/^#\s+(.+)$/m)?.[1] ?? "图片组"}</span>
              </span>
              <span className="flex items-center gap-1.5 shrink-0">
                {detail?.images.length ? (
                  <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={copyGallery}>
                    <Copy className="h-3 w-3 mr-0.5" />复制画廊 MD
                  </Button>
                ) : null}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setSelectedId(null); void refresh() }}><RefreshCw className="h-3 w-3" /></Button>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            {/* 两步进度 */}
            {detail && (
              <div className="grid grid-cols-2 gap-2">
                {detail.steps.map((s, i) => (
                  <div key={i} className={`rounded-lg border px-3 py-2 space-y-1 ${s.status === "done" ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : s.status === "running" ? "border-sky-300 bg-sky-50/50 dark:bg-sky-950/20" : s.status === "error" ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" : ""}`}>
                    <div className="flex items-center gap-1.5">
                      {s.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : s.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" /> : s.status === "error" ? <XCircle className="h-3.5 w-3.5 text-red-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                      <span className="text-xs font-semibold">{STEP_LABELS[s.name] ?? s.name}</span>
                      {s.latencyMs > 0 && <span className="text-[9px] text-muted-foreground ml-auto flex items-center"><Clock className="h-2 w-2 mr-0.5" />{(s.latencyMs / 1000).toFixed(1)}s</span>}
                    </div>
                    <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">{s.detail}</p>
                  </div>
                ))}
              </div>
            )}
            {detail?.error && <div className="text-xs text-red-500 rounded bg-red-50 dark:bg-red-950/30 px-2 py-1.5">{detail.error}</div>}
            {/* 画廊 */}
            <ScrollArea className="max-h-[620px]">
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 pr-2">
                {loadingDetail && !detail?.images.length && (
                  <div className="col-span-full flex items-center justify-center py-10 text-muted-foreground text-sm">
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />载入图片组…
                  </div>
                )}
                {detail?.images.map((a) => {
                  let caption = ""
                  let size = ""
                  try {
                    const m = JSON.parse(a.meta) as { caption?: string; size?: string; index?: number }
                    caption = m.caption ?? ""
                    size = m.size ?? ""
                  } catch {
                    /* meta 损坏忽略 */
                  }
                  return (
                    <motion.figure key={a.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-xl border overflow-hidden bg-muted/30">
                      <img src={a.path} alt={caption} className="w-full aspect-video object-cover" loading="lazy" />
                      <figcaption className="px-2.5 py-2 space-y-1.5">
                        <p className="text-xs leading-snug line-clamp-1">{caption || "（无图注）"}</p>
                        <div className="flex items-center gap-1.5">
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{a.role}</Badge>
                          {size && <span className="text-[9px] text-muted-foreground">{size}</span>}
                          <span className="ml-auto flex items-center gap-1">
                            <a href={a.path} target="_blank" rel="noreferrer" className="text-muted-foreground hover:text-sky-600" title="打开原图"><ExternalLink className="h-3.5 w-3.5" /></a>
                            <a href={a.path} download className="text-muted-foreground hover:text-sky-600" title="下载"><Download className="h-3.5 w-3.5" /></a>
                          </span>
                        </div>
                      </figcaption>
                    </motion.figure>
                  )
                })}
                {detail && detail.images.length === 0 && detail.status === "done" && (
                  <div className="col-span-full flex flex-col items-center py-8 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">本组图片全部降级未出图（生图端点不稳定）——稍后重试或在设置中心配置自定义生图端点</p>
                  </div>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-between">
              <span>图片组看板（{runs.length}）</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => void refresh()}><RefreshCw className="h-3 w-3" /></Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-[560px]">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5 pr-2">
                {runs.length === 0 && (
                  <div className="col-span-full flex flex-col items-center py-12 text-muted-foreground">
                    <ImageIcon className="h-8 w-8 mb-2 opacity-30" />
                    <p className="text-sm">还没有图片组——输入主题，生成第一组图</p>
                  </div>
                )}
                <AnimatePresence>
                  {runs.map((r) => (
                    <motion.button
                      key={r.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => setSelectedId(r.id)}
                      className="text-left rounded-lg border p-3 space-y-2 hover:border-sky-300 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-semibold leading-snug line-clamp-2">{r.ideaTitle}</span>
                        <Badge variant={r.status === "done" ? "default" : r.status === "error" ? "destructive" : "secondary"} className={`shrink-0 ${r.status === "done" ? "bg-emerald-600" : r.status === "running" ? "animate-pulse" : ""}`}>
                          {r.status === "done" ? <CheckCircle2 className="h-3 w-3 mr-0.5" /> : r.status === "error" ? <XCircle className="h-3 w-3 mr-0.5" /> : r.status === "running" ? <Loader2 className="h-3 w-3 mr-0.5 animate-spin" /> : null}
                          {r.status}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                        {r._count?.assets ? <span>{r._count.assets} 资产</span> : null}
                        <span className="truncate max-w-[220px]">{r.ideaAngle}</span>
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
