// ============================================================
// video.ts —— 视频成片渲染引擎 v2（三通道）
// 通道 A（motion 商业片）：storyboard → SVG 场景卡（sharp 栅格化）
//   → 每场景 TTS 口播 → ffmpeg 分段（淡入淡出）→ concat
// 通道 B（art 艺术动画）：storyboard → LLM 转 clip spec（8 语法×8 色板）
//   → huashu-art-motion Canvas 引擎（Playwright 逐帧）→ 分段 → 混音 → concat
// 通道 C（agnes AI 模型）：storyboard → agnes-video 提交/轮询/下载
//   → 混音 → concat（学 dsh 协议族；每账号 1 任务/分钟）
// TTS 端点不可达时诚实降级为静音+计划时长，字幕可读。
// Asset.meta 全程留痕（stage / percent / style / channel）。
// ============================================================

import { db } from "@/lib/db"
import { execFile } from "child_process"
import { mkdir, rm, stat, writeFile } from "fs/promises"
import { promisify } from "util"
import path from "path"
import sharp from "sharp"
import type { Storyboard, StoryboardScene, ArtSpecItem } from "./skills/radar-rewrite"
import { artSpecMessages, parseArtSpecs } from "./skills/radar-rewrite"
import { renderArtClip, type ArtClipSpec } from "./art-engine"
import { chatRetry } from "@/lib/gateway"
import { registry } from "@/lib/gateway/registry"
import { getSettings } from "@/lib/settings"
import { extractJson } from "./json"

const execFileP = promisify(execFile)

const ASSET_DIR = "/home/z/my-project/public/assets"
const TMP_ROOT = "/home/z/my-project/.videotmp"

export type VideoAspect = "9:16" | "16:9"
export type VideoStyle = "motion" | "art"
export type VideoChannel = "local" | "agnes" | "auto"

export interface RenderProgress {
  stage: "queued" | "tts" | "spec" | "frames" | "submit" | "poll" | "download" | "encode" | "concat" | "done" | "error"
  percent: number
  sceneDone: number
  sceneTotal: number
  audioMode: "pending" | "tts" | "partial" | "muted"
  ttsNote?: string
  voice: string
  aspect: VideoAspect
  /** 渲染风格：motion 商业片 / art 艺术动画 */
  style: VideoStyle
  /** 实际通道（auto 解析后）：local / agnes */
  channel: "local" | "agnes"
  aiNote?: string
  seconds?: number
  width?: number
  height?: number
  sizeBytes?: number
  error?: string
  storyboard?: Storyboard
}

// ---------- 文本工具 ----------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** CJK 按字符数折行（无空格语义），返回至多 maxLines 行 */
function wrapCJK(text: string, max: number, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, " ").trim()
  if (!clean) return []
  const lines: string[] = []
  let cur = ""
  for (const ch of clean) {
    if (cur.length >= max) {
      lines.push(cur)
      cur = ""
      if (lines.length >= maxLines) break
    }
    cur += ch
  }
  if (cur && lines.length < maxLines) lines.push(cur)
  if (lines.length === maxLines && clean.length > max * maxLines) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…"
  }
  return lines.length > 0 ? lines : [clean.slice(0, max)]
}

// ---------- 场景卡 SVG（motion 商业片线，品牌化设计，两档画幅） ----------

interface Layout {
  w: number
  h: number
  brandY: number
  titleFont: number
  titleLh: number
  titleWrap: number
  subFont: number
  subLh: number
  subWrap: number
  subY: number
  hookFont: number
  hookY: number
  narrFont: number
  narrLh: number
  narrWrap: number
  narrY: number
  dotsY: number
  footerY: number
}

const LAYOUTS: Record<VideoAspect, Layout> = {
  "9:16": {
    w: 720, h: 1280, brandY: 96,
    titleFont: 58, titleLh: 76, titleWrap: 10,
    subFont: 64, subLh: 84, subWrap: 10, subY: 560,
    hookFont: 30, hookY: 700,
    narrFont: 26, narrLh: 40, narrWrap: 22, narrY: 900,
    dotsY: 1140, footerY: 1204,
  },
  "16:9": {
    w: 1280, h: 720, brandY: 64,
    titleFont: 48, titleLh: 62, titleWrap: 18,
    subFont: 54, subLh: 68, subWrap: 16, subY: 330,
    hookFont: 26, hookY: 430,
    narrFont: 22, narrLh: 34, narrWrap: 40, narrY: 520,
    dotsY: 640, footerY: 688,
  },
}

