"use client"

// ============================================================
// video-panel —— 视频线工作台 v2（Phase 6 四件套）
// ① 导演三方向提案（学 huashu-motion director §4：A·Fit /
//    B·Amplify / C·Unexpected，palette 色带预览，选定注入分镜）
// ② 指着改编辑器（学 huashu-motion studio：时间轴点击 / 分镜卡
//    「改这镜」→ 意见浮层 → 单场景局部重渲染 → 版本树）
// ③ BGM 本地合成（三预设开关，作曲配乐务实版）
// ④ 三通道渲染（motion 商业片 / art 艺术动画 / Agnes AI 模型）
// 选稿 → 三方向 → 分镜 → 通道+音色+画幅+BGM → 渲染进度 → 成片播放/下载
// ============================================================

import { useCallback, useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { TTS_VOICES } from "@/lib/runtime/skills/radar-rewrite"
import { Clapperboard, Loader2, Video, Download, RefreshCw, FileText, Play, Mic, Film, Palette, Sparkles, Wand2, Compass, MessageSquare, Music4, History, Star, Blend } from "lucide-react"

interface RunItem { id: string; ideaTitle: string; status: string; mode: string; createdAt: string; _count?: { articles: number } }
interface StoryboardScene { id: number; seconds: number; visual: string; narration: string; subtitle: string; broll: string; render?: "code" | "model" }
interface DirectionBrief { key: string; kind: string; name: string; language: string; accent: string; base: string; feel: string }
interface StoryboardData { title: string; hook: string; totalSeconds: number; scenes: StoryboardScene[]; bgm: string; caption: string; direction?: DirectionBrief }
interface DirectionCard { key: string; kind: "fit" | "amplify" | "unexpected"; name: string; language: string; logline: string; why: string; feel: string; palette: { accent: string; base: string; note: string }; depth: boolean; recommended: boolean }
interface SceneRevision { sceneId: number; feedback: string; reason: string; at: string }

interface VideoMeta {
  stage: "queued" | "tts" | "spec" | "frames" | "submit" | "poll" | "download" | "encode" | "concat" | "revise" | "done" | "error"
  percent: number
  sceneDone: number
  sceneTotal: number
  audioMode: "pending" | "tts" | "partial" | "muted"
  ttsNote?: string
  aiNote?: string
  style?: "motion" | "art"
  channel?: "local" | "agnes" | "hybrid"
  /** 混合通道统计（P1）：代码动画 / AI 模型镜头数 */
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
  version?: number
  durations?: number[]
  revisions?: SceneRevision[]
  bgm?: "none" | "uplift" | "tech" | "calm"
  bgmNote?: string
}

const STAGE_LABELS: Record<string, string> = {
  queued: "排队中", tts: "TTS 口播合成", spec: "分镜转动画 spec（LLM）",
  frames: "逐帧渲染", submit: "提交 AI 模型", poll: "AI 生成中", download: "下载成片",
  encode: "分段编码", concat: "合成 MP4", revise: "剪辑师修订分镜（LLM）", done: "完成", error: "失败",
}

const KIND_META: Record<string, { label: string; tone: string }> = {
  fit: { label: "A · Fit 贴合", tone: "bg-sky-500" },
  amplify: { label: "B · Amplify 放大", tone: "bg-rose-500" },
  unexpected: { label: "C · Unexpected 意外", tone: "bg-violet-500" },
}

const BGM_OPTIONS: { id: string; label: string }[] = [
  { id: "none", label: "无配乐" },
  { id: "uplift", label: "明快琶音" },
  { id: "tech", label: "科技脉冲" },
  { id: "calm", label: "沉静长音" },
]

type VideoStyle = "motion" | "art"
type VideoChannel = "local" | "agnes" | "auto" | "hybrid"

const STYLE_META: Record<VideoStyle, { label: string; desc: string; icon: typeof Film }> = {
  motion: { label: "商业片 · motion", desc: "品牌化场景卡 + 方向调色板 + TTS 口播（本地确定性渲染，秒级出片）", icon: Film },
  art: { label: "艺术动画 · art", desc: "huashu-art-motion 引擎：8 语法 × 8 色板 Canvas 逐帧（Playwright + ffmpeg）", icon: Palette },
}

export function VideoPanel() {
  const { toast } = useToast()
  const [runs, setRuns] = useState<RunItem[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [storyboard, setStoryboard] = useState<StoryboardData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // 源模式：article（从图文成稿，推荐）/ direct（选题直出，P0 解耦）
  const [srcMode, setSrcMode] = useState<"article" | "direct">("article")
  // 直出模式状态
  const [dTopic, setDTopic] = useState("")
  const [dAngle, setDAngle] = useState("")
  const [dPlatform, setDPlatform] = useState("douyin")
  const [dRunId, setDRunId] = useState<string | null>(null)
  const [dRun, setDRun] = useState<{ id: string; status: string; steps: string; artifacts: string; error: string; mode: string } | null>(null)
  // 渲染参数
  const [style, setStyle] = useState<VideoStyle>("motion")
  const [channel, setChannel] = useState<VideoChannel>("local")
  const [voice, setVoice] = useState("xiaochen")
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16")
  const [bgm, setBgm] = useState("none")
  // 三方向提案
  const [directions, setDirections] = useState<DirectionCard[] | null>(null)
  const [selDir, setSelDir] = useState<DirectionCard | null>(null)
  // 视频产物（版本树）
  const [videoAssets, setVideoAssets] = useState<{ id: string; path: string; provider: string; meta: string; createdAt: string }[]>([])
  const [activeIdx, setActiveIdx] = useState(-1)
  // 指着改
  const [reviseSceneId, setReviseSceneId] = useState<number | null>(null)
  const [feedback, setFeedback] = useState("")
  const videoRef = useRef<HTMLVideoElement>(null)
  // 设置（agnes 可用性 + 默认通道）
  const [agnesReady, setAgnesReady] = useState(false)
  const [settingsChannel, setSettingsChannel] = useState<VideoChannel>("local")

  const refresh = useCallback(async () => {
    const [r, s] = await Promise.all([
      fetch("/api/runs").then((x) => x.json()),
      fetch("/api/settings").then((x) => x.json()),
    ])
    const doneRuns = (r.runs ?? []).filter((x: RunItem) => (x._count?.articles ?? 0) > 0 || x.status === "done")
    setRuns(doneRuns)
    const settings = s.settings as { agnes: { enabled: boolean; accounts: { enabled: boolean; apiKey: string }[] }; video: { channel: VideoChannel } }
    const ready = settings.agnes.enabled && settings.agnes.accounts.some((a) => a.enabled && a.apiKey)
    setAgnesReady(ready)
    setSettingsChannel(settings.video.channel ?? "local")
    if (!runId && doneRuns.length > 0) setRunId(doneRuns[0].id)
  }, [runId])

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(t)
  }, [refresh])

  // 选中 run → 拉详情（storyboard / 视频产物版本树）
  const loadRun = useCallback(async (id: string) => {
    if (!id) return
    const json = await fetch(`/api/runs/${id}`).then((x) => x.json())
    const run = json.run as { assets: { id: string; kind: string; role: string; path: string; provider: string; meta: string; createdAt: string }[] } | null
    if (!run) return
    const videos = run.assets.filter((a) => a.role === "video-final")
    setVideoAssets(videos)
    setActiveIdx(videos.length - 1)
    // 已有分镜（从最近视频 meta 里恢复）
    const withSb = [...videos].reverse().find((v) => {
      try {
        return Boolean((JSON.parse(v.meta) as VideoMeta).storyboard)
      } catch {
        return false
      }
    })
    if (withSb) {
      try {
        setStoryboard((JSON.parse(withSb.meta) as VideoMeta).storyboard ?? null)
      } catch {
        setStoryboard(null)
      }
    } else {
      setStoryboard(null)
    }
  }, [])

  useEffect(() => {
    if (runId) void loadRun(runId)
  }, [runId, loadRun])

  // 渲染/修订进行中 → 轮询
  const activeVideo = activeIdx >= 0 ? videoAssets[activeIdx] : videoAssets[videoAssets.length - 1]
  let activeMeta: VideoMeta | null = null
  try {
    activeMeta = activeVideo ? (JSON.parse(activeVideo.meta) as VideoMeta) : null
  } catch {
    activeMeta = null
  }
  const rendering = activeMeta ? ["queued", "tts", "spec", "frames", "submit", "poll", "download", "encode", "concat", "revise"].includes(activeMeta.stage) : false
  useEffect(() => {
    if (!rendering || !runId) return
    const t = setInterval(() => void loadRun(runId), 2000)
    return () => clearInterval(t)
  }, [rendering, runId, loadRun])

  // 版本列表（供 chips 切换）
  const versions = videoAssets.map((v, i) => {
    let m: VideoMeta | null = null
    try {
      m = JSON.parse(v.meta) as VideoMeta
    } catch {
      /* ignore */
    }
    return { idx: i, id: v.id, version: m?.version ?? i + 1, meta: m }
  })

  // ---------- 导演三方向 ----------
  const doDirections = async () => {
    if (!runId) return
    setBusy("directions")
    setDirections(null)
    setSelDir(null)
    try {
      const res = await fetch(`/api/runs/${runId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "storyboard-directions", platform: "douyin" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDirections(json.directions)
      const rec = (json.directions as DirectionCard[]).find((d) => d.recommended)
      setSelDir(rec ?? json.directions[0] ?? null)
      toast({ title: "导演三方向已提案", description: "选一个方向，分镜将贯彻它的语言与节奏" })
    } catch (e) {
      toast({ title: "三方向提案失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const doStoryboard = async () => {
    if (!runId) return
    setBusy("storyboard")
    try {
      const res = await fetch(`/api/runs/${runId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storyboard", platform: "douyin",
          ...(selDir ? { direction: { key: selDir.key, kind: selDir.kind, name: selDir.name, language: selDir.language, accent: selDir.palette.accent, base: selDir.palette.base, feel: selDir.feel } } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setStoryboard(json.storyboard)
      toast({ title: "视频分镜已生成", description: `${json.storyboard.scenes.length} 个分镜 · ${json.storyboard.totalSeconds}s${selDir ? ` · 方向「${selDir.name}」` : ""}` })
    } catch (e) {
      toast({ title: "分镜生成失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const doRender = async () => {
    if (!runId || !storyboard) {
      toast({ title: "请先生成视频分镜", variant: "destructive" })
      return
    }
    setBusy("render")
    try {
      const res = await fetch(`/api/runs/${runId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "render-video", storyboard, voice, aspect, style, channel, bgm }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "成片渲染已开始", description: json.message })
      await loadRun(runId)
    } catch (e) {
      toast({ title: "渲染启动失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const copyStoryboard = async () => {
    if (!storyboard) return
    const lines = storyboard.scenes.map((s) => `【分镜 ${s.id} · ${s.seconds}s】\n字幕：${s.subtitle}\n口播：${s.narration}\n画面：${s.visual}\n素材：${s.broll}`)
    await navigator.clipboard.writeText([`《${storyboard.title}》总时长 ${storyboard.totalSeconds}s`, `钩子：${storyboard.hook}`, ...(storyboard.direction ? [`方向：${storyboard.direction.key} · ${storyboard.direction.name}`] : []), "", ...lines, "", `BGM：${storyboard.bgm}`, `发布文案：${storyboard.caption}`].join("\n"))
    toast({ title: "分镜脚本已复制" })
  }

  // ---------- 指着改 ----------
  /** 按播放秒数定位分镜（durations 为当前版本实际分段时长） */
  const locateSceneByTime = (t: number) => {
    if (!activeMeta?.storyboard) return
    const durs = activeMeta.durations ?? activeMeta.storyboard.scenes.map((s) => s.seconds)
    let acc = 0
    for (let i = 0; i < durs.length; i++) {
      acc += durs[i]
      if (t < acc) {
        setReviseSceneId(activeMeta.storyboard.scenes[i].id)
        setFeedback("")
        return
      }
    }
    setReviseSceneId(activeMeta.storyboard.scenes[durs.length - 1]?.id ?? null)
    setFeedback("")
  }

  const onTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!activeMeta?.storyboard) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    locateSceneByTime(pct * (activeMeta.seconds ?? activeMeta.storyboard.totalSeconds))
  }

  const doRevise = async () => {
    if (!runId || !storyboard || reviseSceneId == null || !feedback.trim()) return
    setBusy("revise")
    try {
      const res = await fetch(`/api/runs/${runId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "revise-scene", sceneId: reviseSceneId, feedback: feedback.trim(), storyboard,
          voice, aspect, style, bgm,
          ...(activeVideo ? { baseAssetId: activeVideo.id } : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "指着改已受理", description: json.message })
      setReviseSceneId(null)
      setFeedback("")
      await loadRun(runId)
    } catch (e) {
      toast({ title: "指着改提交失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  // ---------- 选题直出（P0：视频线解耦图文线） ----------
  const startDirect = async () => {
    if (!dTopic.trim()) return
    setBusy("direct-start")
    setDirections(null)
    setSelDir(null)
    setStoryboard(null)
    try {
      const res = await fetch("/api/video-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic: dTopic, angle: dAngle, platform: dPlatform }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setDRunId(json.id)
      setDRun(null)
      toast({ title: "选题直出已启动", description: "检索摘要 → 导演三方向，约半分钟" })
    } catch (e) {
      toast({ title: "启动失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  // 直出 run 轮询：queued/running → blocked（三方向就绪等选择）
  useEffect(() => {
    if (!dRunId) return
    let stop = false
    const poll = async () => {
      try {
        const json = await fetch(`/api/runs/${dRunId}`).then((x) => x.json())
        const run = json.run as { id: string; status: string; steps: string; artifacts: string; error: string; mode: string } | null
        if (stop || !run) return
        setDRun(run)
        if (run.status === "blocked") {
          // 三方向就绪 → 填入共用方向卡 UI
          try {
            const arts = JSON.parse(run.artifacts || "{}") as { directions?: DirectionCard[] }
            if (arts.directions?.length) {
              setDirections(arts.directions)
              setSelDir(arts.directions.find((d) => d.recommended) ?? arts.directions[0] ?? null)
            }
          } catch {
            /* 无方向也可直接分镜 */
          }
        }
      } catch {
        /* 网络抖动继续轮询 */
      }
    }
    void poll()
    const t = setInterval(() => {
      if (!stop) void poll()
    }, 3000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [dRunId])

  const doDirectStoryboard = async (direction: DirectionCard | null) => {
    if (!dRunId) return
    setBusy("storyboard")
    try {
      const res = await fetch("/api/video-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "storyboard",
          runId: dRunId,
          ...(direction
            ? { direction: { key: direction.key, kind: direction.kind, name: direction.name, language: direction.language, accent: direction.palette.accent, base: direction.palette.base, feel: direction.feel } }
            : {}),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setStoryboard(json.storyboard)
      setRunId(dRunId) // 渲染/指着改/版本树都挂在这个 video run 上
      await loadRun(dRunId)
      toast({ title: "直出分镜已生成", description: `${json.storyboard.scenes.length} 个分镜 · ${json.storyboard.totalSeconds}s${direction ? ` · 方向「${direction.name}」` : ""}` })
    } catch (e) {
      toast({ title: "分镜生成失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setBusy(null)
    }
  }

  const selectedRun = runs.find((r) => r.id === runId)
  const reviseScene = storyboard?.scenes.find((s) => s.id === reviseSceneId) ?? null
  // 时间线（分镜等比分段 + 渲染进度头）
  const timelineTotal = storyboard?.totalSeconds ?? 0
  const playheadPct = activeMeta && rendering && storyboard ? Math.min(100, (activeMeta.sceneDone / Math.max(1, activeMeta.sceneTotal)) * 100) : 0

  return (
    <div className="space-y-4">
      {/* 源模式切换：从图文成稿（推荐）/ 选题直出（P0 解耦） */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Clapperboard className="h-4 w-4 text-rose-500" />视频线 · 工作台</CardTitle>
          <p className="text-[11px] text-muted-foreground">两种源：图文成稿（信息密度高，推荐）或选题直出（免写文章，检索要点直出分镜）→ 三方向 → 分镜 → 三通道成片 → 指着改</p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex items-center gap-1.5">
            {(["article", "direct"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setSrcMode(m); setDirections(null); setSelDir(null); setStoryboard(null) }}
                className={`text-[11px] border rounded-full px-2.5 py-1 transition-colors ${srcMode === m ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30 text-rose-600 font-semibold" : "hover:border-rose-300 text-muted-foreground"}`}
              >
                {m === "article" ? "从图文成稿（推荐）" : "选题直出（新）"}
              </button>
            ))}
          </div>

          {srcMode === "article" && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-2">
                <select value={runId ?? ""} onChange={(e) => setRunId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="选择源稿">
                  {runs.length === 0 && <option value="">暂无可用成稿（先去图文线出稿）</option>}
                  {runs.map((r) => (
                    <option key={r.id} value={r.id}>{r.ideaTitle.slice(0, 40)}{r._count?.articles ? `（${r._count.articles} 稿）` : ""}</option>
                  ))}
                </select>
                <Button variant="outline" onClick={doDirections} disabled={!runId || busy === "directions"}>
                  {busy === "directions" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Compass className="h-4 w-4 mr-1" />}
                  导演三方向
                </Button>
                <Button variant="outline" onClick={doStoryboard} disabled={!runId || busy === "storyboard"}>
                  {busy === "storyboard" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  {storyboard ? "重新生成分镜" : "直接生成分镜"}
                </Button>
                {storyboard && (
                  <Button variant="ghost" size="sm" onClick={copyStoryboard}><FileText className="h-3.5 w-3.5 mr-1" />复制脚本</Button>
                )}
              </div>
              {selectedRun && (
                <p className="text-[10px] text-muted-foreground">
                  源稿：{selectedRun.ideaTitle} · {selectedRun._count?.articles ?? 0} 稿 · {new Date(selectedRun.createdAt).toLocaleString("zh-CN")}
                </p>
              )}
            </>
          )}

          {srcMode === "direct" && (
            <div className="space-y-2.5">
              <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_auto] gap-2">
                <input
                  value={dTopic}
                  onChange={(e) => setDTopic(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && startDirect()}
                  placeholder="视频选题，如：开源模型追赶商业模型还差什么"
                  className="h-9 rounded-md border bg-background px-3 text-xs w-full"
                />
                <select value={dPlatform} onChange={(e) => setDPlatform(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="目标平台">
                  <option value="douyin">抖音</option>
                  <option value="shipinhao">视频号</option>
                  <option value="bilibili">B 站</option>
                </select>
                <Button variant="outline" onClick={startDirect} disabled={!dTopic.trim() || busy === "direct-start" || dRunId !== null}>
                  {busy === "direct-start" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
                  检索 + 三方向
                </Button>
              </div>
              <input
                value={dAngle}
                onChange={(e) => setDAngle(e.target.value)}
                placeholder="切入角度（可选）"
                className="h-8 rounded-md border bg-background px-3 text-xs w-full"
              />
              {dRunId && (
                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
                    <Badge variant={dRun?.status === "blocked" ? "default" : dRun?.status === "error" ? "destructive" : "secondary"} className={`text-[9px] ${dRun?.status === "blocked" ? "bg-amber-500" : dRun?.status === "running" ? "animate-pulse" : ""}`}>
                      {dRun?.status === "blocked" ? "等待选方向" : dRun?.status === "running" ? "检索/提案中" : dRun?.status === "error" ? "失败" : dRun?.status ?? "排队中"}
                    </Badge>
                    {(dRun ? JSON.parse(dRun.steps || "[]") : []).map((s: { name: string; status: string; detail: string }, i: number) => (
                      <span key={i} className={s.status === "done" ? "text-emerald-600" : s.status === "running" ? "text-amber-600" : s.status === "error" ? "text-red-500" : ""}>
                        {s.name}:{s.status === "done" ? "✓" : s.status === "running" ? "…" : s.status === "error" ? "✗" : "–"}
                      </span>
                    ))}
                    {dRun?.status === "error" && <span className="text-red-500">{dRun.error?.slice(0, 80)}</span>}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setDRunId(null); setDRun(null); setDirections(null); setSelDir(null) }}>
                      换个选题
                    </Button>
                    {dRun?.status === "blocked" && (
                      <>
                        <Button size="sm" className="h-7 text-[11px] bg-rose-500 hover:bg-rose-600 text-white" onClick={() => doDirectStoryboard(selDir)} disabled={busy === "storyboard"}>
                          {busy === "storyboard" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                          {selDir ? `按方向「${selDir.name}」生成分镜` : "生成分镜"}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => doDirectStoryboard(null)} disabled={busy === "storyboard"}>
                          跳过方向直接分镜
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 导演三方向卡（学 huashu-motion：A·Fit / B·Amplify / C·Unexpected，差异在语言与材质） */}
      {directions && directions.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Compass className="h-3.5 w-3.5 text-rose-500" />导演三方向 · 选一个再分镜</span>
              <Badge variant="outline" className="text-[9px]">差异在语言与材质，不只是配色</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              {directions.map((d) => {
                const active = selDir?.key === d.key
                const km = KIND_META[d.kind] ?? KIND_META.fit
                return (
                  <button
                    key={d.key}
                    onClick={() => setSelDir(d)}
                    className={`text-left rounded-lg border p-3 space-y-2 transition-colors ${active ? "border-rose-400 bg-rose-50/50 dark:bg-rose-950/20" : "hover:border-rose-200"}`}
                  >
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Badge className={`${km.tone} text-[9px] px-1.5 text-white`}>{km.label}</Badge>
                      <span className="text-xs font-bold">{d.name}</span>
                      {d.recommended && <Badge variant="outline" className="text-[8px] gap-0.5"><Star className="h-2.5 w-2.5 fill-amber-400 text-amber-400" />导演推荐</Badge>}
                      {d.depth && <Badge variant="outline" className="text-[8px]">空间纵深</Badge>}
                    </div>
                    {/* palette 色带 */}
                    <div className="flex h-5 rounded-md overflow-hidden border">
                      <div className="flex-[2]" style={{ background: d.palette.base }} title={`base ${d.palette.base}`} />
                      <div className="flex-[3]" style={{ background: d.palette.accent }} title={`accent ${d.palette.accent}`} />
                      <div className="flex-[5] bg-muted" />
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">{d.palette.note}</p>
                    <p className="text-[11px] leading-snug">{d.logline}</p>
                    <div className="space-y-0.5 text-[10px] text-muted-foreground leading-snug">
                      <p><span className="text-foreground/70 font-medium">语言：</span>{d.language}</p>
                      <p><span className="text-foreground/70 font-medium">节奏：</span>{d.feel}</p>
                      <p><span className="text-foreground/70 font-medium">为何适合：</span>{d.why}</p>
                    </div>
                  </button>
                )
              })}
            </div>
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <Button size="sm" className="h-7 text-[11px] bg-rose-500 hover:bg-rose-600 text-white" onClick={() => (srcMode === "direct" ? doDirectStoryboard(selDir) : doStoryboard())} disabled={busy === "storyboard"}>
                {busy === "storyboard" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                按方向「{selDir?.name ?? "—"}」生成分镜
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => (srcMode === "direct" ? doDirectStoryboard(null) : (setSelDir(null), void doStoryboard()))} disabled={busy === "storyboard"}>
                跳过方向直接分镜
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 分镜可视化卡片流（每卡可「指着改」） */}
      {storyboard && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Film className="h-3.5 w-3.5 text-rose-500" />分镜 · 《{storyboard.title}》</span>
              <span className="flex items-center gap-2">
                {storyboard.direction && (
                  <Badge variant="outline" className="text-[9px] gap-1">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: storyboard.direction.accent }} />
                    方向 {storyboard.direction.key} · {storyboard.direction.name}
                  </Badge>
                )}
                <Badge variant="outline" className="text-[9px]">{storyboard.totalSeconds}s · {storyboard.scenes.length} 分镜</Badge>
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ScrollArea className="max-h-72 pr-2">
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                {storyboard.scenes.map((s) => (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border p-2.5 space-y-1.5 hover:border-rose-300 transition-colors">
                    <div className="flex items-center gap-2">
                      <Badge className="bg-rose-500 text-[9px] px-1.5">#{s.id}</Badge>
                      <Badge variant="outline" className="text-[9px]">{s.seconds}s</Badge>
                      {s.subtitle && <span className="text-xs font-bold truncate">「{s.subtitle}」</span>}
                    </div>
                    <p className="text-[11px] leading-snug line-clamp-2"><span className="text-muted-foreground">口播：</span>{s.narration}</p>
                    {s.visual && <p className="text-[10px] text-muted-foreground leading-snug line-clamp-1">画面：{s.visual}</p>}
                    <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[9px] text-rose-600 hover:text-rose-700" onClick={() => { setReviseSceneId(s.id); setFeedback("") }}>
                      <MessageSquare className="h-2.5 w-2.5 mr-0.5" />指着改这镜
                    </Button>
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* 通道与渲染控制 */}
      {storyboard && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-1.5"><Wand2 className="h-3.5 w-3.5 text-rose-500" />渲染通道 · 音色 · 画幅 · BGM</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 本地双风格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(Object.keys(STYLE_META) as VideoStyle[]).map((k) => {
                const meta = STYLE_META[k]
                const Icon = meta.icon
                const active = channel !== "agnes" && channel !== "hybrid" && style === k
                return (
                  <button
                    key={k}
                    onClick={() => { setStyle(k); setChannel("local") }}
                    className={`text-left rounded-lg border p-3 space-y-1.5 transition-colors ${active ? "border-rose-400 bg-rose-50/50 dark:bg-rose-950/20" : "hover:border-rose-200"}`}
                  >
                    <div className="flex items-center gap-1.5">
                      <Icon className="h-4 w-4 text-rose-500" />
                      <span className="text-xs font-bold">{meta.label}</span>
                      {active && <Badge className="bg-rose-500 text-[8px] px-1">本地渲染</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground leading-snug">{meta.desc}</p>
                  </button>
                )
              })}
            </div>
            {/* AI 模型通道 */}
            <button
              onClick={() => setChannel(channel === "agnes" ? "local" : "agnes")}
              className={`w-full text-left rounded-lg border p-3 space-y-1.5 transition-colors ${channel === "agnes" ? "border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/20" : "hover:border-emerald-200"}`}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <Video className="h-4 w-4 text-emerald-600" />
                <span className="text-xs font-bold">AI 视频模型 · Agnes</span>
                <Badge variant={agnesReady ? "default" : "secondary"} className={`text-[8px] ${agnesReady ? "bg-emerald-600" : ""}`}>
                  {agnesReady ? "已配置（账号池可用）" : "未配置（设置中心 → Agnes 账号池）"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">agnes-video-2.5-flash（720P · 4-12s）；每账号 1 任务/分钟，失败自动本地兜底{settingsChannel === "auto" ? "；设置中心默认 auto" : ""}</p>
            </button>
            {/* 混合通道（P1）：code 主轨 + model 插播 */}
            <button
              onClick={() => setChannel(channel === "hybrid" ? "local" : "hybrid")}
              className={`w-full text-left rounded-lg border p-3 space-y-1.5 transition-colors ${channel === "hybrid" ? "border-violet-400 bg-violet-50/50 dark:bg-violet-950/20" : "hover:border-violet-200"}`}
            >
              <div className="flex items-center gap-1.5 flex-wrap">
                <Blend className="h-4 w-4 text-violet-600" />
                <span className="text-xs font-bold">混合通道 · code 主轨 + model 插播</span>
                <Badge variant={agnesReady ? "default" : "secondary"} className={`text-[8px] ${agnesReady ? "bg-violet-600" : ""}`}>
                  {agnesReady ? `分镜已标注 ${storyboard?.scenes?.filter((s) => s.render === "model").length ?? 0} 个 model 镜头` : "Agnes 未配置 → 全代码动画"}
                </Badge>
              </div>
              <p className="text-[10px] text-muted-foreground leading-snug">按分镜 render 标注智能分发：数据/字排 → 代码动画（确定零错字），实景/情绪 → AI 模型 5~10s 插播，单镜失败自动回落代码动画，成本 ≈ 纯模型 1/3</p>
            </button>

            {/* 音色 + 画幅 + BGM + 渲染按钮 */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <Mic className="h-3.5 w-3.5 text-muted-foreground" />
              <select value={voice} onChange={(e) => setVoice(e.target.value)} className="h-7 text-[11px] border rounded-md bg-background px-2 max-w-[150px]" aria-label="口播音色">
                {TTS_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>{v.label}</option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                {(["9:16", "16:9"] as const).map((a) => (
                  <button key={a} onClick={() => setAspect(a)} className={`text-[10px] border rounded-full px-2 py-0.5 transition-colors ${aspect === a ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30 text-rose-600 font-semibold" : "hover:border-rose-300 text-muted-foreground"}`}>
                    {a === "9:16" ? "竖屏 9:16" : "横屏 16:9"}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <Music4 className="h-3.5 w-3.5 text-muted-foreground" />
                <select value={bgm} onChange={(e) => setBgm(e.target.value)} className="h-7 text-[11px] border rounded-md bg-background px-2" aria-label="BGM 配乐">
                  {BGM_OPTIONS.map((b) => (
                    <option key={b.id} value={b.id}>{b.label}</option>
                  ))}
                </select>
              </div>
              <Button size="sm" className="h-7 text-[11px] bg-rose-500 hover:bg-rose-600 text-white ml-auto" onClick={doRender} disabled={busy === "render" || rendering}>
                {busy === "render" || rendering ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                {channel === "agnes" ? "AI 通道渲染 MP4" : channel === "hybrid" ? "混合通道渲染 MP4" : style === "art" ? "艺术动画渲染 MP4" : "商业片渲染 MP4"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 成片卡（版本树 + 指着改） */}
      {activeVideo && activeMeta && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-rose-500" />视频成片{activeMeta.version ? ` · v${activeMeta.version}` : ""}</span>
              {activeMeta.stage === "done" && (
                <Badge variant="outline" className="text-[9px]">
                  {activeMeta.seconds}s · {activeMeta.width}×{activeMeta.height} · {activeMeta.sizeBytes ? `${(activeMeta.sizeBytes / 1024 / 1024).toFixed(1)}MB` : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {/* 版本树 chips */}
            {versions.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap">
                <History className="h-3 w-3 text-muted-foreground" />
                {versions.map((v) => {
                  const isRev = v.meta?.revisions && v.meta.revisions.length > 0
                  return (
                    <button
                      key={v.id}
                      onClick={() => setActiveIdx(v.idx)}
                      className={`text-[10px] border rounded-full px-2 py-0.5 transition-colors ${v.idx === activeIdx ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30 text-rose-600 font-semibold" : "hover:border-rose-300 text-muted-foreground"}`}
                      title={isRev ? `v${v.version}：指着改（${v.meta?.revisions?.at(-1)?.reason ?? ""}）` : `v${v.version}：整片渲染`}
                    >
                      v{v.version}{isRev ? " ✎" : ""}
                    </button>
                  )
                })}
              </div>
            )}
            {rendering && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin text-rose-500" />{STAGE_LABELS[activeMeta.stage] ?? activeMeta.stage}（{activeMeta.sceneDone}/{activeMeta.sceneTotal} 分镜）</span>
                  <span className="font-semibold">{activeMeta.percent}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${activeMeta.percent}%` }} />
                </div>
                {activeMeta.aiNote && <p className="text-[10px] text-muted-foreground">{activeMeta.aiNote}</p>}
                {activeMeta.bgmNote && <p className="text-[10px] text-muted-foreground">{activeMeta.bgmNote}</p>}
                {activeMeta.ttsNote && <p className="text-[10px] text-muted-foreground">{activeMeta.ttsNote}</p>}
              </div>
            )}
            {activeMeta.stage === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 px-3 py-2">
                <p className="text-[11px] text-red-600">渲染失败：{activeMeta.error}</p>
                <Button size="sm" variant="outline" className="h-6 text-[10px] mt-1" onClick={doRender} disabled={busy === "render"}>重试整片渲染</Button>
              </div>
            )}
            {activeMeta.stage === "done" && activeVideo.path && (
              <>
                <video ref={videoRef} key={activeVideo.id} controls preload="metadata" src={activeVideo.path} className="w-full rounded-lg border bg-black max-h-[420px]" />
                {/* 时间轴（学 dsh timeline：分镜等比分段；点击 → 定位分镜 → 指着改） */}
                {activeMeta.storyboard && (
                  <div>
                    <div className="flex h-6 rounded-md overflow-hidden border cursor-pointer" onClick={onTimelineClick} title="点击时间轴定位分镜，指着改那一镜">
                      {activeMeta.storyboard.scenes.map((s, i) => {
                        const d = activeMeta.durations?.[i] ?? s.seconds
                        const total = (activeMeta.durations ?? activeMeta.storyboard!.scenes.map((x) => x.seconds)).reduce((a, b) => a + b, 0) || 1
                        return (
                          <div
                            key={s.id}
                            className={`flex items-center justify-center text-[9px] text-white/90 border-r border-white/20 last:border-r-0 ${reviseSceneId === s.id ? "ring-2 ring-amber-400 ring-inset" : ""}`}
                            style={{ width: `${(d / total) * 100}%`, background: `hsl(${348 - i * 6} 70% ${38 + i * 3}%)` }}
                          >
                            #{s.id}
                          </div>
                        )
                      })}
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => { const t = videoRef.current?.currentTime ?? 0; locateSceneByTime(t) }}>
                        <MessageSquare className="h-3 w-3 mr-1" />改播放头这一镜（{Math.floor(videoRef.current?.currentTime ?? 0)}s）
                      </Button>
                      <span className="text-[10px] text-muted-foreground">也可点时间轴 / 分镜卡「指着改这镜」</span>
                    </div>
                  </div>
                )}
                {/* 指着改浮层 */}
                {reviseScene && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50/60 dark:bg-amber-950/20 p-3 space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <MessageSquare className="h-3.5 w-3.5 text-amber-600" />
                      <span className="text-xs font-bold">指着改 · 分镜 #{reviseScene.id}（{reviseScene.seconds}s）</span>
                      <span className="text-[10px] text-muted-foreground truncate">「{reviseScene.subtitle}」{reviseScene.narration.slice(0, 24)}…</span>
                      <Button size="sm" variant="ghost" className="h-5 px-1.5 text-[9px] ml-auto" onClick={() => setReviseSceneId(null)}>取消</Button>
                    </div>
                    <textarea
                      value={feedback}
                      onChange={(e) => setFeedback(e.target.value)}
                      placeholder="对这一镜说意见，例如：字幕太长改短一点 / 口播换个说法更口语 / 这镜数据过时，换成……"
                      rows={2}
                      maxLength={300}
                      className="w-full rounded-md border bg-background px-2 py-1.5 text-xs resize-none"
                    />
                    <div className="flex items-center gap-2 flex-wrap">
                      <Button size="sm" className="h-7 text-[11px] bg-amber-500 hover:bg-amber-600 text-white" onClick={doRevise} disabled={busy === "revise" || rendering || !feedback.trim()}>
                        {busy === "revise" ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Wand2 className="h-3 w-3 mr-1" />}
                        只重做这一镜 → 出新版本
                      </Button>
                      <span className="text-[10px] text-muted-foreground">{feedback.length}/300 · 其余分镜原样保留，改动入版本树</span>
                    </div>
                  </div>
                )}
                {/* 版本改动记录 */}
                {activeMeta.revisions && activeMeta.revisions.length > 0 && (
                  <div className="rounded-lg border p-2.5 space-y-1.5">
                    <p className="text-[10px] font-semibold flex items-center gap-1"><History className="h-3 w-3" />指着改历史（{activeMeta.revisions.length} 次）</p>
                    <ScrollArea className="max-h-24 pr-1">
                      <div className="space-y-1">
                        {activeMeta.revisions.map((r, i) => (
                          <p key={i} className="text-[10px] text-muted-foreground leading-snug">
                            <span className="text-foreground/70">#{r.sceneId}</span> {r.feedback.slice(0, 50)} → <span className="text-amber-600">{r.reason}</span>
                          </p>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={activeMeta.audioMode === "tts" ? "default" : "secondary"} className={activeMeta.audioMode === "tts" ? "bg-emerald-600" : activeMeta.audioMode === "partial" ? "bg-amber-500" : ""}>
                    {activeMeta.audioMode === "tts" ? `${TTS_VOICES.find((v) => v.id === activeMeta?.voice)?.label ?? activeMeta.voice} 口播` : activeMeta.audioMode === "partial" ? "部分口播" : "静音降级（字幕可读）"}
                  </Badge>
                  <Badge variant="outline" className="text-[9px]">
                    {activeMeta.channel === "agnes" ? "Agnes AI 模型" : activeMeta.channel === "hybrid" ? `混合（${activeMeta.codeScenes ?? 0}code+${activeMeta.modelScenes ?? 0}model）` : activeMeta.style === "art" ? "艺术动画" : "商业片"} · {activeMeta.aspect}
                  </Badge>
                  {activeMeta.bgm && activeMeta.bgm !== "none" && (
                    <Badge variant="outline" className="text-[9px] gap-0.5"><Music4 className="h-2.5 w-2.5" />{BGM_OPTIONS.find((b) => b.id === activeMeta.bgm)?.label ?? activeMeta.bgm}</Badge>
                  )}
                  <Badge variant="outline" className="text-[9px]">{activeVideo.provider}</Badge>
                  <a href={activeVideo.path} download className="text-[10px] text-amber-600 hover:underline flex items-center gap-0.5">
                    <Download className="h-3 w-3" />下载 MP4
                  </a>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={doRender} disabled={busy === "render"}>
                    <RefreshCw className="h-3 w-3 mr-1" />整体重新渲染
                  </Button>
                </div>
                {activeMeta.audioMode !== "tts" && activeMeta.ttsNote && <p className="text-[10px] text-muted-foreground">{activeMeta.ttsNote}</p>}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {runs.length === 0 && (
        <Card>
          <CardContent className="pt-6 pb-6 flex flex-col items-center text-muted-foreground">
            <FileText className="h-8 w-8 mb-2 opacity-30" />
            <p className="text-sm">还没有图文成稿——先在图文线跑一条流水线，成稿后回来这里做视频</p>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
