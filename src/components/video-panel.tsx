"use client"

// ============================================================
// video-panel —— 视频线工作台（独立生产线，学 dsh 可视化面板）
// 选稿 → 分镜（卡片流可视化）→ 通道选择（motion 商业片 / art 艺术
// 动画 / Agnes AI 模型）→ TTS 音色 + 画幅 → 渲染进度 → 成片播放/下载
// 底部时间线条（学 dsh timeline：分镜时长等比渲染 + 播放头位置）
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { TTS_VOICES } from "@/lib/runtime/skills/radar-rewrite"
import { Clapperboard, Loader2, Video, Download, RefreshCw, FileText, Play, Mic, Film, Palette, Sparkles, Wand2 } from "lucide-react"

interface RunItem { id: string; ideaTitle: string; status: string; mode: string; createdAt: string; _count?: { articles: number } }
interface StoryboardScene { id: number; seconds: number; visual: string; narration: string; subtitle: string; broll: string }
interface StoryboardData { title: string; hook: string; totalSeconds: number; scenes: StoryboardScene[]; bgm: string; caption: string }

interface VideoMeta {
  stage: "queued" | "tts" | "spec" | "frames" | "submit" | "poll" | "download" | "encode" | "concat" | "done" | "error"
  percent: number
  sceneDone: number
  sceneTotal: number
  audioMode: "pending" | "tts" | "partial" | "muted"
  ttsNote?: string
  aiNote?: string
  style?: "motion" | "art"
  channel?: "local" | "agnes"
  voice: string
  aspect: string
  seconds?: number
  width?: number
  height?: number
  sizeBytes?: number
  error?: string
  storyboard?: StoryboardData
}

const STAGE_LABELS: Record<string, string> = {
  queued: "排队中", tts: "TTS 口播合成", spec: "分镜转动画 spec（LLM）",
  frames: "逐帧渲染", submit: "提交 AI 模型", poll: "AI 生成中", download: "下载成片",
  encode: "分段编码", concat: "合成 MP4", done: "完成", error: "失败",
}

type VideoStyle = "motion" | "art"
type VideoChannel = "local" | "agnes" | "auto"

const STYLE_META: Record<VideoStyle, { label: string; desc: string; icon: typeof Film }> = {
  motion: { label: "商业片 · motion", desc: "品牌化场景卡 + 数据排版 + TTS 口播（本地确定性渲染，秒级出片）", icon: Film },
  art: { label: "艺术动画 · art", desc: "huashu-art-motion 引擎：8 语法 × 8 色板 Canvas 逐帧（Playwright + ffmpeg）", icon: Palette },
}

