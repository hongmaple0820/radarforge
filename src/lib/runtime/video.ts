// ============================================================
// video.ts —— 视频成片渲染引擎 v4（六项能力，方案线 C）
// 通道 A（motion 商业片）：storyboard → SVG 场景卡（sharp 栅格化，方向调色板）
//   → 每场景 TTS 口播 → ffmpeg 分段（淡入淡出）→ concat
// 通道 B（art 艺术动画）：storyboard → LLM 转 clip spec（8 语法×8 色板）
//   → huashu-art-motion Canvas 引擎（Playwright 逐帧）→ 分段 → 混音 → concat
// 通道 C（agnes AI 模型 · C1 AI 首帧主轨）：导演规划器拆分镜（C2）
//   → 每镜 B1 管线生成 AI 首帧（与文章配图同风格包）→ VLM 审帧（B3 闭环）
//   → agnes-video keyframe 模式 i2v（首帧+运动描述）→ 字幕烧录（C5 三预设）
//   → 混音合成；失败降级链每镜留痕（segments.source）。
// 通道 D（hybrid 混合）：model 镜头走 C1 i2v，code 镜头本地代码动画。
// 指着改（学 huashu-motion studio）：渲染留存场景分段 → 单场景局部重渲染
//   → concat 新版本成片 → 版本树 + 改动留痕（Asset.meta.revisions）
// BGM 本地合成（C5 六预设：无版权，ffmpeg aevalsrc）+ TTS 失败诚实降级。
// C6 合成诊断：各腿分相计时留痕（Asset.meta.diag + video-diagnostics 环形缓冲）。
// 分辨率：720P/1080P 由设置卡驱动（C3 协议族能力元数据闸门）。
// Asset.meta 全程留痕（stage / percent / style / channel / version / bgm / planner / segments）。
// ============================================================

import { db } from "@/lib/db"
import { execFile } from "child_process"
import { existsSync } from "fs"
import { copyFile, mkdir, rm, stat, writeFile } from "fs/promises"
import { promisify } from "util"
import path from "path"
import sharp from "sharp"
import type { Storyboard, StoryboardScene, ArtSpecItem, DirectionBrief } from "./skills/radar-rewrite"
import { artSpecMessages, parseArtSpecs, sceneReviseMessages, parseSceneRevision } from "./skills/radar-rewrite"
import { renderArtClip, Y4_CHARACTER_FRAMES, type ArtClipSpec } from "./art-engine"
import { chatRetry } from "@/lib/gateway"
import { registry } from "@/lib/gateway/registry"
import { getSettings } from "@/lib/settings"
import { extractJson } from "./json"
import { mustResolve } from "@/lib/media/binaries"
import { planShots, type ShotPlan, type VideoShot } from "./video-director"
import { diagRecord, diagRun, diagSummary } from "./video-diagnostics"
import { directVideoKeyframe } from "./illustration-director"
import { generateImage } from "@/lib/gateway/providers/zai-image"
import { vlmCheckImage } from "@/lib/gateway/vlm"
import { getImageStyle } from "./skills/radar-image"
import { videoFamilyForModel } from "@/lib/gateway/providers/video/family"
import {
  BGM_PRESETS,
  BGM_RECIPES,
  dimsFor,
  scaledLayout,
  subtitleFilters,
  wrapCJK,
  type BgmPreset,
  type Layout,
  type SubtitleStyle,
  type VideoResolution,
} from "./video-presets"

const execFileP = promisify(execFile)

const ASSET_DIR = "/home/z/my-project/public/assets"
const TMP_ROOT = "/home/z/my-project/.videotmp"

export type VideoAspect = "9:16" | "16:9"
export type VideoStyle = "motion" | "art"
/** local=本地代码动画｜agnes=AI 模型（C1：AI 首帧 i2v 主轨）｜auto=可用则 agnes｜hybrid=混合通道（model 镜头 i2v + code 镜头本地） */
export type VideoChannel = "local" | "agnes" | "auto" | "hybrid"
// C5 预设层下沉 video-presets.ts（纯函数可离线自测）；此处 re-export 保公共 API 不变
export { BGM_PRESETS, SUBTITLE_STYLES, dimsFor, scaledLayout } from "./video-presets"
export type { BgmPreset, SubtitleStyle, VideoResolution } from "./video-presets"

/** C1 每镜头来源留痕（成片元数据标注通道构成；验收「i2v 占比 ≥80%」的凭证） */
export interface SegmentSource {
  sceneId: number
  source: "i2v" | "code"
  /** i2v 首帧来源：b1(director/legacy) / code-card / cached */
  keyframe?: string
  seconds?: number
  error?: string
}

/** C1 首帧质量统计（VLM 闭环证据） */
export interface KeyframeStats {
  ok: number
  fallback: number
  vlmPass: number
  vlmFail: number
  vlmSkip: number
  via: string[]
}

export interface SceneRevision {
  sceneId: number
  feedback: string
  reason: string
  at: string
}

export interface RenderProgress {
  stage:
    | "queued"
    | "tts"
    | "spec"
    | "plan" // C2 导演规划
    | "keyframes" // C1 AI 首帧生成
    | "preview" // C2 预览即所提交：首帧就绪等确认（未花 i2v 额度）
    | "frames"
    | "submit"
    | "poll"
    | "download"
    | "encode"
    | "concat"
    | "revise"
    | "done"
    | "error"
  percent: number
  sceneDone: number
  sceneTotal: number
  audioMode: "pending" | "tts" | "partial" | "muted"
  ttsNote?: string
  voice: string
  aspect: VideoAspect
  /** 渲染风格：motion 商业片 / art 艺术动画 */
  style: VideoStyle
  /** 实际通道（auto 解析后）：local / agnes / hybrid */
  channel: "local" | "agnes" | "hybrid"
  aiNote?: string
  seconds?: number
  width?: number
  height?: number
  sizeBytes?: number
  error?: string
  storyboard?: Storyboard
  /** 版本树：v1 起整片渲染，之后指着改逐次 +1 */
  version?: number
  /** 场景分段时长（秒）——指着改定位场景边界用 */
  durations?: number[]
  /** 指着改历史（跨版本继承） */
  revisions?: SceneRevision[]
  /** BGM 预设（none=无配乐） */
  bgm?: BgmPreset
  bgmNote?: string
  /** 混合通道统计：代码动画 / AI 模型镜头数（成本与验收证据） */
  codeScenes?: number
  modelScenes?: number
  /** C5 分辨率（720P/1080P；协议族能力闸门后的实际档位） */
  resolution?: VideoResolution
  /** C2 规划器来源：director=LLM 分镜规划 / rule-based=规则降级 */
  planner?: "director" | "rule-based"
  /** C1 每镜头来源构成（i2v/code + 失败段定位） */
  segments?: SegmentSource[]
  /** C1 首帧质量统计（VLM 闭环证据） */
  keyframes?: KeyframeStats
  /** C6 合成诊断分腿汇总（完成时写入；环形缓冲全量在内存态） */
  diag?: { entries: number; errors: number; legs: Record<string, { n: number; errors: number; avgMs: number; lastError?: string }> }
}

// ---------- 文本工具 ----------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// ---------- 场景卡 SVG（motion 商业片线，品牌化设计，两档画幅；布局/缩放见 video-presets） ----------

/** 方向调色板：从 storyboard.direction 派生（无方向时保持 amber 默认）
 *  注意：背景仅接受深色 base（亮度<0.55），浅色方向自动回退深色底保证文字可读 */
interface ScenePalette {
  accent: string
  accentSoft: string // 走过的进度点
  bgFrom: string
}

