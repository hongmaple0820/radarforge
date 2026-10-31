"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Textarea } from "@/components/ui/textarea"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { useToast } from "@/hooks/use-toast"
import { MdView, SectionedMdView } from "./md-view"
import { TTS_VOICES } from "@/lib/runtime/skills/radar-rewrite"
import { CheckCircle2, XCircle, Loader2, Circle, Clock, Edit3, Send, Copy, FileText, ImageIcon, Sparkles, ThumbsUp, ThumbsDown, ExternalLink, Clapperboard, Palette, Video, Download, RefreshCw, Mic, MousePointerClick, History, ChevronDown, HelpCircle } from "lucide-react"

export interface StoryboardScene { id: number; seconds: number; visual: string; narration: string; subtitle: string; broll: string }
export interface StoryboardData { title: string; hook: string; totalSeconds: number; scenes: StoryboardScene[]; bgm: string; caption: string }

export interface RunDetailData {
  id: string
  ideaTitle: string
  ideaAngle: string
  persona: string
  theme: string
  status: string
  mode: string
  steps: string
  artifacts: string
  error: string
  createdAt: string
  claims: { id: string; idx: number; claimType: string; text: string; verified: boolean | null; sourceTitle: string; sourceUrl: string; sourceSite: string; sourceDate: string }[]
  articles: { id: string; version: number; title: string; markdown: string; formatted: string; wordCount: number }[]
  reviews: { id: string; round: number; scoresJson: string; commentsJson: string; average: number; revised: boolean }[]
  assets: { id: string; kind: string; role: string; path: string; error: string; provider: string; meta: string; createdAt: string }[]
  publishes: { id: string; platform: string; level: number; levelName: string; reason: string; htmlLength: number; createdAt: string }[]
}

interface RunStep { name: string; status: "pending" | "running" | "done" | "error" | "skipped"; detail: string; latencyMs: number }

interface VideoMeta {
  stage: "queued" | "tts" | "spec" | "frames" | "submit" | "poll" | "download" | "encode" | "concat" | "done" | "error"
  percent: number
  sceneDone: number
  sceneTotal: number
  audioMode: "pending" | "tts" | "partial" | "muted"
  ttsNote?: string
  aiNote?: string
  style?: "motion" | "art"
  channel?: "local" | "agnes" | "hybrid"
  /** 混合通道统计（P1） */
  codeScenes?: number
  modelScenes?: number
  voice: string
  aspect: string
  seconds?: number
  width?: number
  height?: number
  sizeBytes?: number
  error?: string
  storyboard?: StoryboardData
}

const VIDEO_STAGE_LABELS: Record<string, string> = { queued: "排队中", tts: "TTS 口播合成", spec: "分镜转动画 spec（LLM）", frames: "逐帧渲染", submit: "提交 AI 模型", poll: "AI 生成中", download: "下载成片", encode: "分段编码", concat: "合成 MP4", done: "完成", error: "失败" }

const STEP_LABELS: Record<string, string> = { brief: "任务书", claims: "主张取证", outline: "大纲先行", draft: "分节初稿", review: "跨家族审稿", verify: "原子断言", illustrate: "正文配图", cover: "封面", layout: "微信排版" }
const DIM_LABELS: Record<string, string> = { accuracy: "准确", viewpoint: "观点", usefulness: "有用", voice: "合声", readability: "好读" }