export function VideoPanel() {
  const { toast } = useToast()
  const [runs, setRuns] = useState<RunItem[]>([])
  const [runId, setRunId] = useState<string | null>(null)
  const [storyboard, setStoryboard] = useState<StoryboardData | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  // 渲染参数
  const [style, setStyle] = useState<VideoStyle>("motion")
  const [channel, setChannel] = useState<VideoChannel>("local")
  const [voice, setVoice] = useState("xiaochen")
  const [aspect, setAspect] = useState<"9:16" | "16:9">("9:16")
  // 视频产物
  const [videoAssets, setVideoAssets] = useState<{ id: string; path: string; provider: string; meta: string; createdAt: string }[]>([])
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

  // 选中 run → 拉详情（storyboard / 视频产物）
  const loadRun = useCallback(async (id: string) => {
    if (!id) return
    const json = await fetch(`/api/runs/${id}`).then((x) => x.json())
    const run = json.run as { assets: { id: string; kind: string; role: string; path: string; provider: string; meta: string; createdAt: string }[] } | null
    if (!run) return
    const videos = run.assets.filter((a) => a.role === "video-final")
    setVideoAssets(videos)
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

  // 渲染进行中 → 轮询
  const latestVideo = videoAssets[videoAssets.length - 1]
  let latestMeta: VideoMeta | null = null
  try {
    latestMeta = latestVideo ? (JSON.parse(latestVideo.meta) as VideoMeta) : null
  } catch {
    latestMeta = null
  }
  const rendering = latestMeta ? ["queued", "tts", "spec", "frames", "submit", "poll", "download", "encode", "concat"].includes(latestMeta.stage) : false
  useEffect(() => {
    if (!rendering || !runId) return
    const t = setInterval(() => void loadRun(runId), 2000)
    return () => clearInterval(t)
  }, [rendering, runId, loadRun])

  const doStoryboard = async () => {
    if (!runId) return
    setBusy("storyboard")
    try {
      const res = await fetch(`/api/runs/${runId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "storyboard", platform: "douyin" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setStoryboard(json.storyboard)
      toast({ title: "视频分镜已生成", description: `${json.storyboard.scenes.length} 个分镜 · ${json.storyboard.totalSeconds}s` })
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
        body: JSON.stringify({ action: "render-video", storyboard, voice, aspect, style, channel }),
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
    await navigator.clipboard.writeText([`《${storyboard.title}》总时长 ${storyboard.totalSeconds}s`, `钩子：${storyboard.hook}`, "", ...lines, "", `BGM：${storyboard.bgm}`, `发布文案：${storyboard.caption}`].join("\n"))
    toast({ title: "分镜脚本已复制" })
  }

  const selectedRun = runs.find((r) => r.id === runId)
  // 时间线（学 dsh timeline：分镜等比分段 + 渲染进度位置）
  const timelineTotal = storyboard?.totalSeconds ?? 0
  const playheadPct = latestMeta && rendering && storyboard ? Math.min(100, (latestMeta.sceneDone / Math.max(1, latestMeta.sceneTotal)) * 100) : 0

  return (
    <div className="space-y-4">
      {/* 源稿选择 + 分镜 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Clapperboard className="h-4 w-4 text-rose-500" />视频线 · 工作台</CardTitle>
          <p className="text-[11px] text-muted-foreground">图文成稿 → 分镜脚本 → 三通道成片（本地双风格 / Agnes AI 模型）→ TTS 口播 → MP4 下载</p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2">
            <select value={runId ?? ""} onChange={(e) => setRunId(e.target.value)} className="h-9 rounded-md border bg-background px-2 text-xs" aria-label="选择源稿">
              {runs.length === 0 && <option value="">暂有可用的成稿 Run（先去图文线出稿）</option>}
              {runs.map((r) => (
                <option key={r.id} value={r.id}>{r.ideaTitle.slice(0, 40)}{r._count?.articles ? `（${r._count.articles} 稿）` : ""}</option>
              ))}
            </select>
            <Button variant="outline" onClick={doStoryboard} disabled={!runId || busy === "storyboard"}>
              {busy === "storyboard" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1" />}
              {storyboard ? "重新生成分镜" : "生成分镜"}
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
        </CardContent>
      </Card>

      {/* 分镜可视化卡片流（学 dsh 画布的分镜节点形态） */}
      {storyboard && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Film className="h-3.5 w-3.5 text-rose-500" />分镜 · 《{storyboard.title}》</span>
              <span className="flex items-center gap-2">
                <Badge variant="outline" className="text-[9px]">{storyboard.totalSeconds}s · {storyboard.scenes.length} 分镜</Badge>
                <Badge variant="outline" className="text-[9px]">钩子：{storyboard.hook.slice(0, 16)}</Badge>
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
                  </motion.div>
                ))}
              </div>
            </ScrollArea>
            {/* 时间线条（分镜时长等比 + 渲染进度头） */}
            <div className="mt-3">
              <div className="flex h-6 rounded-md overflow-hidden border">
                {storyboard.scenes.map((s, i) => (
                  <div
                    key={s.id}
                    title={`分镜 ${s.id} · ${s.seconds}s`}
                    className="flex items-center justify-center text-[9px] text-white/90 border-r border-white/20 last:border-r-0"
                    style={{ width: `${(s.seconds / Math.max(1, timelineTotal)) * 100}%`, background: `hsl(${348 - i * 6} 70% ${38 + i * 3}%)` }}
                  >
                    {s.seconds}s
                  </div>
                ))}
              </div>
              {rendering && (
                <div className="mt-1 h-1 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${playheadPct}%` }} />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 通道与渲染控制 */}
      {storyboard && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-1.5"><Wand2 className="h-3.5 w-3.5 text-rose-500" />渲染通道</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 本地双风格 */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(Object.keys(STYLE_META) as VideoStyle[]).map((k) => {
                const meta = STYLE_META[k]
                const Icon = meta.icon
                const active = channel !== "agnes" && style === k
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

            {/* 音色 + 画幅 + 渲染按钮 */}
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
              <Button size="sm" className="h-7 text-[11px] bg-rose-500 hover:bg-rose-600 text-white ml-auto" onClick={doRender} disabled={busy === "render" || rendering}>
                {busy === "render" || rendering ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                {channel === "agnes" ? "AI 通道渲染 MP4" : style === "art" ? "艺术动画渲染 MP4" : "商业片渲染 MP4"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 成片卡 */}
      {latestVideo && latestMeta && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center justify-between">
              <span className="flex items-center gap-1.5"><Video className="h-3.5 w-3.5 text-rose-500" />视频成片</span>
              {latestMeta.stage === "done" && (
                <Badge variant="outline" className="text-[9px]">
                  {latestMeta.seconds}s · {latestMeta.width}×{latestMeta.height} · {latestMeta.sizeBytes ? `${(latestMeta.sizeBytes / 1024 / 1024).toFixed(1)}MB` : ""}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-2">
            {rendering && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin text-rose-500" />{STAGE_LABELS[latestMeta.stage] ?? latestMeta.stage}（{latestMeta.sceneDone}/{latestMeta.sceneTotal} 分镜）</span>
                  <span className="font-semibold">{latestMeta.percent}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div className="h-full bg-rose-500 rounded-full transition-all duration-500" style={{ width: `${latestMeta.percent}%` }} />
                </div>
                {latestMeta.aiNote && <p className="text-[10px] text-muted-foreground">{latestMeta.aiNote}</p>}
                {latestMeta.ttsNote && <p className="text-[10px] text-muted-foreground">{latestMeta.ttsNote}</p>}
              </div>
            )}
            {latestMeta.stage === "error" && (
              <div className="rounded-lg border border-red-200 bg-red-50/50 dark:bg-red-950/20 px-3 py-2">
                <p className="text-[11px] text-red-600">渲染失败：{latestMeta.error}</p>
                <Button size="sm" variant="outline" className="h-6 text-[10px] mt-1" onClick={doRender} disabled={busy === "render"}>重试渲染</Button>
              </div>
            )}
            {latestMeta.stage === "done" && latestVideo.path && (
              <>
                <video key={latestVideo.id} controls preload="metadata" src={latestVideo.path} className="w-full rounded-lg border bg-black max-h-[420px]" />
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={latestMeta.audioMode === "tts" ? "default" : "secondary"} className={latestMeta.audioMode === "tts" ? "bg-emerald-600" : latestMeta.audioMode === "partial" ? "bg-amber-500" : ""}>
                    {latestMeta.audioMode === "tts" ? `${TTS_VOICES.find((v) => v.id === latestMeta?.voice)?.label ?? latestMeta.voice} 口播` : latestMeta.audioMode === "partial" ? "部分口播" : "静音降级（字幕可读）"}
                  </Badge>
                  <Badge variant="outline" className="text-[9px]">
                    {latestMeta.channel === "agnes" ? "Agnes AI 模型" : latestMeta.style === "art" ? "艺术动画" : "商业片"} · {latestMeta.aspect}
                  </Badge>
                  <Badge variant="outline" className="text-[9px]">{latestVideo.provider}</Badge>
                  <a href={latestVideo.path} download className="text-[10px] text-amber-600 hover:underline flex items-center gap-0.5">
                    <Download className="h-3 w-3" />下载 MP4
                  </a>
                  <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={doRender} disabled={busy === "render"}>
                    <RefreshCw className="h-3 w-3 mr-1" />重新渲染
                  </Button>
                </div>
                {latestMeta.audioMode !== "tts" && latestMeta.ttsNote && <p className="text-[10px] text-muted-foreground">{latestMeta.ttsNote}</p>}
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