function sceneSvg(scene: StoryboardScene, i: number, n: number, sb: Storyboard, aspect: VideoAspect): string {
  const L = LAYOUTS[aspect]
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
    const fill = k < i ? "#f59e0b99" : k === i ? "#f59e0b" : "#47556966"
    dots.push(`<circle cx="${x}" cy="${L.dotsY}" r="6" fill="${fill}"/>`)
  }

  const texts: string[] = []
  texts.push(
    `<text x="${L.w - 40}" y="${L.brandY}" font-family="Sarasa Mono SC" font-size="20" fill="#64748b" text-anchor="end">SCENE ${String(i + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}</text>`,
  )
  if (isFirst) {
    texts.push(`<text x="40" y="${L.brandY}" font-family="Noto Sans SC" font-weight="700" font-size="24" fill="#f59e0b">AI 资讯雷达</text>`)
    texts.push(`<text x="${cx}" y="${L.subY - 120}" font-family="Noto Sans SC" font-size="${L.hookFont}" fill="#94a3b8" text-anchor="middle">${esc(sb.hook)}</text>`)
  } else {
    texts.push(`<text x="40" y="${L.brandY}" font-family="Noto Sans SC" font-size="22" fill="#94a3b8">AI 资讯雷达</text>`)
  }
  texts.push(`<rect x="${cx - 30}" y="${bigStartY - bigFont - 28}" width="60" height="4" rx="2" fill="#f59e0b"/>`)
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
      <stop offset="0" stop-color="#0b1220"/><stop offset="1" stop-color="#1e293b"/>
    </linearGradient>
    <radialGradient id="glowA" cx="0.82" cy="0.16" r="0.5">
      <stop offset="0" stop-color="#f59e0b" stop-opacity="0.14"/><stop offset="1" stop-color="#f59e0b" stop-opacity="0"/>
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
  const { stdout } = await execFileP("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file])
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

// ---------- 渲染主流程 ----------

const inflightVideo = new Set<string>()

export function startVideoRenderInBackground(
  runId: string,
  assetId: string,
  storyboard: Storyboard,
  opts: { voice: string; aspect: VideoAspect; style?: VideoStyle; channel?: VideoChannel },
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

/** Agnes 通道：单场景 提交→轮询→下载 */
async function agnesSceneToMp4(
  scene: StoryboardScene,
  seconds: number,
  aspect: VideoAspect,
  outFile: string,
  onWait: (waited: number) => void,
): Promise<string> {
  const p = registry.get("agnes-video")
  if (p.kind !== "VIDEO" || !p.submitVideo || !p.getVideoTask) throw new Error("agnes-video provider 未就绪")
  const prompt = `${scene.visual}。口播要点：${scene.narration}`.slice(0, 500)
  const task = await p.submitVideo({
    prompt,
    mode: "text",
    seconds,
    aspectRatio: aspect === "9:16" ? "9:16" : "16:9",
  })
  const deadline = Date.now() + 10 * 60_000
  let waited = 0
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 8000))
    waited += 8
    onWait(waited)
    const t = await p.getVideoTask(task.remoteTaskId ?? task.id)
    if (t.status === "completed" && t.resultUrl) {
      const res = await fetch(t.resultUrl, { signal: AbortSignal.timeout(120_000) })
      if (!res.ok) throw new Error(`下载成片失败：HTTP ${res.status}`)
      const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()))
      if (buf.length < 10_000) throw new Error(`成片过小（${buf.length}B）`)
      await writeFile(outFile, buf)
      return outFile
    }
    if (t.status === "failed") throw new Error(`Agnes 生成失败：${t.error ?? "未知"}`)
  }
  throw new Error("Agnes 轮询超时（10 分钟）")
}

/** 分段混音：视频段 + 音频（无音 → 静音轨）→ 统一参数分段 */
async function muxSegment(videoIn: string, audioIn: string | null, dur: number, outFile: string): Promise<void> {
  const args = [
    "-y", "-i", videoIn,
    ...(audioIn ? ["-i", audioIn] : ["-f", "lavfi", "-t", dur.toFixed(2), "-i", "anullsrc=r=24000:cl=mono"]),
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
    "-vf", "format=yuv420p",
    "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
    "-t", dur.toFixed(2), "-shortest",
    outFile,
  ]
  await execFileP("ffmpeg", args, { timeout: 120_000 })
}