export function RunDetail({ runId, onBack }: { runId: string | null; onBack: () => void }) {
  const { toast } = useToast()
  const [run, setRun] = useState<RunDetailData | null>(null)
  const [editing, setEditing] = useState(false)
  const [editText, setEditText] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  const [rewriteOut, setRewriteOut] = useState<{ target: string; content: string } | null>(null)
  const [publishOut, setPublishOut] = useState<{ level: number; levelName: string; reason: string; instruction: string; html: string } | null>(null)
  const [rules, setRules] = useState<{ id: string; rule: string; rationale: string; status: string; hits: number }[]>([])
  const [storyboard, setStoryboard] = useState<StoryboardData | null>(null)
  const [themes, setThemes] = useState<{ id: string; label: string; category: string; description: string }[]>([])
  const [voiceChoice, setVoiceChoice] = useState("xiaochen")
  const [aspectChoice, setAspectChoice] = useState<"9:16" | "16:9">("9:16")
  const [videoStyle, setVideoStyle] = useState<"motion" | "art">("motion")
  const [videoChannel, setVideoChannel] = useState<"local" | "agnes" | "hybrid">("local")
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  // P1 指着改图文：选中节 + 反馈输入
  const [sectionEdit, setSectionEdit] = useState<{ index: number; heading: string } | null>(null)
  const [sectionFeedback, setSectionFeedback] = useState("")
  // P1 文章版本树：查看历史版本（只读，改稿始终作用于最新版）
  const [viewVersion, setViewVersion] = useState<number | null>(null)
  // P1 信息重排：「为什么这样写」证据链抽屉（null = 自动：运行中展开/完成折叠）
  const [whyOpen, setWhyOpen] = useState<boolean | null>(null)

  const refresh = useCallback(async () => {
    if (!runId) return
    const json = await fetch(`/api/runs/${runId}`).then((x) => x.json())
    if (json.run) setRun(json.run)
    const lr = await fetch("/api/learn").then((x) => x.json())
    setRules(lr.rules ?? [])
  }, [runId])

  useEffect(() => {
    setRewriteOut(null)
    setPublishOut(null)
    setStoryboard(null)
    setEditing(false)
    setExportData(null)
    setExportTab("wechat")
    setExportTheme("")
    setSectionEdit(null)
    setSectionFeedback("")
    setViewVersion(null)
    setWhyOpen(null)
    void refresh()
    // 主题画廊数据（18 主题注册表，/api/runs 顺带返回）
    void fetch("/api/runs")
      .then((x) => x.json())
      .then((j) => setThemes(j.themes ?? []))
      .catch(() => {})
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [refresh])

  useEffect(() => {
    if (!run || (run.status !== "running" && run.status !== "queued")) return
    pollRef.current = setInterval(() => void refresh(), 2500)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [run?.status])

  // 视频渲染进行中 → 独立轮询（done 的 run 也有后台任务在跑；early-return 前求值避免 TDZ）
  const activeVideoStage = (() => {
    if (!run) return ""
    const va = [...run.assets].reverse().find((a) => a.role === "video-final")
    if (!va) return ""
    try {
      const m = JSON.parse(va.meta) as VideoMeta
      return ["queued", "tts", "spec", "frames", "submit", "poll", "download", "encode", "concat"].includes(m.stage) ? m.stage : ""
    } catch {
      return ""
    }
  })()
  useEffect(() => {
    if (!activeVideoStage) return
    const t = setInterval(() => void refresh(), 2000)
    return () => clearInterval(t)
  }, [activeVideoStage, refresh])

  // ---------- 多平台发布中心：导出预览（切换平台/主题即时预览，不落库） ----------
  const [exportTab, setExportTab] = useState("wechat")
  const [exportData, setExportData] = useState<{ platform: string; label: string; kind: "html" | "markdown" | "text"; content: string; instruction: string; note?: string } | null>(null)
  const [exportTheme, setExportTheme] = useState("")
  const [exportBusy, setExportBusy] = useState(false)
  const [gateBlocked, setGateBlocked] = useState<{ reasons: string[] } | null>(null)

  const doExport = async (platform: string, theme?: string) => {
    if (!runId) return
    setExportBusy(true)
    try {
      const res = await fetch(`/api/runs/${runId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export", platform, ...(theme ? { theme } : {}) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setExportData(json.export)
      if (theme) setExportTheme(theme)
    } catch (e) {
      toast({ title: "导出失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setExportBusy(false)
    }
  }

  const copyExport = async () => {
    if (!exportData?.content) return
    if (exportData.kind === "html") {
      // 富文本复制（粘贴进平台编辑器保留样式）
      const tmp = document.createElement("div")
      tmp.innerHTML = exportData.content
      tmp.style.position = "fixed"
      tmp.style.left = "-9999px"
      document.body.appendChild(tmp)
      const range = document.createRange()
      range.selectNodeContents(tmp)
      const sel = window.getSelection()
      sel?.removeAllRanges()
      sel?.addRange(range)
      document.execCommand("copy")
      document.body.removeChild(tmp)
    } else {
      await navigator.clipboard.writeText(exportData.content)
    }
    toast({
      title: `${exportData.label}格式已复制`,
      description: exportData.instruction,
    })
  }

  // 首次进入自动预览（公众号 · 当前主题）
  useEffect(() => {
    if (runId && run && run.articles.length > 0 && !exportData && !exportBusy) {
      setExportTheme(run.theme)
      void doExport("wechat", run.theme)
    }
  }, [runId, run?.status])

  if (!runId || !run) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
        <FileText className="h-10 w-10 mb-3 opacity-30" />
        <p className="text-sm">选择左侧一个 Run 查看详情</p>
      </div>
    )
  }

  let steps: RunStep[] = []
  try {
    steps = JSON.parse(run.steps) as RunStep[]
  } catch { /* ignore */ }

  const latest = run.articles[run.articles.length - 1]
  const review = run.reviews[0]
  const covers = run.assets.filter((a) => a.role === "cover")
  const cover = [...covers].reverse().find((c) => c.path) ?? covers[covers.length - 1]
  const videoAssets = run.assets.filter((a) => a.role === "video-final")
  const videoAsset = videoAssets[videoAssets.length - 1]
  let videoMeta: VideoMeta | null = null
  try {
    videoMeta = videoAsset ? (JSON.parse(videoAsset.meta) as VideoMeta) : null
  } catch {
    videoMeta = null
  }
  const sbShow = storyboard ?? videoMeta?.storyboard ?? null

  // P1 运行前馈：等待有内容可看——brief 已定而初稿未完时，展示核心判断
  // 与大纲节标题预告（数据已在 artifacts，只差展示层，零额外请求）
  let artifactsJson: Record<string, unknown> = {}
  try { artifactsJson = JSON.parse(run.artifacts) as Record<string, unknown> } catch { /* ignore */ }
  const briefArt = (artifactsJson.brief ?? {}) as Record<string, string>
  const outlineArt = artifactsJson.outline as { title: string; sections: { heading: string; point: string }[] } | undefined
  const draftStep = steps.find((s) => s.name === "draft")
  const feedforward =
    run.status === "running" && !!briefArt.coreJudgment && !!draftStep && ["running", "pending"].includes(draftStep.status)
  // 版本树：历史版本只读预览（改稿动作始终作用于最新版）
  const viewArticle = viewVersion !== null ? run.articles.find((a) => a.version === viewVersion) : undefined
  const displayArticle = viewArticle ?? latest
  const viewingHistory = !!viewArticle && viewArticle.version !== latest?.version
  // 抽屉开合：null = 自动（运行中展开给前馈，完成折叠让稿优先）
  const whyOpenValue = whyOpen ?? run.status !== "done"

  const saveEdit = async () => {
    if (!latest || !editText.trim()) return
    setBusy("edit")
    try {
      const res = await fetch(`/api/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "edit", markdown: editText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "改稿已保存", description: json.message })
      setEditing(false)
      await refresh()
    } catch (e) {
      toast({ title: "保存失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const doRewrite = async (target: string) => {
    setBusy(`rewrite-${target}`)
    try {
      const res = await fetch(`/api/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rewrite", target }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setRewriteOut({ target: json.target, content: json.rewrite })
      toast({ title: `已改写：${json.target}`, description: `${json.wordCount} 字` })
    } catch (e) {
      toast({ title: "改写失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  // P1 指着改图文：选中节 → AI 只重写本节 → 新版本入版本树 → diff 喂飞轮
  const doRewriteSection = async () => {
    if (!sectionEdit || !run) return
    setBusy("rewrite-section")
    try {
      const res = await fetch(`/api/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rewrite-section", sectionIndex: sectionEdit.index, feedback: sectionFeedback }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: `第 ${json.sectionIndex + 1} 节已重写 → v${json.version}`, description: json.message })
      setSectionEdit(null)
      setSectionFeedback("")
      setViewVersion(null)
      await refresh()
    } catch (e) {
      toast({ title: "选段改写失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const doPublish = async (force = false) => {
    setBusy("publish")
    try {
      const res = await fetch(`/api/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish", ...(force ? { force: true } : {}) }),
      })
      const json = await res.json()
      if (!res.ok) {
        if (json.gate?.blocked) {
          setGateBlocked(json.gate)
          toast({ title: "发布门禁拦截", description: json.gate.reasons?.[0] ?? "质量未达标", variant: "destructive" })
        } else {
          throw new Error(json.error)
        }
        return
      }
      setGateBlocked(null)
      setPublishOut(json.outcome)
      toast({ title: `发布走通：${json.outcome.levelName}`, description: json.outcome.instruction.slice(0, 60) })
      await refresh()
    } catch (e) {
      toast({ title: "发布失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const ruleAction = async (id: string, action: "confirm" | "reject") => {
    const res = await fetch("/api/learn", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      toast({ title: "未激活", description: json.error ?? "操作失败", variant: "destructive" })
    } else {
      toast({ title: action === "confirm" ? "规则已激活（注入后续初稿）" : "规则已拒绝" })
    }
    const lr = await fetch("/api/learn").then((x) => x.json())
    setRules(lr.rules ?? [])
  }

  const copyHtml = async () => {
    if (!latest?.formatted) return
    // 复制渲染后的富文本（粘贴进公众号编辑器）
    const tmp = document.createElement("div")
    tmp.innerHTML = latest.formatted
    tmp.style.position = "fixed"
    tmp.style.left = "-9999px"
    document.body.appendChild(tmp)
    const range = document.createRange()
    range.selectNodeContents(tmp)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(range)
    document.execCommand("copy")
    document.body.removeChild(tmp)
    toast({ title: "公众号格式已复制", description: "直接粘贴进公众号编辑器，样式保留" })
  }

  const copyMd = async () => {
    if (!latest?.markdown) return
    await navigator.clipboard.writeText(latest.markdown)
    toast({ title: "Markdown 已复制", description: "粘贴到 CSDN / Notion / Obsidian 等编辑器" })
  }

  const copyHtmlSource = async () => {
    if (!latest?.formatted) return
    await navigator.clipboard.writeText(latest.formatted)
    toast({ title: "HTML 源码已复制", description: "可直接嵌入网页或发给开发同学" })
  }

  const copyStoryboard = async () => {
    if (!sbShow) return
    const lines = sbShow.scenes.map(
      (s) => `【分镜 ${s.id} · ${s.seconds}s】\n字幕：${s.subtitle}\n口播：${s.narration}\n画面：${s.visual}\n素材：${s.broll}`,
    )
    await navigator.clipboard.writeText([`《${sbShow.title}》总时长 ${sbShow.totalSeconds}s`, `钩子：${sbShow.hook}`, "", ...lines, "", `BGM：${sbShow.bgm}`, `发布文案：${sbShow.caption}`].join("\n"))
    toast({ title: "分镜脚本已复制", description: "可直接交给拍摄/剪辑同学" })
  }

  const doStoryboard = async (platform: string) => {
    setBusy(`storyboard-${platform}`)
    try {
      const res = await fetch(`/api/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "storyboard", platform }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setStoryboard(json.storyboard)
      toast({ title: "视频分镜已生成", description: `${json.storyboard.scenes.length} 个分镜 · ${json.storyboard.totalSeconds}s，可直接「渲染成片 MP4」` })
      await refresh()
    } catch (e) {
      toast({ title: "分镜生成失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const doRetheme = async () => {
    if (!exportTheme || exportTheme === run.theme) return
    setBusy("retheme")
    try {
      const res = await fetch(`/api/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "retheme", theme: exportTheme }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "主题已切换", description: json.message })
      await refresh()
    } catch (e) {
      toast({ title: "切换失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const doCover = async () => {
    setBusy("cover")
    try {
      const res = await fetch(`/api/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cover" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      if (!json.ok) {
        toast({ title: "生图降级（不阻断）", description: `${json.error} —— 可在设置中心配置自定义生图端点后点「重新生成」`, variant: "destructive" })
      } else {
        toast({ title: "封面已生成", description: `${json.path}（${Math.round(json.sizeBytes / 1024)}KB）` })
      }
      await refresh()
    } catch (e) {
      toast({ title: "封面生成失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const doRenderVideo = async (sb?: StoryboardData) => {
    const target = sb ?? sbShow
    if (!target) {
      toast({ title: "请先生成视频分镜", variant: "destructive" })
      return
    }
    setBusy("render-video")
    try {
      const res = await fetch(`/api/runs/${run.id}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "render-video", storyboard: target, voice: voiceChoice, aspect: aspectChoice, style: videoStyle, channel: videoChannel }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "成片渲染已开始", description: json.message })
      await refresh()
    } catch (e) {
      toast({ title: "渲染启动失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const proposedRules = rules.filter((r) => r.status === "proposed")
  const activeRules = rules.filter((r) => r.status === "active")

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-1 h-7 text-xs">← 返回看板</Button>
          <h2 className="text-lg font-bold truncate">{run.ideaTitle}</h2>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            <Badge variant={run.status === "done" ? "default" : run.status === "error" ? "destructive" : "secondary"} className={run.status === "done" ? "bg-emerald-600" : ""}>
              {run.status === "running" && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}{run.status}
            </Badge>
            <Badge variant={run.mode === "REAL" ? "default" : "secondary"} className={run.mode === "REAL" ? "bg-emerald-600" : ""}>{run.mode === "REAL" ? "真实检索" : "演示"}</Badge>
            <Badge variant="outline" className="text-[10px]">{run.persona}</Badge>
            <Badge variant="outline" className="text-[10px]">主题 {run.theme}</Badge>
            {latest && <span className="text-[11px] text-muted-foreground">{latest.wordCount} 字 · v{latest.version}</span>}
          </div>
        </div>
      </motion.div>

      {/* 九步进度 */}
      <Card>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-5 xl:grid-cols-9 gap-2">
            {steps.map((s, i) => (
              <div key={i} className={`rounded-lg border px-3 py-2 space-y-1 ${s.status === "done" ? "border-emerald-200 bg-emerald-50/50 dark:bg-emerald-950/20" : s.status === "running" ? "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20" : s.status === "error" ? "border-red-200 bg-red-50/50 dark:bg-red-950/20" : s.status === "skipped" ? "border-muted bg-muted/30" : ""}`}>
                <div className="flex items-center gap-1.5">
                  {s.status === "done" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : s.status === "running" ? <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" /> : s.status === "error" ? <XCircle className="h-3.5 w-3.5 text-red-500" /> : <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />}
                  <span className="text-xs font-semibold">{STEP_LABELS[s.name] ?? s.name}</span>
                  {s.latencyMs > 0 && <span className="text-[9px] text-muted-foreground ml-auto flex items-center"><Clock className="h-2 w-2 mr-0.5" />{(s.latencyMs / 1000).toFixed(1)}s</span>}
                </div>
                <p className="text-[10px] text-muted-foreground line-clamp-2 leading-snug">{s.detail}</p>
              </div>
            ))}
          </div>
          {/* P1 运行前馈：4 分钟等待有内容可看（预告而非状态汇报） */}
          {feedforward && (
            <div className="mt-2.5 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 px-3 py-2.5 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                <Sparkles className="h-3 w-3" />运行前馈 · 任务书已定，初稿正按它写
              </div>
              <p className="text-[11px] leading-snug"><span className="text-muted-foreground">核心判断：</span>{briefArt.coreJudgment}</p>
              {briefArt.targetReader && <p className="text-[10px] text-muted-foreground leading-snug">写给：{briefArt.targetReader}</p>}
              {outlineArt?.sections?.length ? (
                <div className="flex items-center gap-1 flex-wrap pt-0.5">
                  <span className="text-[10px] text-muted-foreground shrink-0">大纲预告：</span>
                  {outlineArt.sections.map((s, i) => (
                    <span key={i} className="text-[9px] border border-amber-300/60 dark:border-amber-700 rounded-full px-1.5 py-0.5 text-amber-700 dark:text-amber-300 truncate max-w-[150px]">{i + 1}. {s.heading}</span>
                  ))}
                </div>
              ) : null}
            </div>
          )}
          {run.error && <div className="mt-2 text-xs text-red-500 rounded bg-red-50 dark:bg-red-950/30 px-2 py-1.5">{run.error}</div>}
        </CardContent>
      </Card>

      {/* 稿件主体（P1 信息重排：稿优先——正文与导出占首屏） */}
      <div className="space-y-4">
          {/* 动作栏 */}
          {run.status === "done" && latest && (
            <Card>
              <CardContent className="pt-4 space-y-2.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button size="sm" variant={editing ? "default" : "outline"} onClick={() => { setEditing(!editing); setEditText(latest.markdown) }}>
                    <Edit3 className="h-3.5 w-3.5 mr-1" />{editing ? "取消改稿" : "改稿（喂飞轮）"}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => doRewrite("csdn")} disabled={busy === "rewrite-csdn"}>
                    {busy === "rewrite-csdn" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}CSDN 版
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => doRewrite("xiaohongshu")} disabled={busy === "rewrite-xiaohongshu"}>
                    {busy === "rewrite-xiaohongshu" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}小红书版
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => doRewrite("shortvideo")} disabled={busy === "rewrite-shortvideo"}>
                    {busy === "rewrite-shortvideo" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <FileText className="h-3.5 w-3.5 mr-1" />}口播稿
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => doStoryboard("douyin")} disabled={busy === "storyboard-douyin"}>
                    {busy === "storyboard-douyin" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Clapperboard className="h-3.5 w-3.5 mr-1" />}视频分镜
                  </Button>
                  <div className="flex-1" />
                  <Button size="sm" variant="outline" onClick={copyMd} disabled={!latest.markdown}>
                    <Copy className="h-3.5 w-3.5 mr-1" />复制 MD
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyHtml} disabled={!latest.formatted}>
                    <Copy className="h-3.5 w-3.5 mr-1" />复制公众号格式
                  </Button>
                  <Button size="sm" variant="outline" onClick={copyHtmlSource} disabled={!latest.formatted}>
                    <Copy className="h-3.5 w-3.5 mr-1" />复制 HTML
                  </Button>
                  <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white" onClick={() => doPublish(false)} disabled={busy === "publish"}>
                    {busy === "publish" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Send className="h-3.5 w-3.5 mr-1" />}发布（质量门禁 + 三级降级）
                  </Button>
                </div>
                {/* 发布门禁拦截面板（诚实告知原因，可强制发布自担风险） */}
                {gateBlocked && (
                  <div className="rounded-lg border border-red-300 bg-red-50/60 dark:bg-red-950/20 px-3 py-2 space-y-1.5">
                    <div className="flex items-center gap-1.5">
                      <XCircle className="h-3.5 w-3.5 text-red-500" />
                      <span className="text-xs font-semibold text-red-600 dark:text-red-400">发布门禁拦截</span>
                    </div>
                    {gateBlocked.reasons?.map((r, i) => (
                      <p key={i} className="text-[11px] text-red-700 dark:text-red-300 leading-snug">· {r}</p>
                    ))}
                    <div className="flex items-center gap-2 pt-0.5">
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => doPublish(true)} disabled={busy === "publish"}>
                        {busy === "publish" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Send className="h-3 w-3 mr-1" />}
                        仍要发布（自担风险）
                      </Button>
                      <span className="text-[10px] text-muted-foreground">建议先在左侧「原子断言」核对无据条目，或改稿后重试</span>
                    </div>
                  </div>
                )}
                <p className="text-[10px] text-muted-foreground">门禁规则：审稿均分 ≥7.0 且断言无据率 ≤30% 才放行；排版主题切换与多平台复制已移至下方「多平台发布中心」</p>
              </CardContent>
            </Card>
          )}

          {/* 改稿编辑器 */}
          {editing && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm">改稿（diff 后自动提炼飞轮规则）</CardTitle></CardHeader>
              <CardContent className="pt-0 space-y-2">
                <Textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={14} className="font-mono text-xs" />
                <Button size="sm" onClick={saveEdit} disabled={busy === "edit"} className="bg-amber-500 hover:bg-amber-600 text-white">
                  {busy === "edit" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存并喂飞轮
                </Button>
              </CardContent>
            </Card>
          )}

          {/* 成稿 markdown（P1：版本树 + 指着改选段重写） */}
          {displayArticle && !editing && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-1.5">
                  <span>成稿（v{displayArticle.version} · {displayArticle.title}）</span>
                  <span className="flex items-center gap-1.5">
                    {/* 文章版本树：v0 初稿 → 指着改/改稿逐版累加，历史版本只读 */}
                    {run.articles.length > 1 && (
                      <span className="flex items-center gap-1 text-[10px] font-normal text-muted-foreground">
                        <History className="h-3 w-3" />版本
                        <select
                          value={viewVersion ?? latest?.version ?? 0}
                          onChange={(e) => setViewVersion(Number(e.target.value))}
                          className="h-6 text-[10px] border rounded-md bg-background px-1"
                          aria-label="文章版本树"
                        >
                          {run.articles.map((a) => (
                            <option key={a.id} value={a.version}>v{a.version}（{a.wordCount} 字）</option>
                          ))}
                        </select>
                      </span>
                    )}
                    <span className="text-[10px] font-normal text-muted-foreground">[n] = claims 账本编号</span>
                  </span>
                </CardTitle>
                {viewingHistory && (
                  <p className="text-[10px] text-amber-600 flex items-center gap-1"><History className="h-3 w-3" />正在查看历史版本 v{viewArticle?.version}（只读）——指着改与改稿始终作用于最新版 v{latest?.version}</p>
                )}
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <ScrollArea className="h-[420px] rounded-md border bg-muted/30 p-3">
                  <SectionedMdView
                    content={displayArticle.markdown}
                    onRewrite={viewingHistory ? undefined : (i, h) => { setSectionEdit({ index: i, heading: h }); setSectionFeedback("") }}
                  />
                </ScrollArea>
                {/* 指着改提示（只对最新版开放） */}
                {!viewingHistory && latest && (
                  <p className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <MousePointerClick className="h-3 w-3" />指着改：鼠标悬停任意小节 → 点「指着改」→ 填意见 → AI 只重写该节（其余不动，版本树 +1）
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* 指着改面板：选段反馈 → 单节重写（学视频线「指着改」交互） */}
          {sectionEdit && latest && !viewingHistory && (
            <Card className="border-amber-300 dark:border-amber-700">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-1.5">
                  <MousePointerClick className="h-3.5 w-3.5 text-amber-500" />
                  指着改 · 第 {sectionEdit.index + 1} 节{sectionEdit.heading ? `「${sectionEdit.heading}」` : "（开篇前言）"}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                <Textarea
                  placeholder="改稿意见（最高优先级，逐条落实），如：这段太绕，直接给结论；数据只保留两个最关键的"
                  value={sectionFeedback}
                  onChange={(e) => setSectionFeedback(e.target.value)}
                  rows={3}
                />
                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={doRewriteSection} disabled={busy === "rewrite-section"} className="bg-amber-500 hover:bg-amber-600 text-white">
                    {busy === "rewrite-section" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <MousePointerClick className="h-3.5 w-3.5 mr-1" />}
                    AI 重写本节
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setSectionEdit(null); setSectionFeedback("") }} disabled={busy === "rewrite-section"}>取消</Button>
                  <span className="text-[10px] text-muted-foreground">只动这一节，其余原文保留；改完存 v{latest.version + 1}，diff 自动喂飞轮</span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 改写结果 */}
          {rewriteOut && (
            <Card>
              <CardHeader className="pb-3"><CardTitle className="text-sm">{rewriteOut.target}（一稿多发）</CardTitle></CardHeader>
              <CardContent className="pt-0">
                <ScrollArea className="h-72 rounded-md border bg-muted/30 p-3">
                  <MdView content={rewriteOut.content} />
                </ScrollArea>
              </CardContent>
            </Card>
          )}

          {/* 视频分镜卡（含成片渲染入口：音色 + 画幅 + TTS，沙箱拦截自动静音降级） */}
          {sbShow && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Clapperboard className="h-3.5 w-3.5 text-rose-500" />视频分镜 · 《{sbShow.title}》</span>
                  <span className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[9px]">{sbShow.totalSeconds}s · {sbShow.scenes.length} 分镜</Badge>
                    <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={copyStoryboard}><Copy className="h-3 w-3 mr-1" />复制脚本</Button>
                  </span>
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">钩子：{sbShow.hook}｜BGM：{sbShow.bgm}</p>
              </CardHeader>
              <CardContent className="pt-0">
                <ScrollArea className="max-h-80 pr-2">
                  <div className="space-y-2">
                    {sbShow.scenes.map((s) => (
                      <div key={s.id} className="rounded-lg border px-3 py-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-rose-500 text-[9px] px-1.5">#{s.id}</Badge>
                          <Badge variant="outline" className="text-[9px]">{s.seconds}s</Badge>
                          {s.subtitle && <span className="text-xs font-bold">「{s.subtitle}」</span>}
                        </div>
                        <p className="text-[11px] leading-snug"><span className="text-muted-foreground">口播：</span>{s.narration}</p>
                        {s.visual && <p className="text-[10px] text-muted-foreground leading-snug"><span className="text-muted-foreground/70">画面：</span>{s.visual}</p>}
                      </div>
                    ))}
                    {sbShow.caption && (
                      <div className="rounded-lg border border-rose-200 bg-rose-50/50 dark:bg-rose-950/20 px-3 py-2">
                        <p className="text-[10px] text-muted-foreground mb-0.5">发布文案</p>
                        <p className="text-[11px] leading-snug">{sbShow.caption}</p>
                      </div>
                    )}
                  </div>
                </ScrollArea>
                {/* 成片渲染控制条（三通道：motion / art / Agnes AI） */}
                <div className="mt-3 pt-3 border-t space-y-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-[10px] text-muted-foreground shrink-0">通道：</span>
                    {([
                      { id: "motion", label: "商业片", title: "品牌化场景卡，本地确定性渲染" },
                      { id: "art", label: "艺术动画", title: "huashu-art-motion 引擎：8 语法 × 8 色板 Canvas 逐帧" },
                      { id: "agnes", label: "AI 模型", title: "agnes-video（720P · 4-12s，需设置中心配置账号池）" },
                      { id: "hybrid", label: "混合", title: "P1 混合通道：数据/字排→代码动画，实景/情绪→AI 模型 5~10s 插播，成本 ≈ 纯模型 1/3" },
                    ] as const).map((c) => (
                      <button
                        key={c.id}
                        title={c.title}
                        onClick={() => {
                          setVideoChannel(c.id === "agnes" ? "agnes" : c.id === "hybrid" ? "hybrid" : "local")
                          setVideoStyle(c.id === "art" ? "art" : "motion")
                        }}
                        className={`text-[10px] border rounded-full px-2 py-0.5 transition-colors ${
                          videoChannel === "agnes"
                            ? c.id === "agnes"
                            : videoChannel === "hybrid"
                              ? c.id === "hybrid"
                              : c.id !== "agnes" && c.id !== "hybrid" && videoStyle === c.id
                            ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30 text-rose-600 font-semibold"
                            : "hover:border-rose-300 text-muted-foreground"
                        }`}
                      >
                        {c.label}
                      </button>
                    ))}
                    <Mic className="h-3.5 w-3.5 text-muted-foreground ml-1" />
                    <select
                      value={voiceChoice}
                      onChange={(e) => setVoiceChoice(e.target.value)}
                      className="h-7 text-[11px] border rounded-md bg-background px-2 max-w-[140px]"
                      aria-label="口播音色"
                    >
                      {TTS_VOICES.map((v) => (
                        <option key={v.id} value={v.id}>{v.label}</option>
                      ))}
                    </select>
                    <div className="flex items-center gap-1">
                      {(["9:16", "16:9"] as const).map((a) => (
                        <button
                          key={a}
                          onClick={() => setAspectChoice(a)}
                          className={`text-[10px] border rounded-full px-2 py-0.5 transition-colors ${aspectChoice === a ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30 text-rose-600 font-semibold" : "hover:border-rose-300 text-muted-foreground"}`}
                        >
                          {a === "9:16" ? "竖屏 9:16" : "横屏 16:9"}
                        </button>
                      ))}
                    </div>
                    <Button size="sm" className="h-7 text-[11px] bg-rose-500 hover:bg-rose-600 text-white" onClick={() => doRenderVideo()} disabled={busy === "render-video"}>
                      {busy === "render-video" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Video className="h-3 w-3 mr-1" />}渲染成片 MP4
                    </Button>
                  </div>
                  <p className="text-[10px] text-muted-foreground">
                    {videoChannel === "agnes"
                      ? "Agnes AI 视频模型：提交 → 轮询 → 下载 → 混音（每账号 1 任务/分钟；失败自动本地兜底）"
                      : videoChannel === "hybrid"
                        ? "混合通道：数据/字排分镜走代码动画（确定零错字），实景/情绪分镜走 AI 模型 5~10s 插播，单镜失败自动回落代码动画"
                        : videoStyle === "art"
                          ? "艺术动画：LLM 把分镜转 clip spec（8 语法×8 色板）→ Canvas 逐帧渲染（Playwright+ffmpeg，风格化强）"
                          : "商业片：分镜 → 场景卡 + TTS 口播 → ffmpeg 合成 MP4（本地渲染；TTS 不可达自动静音降级，字幕已烧录）"}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 视频成片卡：渲染进度 / 播放器 / 下载 / 音频模式留痕 */}
          {videoAsset && videoMeta && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-rose-500" />视频成片</span>
                  {videoMeta.stage === "done" && (
                    <Badge variant="outline" className="text-[9px]">
                      {videoMeta.seconds}s · {videoMeta.width}×{videoMeta.height} · {videoMeta.sizeBytes ? `${(videoMeta.sizeBytes / 1024 / 1024).toFixed(1)}MB` : ""}
                    </Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {videoMeta.stage !== "done" && videoMeta.stage !== "error" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin text-rose-500" />{VIDEO_STAGE_LABELS[videoMeta.stage] ?? videoMeta.stage}（{videoMeta.sceneDone}/{videoMeta.sceneTotal} 分镜）</span>
                      <span className="font-semibold">{videoMeta.percent}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${videoMeta.percent}%` }} />
                    </div>
                    <p className="text-[10px] text-muted-foreground">{videoMeta.aiNote ?? videoMeta.ttsNote ?? "正在渲染…"}</p>
                  </div>
                )}
                {videoMeta.stage === "error" && (
                  <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 px-3 py-2">
                    <p className="text-[11px] text-red-600">渲染失败：{videoMeta.error}</p>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] mt-1" onClick={() => doRenderVideo()} disabled={busy === "render-video"}>重试渲染</Button>
                  </div>
                )}
                {videoMeta.stage === "done" && videoAsset.path && (
                  <>
                    <video key={videoAsset.id} controls preload="metadata" src={videoAsset.path} className="w-full rounded-lg border bg-black max-h-[480px]" />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge variant={videoMeta.audioMode === "tts" ? "default" : "secondary"} className={videoMeta.audioMode === "tts" ? "bg-emerald-600" : videoMeta.audioMode === "partial" ? "bg-amber-500" : ""}>
                        {videoMeta.audioMode === "tts"
                          ? `${TTS_VOICES.find((v) => v.id === videoMeta.voice)?.label ?? videoMeta.voice} 口播`
                          : videoMeta.audioMode === "partial"
                            ? "部分口播（其余静音）"
                            : "静音降级（字幕可读）"}
                      </Badge>
                      <Badge variant="outline" className="text-[9px]">{videoMeta.aspect} · {videoMeta.sceneTotal} 分镜</Badge>
                      <Badge variant="outline" className="text-[9px]">{videoMeta.channel === "agnes" ? "Agnes AI 模型" : videoMeta.channel === "hybrid" ? `混合（${videoMeta.codeScenes ?? 0}code+${videoMeta.modelScenes ?? 0}model）` : videoMeta.style === "art" ? "艺术动画" : "商业片"}</Badge>
                      <a href={videoAsset.path} download className="text-[10px] text-amber-600 hover:underline flex items-center gap-0.5">
                        <Download className="h-3 w-3" />下载 MP4
                      </a>
                      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => doRenderVideo()} disabled={busy === "render-video"}>
                        {busy === "render-video" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}重新渲染
                      </Button>
                    </div>
                    {videoMeta.audioMode !== "tts" && videoMeta.ttsNote && (
                      <p className="text-[10px] text-muted-foreground">{videoMeta.ttsNote}</p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {/* 多平台发布中心：5 平台导出 + 18 主题即时预览 + 一键复制 */}
          {latest && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center justify-between flex-wrap gap-1">
                  <span className="flex items-center gap-1.5"><Send className="h-3.5 w-3.5 text-amber-500" />多平台发布中心</span>
                  {exportData && <Badge variant="outline" className="text-[9px]">{exportData.label} · {exportData.content.length.toLocaleString()} 字符</Badge>}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-3">
                {/* 平台 tabs */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  {([
                    { id: "wechat", label: "公众号", dot: "bg-emerald-500" },
                    { id: "markdown", label: "Markdown", dot: "bg-slate-400" },
                    { id: "zhihu", label: "知乎", dot: "bg-blue-500" },
                    { id: "xiaohongshu", label: "小红书", dot: "bg-rose-500" },
                    { id: "toutiao", label: "头条号", dot: "bg-red-600" },
                  ] as const).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setExportTab(p.id)
                        void doExport(p.id, p.id === "wechat" ? (exportTheme || run.theme) : undefined)
                      }}
                      className={`flex items-center gap-1.5 text-[11px] border rounded-full px-2.5 py-1 transition-colors ${exportTab === p.id ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-600 font-semibold" : "hover:border-amber-300 text-muted-foreground"}`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${p.dot}`} />
                      {p.label}
                    </button>
                  ))}
                  <div className="flex-1" />
                  {exportBusy && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />}
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={copyExport} disabled={!exportData?.content || exportBusy}>
                    <Copy className="h-3 w-3 mr-1" />复制{exportData ? exportData.label : ""}格式
                  </Button>
                </div>

                {/* 主题画廊（仅公众号 tab；切换即时预览不落库，「应用」才持久化重排） */}
                {exportTab === "wechat" && (
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Palette className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">排版主题（选中即预览）：</span>
                      <span className="text-[10px] font-medium text-amber-600">{exportTheme || run.theme}</span>
                      {exportTheme && exportTheme !== run.theme && (
                        <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={doRetheme} disabled={busy === "retheme"}>
                          {busy === "retheme" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}应用并保存为主题
                        </Button>
                      )}
                    </div>
                    <div className="rounded-lg border bg-muted/30 p-2 max-h-44 overflow-y-auto">
                      <div className="grid grid-cols-3 sm:grid-cols-4 xl:grid-cols-6 gap-1.5">
                        {themes.map((t) => (
                          <button
                            key={t.id}
                            title={t.description}
                            onClick={() => void doExport("wechat", t.id)}
                            className={`text-left text-[10px] border rounded-md px-2 py-1.5 transition-colors truncate ${(exportTheme || run.theme) === t.id ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-600 font-semibold" : run.theme === t.id ? "border-emerald-300 text-emerald-600" : "hover:border-amber-300"}`}
                          >
                            <span className="text-muted-foreground">{t.category} · </span>
                            {t.id}
                          </button>
                        ))}
                      </div>
                      <p className="text-[9px] text-muted-foreground mt-1.5">18 主题移植自 wewrite（MIT）：即时预览不入库，点「应用并保存为主题」才重排成稿</p>
                    </div>
                  </div>
                )}

                {/* 预览区：html → iframe；markdown/text → 等宽文本 */}
                {exportData && exportData.kind === "html" && (
                  <div className="rounded-lg border bg-muted/40 overflow-hidden">
                    <iframe title="platform-preview" srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{margin:0;padding:8px;background:#e8e8e8;}</style></head><body>${exportData.content}</body></html>`} className="w-full h-[420px] bg-transparent" />
                  </div>
                )}
                {exportData && exportData.kind !== "html" && (
                  <ScrollArea className="h-[420px] rounded-lg border bg-muted/30">
                    <pre className="text-[11px] leading-relaxed whitespace-pre-wrap break-words p-3 font-mono">{exportData.content}</pre>
                  </ScrollArea>
                )}
                {!exportData && <div className="h-[220px] rounded-lg border bg-muted/30 flex items-center justify-center text-xs text-muted-foreground">选择平台后在此预览</div>}

                {/* 平台提示 + 小红书超长警告 */}
                {exportData?.note && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-400">⚠ {exportData.note}</div>
                )}
                {exportData && <p className="text-[10px] text-muted-foreground">{exportData.instruction}</p>}

                {publishOut && (
                  <div className={`rounded-lg border px-3 py-2 space-y-1 ${publishOut.level === 1 ? "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20" : "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20"}`}>
                    <div className="flex items-center gap-1.5">
                      <Badge className={publishOut.level === 1 ? "bg-emerald-600" : "bg-amber-500"}>Level {publishOut.level}</Badge>
                      <span className="text-xs font-semibold">{publishOut.levelName}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground">{publishOut.reason}</p>
                    <p className="text-[11px]">{publishOut.instruction}</p>
                  </div>
                )}
                {run.publishes.length > 0 && (
                  <div className="space-y-1">
                    {run.publishes.map((p) => (
                      <div key={p.id} className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                        <Badge variant="secondary" className="text-[8px] px-1 py-0">L{p.level}</Badge>
                        {p.platform} · {p.levelName} · {p.htmlLength} 字符 · {new Date(p.createdAt).toLocaleString("zh-CN")}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
          {/* 封面（手动可重试：生图降级后配好自定义端点再点「重新生成」） */}
          {(run.status === "done" || covers.length > 0) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5"><ImageIcon className="h-3.5 w-3.5" />封面</span>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={doCover} disabled={busy === "cover"}>
                    {busy === "cover" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RefreshCw className="h-3 w-3 mr-1" />}
                    {cover?.path ? "重新生成" : "生成封面"}
                  </Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                {cover?.path ? (
                  <img src={cover.path} alt="封面" className="rounded-md w-full border" />
                ) : (
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    生图降级：{cover?.error?.slice(0, 80) || "未生成"}（不阻断出稿；可在设置中心配置自定义生图端点后点「重新生成」）
                  </p>
                )}
                {covers.length > 1 && <p className="text-[9px] text-muted-foreground mt-1">共尝试 {covers.length} 次（Asset 留痕）</p>}
              </CardContent>
            </Card>
          )}

      </div>

      {/* 为什么这样写（P1 信息重排：证据链折叠抽屉，与可溯源卖点对齐） */}
      <Collapsible open={whyOpenValue} onOpenChange={(v) => setWhyOpen(v)}>
        <CollapsibleTrigger asChild>
          <button className="w-full rounded-xl border px-4 py-3 flex items-center gap-2 hover:bg-muted/40 transition-colors text-left">
            <HelpCircle className="h-4 w-4 text-amber-500 shrink-0" />
            <span className="text-sm font-semibold">为什么这样写</span>
            <span className="text-[10px] text-muted-foreground">任务书 · 大纲 · 断言核验 · claims 账本 · 审稿 · 飞轮</span>
            <span className="flex-1" />
            <Badge variant="outline" className="text-[9px]">{run.claims.filter((c) => c.idx > 0).length} claims</Badge>
            <Badge variant="outline" className="text-[9px]">{run.reviews.length} 审稿</Badge>
            <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${whyOpenValue ? "rotate-180" : ""}`} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 mt-3">
          {/* brief */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">文章任务书（brief）</CardTitle></CardHeader>
            <CardContent className="pt-0">
              {(() => {
                let brief: Record<string, string> = {}
                try { brief = JSON.parse(run.artifacts).brief ?? {} } catch { /* ignore */ }
                if (!brief.coreJudgment) return <p className="text-xs text-muted-foreground">未生成</p>
                const rows: [string, string][] = [["读者", brief.targetReader], ["问题", brief.realProblem], ["判断", brief.coreJudgment], ["反方", brief.counterView], ["边界", brief.boundary]]
                return (
                  <div className="space-y-1.5">
                    {rows.filter(([, v]) => v).map(([k, v]) => (
                      <div key={k} className="text-[11px] leading-snug"><span className="text-muted-foreground font-medium">{k}：</span><span>{v}</span></div>
                    ))}
                  </div>
                )
              })()}
            </CardContent>
          </Card>

          {/* 大纲（P0 大纲先行产物） */}
          {(() => {
            let outline: { title: string; sections: { heading: string; point: string; evidence: number[]; illustration: string }[] } | null = null
            try { outline = JSON.parse(run.artifacts).outline ?? null } catch { /* ignore */ }
            if (!outline) return null
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>大纲（{outline.sections.length} 节）</span>
                    <Badge variant="outline" className="text-[9px]">先规划后写作</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-1.5">
                    {outline.sections.map((s, i) => (
                      <div key={i} className="rounded-md border px-2 py-1.5 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant="outline" className="text-[9px] px-1 py-0">{i + 1}</Badge>
                          <span className="text-[11px] font-semibold">{s.heading}</span>
                          {s.evidence?.length > 0 && (
                            <Badge variant="outline" className="text-[8px] px-1 py-0 border-amber-400 text-amber-600 dark:text-amber-400">
                              证据 {s.evidence.join(",")}
                            </Badge>
                          )}
                          {s.illustration && <Badge variant="outline" className="text-[8px] px-1 py-0">配图位</Badge>}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{s.point}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })()}

          {/* 原子断言核验（P0 事实层产物） */}
          {(() => {
            let assertions: { total: number; verified: number; unsupported: number; unsupportedRate: number; threshold: number; gateBlocked: boolean; items?: { text: string; verified: boolean; sourceUrl: string; sourceSite: string }[] } | null = null
            try { assertions = JSON.parse(run.artifacts).assertions ?? null } catch { /* ignore */ }
            if (!assertions) return null
            const pct = Math.round((assertions.unsupportedRate ?? 0) * 100)
            return (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>原子断言核验</span>
                    <Badge variant={assertions.gateBlocked ? "destructive" : "default"} className={`text-[9px] ${assertions.gateBlocked ? "" : "bg-emerald-600"}`}>
                      {assertions.gateBlocked ? "门禁拦截" : "门禁通过"}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 space-y-1.5">
                  <div className="flex items-center gap-2 text-[11px]">
                    <span className="text-muted-foreground">无据率</span>
                    <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div className={`h-full rounded-full ${pct <= Math.round((assertions.threshold ?? 0.3) * 100) ? "bg-emerald-500" : "bg-red-400"}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                    <span className={`font-semibold ${assertions.gateBlocked ? "text-red-500" : "text-emerald-600"}`}>{pct}%</span>
                    <span className="text-[9px] text-muted-foreground">阈值 {Math.round((assertions.threshold ?? 0.3) * 100)}%</span>
                  </div>
                  {(assertions.items ?? []).slice(0, 8).map((x, i) => (
                    <div key={i} className="flex items-start gap-1.5">
                      {x.verified ? <CheckCircle2 className="h-3 w-3 text-emerald-600 shrink-0 mt-0.5" /> : <XCircle className="h-3 w-3 text-red-400 shrink-0 mt-0.5" />}
                      <p className="text-[10px] leading-snug line-clamp-1 flex-1">{x.text}</p>
                      {x.verified && x.sourceUrl && (
                        <a href={x.sourceUrl} target="_blank" rel="noreferrer" className="text-[9px] text-muted-foreground hover:text-amber-600 shrink-0 max-w-[70px] truncate">{x.sourceSite}</a>
                      )}
                    </div>
                  ))}
                  {(assertions.items ?? []).length > 8 && (
                    <p className="text-[9px] text-muted-foreground">…共 {assertions.total} 条（{assertions.verified} 有据 / {assertions.unsupported} 无据）</p>
                  )}
                </CardContent>
              </Card>
            )
          })()}

          {/* claims 账本 */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">claims 来源账本（{run.claims.filter((c) => c.idx > 0).length}）</CardTitle></CardHeader>
            <CardContent className="pt-0">
              <ScrollArea className="max-h-64">
                <div className="space-y-1.5 pr-2">
                  {run.claims.filter((c) => c.idx > 0).map((c) => (
                    <div key={c.id} className="rounded-md border px-2 py-1.5 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[9px] px-1 py-0 border-amber-400 text-amber-600 dark:text-amber-400">[{c.idx}]</Badge>
                        <Badge variant="outline" className="text-[9px] px-1 py-0">{c.claimType}</Badge>
                        {c.verified === true && <Badge className="bg-emerald-600 text-[9px] px-1 py-0">已核实</Badge>}
                        {c.verified === false && <Badge variant="destructive" className="text-[9px] px-1 py-0">无来源</Badge>}
                        {c.verified === null && <Badge variant="secondary" className="text-[9px] px-1 py-0">非事实</Badge>}
                      </div>
                      <p className="text-[10px] leading-snug line-clamp-2">{c.text}</p>
                      {c.verified && c.sourceUrl && (
                        <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="text-[10px] text-muted-foreground hover:text-amber-600 flex items-center gap-0.5 truncate">
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />{c.sourceSite} · {c.sourceDate.slice(0, 10)}
                        </a>
                      )}
                    </div>
                  ))}
                  {run.claims.filter((c) => c.idx > 0).length === 0 && <p className="text-xs text-muted-foreground py-3 text-center">无</p>}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          {/* 审稿 */}
          {review && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center justify-between">
                  <span>五维审稿</span>
                  <span className={`text-sm font-bold ${review.average >= 7.5 ? "text-emerald-600" : "text-amber-600"}`}>{review.average}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 space-y-2">
                {(() => {
                  let scores: Record<string, number> = {}
                  let comments: { dim: string; comment: string }[] = []
                  try { scores = JSON.parse(review.scoresJson); comments = JSON.parse(review.commentsJson) } catch { /* ignore */ }
                  return (
                    <>
                      <div className="space-y-1">
                        {Object.entries(scores).map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2">
                            <span className="text-[10px] text-muted-foreground w-8 shrink-0">{DIM_LABELS[k] ?? k}</span>
                            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${v >= 8 ? "bg-emerald-500" : v >= 6 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${v * 10}%` }} />
                            </div>
                            <span className="text-[10px] w-6 text-right shrink-0">{v}</span>
                          </div>
                        ))}
                      </div>
                      {review.revised && <Badge variant="secondary" className="text-[9px]">触发修订一轮</Badge>}
                      {comments.slice(0, 3).map((c, i) => (
                        <p key={i} className="text-[10px] text-muted-foreground leading-snug"><span className="font-medium">{c.dim}：</span>{c.comment}</p>
                      ))}
                    </>
                  )
                })()}
              </CardContent>
            </Card>
          )}

        </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  )
}