function hexLuma(hex: string): number {
  const r = Number.parseInt(hex.slice(1, 3), 16) / 255
  const g = Number.parseInt(hex.slice(3, 5), 16) / 255
  const b = Number.parseInt(hex.slice(5, 7), 16) / 255
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function paletteFor(sb: Storyboard): ScenePalette {
  const d = sb.direction
  const accent = d?.accent ?? "#f59e0b"
  const base = d?.base ?? "#0b1220"
  return {
    accent,
    accentSoft: `${accent}99`,
    bgFrom: hexLuma(base) < 0.55 ? base : "#0b1220",
  }
}

function sceneSvg(scene: StoryboardScene, i: number, n: number, sb: Storyboard, L: Layout): string {
  const P = paletteFor(sb)
  const cx = L.w / 2
  const isFirst = i === 0

  const bigLines = isFirst ? wrapCJK(sb.title, L.titleWrap, 3) : wrapCJK(scene.subtitle || scene.narration.slice(0, 24), L.subWrap, 3)
  const bigFont = isFirst ? L.titleFont : L.subFont
  const bigLh = isFirst ? L.titleLh : L.subLh
  const bigStartY = L.subY - ((bigLines.length - 1) * bigLh) / 2

  const narrLines = wrapCJK(scene.narration, L.narrWrap, 4)

  const dots: string[] = []
  const dotGap = 22
  const dotsW = (n - 1) * dotGap
  for (let k = 0; k < n; k++) {
    const x = cx - dotsW / 2 + k * dotGap
    const fill = k < i ? P.accentSoft : k === i ? P.accent : "#47556966"
    dots.push(`<circle cx="${x}" cy="${L.dotsY}" r="6" fill="${fill}"/>`)
  }

  const texts: string[] = []
  texts.push(
    `<text x="${L.w - 40}" y="${L.brandY}" font-family="Sarasa Mono SC" font-size="20" fill="#64748b" text-anchor="end">SCENE ${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}</text>`,
  )
  if (isFirst) {
    texts.push(`<text x="40" y="${L.brandY}" font-family="Noto Sans SC" font-weight="700" font-size="24" fill="${P.accent}">AI 资讯雷达</text>`)
    texts.push(`<text x="${cx}" y="${L.subY - 120}" font-family="Noto Sans SC" font-size="${L.hookFont}" fill="#94a3b8" text-anchor="middle">${esc(sb.hook)}</text>`)
  } else {
    texts.push(`<text x="40" y="${L.brandY}" font-family="Noto Sans SC" font-size="22" fill="#94a3b8">AI 资讯雷达${sb.direction ? ` · ${esc(sb.direction.name)}` : ""}</text>`)
  }
  texts.push(`<rect x="${cx - 30}" y="${bigStartY - bigFont - 28}" width="60" height="4" rx="2" fill="${P.accent}"/>`)
  bigLines.forEach((line, k) => {
    texts.push(
      `<text x="${cx}" y="${bigStartY + k * bigLh}" font-family="Noto Sans SC" font-weight="700" font-size="${bigFont}" fill="#f8fafc" text-anchor="middle">${esc(line)}</text>`,
    )
  })
  narrLines.forEach((line, k) => {
    texts.push(
      `<text x="${cx}" y="${L.narrY + k * L.narrLh}" font-family="Noto Sans SC" font-size="${L.narrFont}" fill="#94a3b8" text-anchor="middle">${esc(line)}</text>`,
    )
  })
  texts.push(`<text x="${cx}" y="${L.footerY}" font-family="Noto Sans SC" font-size="19" fill="#475569" text-anchor="middle">证据驱动 · 每条主张可溯源</text>`)

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${L.w}" height="${L.h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${P.bgFrom}"/><stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.82" cy="0.16" r="0.5">
      <stop offset="0" stop-color="${P.accent}" stop-opacity="0.14"/><stop offset="1" stop-color="${P.accent}" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glowB" cx="0.12" cy="0.9" r="0.55">
      <stop offset="0" stop-color="#38bdf8" stop-opacity="0.12"/><stop offset="1" stop-color="#38bdf8" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${L.w}" height="${L.h}" fill="url(#bg)"/>
  <rect width="${L.w}" height="${L.h}" fill="url(#glowA)"/>
  <rect width="${L.w}" height="${L.h}" fill="url(#glowB)"/>
  <rect x="0" y="${L.brandY + 8}" width="${L.w}" height="1" fill="#ffffff" opacity="0.08"/>
  ${texts.join("\n  ")}
  ${dots.join("\n  ")}
  <rect x="0" y="${L.dotsY - 40}" width="${L.w}" height="1" fill="#ffffff" opacity="0.08"/>
</svg>`
}

// ---------- ffmpeg / TTS ----------

async function ffprobeSeconds(file: string): Promise<number> {
  const { stdout } = await execFileP(mustResolve("ffprobe"), ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])
  return Number.parseFloat(stdout.trim()) || 0
}

async function ttsWav(narration: string, voice: string, outFile: string): Promise<boolean> {
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk")
    const zai = await ZAI.create()
    const res = await zai.audio.tts.create({
      input: narration.slice(0, 1000),
      voice,
      speed: 1.05,
      response_format: "wav",
      stream: false,
    })
    const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()))
    if (buf.length < 2000) throw new Error(`TTS 返回过小（${buf.length}B）`)
    await writeFile(outFile, buf)
    return true
  } catch (e) {
    console.warn(`[video] TTS 失败：${(e as Error).message.slice(0, 160)}`)
    return false
  }
}

// ---------- BGM 本地合成（作曲配乐务实版：ffmpeg 正弦合成，无版权问题） ----------

/** 合成 BGM wav（时长对齐成片，尾部淡出） */
async function synthesizeBgm(preset: Exclude<BgmPreset, "none">, seconds: number, outFile: string): Promise<void> {
  const r = BGM_RECIPES[preset]
  const fadeOutStart = Math.max(0, seconds - 2.2).toFixed(2)
  await execFileP(mustResolve("ffmpeg"), [
    "-y", "-f", "lavfi",
    "-i", `aevalsrc=${r.expr}:s=24000:d=${seconds.toFixed(2)}`,
    "-af", `${r.chain},afade=t=out:st=${fadeOutStart}:d=2.2`,
    "-c:a", "pcm_s16le", "-ar", "24000", "-ac", "1",
    outFile,
  ], { timeout: 60_000 })
}

/** 口播成片 + BGM 混音（口播为主，BGM 垫底；静音降级片 BGM 提为主角） */
async function mixBgm(videoIn: string, preset: Exclude<BgmPreset, "none">, hasVoice: boolean, outFile: string): Promise<void> {
  const r = BGM_RECIPES[preset]
  const bgmWav = `${outFile}.bgm.wav`
  const dur = await ffprobeSeconds(videoIn)
  await synthesizeBgm(preset, dur, bgmWav)
  const bgmVol = hasVoice ? r.volume : Math.min(0.6, r.volume * 2.4)
  await execFileP(mustResolve("ffmpeg"), [
    "-y", "-i", videoIn, "-i", bgmWav,
    "-filter_complex", `[1:a]volume=${bgmVol.toFixed(2)}[b];[0:a][b]amix=inputs=2:duration=first:dropout_transition=0:normalize=0[a]`,
    "-map", "0:v:0", "-map", "[a]",
    "-c:v", "copy", "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
    outFile,
  ], { timeout: 120_000 })
  await rm(bgmWav, { force: true })
}

// ---------- 版本树（指着改的版本命名） ----------

/** 该 run 现有 video-final 的最大版本号（无版本字段按 v1 计；须排除自身——action 路由先建 Asset 后启动渲染，自数会令首渲恒为 v2） */
async function latestVideoVersion(runId: string, excludeAssetId?: string): Promise<number> {
  const priors = await db.asset.findMany({
    where: { runId, role: "video-final", ...(excludeAssetId ? { id: { not: excludeAssetId } } : {}) },
    select: { meta: true },
  })
  let max = 0
  for (const a of priors) {
    try {
      const v = Number((JSON.parse(a.meta) as { version?: number }).version ?? 1)
      if (Number.isFinite(v)) max = Math.max(max, v)
    } catch {
      max = Math.max(max, 1)
    }
  }
  return max
}

function videoPathFor(runId: string, version: number): string {
  return path.join(ASSET_DIR, version <= 1 ? `video-${runId}.mp4` : `video-${runId}-v${version}.mp4`)
}

/** 场景分段留存目录（指着改的物料；重渲染覆盖旧分段） */
function segDirFor(runId: string): string {
  return path.join(ASSET_DIR, "video-segs", runId)
}

// ---------- 渲染主流程 ----------

const inflightVideo = new Set<string>()

export function startVideoRenderInBackground(
  runId: string,
  assetId: string,
  storyboard: Storyboard,
  opts: {
    voice: string
    aspect: VideoAspect
    style?: VideoStyle
    channel?: VideoChannel
    bgm?: BgmPreset
    /** C2 预览即所提交：只出分镜计划 + AI 首帧（不花 i2v 额度） */
    preview?: boolean
    /** 复用上一轮 preview 生成的首帧（确认后继续渲染时传 true） */
    reuseKeyframes?: boolean
  },
): void {
  const key = `${runId}:${assetId}`
  if (inflightVideo.has(key)) return
  inflightVideo.add(key)
  void renderVideo(runId, assetId, storyboard, opts).finally(() => inflightVideo.delete(key))
}

/** LLM：分镜 → art clip specs（8 语法×8 色板契约见 radar-rewrite） */
async function convertToArtSpecs(storyboard: Storyboard, aspect: VideoAspect): Promise<ArtSpecItem[]> {
  try {
    const raw = await chatRetry(artSpecMessages(storyboard, aspect), { temperature: 0.4 })
    const parsed = extractJson<unknown>(raw)
    const specs = parseArtSpecs(parsed ?? raw)
    if (specs.length > 0) return specs
  } catch (e) {
    console.warn(`[video] art spec 转换失败：${(e as Error).message.slice(0, 160)}`)
  }
  // 兜底：全部退化为 t2_keynote_ui 文字卡（引擎总能渲染）
  return storyboard.scenes.map((s, i) => ({
    sceneId: s.id,
    grammar: "t2_keynote_ui",
    theme: "paper",
    data: i === 0 ? { eyebrow: storyboard.hook, title: storyboard.title, subtitle: "" } : { title: s.subtitle || s.narration.slice(0, 12), subtitle: "" },
    cues: [
      { at: 0.3, kind: "title" },
      { at: Math.min(2, s.seconds * 0.5), kind: "step", data: { step: 1, text: s.subtitle || s.narration.slice(0, 14) } },
    ],
  }))
}

/** C1 首帧结果（生成链留痕：B1 导演→生图→裁切，或 code-card 兜底，或 preview 缓存复用） */
interface KeyframeResult {
  file: string
  /** b1(director) / b1(legacy) / code-card / cached */
  source: string
  vlm: "pass" | "pass-after-retry" | "failed" | "skipped"
  via?: string
  note?: string
}

/** Agnes 通道：单场景 提交→轮询→下载（C1：keyframe i2v + C6 三腿分相诊断） */
async function agnesSceneToMp4(
  scene: StoryboardScene,
  seconds: number,
  aspect: VideoAspect,
  outFile: string,
  onWait: (waited: number) => void,
  opts: { runId: string; sceneId: number; firstFrame?: string; motionPrompt?: string },
): Promise<string> {
  const p = registry.get("agnes-video")
  if (p.kind !== "VIDEO" || !p.submitVideo || !p.getVideoTask) throw new Error("agnes-video provider 未就绪")
  // C1：keyframe 模式用导演规划的运动描述（不再是「visual+口播截断 500 字」的拼凑）；text 模式保留旧拼接作降级
  const prompt = (opts.motionPrompt ?? `${scene.visual}。口播要点：${scene.narration}`).slice(0, 500)
  const mode = opts.firstFrame ? "keyframe" : "text"
  const task = await diagRun(
    opts.runId,
    "submit",
    () =>
      p.submitVideo!({
        prompt,
        mode,
        seconds,
        aspectRatio: aspect === "9:16" ? "9:16" : "16:9",
        ...(opts.firstFrame ? { firstFrame: opts.firstFrame } : {}),
      }),
    { sceneId: opts.sceneId, detail: mode },
  )
  const deadline = Date.now() + 10 * 60_000
  const pollT0 = Date.now()
  let waited = 0
  let resultUrl: string | null = null
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000))
    waited += 8
    onWait(waited)
    const t = await p.getVideoTask(task.remoteTaskId ?? task.id)
    if (t.status === "completed" && t.resultUrl) {
      resultUrl = t.resultUrl
      break
    }
    if (t.status === "failed") {
      diagRecord(opts.runId, "poll", false, Date.now() - pollT0, { sceneId: opts.sceneId, error: t.error ?? "生成失败" })
      throw new Error(`Agnes 生成失败：${t.error ?? "未知"}`)
    }
  }
  if (!resultUrl) {
    diagRecord(opts.runId, "poll", false, Date.now() - pollT0, { sceneId: opts.sceneId, error: "轮询超时（10 分钟）" })
    throw new Error("Agnes 轮询超时（10 分钟）")
  }
  diagRecord(opts.runId, "poll", true, Date.now() - pollT0, { sceneId: opts.sceneId, detail: `waited ${waited}s` })
  await diagRun(
    opts.runId,
    "download",
    async () => {
      const res = await fetch(resultUrl!, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`下载成片失败：HTTP ${res.status}`)
      const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()))
      if (buf.length < 10_000) throw new Error(`成片过小（${buf.length}B）`)
      await writeFile(outFile, buf)
    },
    { sceneId: opts.sceneId },
  )
  return outFile
}

/** 分段混音：视频段 + 音频（无音 → 静音轨）→ 统一参数分段
 *  C5：i2v 片段可烧录字幕（三预设）；C1：口播长于 i2v 上限时定格尾帧延长（tpad clone） */
interface MuxSegmentOpts {
  subtitle?: { scene: StoryboardScene; style: SubtitleStyle; dims: { w: number; h: number } }
  pad?: boolean
}

async function muxSegment(videoIn: string, audioIn: string | null, dur: number, outFile: string, opts: MuxSegmentOpts = {}): Promise<void> {
  const vfParts: string[] = []
  if (opts.pad) {
    const rawDur = await ffprobeSeconds(videoIn)
    if (Number.isFinite(rawDur) && rawDur > 0.5 && rawDur < dur - 0.3) {
      vfParts.push(`tpad=stop_mode=clone:stop_duration=${(dur - rawDur).toFixed(2)}`)
    }
  }
  if (opts.subtitle) vfParts.push(...subtitleFilters(opts.subtitle.scene, opts.subtitle.style, opts.subtitle.dims))
  vfParts.push("format=yuv420p")
  const args = [
    "-y", "-i", videoIn,
    ...(audioIn ? ["-i", audioIn] : ["-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=r=24000:cl=mono"]),
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-vf", vfParts.join(","),
    "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
    "-t", dur.toFixed(2), "-shortest",
    outFile,
  ]
  await execFileP(mustResolve("ffmpeg"), args, { timeout: 120_000 })
}

async function renderVideo(
  runId: string,
  assetId: string,
  storyboard: Storyboard,
  opts: {
    voice: string
    aspect: VideoAspect
    style?: VideoStyle
    channel?: VideoChannel
    bgm?: BgmPreset
    preview?: boolean
    reuseKeyframes?: boolean
  },
): Promise<void> {
  const scenes = storyboard.scenes
  const n = scenes.length
  const style: VideoStyle = opts.style ?? "motion"
  const bgm: BgmPreset = opts.bgm ?? "none"
  const tmp = path.join(TMP_ROOT, `${runId.slice(-8)}-${assetId.slice(-8)}`)
  // 版本树：本片版本号（v1 基线 / 后续指着改逐次 +1；排除自身 Asset，防自数）
  const version = (await latestVideoVersion(runId, assetId)) + 1
  const finalPath = videoPathFor(runId, version)

  // ---- 通道解析（settings 默认 + 请求覆盖；auto = agnes 可用则 agnes）----
  const settings = await getSettings(true)
  const channelChoice: VideoChannel = opts.channel ?? settings.video.channel
  // C3 协议族能力闸门：模型非 agnes 族（如 doubao-seedance-*，本期未接 key）→ 显式降级本地并留痕，不提交吃 400
  const videoModel = settings.video.model || settings.agnes.videoModel
  const familyMeta = videoFamilyForModel(videoModel)
  const familyOk = familyMeta.id === "agnes" && familyMeta.wired
  const agnesReady = (() => {
    if (!familyOk) return false
    const p = registry.get("agnes-video")
    return p.kind === "VIDEO" && p.isConfigured() && Boolean(p.submitVideo)
  })()
  let channel: "local" | "agnes" | "hybrid"
  if (channelChoice === "agnes") channel = "agnes"
  else if (channelChoice === "hybrid") channel = "hybrid"
  else if (channelChoice === "auto") channel = agnesReady ? "agnes" : "local"
  else channel = "local"
  let aiNote = ""
  if (channelChoice !== "local" && !familyOk) {
    if (channelChoice === "agnes") channel = "local"
    aiNote = `视频模型「${videoModel}」属于${familyMeta.label}（本期未接 key）→ ${
      channelChoice === "hybrid" ? "model 镜头将全部本地渲染" : "已回退本地渲染"
    }；换用 agnes-* 模型可启用 AI 首帧 i2v 主轨`
  } else if (channelChoice === "agnes" && !agnesReady) {
    channel = "local"
    aiNote = "Agnes 未配置（账号池为空或未启用）→ 已回退本地渲染"
  } else if (channelChoice === "auto" && !agnesReady) {
    aiNote = "auto：Agnes 未配置 → 本地渲染"
  } else if (channelChoice === "hybrid" && !agnesReady) {
    aiNote = "混合通道：Agnes 未配置 → 全部代码动画渲染（配置 Agnes 账号池后 model 镜头自动启用）"
  }
  // C5 分辨率：能力元数据闸门后的实际档位（族不支持 1080P 时降至 720P）
  const resolution: VideoResolution = familyMeta.resolutions.includes(settings.video.resolution) ? settings.video.resolution : "720P"
  const dims = dimsFor(opts.aspect, resolution)
  const L = scaledLayout(opts.aspect, resolution)
  // C5 字幕预设（i2v 片段烧录；非法值回 clean）
  const subtitleStyle: SubtitleStyle = ["clean", "strong", "soft"].includes(
    (settings.video as { subtitleStyle?: string }).subtitleStyle ?? "",
  )
    ? ((settings.video as { subtitleStyle?: string }).subtitleStyle as SubtitleStyle)
    : "clean"
  // 混合通道的分发判定（P1：LLM 已在分镜 JSON 标注 render=code|model；C1 后 model 镜头走 i2v）
  const agnesForScene = (i: number): boolean => {
    if (channel === "agnes") return true
    if (channel !== "hybrid") return false
    return scenes[i].render === "model" && agnesReady
  }
  const modelSceneCount = scenes.filter((s) => s.render === "model").length
  const codeSceneCount = n - modelSceneCount

  const progress: RenderProgress = {
    stage: "queued", percent: 0, sceneDone: 0, sceneTotal: n,
    audioMode: "pending", voice: opts.voice, aspect: opts.aspect,
    style: channel === "agnes" ? style : style, channel, version, resolution,
    ...(aiNote ? { aiNote } : {}),
    ...(bgm !== "none" ? { bgm } : {}),
    ...(channel === "hybrid" ? { codeScenes: codeSceneCount, modelScenes: agnesReady ? modelSceneCount : 0 } : {}),
  }
  let baseMeta: Record<string, unknown> = {}
  try {
    const asset = await db.asset.findUnique({ where: { id: assetId } })
    if (asset) baseMeta = JSON.parse(asset.meta) as Record<string, unknown>
  } catch {
    /* meta 损坏则从空开始 */
  }
  const saveProgress = (patch: Partial<RenderProgress>) => {
    Object.assign(progress, patch)
    void db.asset.update({ where: { id: assetId }, data: { meta: JSON.stringify({ ...baseMeta, ...progress }) } }).catch(() => {})
  }

  try {
    await mkdir(tmp, { recursive: true })
    await mkdir(ASSET_DIR, { recursive: true })

    // ===== Stage 1: TTS 口播（失败 → 字幕主导模式降级；preview 模式跳过——不花配额） =====
    let ttsOk = 0
    let ttsDown = false
    let ttsNote = ""
    const durations: number[] = []
    const audioFiles: string[] = []
    if (opts.preview) {
      for (let i = 0; i < n; i++) {
        durations.push(Math.min(15, Math.max(2, scenes[i].seconds)))
        audioFiles.push("")
      }
      saveProgress({ audioMode: "pending", ttsNote: "预览模式：跳过 TTS（确认渲染成片时再合成口播）" })
    } else {
      saveProgress({ stage: "tts" })
      for (let i = 0; i < n; i++) {
        const wav = path.join(tmp, `a${i}.wav`)
        let ok = false
        if (!ttsDown && scenes[i].narration.trim()) {
          ok = await diagRun(runId, "tts", () => ttsWav(scenes[i].narration, opts.voice, wav), { sceneId: scenes[i].id })
          if (!ok) {
            ttsDown = true
            ttsNote = "TTS 端点不可达 → 已降级「字幕主导模式」：按分镜计划时长出片、字幕已烧录可正常观看；口播就绪后点「重新渲染」可恢复配音"
          }
        }
        if (ok) {
          ttsOk++
          durations.push(Math.max(1, await ffprobeSeconds(wav)))
          audioFiles.push(wav)
        } else {
          const planned =
            channel === "agnes"
              ? settings.video.secondsPerScene
              : channel === "hybrid" && agnesForScene(i)
                ? Math.min(10, Math.max(5, scenes[i].seconds)) // model 镜头 5~10s 插播（P1 混合通道）
                : Math.min(15, Math.max(2, scenes[i].seconds))
          durations.push(planned)
          audioFiles.push("")
        }
        saveProgress({ sceneDone: i + 1, percent: Math.round(5 + (25 * (i + 1)) / n) })
      }
    }
    saveProgress({
      audioMode: ttsOk === n ? "tts" : ttsOk > 0 ? "partial" : opts.preview ? "pending" : "muted",
      ttsNote: opts.preview ? "预览模式：跳过 TTS（确认渲染成片时再合成口播）" : ttsOk === n ? "全部分镜 TTS 口播完成" : ttsNote || `${ttsOk}/${n} 分镜有口播`,
      sceneDone: 0,
    })

    // ===== Stage 1.5: C1 AI 首帧主轨（C2 导演规划 → B1 首帧生成 → B3 VLM 审帧闭环） =====
    // preview 或任一 i2v 镜头时执行；hybrid 只为 model 镜头生成（code 镜头本地确定零错字）
    const wantI2v = (i: number): boolean =>
      opts.preview ? true : channel === "agnes" ? true : channel === "hybrid" ? agnesForScene(i) : false
    const anyI2v = scenes.some((_, i) => wantI2v(i))
    let plan: ShotPlan | null = null
    const keyframes: (KeyframeResult | null)[] = new Array(n).fill(null)
    const keyframeStats: KeyframeStats = { ok: 0, fallback: 0, vlmPass: 0, vlmFail: 0, vlmSkip: 0, via: [] }
    if (anyI2v) {
      // -- C2 导演规划（LLM 拆结构化分镜计划：首帧提示词中英 + 运动描述；失败规则降级留痕）--
      saveProgress({ stage: "plan", percent: 27, aiNote: `导演规划中：为 ${scenes.filter((_, i) => wantI2v(i)).length} 个 i2v 镜头拆分镜计划（首帧提示词+运动描述）…` })
      plan = await diagRun(
        runId,
        "plan",
        () =>
          planShots({
            title: storyboard.title,
            hook: storyboard.hook,
            aspect: opts.aspect,
            secondsRange: familyMeta.seconds,
            scenes: scenes.map((s) => ({ id: s.id, seconds: s.seconds, visual: s.visual, narration: s.narration, subtitle: s.subtitle })),
          }),
      )
      saveProgress({ planner: plan.planner, ...(plan.note ? { aiNote: plan.note } : {}) })

      // -- C1 首帧生成（B1 首帧导演 → 三通道生图 → 裁切对齐画幅）+ B3 VLM 审帧 --
      saveProgress({ stage: "keyframes", sceneDone: 0, percent: 30 })
      const framesDir = path.join(ASSET_DIR, "video-frames", runId)
      await mkdir(framesDir, { recursive: true })
      // 风格基准与文章配图同源（settings.article.imageStyleId）→ 图-文-视频视觉统一（C1 免费收益）
      const stylePrompt = getImageStyle(settings.article.imageStyleId).prompt
      const i2vIdx = scenes.map((_, i) => i).filter((i) => wantI2v(i))
      let kfDone = 0
      for (const i of i2vIdx) {
        const shot = plan.shots.find((s) => s.sceneId === scenes[i].id)
        const kfFile = path.join(framesDir, `kf-${scenes[i].id}-${dims.w}x${dims.h}.png`)
        // preview 缓存复用（确认后继续渲染不重花生图额度）
        if (opts.reuseKeyframes) {
          try {
            await stat(kfFile)
            keyframes[i] = { file: kfFile, source: "cached", vlm: "skipped" }
            kfDone++
            saveProgress({ sceneDone: kfDone, percent: 30 + Math.round((8 * kfDone) / i2vIdx.length), aiNote: `AI 首帧 ${kfDone}/${i2vIdx.length}：复用预览缓存（分镜 ${i + 1}）` })
            continue
          } catch {
            /* 无缓存 → 正常生成 */
          }
        }
        const concept =
          [shot?.firstFrameZh, shot?.firstFrameEn].filter(Boolean).join("；").slice(0, 240) || scenes[i].visual.slice(0, 160)
        // B1 首帧导演（wewrite-art-direct prompt: keyframe；失败 legacy 降级留痕）
        const directed = await directVideoKeyframe({
          topic: storyboard.title,
          shotIndex: i + 1,
          concept,
          subtitle: scenes[i].subtitle,
          stylePrompt,
        })
        const img = await diagRun(
          runId,
          "keyframe",
          () => generateImage(directed.promptFull, runId, `vkf${scenes[i].id}`, opts.aspect === "9:16" ? "864x1152" : "1344x768"),
          { sceneId: scenes[i].id, detail: directed.source },
        )
        const finishFrame = async (absPath: string): Promise<void> => {
          await sharp(absPath).resize(dims.w, dims.h, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(kfFile)
        }
        if (img.ok) {
          await finishFrame(img.absPath)
          const kf: KeyframeResult = { file: kfFile, source: `b1(${directed.source})`, vlm: "skipped", via: img.via }
          // B3 闭环：VLM 审帧 → 未过带 hint 定向重生一次 → 二次未过采用并标注 failed（诚实留痕不阻断）
          const vlm = await diagRun(
            runId,
            "vlm",
            () => vlmCheckImage({ absPath: kfFile, concept, caption: scenes[i].subtitle, kind: "gen" }),
            { sceneId: scenes[i].id },
          )
          if (vlm.done && !vlm.pass && vlm.retryHint) {
            const directed2 = await directVideoKeyframe({
              topic: storyboard.title,
              shotIndex: i + 1,
              concept,
              subtitle: scenes[i].subtitle,
              stylePrompt,
              retryHint: vlm.retryHint,
            })
            const img2 = await generateImage(directed2.promptFull, runId, `vkf${scenes[i].id}r`, opts.aspect === "9:16" ? "864x1152" : "1344x768")
            if (img2.ok) {
              await finishFrame(img2.absPath)
              kf.via = img2.via
              const vlm2 = await vlmCheckImage({ absPath: kfFile, concept, caption: scenes[i].subtitle, kind: "gen" })
              kf.vlm = vlm2.done ? (vlm2.pass ? "pass-after-retry" : "failed") : "skipped"
            } else {
              kf.vlm = "failed"
            }
          } else if (vlm.done) {
            kf.vlm = vlm.pass ? "pass" : "failed"
          }
          keyframes[i] = kf
          keyframeStats.ok++
          if (img.via && !keyframeStats.via.includes(img.via)) keyframeStats.via.push(img.via)
        } else {
          // 生图不可用 → 场景卡兜底首帧（i2v 主轨不因此整线回退；来源留痕 code-card）
          const svg = sceneSvg(scenes[i], i, n, storyboard, L)
          await sharp(Buffer.from(svg)).resize(dims.w, dims.h, { fit: "cover" }).png({ compressionLevel: 9 }).toFile(kfFile)
          keyframes[i] = { file: kfFile, source: "code-card", vlm: "skipped", note: img.error?.slice(0, 100) }
          keyframeStats.fallback++
        }
        const vlmState = keyframes[i]!.vlm
        if (vlmState === "pass" || vlmState === "pass-after-retry") keyframeStats.vlmPass++
        else if (vlmState === "failed") keyframeStats.vlmFail++
        else keyframeStats.vlmSkip++
        // 首帧落 Asset（run 详情页可见 → C2「预览即所提交」的物料基础）
        await db.asset
          .create({
            data: {
              runId,
              kind: "image",
              role: "video-keyframe",
              provider: `keyframe(${keyframes[i]!.source})`,
              path: `/assets/video-frames/${runId}/${path.basename(kfFile)}`,
              meta: JSON.stringify({
                sceneId: scenes[i].id,
                shotIndex: i + 1,
                vlm: vlmState,
                planner: plan.planner,
                aspect: opts.aspect,
                resolution,
                dims: `${dims.w}x${dims.h}`,
              }),
            },
          })
          .catch(() => {})
        kfDone++
        saveProgress({
          sceneDone: kfDone,
          percent: 30 + Math.round((8 * kfDone) / i2vIdx.length),
          aiNote: `AI 首帧 ${kfDone}/${i2vIdx.length}（分镜 ${i + 1}：${keyframes[i]!.source}${
            vlmState !== "skipped"
              ? ` · VLM ${vlmState === "pass" ? "通过" : vlmState === "pass-after-retry" ? "重生后通过" : "未过（已采用并标注）"}`
              : ""
          }）`,
        })
      }
      saveProgress({ keyframes: keyframeStats, sceneDone: 0 })
      // C2 预览即所提交：首帧与分镜计划就绪即停（不花 i2v 额度），等用户确认
      if (opts.preview) {
        saveProgress({
          stage: "preview",
          percent: 100,
          aiNote: `分镜预览就绪：${i2vIdx.length} 张 AI 首帧 + 导演分镜计划（${
            plan.planner === "director" ? "LLM 规划" : "规则规划降级"
          }）已生成，未消耗 i2v 额度——确认后点「渲染成片」继续（将复用这些首帧）`,
        })
        await rm(tmp, { recursive: true, force: true })
        return
      }
    }

    // ===== Stage 2: 分段生成（四通道分叉：agnes i2v / hybrid / art / motion） =====
    const segs: string[] = []
    /** C1 每镜头来源留痕（成片元数据标注通道构成；失败段定位） */
    const segments: SegmentSource[] = []

    /** 混合通道的本地代码动画单镜渲染（style=art 走引擎，否则 motion 场景卡；供 code 分镜与 model 回落共用）
     * 修复（2026-10-31）：渲染完成必须 segs.push——此前仅在调用方 model 路径 push，
     * 全 code 分镜时 segs 为空导致 concat 空列表失败；有 model 分镜时 code 分镜被静默丢帧（更糟）。 */
    const renderLocalSceneSeg = async (i: number, seg: string, specs: ArtSpecItem[]): Promise<void> => {
      if (style === "art") {
        const specItem = specs.find((s) => s.sceneId === scenes[i].id) ?? specs[i]
        const clipPath = path.join(tmp, `c${i}.mp4`)
        const grammar = specItem?.grammar ?? "t2_keynote_ui"
        const spec: ArtClipSpec = {
          grammar,
          duration: Math.min(8, Math.max(2, durations[i])),
          fps: 30,
          width: L.w,
          height: L.h,
          theme: specItem?.theme ?? "paper",
          data: grammar === "y4_storytime" ? { ...(specItem?.data ?? {}), character: { frames: Y4_CHARACTER_FRAMES } } : specItem?.data ?? {},
          cues: (specItem?.cues ?? [{ at: 0.3, kind: "title" }]).map((c) => ({
            at: c.at,
            kind: c.kind,
            ...(c.text ? { text: c.text } : {}),
            ...(c.sub ? { sub: c.sub } : {}),
            ...(c.data ? { data: c.data } : {}),
          })),
        }
        saveProgress({ stage: "frames", sceneDone: i, aiNote: `混合通道：分镜 ${i + 1}/${n}（code）${spec.grammar} · ${spec.theme ?? "paper"} 渲染中` })
        try {
          await renderArtClip(spec, clipPath, (p) => {
            saveProgress({ percent: Math.round(30 + (45 * (i + p.frameDone / Math.max(1, p.frameTotal))) / n) })
          })
        } catch (e) {
          console.warn(`[video] hybrid art 分镜 ${i + 1}（${grammar}）失败，回落 t2_keynote_ui：${(e as Error).message.slice(0, 120)}`)
          const fallbackSpec: ArtClipSpec = {
            grammar: "t2_keynote_ui",
            duration: spec.duration,
            fps: 30,
            width: L.w,
            height: L.h,
            theme: spec.theme ?? "paper",
            data: { title: storyboard.title, subtitle: scenes[i].subtitle },
            cues: [{ at: 0.3, kind: "title" }],
          }
          await renderArtClip(fallbackSpec, clipPath, (p) => {
            saveProgress({ percent: Math.round(30 + (45 * (i + p.frameDone / Math.max(1, p.frameTotal))) / n) })
          })
          saveProgress({ aiNote: `分镜 ${i + 1}（${grammar}）已回落 t2_keynote_ui：${(e as Error).message.slice(0, 60)}` })
        }
        await muxSegment(clipPath, audioFiles[i] || null, spec.duration, seg)
        segs.push(seg)
        segments.push({ sceneId: scenes[i].id, source: "code", seconds: Math.round(spec.duration * 10) / 10 })
        return
      }
      // motion 场景卡（与纯 motion 通道同配方）
      saveProgress({ stage: "frames", sceneDone: i, aiNote: `混合通道：分镜 ${i + 1}/${n}（code）motion 场景卡渲染中` })
      const svg = sceneSvg(scenes[i], i, n, storyboard, L)
      const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
      const frame = path.join(tmp, `f${i}.png`)
      await writeFile(frame, png)
      const fadeOut = Math.max(0, durations[i] - 0.25).toFixed(2)
      await execFileP(mustResolve("ffmpeg"), [
        "-y", "-loop", "1", "-framerate", "30", "-t", durations[i].toFixed(2), "-i", frame,
        ...(audioFiles[i] ? ["-i", audioFiles[i]] : ["-f", "lavfi", "-t", durations[i].toFixed(2), "-i", "anullsrc=r=24000:cl=mono"]),
        "-vf", `fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOut}:d=0.22,format=yuv420p`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
        "-t", durations[i].toFixed(2), "-shortest", seg,
      ], { timeout: 120_000 })
      segs.push(seg)
      segments.push({ sceneId: scenes[i].id, source: "code", seconds: Math.round(durations[i] * 10) / 10 })
    }

    if (channel === "agnes") {
      // ---- 通道 C：C1 AI 首帧 i2v 主轨（导演运动描述 + keyframe 模式 → 字幕烧录混音；失败单镜本地兜底） ----
      for (let i = 0; i < n; i++) {
        const raw = path.join(tmp, `raw${i}.mp4`)
        const seg = path.join(tmp, `s${i}.mp4`)
        const shot = plan?.shots.find((s) => s.sceneId === scenes[i].id)
        const kf = keyframes[i]
        try {
          saveProgress({
            stage: "submit",
            sceneDone: i,
            aiNote: `分镜 ${i + 1}/${n}：${kf ? `AI 首帧 i2v（${kf.source}）生成中` : "Agnes 文生视频生成中"}`,
          })
          // C1：运动描述（导演规划产出，不再是「visual+口播截断 500 字」的拼凑）
          const motionPrompt = shot
            ? [shot.motionZh, shot.motionEn].filter(Boolean).join("，") + "。保持首帧构图与色调，电影感平滑运动，画面不出现文字。"
            : undefined
          // 首帧转 dataURI（jpeg q85 控制 payload；keyframe 模式 = 首帧即第一帧）
          const firstFrame = kf
            ? `data:image/jpeg;base64,${(await sharp(kf.file).jpeg({ quality: 85 }).toBuffer()).toString("base64")}`
            : undefined
          await agnesSceneToMp4(
            scenes[i],
            durations[i],
            opts.aspect,
            raw,
            (waited) => {
              saveProgress({ stage: "poll", percent: Math.round(38 + (42 * (i + Math.min(1, waited / 60))) / n), aiNote: `分镜 ${i + 1}/${n}：Agnes i2v 生成中（已等 ${waited}s）` })
            },
            { runId, sceneId: scenes[i].id, firstFrame, motionPrompt },
          )
          saveProgress({ stage: "download", sceneDone: i + 1 })
          await diagRun(
            runId,
            "ffmpeg",
            () => muxSegment(raw, audioFiles[i] || null, durations[i], seg, { subtitle: { scene: scenes[i], style: subtitleStyle, dims }, pad: true }),
            { sceneId: scenes[i].id },
          )
          segs.push(seg)
          segments.push({ sceneId: scenes[i].id, source: "i2v", ...(kf ? { keyframe: kf.source } : {}), seconds: Math.round(durations[i] * 10) / 10 })
        } catch (e) {
          // 单场景失败 → 本地 motion 场景卡兜底（诚实留痕 + 失败段定位，不整片失败）
          console.warn(`[video] agnes 场景 ${i} 失败，回退本地：${(e as Error).message.slice(0, 120)}`)
          const svg = sceneSvg(scenes[i], i, n, storyboard, L)
          const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
          const frame = path.join(tmp, `f${i}.png`)
          await writeFile(frame, png)
          const localSeg = path.join(tmp, `sl${i}.mp4`)
          const fadeOut = Math.max(0, durations[i] - 0.25).toFixed(2)
          await diagRun(
            runId,
            "ffmpeg",
            () =>
              execFileP(
                mustResolve("ffmpeg"),
                [
                  "-y", "-loop", "1", "-framerate", "30", "-t", durations[i].toFixed(2), "-i", frame,
                  ...(audioFiles[i] ? ["-i", audioFiles[i]] : ["-f", "lavfi", "-t", durations[i].toFixed(2), "-i", "anullsrc=r=24000:cl=mono"]),
                  "-vf", `fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOut}:d=0.22,format=yuv420p`,
                  "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
                  "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
                  "-t", durations[i].toFixed(2), "-shortest", localSeg,
                ],
                { timeout: 120_000 },
              ),
            { sceneId: scenes[i].id },
          )
          segs.push(localSeg)
          segments.push({ sceneId: scenes[i].id, source: "code", seconds: Math.round(durations[i] * 10) / 10, error: (e as Error).message.slice(0, 120) })
          saveProgress({ aiNote: `分镜 ${i + 1} Agnes 失败已本地兜底：${(e as Error).message.slice(0, 60)}` })
        }
        saveProgress({ percent: Math.round(38 + (42 * (i + 1)) / n) })
      }
    } else if (channel === "hybrid") {
      // ---- 通道 D（P1 混合通道）：按分镜 render 标注分发 ----
      // code 分镜 → 本地代码动画（style=motion 场景卡 / art 艺术动画，确定可控零错字）
      // model 分镜 → Agnes AI 视频模型 5~10s 插播（实景/情绪 b-roll），失败单镜回落代码动画
      // 成本模型：模型秒数 = model 镜头时长之和 ≈ 全片的 1/4~1/3 → 单条成本 ≈ 纯模型 1/3
      let modelDone = 0
      let modelFallback = 0
      const specs = style === "art" ? await convertToArtSpecs(storyboard, opts.aspect) : []
      if (style === "art") saveProgress({ stage: "spec" })
      for (let i = 0; i < n; i++) {
        const seg = path.join(tmp, `s${i}.mp4`)
        if (agnesForScene(i)) {
          // ---- model 镜头：C1 AI 首帧 i2v（失败回落代码动画，诚实留痕） ----
          const raw = path.join(tmp, `raw${i}.mp4`)
          const shot = plan?.shots.find((s) => s.sceneId === scenes[i].id)
          const kf = keyframes[i]
          const modelDur = Math.min(12, Math.max(5, durations[i]))
          try {
            saveProgress({ stage: "submit", sceneDone: i, aiNote: `混合通道：分镜 ${i + 1}/${n}（model）${kf ? `AI 首帧 i2v（${kf.source}）` : "Agnes 文生视频"}生成中 · ${scenes[i].render === "model" ? "实景/情绪镜头" : ""}` })
            const motionPrompt = shot
              ? [shot.motionZh, shot.motionEn].filter(Boolean).join("，") + "。保持首帧构图与色调，电影感平滑运动，画面不出现文字。"
              : undefined
            const firstFrame = kf
              ? `data:image/jpeg;base64,${(await sharp(kf.file).jpeg({ quality: 85 }).toBuffer()).toString("base64")}`
              : undefined
            await agnesSceneToMp4(
              scenes[i],
              modelDur,
              opts.aspect,
              raw,
              (waited) => {
                saveProgress({ stage: "poll", percent: Math.round(38 + (42 * (i + Math.min(1, waited / 60))) / n), aiNote: `混合通道：分镜 ${i + 1}/${n}（model）Agnes i2v 生成中（已等 ${waited}s）` })
              },
              { runId, sceneId: scenes[i].id, firstFrame, motionPrompt },
            )
            saveProgress({ stage: "download", sceneDone: i + 1 })
            await diagRun(
              runId,
              "ffmpeg",
              () => muxSegment(raw, audioFiles[i] || null, durations[i], seg, { subtitle: { scene: scenes[i], style: subtitleStyle, dims }, pad: true }),
              { sceneId: scenes[i].id },
            )
            segs.push(seg)
            segments.push({ sceneId: scenes[i].id, source: "i2v", ...(kf ? { keyframe: kf.source } : {}), seconds: Math.round(durations[i] * 10) / 10 })
            modelDone++
          } catch (e) {
            modelFallback++
            console.warn(`[video] hybrid 分镜 ${i + 1}（model）Agnes 失败，回落代码动画：${(e as Error).message.slice(0, 120)}`)
            saveProgress({ aiNote: `分镜 ${i + 1}（model）Agnes 失败已回落代码动画：${(e as Error).message.slice(0, 60)}` })
            await renderLocalSceneSeg(i, seg, specs)
          }
        } else {
          // ---- code 镜头：本地代码动画 ----
          await renderLocalSceneSeg(i, seg, specs)
        }
        saveProgress({ percent: Math.round(30 + (50 * (i + 1)) / n) })
      }
      const modelOk = Math.max(0, modelDone)
      saveProgress({
        codeScenes: n - modelOk,
        modelScenes: modelOk,
        aiNote: aiNote || `混合通道完成：${n - modelOk} 镜代码动画 + ${modelOk} 镜 AI 模型${modelFallback > 0 ? `（${modelFallback} 镜回落代码）` : ""}｜模型秒数占比 ≈ ${Math.round((durations.reduce((s, d, i) => s + (scenes[i].render === "model" ? d : 0), 0) / Math.max(1, durations.reduce((s, d) => s + d, 0))) * 100)}%`,
      })
    } else if (style === "art") {
      // ---- 通道 B：艺术动画（LLM spec → Canvas 引擎逐帧 → 混音）----
      saveProgress({ stage: "spec" })
      const specs = await convertToArtSpecs(storyboard, opts.aspect)
      for (let i = 0; i < n; i++) {
        const specItem = specs.find((s) => s.sceneId === scenes[i].id) ?? specs[i]
        const clipPath = path.join(tmp, `c${i}.mp4`)
        const seg = path.join(tmp, `s${i}.mp4`)
        // y4_storytime：管线自动注入内置角色帧库（zai-image 生成，引擎按图片中心锚定脚部）
        const grammar = specItem?.grammar ?? "t2_keynote_ui"
        const spec: ArtClipSpec = {
          grammar,
          duration: Math.min(8, Math.max(2, durations[i])),
          fps: 30,
          width: L.w,
          height: L.h,
          theme: specItem?.theme ?? "paper",
          data:
            grammar === "y4_storytime"
              ? { ...(specItem?.data ?? {}), character: { frames: Y4_CHARACTER_FRAMES } }
              : specItem?.data ?? {},
          cues: (specItem?.cues ?? [{ at: 0.3, kind: "title" }]).map((c) => ({
            at: c.at,
            kind: c.kind,
            ...(c.text ? { text: c.text } : {}),
            ...(c.sub ? { sub: c.sub } : {}),
            ...(c.data ? { data: c.data } : {}),
          })),
        }
        saveProgress({ stage: "frames", sceneDone: i, aiNote: `分镜 ${i + 1}/${n}：${spec.grammar} · ${spec.theme ?? "paper"} 色板渲染中` })
        try {
          await renderArtClip(spec, clipPath, (p) => {
            saveProgress({ percent: Math.round(30 + (45 * (i + p.frameDone / Math.max(1, p.frameTotal))) / n) })
          })
        } catch (e) {
          // 单分镜引擎失败（如 y4 帧库资产缺失）→ 该分镜回落 t2_keynote_ui 文字卡，其余分镜不受影响
          console.warn(`[video] art 分镜 ${i + 1}（${grammar}）渲染失败，回落 t2_keynote_ui：${(e as Error).message.slice(0, 120)}`)
          const fallbackSpec: ArtClipSpec = {
            grammar: "t2_keynote_ui",
            duration: spec.duration,
            fps: 30,
            width: L.w,
            height: L.h,
            theme: spec.theme ?? "paper",
            data: { title: storyboard.title, subtitle: scenes[i].subtitle },
            cues: [{ at: 0.3, kind: "title" }],
          }
          await renderArtClip(fallbackSpec, clipPath, (p) => {
            saveProgress({ percent: Math.round(30 + (45 * (i + p.frameDone / Math.max(1, p.frameTotal))) / n) })
          })
          saveProgress({ aiNote: `分镜 ${i + 1}（${grammar}）已回落 t2_keynote_ui：${(e as Error).message.slice(0, 60)}` })
        }
        await muxSegment(clipPath, audioFiles[i] || null, spec.duration, seg)
        segs.push(seg)
        segments.push({ sceneId: scenes[i].id, source: "code", seconds: Math.round(spec.duration * 10) / 10 })
        saveProgress({ sceneDone: i + 1, percent: Math.round(30 + (50 * (i + 1)) / n) })
      }
    } else {
      // ---- 通道 A：motion 商业片（SVG 场景卡）----
      saveProgress({ stage: "frames" })
      for (let i = 0; i < n; i++) {
        const svg = sceneSvg(scenes[i], i, n, storyboard, L)
        const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
        await writeFile(path.join(tmp, `f${i}.png`), png)
        saveProgress({ sceneDone: i + 1, percent: Math.round(30 + (20 * (i + 1)) / n) })
      }
      saveProgress({ stage: "encode", sceneDone: 0 })
      for (let i = 0; i < n; i++) {
        const dur = durations[i]
        const seg = path.join(tmp, `s${i}.mp4`)
        const fadeOut = Math.max(0, dur - 0.25).toFixed(2)
        const args = [
          "-y", "-loop", "1", "-framerate", "30", "-t", dur.toFixed(2), "-i", path.join(tmp, `f${i}.png`),
          ...(audioFiles[i] ? ["-i", audioFiles[i]] : ["-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=r=24000:cl=mono"]),
          "-vf", `fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOut}:d=0.22,format=yuv420p`,
          "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
          "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
          "-t", dur.toFixed(2), "-shortest", seg,
        ]
        await execFileP(mustResolve("ffmpeg"), args, { timeout: 120_000 })
        segs.push(seg)
        segments.push({ sceneId: scenes[i].id, source: "code", seconds: Math.round(dur * 10) / 10 })
        saveProgress({ sceneDone: i + 1, percent: Math.round(50 + (40 * (i + 1)) / n) })
      }
    }

    // ===== Stage 3: concat 合成 + 校验（C6 分腿留痕） =====
    saveProgress({ stage: "concat", percent: 93 })
    const listFile = path.join(tmp, "list.txt")
    await writeFile(listFile, segs.map((s) => `file '${s}'`).join("\n"))
    const outPath = finalPath
    await diagRun(
      runId,
      "concat",
      () => execFileP(mustResolve("ffmpeg"), ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", outPath], { timeout: 120_000 }),
      { detail: `${segs.length} 段` },
    )

    // ===== Stage 3.5: BGM 本地合成混音（C5 六预设；口播为主 BGM 垫底） =====
    let bgmNote = ""
    if (bgm !== "none") {
      saveProgress({ stage: "concat", percent: 96, bgmNote: `${BGM_PRESETS[bgm].label}合成中…` })
      const mixed = path.join(tmp, "mixed.mp4")
      try {
        await diagRun(runId, "bgm", () => mixBgm(outPath, bgm, ttsOk > 0, mixed))
        await copyFile(mixed, finalPath)
        bgmNote = `${BGM_PRESETS[bgm].label}已混音${ttsOk > 0 ? "（口播为主、BGM 垫底）" : "（字幕主导模式片，BGM 为主音轨）"}`
      } catch (e) {
        diagRecord(runId, "bgm", false, 0, { error: (e as Error).message })
        bgmNote = `BGM 混音失败（已回退无配乐）：${(e as Error).message.slice(0, 80)}`
      }
    }

    // ===== Stage 3.6: 场景分段留存（指着改的物料） =====
    const segDir = segDirFor(runId)
    try {
      await mkdir(segDir, { recursive: true })
      for (let i = 0; i < n; i++) await copyFile(segs[i], path.join(segDir, `s${i}.mp4`))
    } catch (e) {
      console.warn(`[video] 分段留存失败（指着改将不可用）：${(e as Error).message.slice(0, 120)}`)
    }

    let seconds = await ffprobeSeconds(finalPath)
    if (seconds < 3) throw new Error(`合成校验失败：成片仅 ${seconds.toFixed(1)}s`)

    await rm(tmp, { recursive: true, force: true })

    const size = (await stat(finalPath)).size
    // C1/C6 收口留痕：每镜头来源构成 + 首帧质量统计 + 分腿诊断汇总（「i2v 片段占比 ≥80%」验收凭证）
    const i2vSegs = segments.filter((s) => s.source === "i2v").length
    saveProgress({
      stage: "done", percent: 100,
      seconds: Math.round(seconds * 10) / 10,
      width: dims.w, height: dims.h, sizeBytes: size,
      durations: durations.map((d) => Math.round(d * 10) / 10),
      segments,
      ...(i2vSegs > 0 ? { aiNote: `${aiNote ? aiNote + "｜" : ""}i2v 主轨 ${i2vSegs}/${segments.length} 镜（占 ${Math.round((i2vSegs / Math.max(1, segments.length)) * 100)}%）` } : {}),
      ...(bgm !== "none" ? { bgmNote } : {}),
      diag: diagSummary(runId),
    })
    await db.asset.update({
      where: { id: assetId },
      data: {
        path: path.join("/assets", path.basename(finalPath)),
        provider:
          channel === "agnes"
            ? `agnes-i2v(${i2vSegs}i2v+${segments.length - i2vSegs}code)${ttsOk > 0 ? "+tts" : "+字幕主导"}${bgm !== "none" ? "+bgm" : ""}`
            : channel === "hybrid"
              ? `hybrid(${(progress.codeScenes ?? 0)}code+${(progress.modelScenes ?? 0)}model·i2v)${ttsOk > 0 ? "+tts" : ""}${bgm !== "none" ? "+bgm" : ""}`
              : style === "art"
                ? `art-motion${ttsOk > 0 ? "+tts" : ""}${bgm !== "none" ? "+bgm" : ""}`
                : `ffmpeg${ttsOk > 0 ? "+tts" : "+字幕主导"}${bgm !== "none" ? "+bgm" : ""}`,
      },
    })
  } catch (e) {
    saveProgress({ stage: "error", error: (e as Error).message.slice(0, 300) })
    await db.asset
      .update({ where: { id: assetId }, data: { error: (e as Error).message.slice(0, 300) } })
      .catch(() => {})
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

// ============================================================
// 指着改（学 huashu-motion studio）：用户对着成片提意见 → 只重渲染
// 被指的分镜 → 与留存分段重新 concat → 新版本成片（版本树 + 留痕）
// ============================================================

export interface ReviseOpts {
  sceneId: number
  feedback: string
  voice: string
  aspect: VideoAspect
  style: VideoStyle
  bgm: BgmPreset
  /** 基线版本的 meta（承接 versions/revisions 链与 durations） */
  baseVersion: number
  baseDurations: number[]
  baseRevisions: SceneRevision[]
}

const inflightRevise = new Set<string>()

export function startSceneReviseInBackground(runId: string, assetId: string, storyboard: Storyboard, opts: ReviseOpts): void {
  const key = `${runId}:${assetId}`
  if (inflightRevise.has(key)) return
  inflightRevise.add(key)
  void reviseSceneVideo(runId, assetId, storyboard, opts).finally(() => inflightRevise.delete(key))
}

async function reviseSceneVideo(runId: string, assetId: string, storyboard: Storyboard, opts: ReviseOpts): Promise<void> {
  // C5：指着改同样吃分辨率档位（与整片一致；族能力闸门同 renderVideo）
  const revSettings = await getSettings(true)
  const revResolution: VideoResolution = videoFamilyForModel(revSettings.video.model || revSettings.agnes.videoModel).resolutions.includes(
    revSettings.video.resolution,
  )
    ? revSettings.video.resolution
    : "720P"
  const L = scaledLayout(opts.aspect, revResolution)
  const idx = storyboard.scenes.findIndex((s) => s.id === opts.sceneId)
  const tmp = path.join(TMP_ROOT, `rev-${runId.slice(-8)}-${assetId.slice(-8)}`)
  const version = (await latestVideoVersion(runId, assetId)) + 1
  const finalPath = videoPathFor(runId, version)
  const segDir = segDirFor(runId)
  const sceneTotal = storyboard.scenes.length

  const progress: RenderProgress = {
    stage: "queued", percent: 0, sceneDone: 0, sceneTotal,
    audioMode: "pending", voice: opts.voice, aspect: opts.aspect,
    style: opts.style, channel: "local", version,
    ...(opts.bgm !== "none" ? { bgm: opts.bgm } : {}),
  }
  let baseMeta: Record<string, unknown> = {}
  try {
    const asset = await db.asset.findUnique({ where: { id: assetId } })
    if (asset) baseMeta = JSON.parse(asset.meta) as Record<string, unknown>
  } catch {
    /* meta 损坏则从空开始 */
  }
  const saveProgress = (patch: Partial<RenderProgress>) => {
    Object.assign(progress, patch)
    void db.asset.update({ where: { id: assetId }, data: { meta: JSON.stringify({ ...baseMeta, ...progress }) } }).catch(() => {})
  }

  let newStoryboard = storyboard
  try {
    if (idx < 0) throw new Error(`找不到分镜 #${opts.sceneId}`)
    await mkdir(tmp, { recursive: true })

    // ---- 0. 校验分段物料在（v3 渲染起才留存；旧版本诚实提示） ----
    const segFiles = storyboard.scenes.map((_, i) => path.join(segDir, `s${i}.mp4`))
    for (const f of segFiles) {
      try {
        await stat(f)
      } catch {
        throw new Error("该视频未留存场景分段（旧版渲染产物），请先整体重新渲染一次以启用指着改")
      }
    }

    // ---- 1. LLM 修订该场景（严格只动被指的分镜） ----
    saveProgress({ stage: "revise", percent: 5, aiNote: `剪辑师正在按意见修改分镜 #${opts.sceneId}…` })
    const scene = storyboard.scenes[idx]
    let revised: { scene: StoryboardScene; reason: string }
    try {
      const raw = await chatRetry(sceneReviseMessages(scene, storyboard, opts.feedback), { temperature: 0.4 })
      revised = parseSceneRevision(extractJson(raw) ?? raw, scene)
    } catch (e) {
      throw new Error(`分镜修订失败：${(e as Error).message.slice(0, 120)}`)
    }
    newStoryboard = { ...storyboard, scenes: storyboard.scenes.map((s) => (s.id === opts.sceneId ? revised.scene : s)) }

    // ---- 2. 该场景重做：TTS → 分段 ----
    saveProgress({ stage: "tts", percent: 20, aiNote: `分镜 #${opts.sceneId} 新口播合成中…` })
    const wav = path.join(tmp, "a.wav")
    const ttsOk = revised.scene.narration.trim() ? await ttsWav(revised.scene.narration, opts.voice, wav) : false
    const dur = ttsOk ? Math.max(1, await ffprobeSeconds(wav)) : Math.min(15, Math.max(2, revised.scene.seconds))
    const newSeg = path.join(tmp, "s-new.mp4")

    saveProgress({ stage: "frames", percent: 45, aiNote: `分镜 #${opts.sceneId} 重新渲染（${opts.style === "art" ? "art 引擎" : "motion 场景卡"}）…` })
    if (opts.style === "art") {
      // art 线：重新转换全片 spec，取被修订场景的 spec（转换秒级，视觉语法保持）
      const specs = await convertToArtSpecs(newStoryboard, opts.aspect)
      const specItem = specs.find((s) => s.sceneId === revised.scene.id) ?? specs[idx]
      const clipPath = path.join(tmp, "c.mp4")
      const reviseGrammar = specItem?.grammar ?? "t2_keynote_ui"
      const spec: ArtClipSpec = {
        grammar: reviseGrammar,
        duration: Math.min(8, Math.max(2, dur)),
        fps: 30, width: L.w, height: L.h,
        theme: specItem?.theme ?? "paper",
        data:
          reviseGrammar === "y4_storytime"
            ? { ...(specItem?.data ?? {}), character: { frames: Y4_CHARACTER_FRAMES } }
            : specItem?.data ?? {},
        cues: (specItem?.cues ?? [{ at: 0.3, kind: "title" }]).map((c) => ({
          at: c.at, kind: c.kind,
          ...(c.text ? { text: c.text } : {}),
          ...(c.sub ? { sub: c.sub } : {}),
          ...(c.data ? { data: c.data } : {}),
        })),
      }
      await renderArtClip(spec, clipPath, (p) => {
        saveProgress({ percent: Math.round(45 + (30 * p.frameDone) / Math.max(1, p.frameTotal)) })
      })
      await muxSegment(clipPath, ttsOk ? wav : null, spec.duration, newSeg)
    } else {
      // motion 线：方向调色板场景卡（与整片一致）
      const svg = sceneSvg(revised.scene, idx, sceneTotal, newStoryboard, L)
      const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
      const frame = path.join(tmp, "f.png")
      await writeFile(frame, png)
      const fadeOut = Math.max(0, dur - 0.25).toFixed(2)
      await execFileP(mustResolve("ffmpeg"), [
        "-y", "-loop", "1", "-framerate", "30", "-t", dur.toFixed(2), "-i", frame,
        ...(ttsOk ? ["-i", wav] : ["-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=r=24000:cl=mono"]),
        "-vf", `fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOut}:d=0.22,format=yuv420p`,
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
        "-t", dur.toFixed(2), "-shortest", newSeg,
      ], { timeout: 120_000 })
    }

    // ---- 3. 与既有分段重新 concat → 新版本成片 ----
    saveProgress({ stage: "concat", percent: 80, aiNote: "时间线重新合成…" })
    const listFile = path.join(tmp, "list.txt")
    await writeFile(listFile, segFiles.map((f, i) => `file '${i === idx ? newSeg : f}'`).join("\n"))
    await execFileP(mustResolve("ffmpeg"), ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", finalPath], { timeout: 120_000 })

    // ---- 3.5 BGM 混音（可选） ----
    let bgmNote = ""
    if (opts.bgm !== "none") {
      const mixed = path.join(tmp, "mixed.mp4")
      try {
        await mixBgm(finalPath, opts.bgm, ttsOk, mixed)
        await copyFile(mixed, finalPath)
        bgmNote = `${BGM_PRESETS[opts.bgm].label}已混音`
      } catch (e) {
        bgmNote = `BGM 混音失败（回退无配乐）：${(e as Error).message.slice(0, 60)}`
      }
    }

    // ---- 4. 分段目录同步（后续修订继续可用） ----
    await copyFile(newSeg, path.join(segDir, `s${idx}.mp4`))

    const seconds = await ffprobeSeconds(finalPath)
    if (seconds < 3) throw new Error(`合成校验失败：成片仅 ${seconds.toFixed(1)}s`)
    await rm(tmp, { recursive: true, force: true })

    const durations = [...opts.baseDurations]
    while (durations.length < sceneTotal) durations.push(storyboard.scenes[durations.length]?.seconds ?? 4)
    durations[idx] = Math.round(dur * 10) / 10
    const revisions: SceneRevision[] = [
      ...opts.baseRevisions,
      { sceneId: opts.sceneId, feedback: opts.feedback.slice(0, 200), reason: revised.reason, at: new Date().toISOString() },
    ]

    const size = (await stat(finalPath)).size
    saveProgress({
      stage: "done", percent: 100,
      seconds: Math.round(seconds * 10) / 10,
      width: L.w, height: L.h, sizeBytes: size,
      storyboard: newStoryboard,
      durations,
      revisions,
      audioMode: ttsOk ? "tts" : "muted",
      ttsNote: ttsOk ? "修订分镜口播已更新" : "TTS 不可达（该分镜静音降级，字幕可读）",
      aiNote: `v${version}：分镜 #${opts.sceneId} 已按意见重做（${revised.reason}）`,
      ...(bgmNote ? { bgmNote } : {}),
    })
    await db.asset.update({
      where: { id: assetId },
      data: {
        path: path.join("/assets", path.basename(finalPath)),
        provider: `${opts.style === "art" ? "art-motion" : "ffmpeg"}+revise${ttsOk ? "+tts" : ""}${opts.bgm !== "none" ? "+bgm" : ""}`,
      },
    })
  } catch (e) {
    saveProgress({ stage: "error", error: (e as Error).message.slice(0, 300) })
    await db.asset
      .update({ where: { id: assetId }, data: { error: (e as Error).message.slice(0, 300) } })
      .catch(() => {})
    await rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}