async function renderVideo(
  runId: string,
  assetId: string,
  storyboard: Storyboard,
  opts: { voice: string; aspect: VideoAspect; style?: VideoStyle; channel?: VideoChannel },
): Promise<void> {
  const L = LAYOUTS[opts.aspect]
  const scenes = storyboard.scenes
  const n = scenes.length
  const style: VideoStyle = opts.style ?? "motion"
  const tmp = path.join(TMP_ROOT, `${runId.slice(-8)}-${assetId.slice(-8)}`)
  const finalPath = path.join(ASSET_DIR, `video-${runId}.mp4`)

  // ---- 通道解析（settings 默认 + 请求覆盖；auto = agnes 可用则 agnes）----
  const settings = await getSettings(true)
  const channelChoice: VideoChannel = opts.channel ?? settings.video.channel
  const agnesReady = (() => {
    const p = registry.get("agnes-video")
    return p.kind === "VIDEO" && p.isConfigured() && Boolean(p.submitVideo)
  })()
  let channel: "local" | "agnes" = channelChoice === "agnes" ? "agnes" : channelChoice === "auto" ? (agnesReady ? "agnes" : "local") : "local"
  let aiNote = ""
  if (channelChoice === "agnes" && !agnesReady) {
    channel = "local"
    aiNote = "Agnes 未配置（账号池为空或未启用）→ 已回退本地渲染"
  } else if (channelChoice === "auto" && !agnesReady) {
    aiNote = "auto：Agnes 未配置 → 本地渲染"
  }

  const progress: RenderProgress = {
    stage: "queued", percent: 0, sceneDone: 0, sceneTotal: n,
    audioMode: "pending", voice: opts.voice, aspect: opts.aspect,
    style: channel === "agnes" ? style : style, channel,
    ...(aiNote ? { aiNote } : {}),
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

    // ===== Stage 1: TTS 口播（失败 → 静音降级，字幕可读） =====
    saveProgress({ stage: "tts" })
    let ttsOk = 0
    let ttsDown = false
    let ttsNote = ""
    const durations: number[] = []
    const audioFiles: string[] = []
    for (let i = 0; i < n; i++) {
      const wav = path.join(tmp, `a${i}.wav`)
      let ok = false
      if (!ttsDown && scenes[i].narration.trim()) {
        ok = await ttsWav(scenes[i].narration, opts.voice, wav)
        if (!ok) {
          ttsDown = true
          ttsNote = "TTS 端点不可达（已静音降级：按分镜计划时长出片，口播字幕已烧录，可正常观看）"
        }
      }
      if (ok) {
        ttsOk++
        durations.push(Math.max(1, await ffprobeSeconds(wav)))
        audioFiles.push(wav)
      } else {
        const planned = channel === "agnes" ? settings.video.secondsPerScene : Math.min(15, Math.max(2, scenes[i].seconds))
        durations.push(planned)
        audioFiles.push("")
      }
      saveProgress({ sceneDone: i + 1, percent: Math.round(5 + (25 * (i + 1)) / n) })
    }
    saveProgress({
      audioMode: ttsOk === n ? "tts" : ttsOk > 0 ? "partial" : "muted",
      ttsNote: ttsOk === n ? "全部分镜 TTS 口播完成" : ttsNote || `${ttsOk}/${n} 分镜有口播`,
      sceneDone: 0,
    })

    // ===== Stage 2: 分段生成（三通道分叉） =====
    const segs: string[] = []

    if (channel === "agnes") {
      // ---- 通道 C：Agnes AI 视频模型（逐场景提交→轮询→下载→混音）----
      for (let i = 0; i < n; i++) {
        const raw = path.join(tmp, `raw${i}.mp4`)
        const seg = path.join(tmp, `s${i}.mp4`)
        try {
          saveProgress({ stage: "submit", sceneDone: i })
          await agnesSceneToMp4(scenes[i], durations[i], opts.aspect, raw, (waited) => {
            saveProgress({ stage: "poll", percent: Math.round(30 + (45 * (i + Math.min(1, waited / 60))) / n), aiNote: `分镜 ${i + 1}/${n}：Agnes 生成中（已等 ${waited}s）` })
          })
          saveProgress({ stage: "download", sceneDone: i + 1 })
          await muxSegment(raw, audioFiles[i] || null, durations[i], seg)
          segs.push(seg)
        } catch (e) {
          // 单场景失败 → 本地 motion 场景卡兜底（诚实留痕，不整片失败）
          console.warn(`[video] agnes 场景 ${i} 失败，回退本地：${(e as Error).message.slice(0, 120)}`)
          const svg = sceneSvg(scenes[i], i, n, storyboard, opts.aspect)
          const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer()
          const frame = path.join(tmp, `f${i}.png`)
          await writeFile(frame, png)
          const localSeg = path.join(tmp, `sl${i}.mp4`)
          const fadeOut = Math.max(0, durations[i] - 0.25).toFixed(2)
          await execFileP("ffmpeg", [
            "-y", "-loop", "1", "-framerate", "30", "-t", durations[i].toFixed(2), "-i", frame,
            ...(audioFiles[i] ? ["-i", audioFiles[i]] : ["-f", "lavfi", "-t", durations[i].toFixed(2), "-i", "anullsrc=r=24000:cl=mono"]),
            "-vf", `fade=t=in:st=0:d=0.22,fade=t=out:st=${fadeOut}:d=0.22,format=yuv420p`,
            "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
            "-c:a", "aac", "-b:a", "96k", "-ar", "24000", "-ac", "1",
            "-t", durations[i].toFixed(2), "-shortest", localSeg,
          ], { timeout: 120_000 })
          segs.push(localSeg)
          saveProgress({ aiNote: `分镜 ${i + 1} Agnes 失败已本地兜底：${(e as Error).message.slice(0, 60)}` })
        }
        saveProgress({ percent: Math.round(30 + (50 * (i + 1)) / n) })
      }
    } else if (style === "art") {
      // ---- 通道 B：艺术动画（LLM spec → Canvas 引擎逐帧 → 混音）----
      saveProgress({ stage: "spec" })
      const specs = await convertToArtSpecs(storyboard, opts.aspect)
      for (let i = 0; i < n; i++) {
        const specItem = specs.find((s) => s.sceneId === scenes[i].id) ?? specs[i]
        const clipPath = path.join(tmp, `c${i}.mp4`)
        const seg = path.join(tmp, `s${i}.mp4`)
        const spec: ArtClipSpec = {
          grammar: specItem?.grammar ?? "t2_keynote_ui",
          duration: Math.min(8, Math.max(2, durations[i])),
          fps: 30,
          width: L.w,
          height: L.h,
          theme: specItem?.theme ?? "paper",
          data: specItem?.data ?? {},
          cues: (specItem?.cues ?? [{ at: 0.3, kind: "title" }]).map((c) => ({
            at: c.at,
            kind: c.kind,
            ...(c.text ? { text: c.text } : {}),
            ...(c.sub ? { sub: c.sub } : {}),
            ...(c.data ? { data: c.data } : {}),
          })),
        }
        saveProgress({ stage: "frames", sceneDone: i, aiNote: `分镜 ${i + 1}/${n}：${spec.grammar} · ${spec.theme ?? "paper"} 色板渲染中` })
        await renderArtClip(spec, clipPath, (p) => {
          saveProgress({ percent: Math.round(30 + (45 * (i + p.frameDone / Math.max(1, p.frameTotal))) / n) })
        })
        await muxSegment(clipPath, audioFiles[i] || null, spec.duration, seg)
        segs.push(seg)
        saveProgress({ sceneDone: i + 1, percent: Math.round(30 + (50 * (i + 1)) / n) })
      }
    } else {
      // ---- 通道 A：motion 商业片（SVG 场景卡）----
      saveProgress({ stage: "frames" })
      for (let i = 0; i < n; i++) {
        const svg = sceneSvg(scenes[i], i, n, storyboard, opts.aspect)
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
        await execFileP("ffmpeg", args, { timeout: 120_000 })
        segs.push(seg)
        saveProgress({ sceneDone: i + 1, percent: Math.round(50 + (40 * (i + 1)) / n) })
      }
    }

    // ===== Stage 3: concat 合成 + 校验 =====
    saveProgress({ stage: "concat", percent: 93 })
    const listFile = path.join(tmp, "list.txt")
    await writeFile(listFile, segs.map((s) => `file '${s}'`).join("\n"))
    await execFileP("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listFile, "-c", "copy", finalPath], { timeout: 120_000 })
    const seconds = await ffprobeSeconds(finalPath)
    if (seconds < 3) throw new Error(`合成校验失败：成片仅 ${seconds.toFixed(1)}s`)

    await rm(tmp, { recursive: true, force: true })

    const size = (await stat(finalPath)).size
    saveProgress({
      stage: "done", percent: 100,
      seconds: Math.round(seconds * 10) / 10,
      width: L.w, height: L.h, sizeBytes: size,
    })
    await db.asset.update({
      where: { id: assetId },
      data: {
        path: `/assets/video-${runId}.mp4`,
        provider: channel === "agnes" ? `agnes-video${ttsOk > 0 ? "+tts" : ""}` : style === "art" ? `art-motion${ttsOk > 0 ? "+tts" : ""}` : `ffmpeg${ttsOk > 0 ? "+tts" : "+tts(降级)"}`,
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
