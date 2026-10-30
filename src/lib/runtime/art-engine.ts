// ============================================================
// art-engine.ts —— 艺术动画线渲染引擎（huashu-art-motion 移植，MIT）
// 引擎 vendored 于 public/engine/art-motion/（Canvas2D 确定性绘制：
// 时间 t → 一帧纯函数）。渲染链（同上游 render.py）：
//   本地 HTTP 静态服务 → Playwright Chromium 打开 clip.html?render=1
//   → 注入 window.CLIP_SPEC → 每帧 window.renderFrame(t)
//   → canvas.toDataURL → PNG 管道送 ffmpeg → H.264 MP4
// 8 语法 × 8 色板 × finish 后期；spec 契约见 clip_schema.json。
// ============================================================

import { chromium } from "playwright"
import { spawn, type ChildProcessWithoutNullStreams } from "child_process"
import { createServer } from "http"
import { readFile, mkdir, stat } from "fs/promises"
import path from "path"

const ENGINE_DIR = "/home/z/my-project/public/engine/art-motion"

// ---------- clip spec 契约（clip_schema.json 的 TS 化子集） ----------

export interface ArtClipCue {
  at: number
  kind: string
  text?: string
  sub?: string
  data?: Record<string, unknown>
}

export interface ArtClipSpec {
  grammar: string
  duration: number
  fps?: number
  width: number
  height: number
  theme?: string
  finish?: string
  safe?: Record<string, number>
  data: Record<string, unknown>
  cues?: ArtClipCue[]
}

/** 8 解说语法（供 LLM 生成 spec 时的约束与 UI 选择器） */
export const ART_GRAMMARS: Record<string, { label: string; desc: string }> = {
  t1_3b1b: { label: "公式讲解", desc: "manim 式公式形变 / 数字推导（3Blue1Brown 风）" },
  t2_keynote_ui: { label: "发布会卡片", desc: "大标题卡片 / 步骤卡 / 数字强调（Keynote 风）" },
  t3_finance_chart: { label: "财经图表", desc: "柱/线图先轴后数据，只标一件事（Vox 财经风）" },
  y1_kurzgesagt: { label: "科普穿行", desc: "尺度穿行 / 场景揭示（Kurzgesagt 风）" },
  y2_vox: { label: "剪报调查", desc: "剪报红线荧光笔 / 相机调查桌（Vox 风）" },
  y3_whiteboard: { label: "白板手绘", desc: "手绘图标逐笔呈现（RSA Animate 风）" },
  y4_storytime: { label: "故事帧库", desc: "角色反应特写 + 表情包节奏（storytime 风）" },
  y5_kinetic_type: { label: "动态大字", desc: "120BPM 砸入的动态文字排版" },
}

/** 8 主题色板 */
export const ART_THEMES = ["paper", "poster", "ink", "navy", "bauhaus", "snow", "wood", "chalk"] as const
export type ArtThemeName = (typeof ART_THEMES)[number]

// ---------- 本地静态服务（引擎目录，随机端口） ----------

async function startEngineServer(): Promise<{ server: ReturnType<typeof createServer>; port: number; close: () => Promise<void> }> {
  const MIME: Record<string, string> = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json",
    ".woff": "font/woff",
    ".woff2": "font/woff2",
    ".png": "image/png",
  }
  const server = createServer(async (req, res) => {
    try {
      const url = (req.url ?? "/").split("?")[0]
      const file = path.join(ENGINE_DIR, url === "/" ? "clip.html" : url.replace(/^\//, ""))
      const body = await readFile(file)
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" })
      res.end(body)
    } catch {
      res.writeHead(404)
      res.end("not found")
    }
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  const addr = server.address() as { port: number }
  return {
    server,
    port: addr.port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  }
}

// ---------- ffmpeg 帧管道 ----------

interface FfmpegPipe {
  proc: ChildProcessWithoutNullStreams
  finished: Promise<{ code: number }>
  write(buf: Buffer): Promise<void>
  end(): void
}

function startFfmpegPipe(outFile: string, fps: number, width: number, height: number): FfmpegPipe {
  const proc = spawn("ffmpeg", [
    "-y",
    "-f", "image2pipe",
    "-framerate", String(fps),
    "-i", "-",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "22",
    "-vf", `scale=${width}:${height}:flags=lanczos,format=yuv420p`,
    "-g", String(fps), // GOP=fps：按秒关键帧（上游同款，管线可按秒 seek）
    "-movflags", "+faststart",
    outFile,
  ])
  proc.stderr.resume() // 丢弃 stderr 防" EPIPE
  let closed = false
  const finished = new Promise<{ code: number }>((resolve) => {
    proc.on("close", (code) => {
      closed = true
      resolve({ code: code ?? -1 })
    })
  })
  return {
    proc,
    finished,
    write(buf: Buffer) {
      return new Promise<void>((resolve, reject) => {
        if (closed) return reject(new Error("ffmpeg 已退出"))
        const ok = proc.stdin.write(buf, (err) => (err ? reject(err) : resolve()))
        if (!ok) {
          proc.stdin.once("drain", () => resolve())
        } else resolve()
      })
    },
    end() {
      proc.stdin.end()
    },
  }
}

// ---------- 单片段渲染 ----------

// 注意：本环境 Playwright 的 evaluate 传参必须用「真实函数对象」，
// 字符串函数 + arg 会静默返回 undefined（已实测最小复现）。
const grabFrame = async (t: number): Promise<string> => {
  const w = window as unknown as { prepare(t: number): Promise<void>; renderFrame(t: number): void; __canvas: HTMLCanvasElement }
  await w.prepare(t)
  w.renderFrame(t)
  return w.__canvas.toDataURL("image/png").split(",")[1]
}

export interface ArtRenderProgress {
  stage: "boot" | "frames" | "encode" | "done" | "error"
  frameDone: number
  frameTotal: number
  error?: string
}

/**
 * 渲染一个 clip spec → MP4。
 * onProgress 每帧回调（frameDone/frameTotal）。
 */
export async function renderArtClip(
  spec: ArtClipSpec,
  outFile: string,
  onProgress?: (p: ArtRenderProgress) => void,
): Promise<{ seconds: number; sizeBytes: number }> {
  const fps = Math.round(spec.fps ?? 30)
  const totalFrames = Math.max(1, Math.round(spec.duration * fps))
  const srv = await startEngineServer()
  const browser = await chromium.launch({ headless: true })
  let pipe: FfmpegPipe | null = null
  try {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height } })
    const page = await context.newPage()
    await page.addInitScript(`window.CLIP_SPEC = ${JSON.stringify(spec)};`)
    onProgress?.({ stage: "boot", frameDone: 0, frameTotal: totalFrames })
    await page.goto(`http://127.0.0.1:${srv.port}/clip.html?render=1`, { waitUntil: "load", timeout: 60_000 })
    await page.waitForFunction("window.__ready === true || !!window.__bootFailed", undefined, { timeout: 60_000 })
    const bootFailed = await page.evaluate("!!window.__bootFailed")
    if (bootFailed) {
      // clip.js 的 fail() 把消息写进 __bootFailed（字符串）；__bootError 并不存在
      const err = await page.evaluate("String(window.__bootError || window.__bootFailed || '')")
      throw new Error(`art 引擎启动失败：${String(err).slice(0, 200) || "未知启动错误"}`)
    }

    await mkdir(path.dirname(outFile), { recursive: true })
    pipe = startFfmpegPipe(outFile, fps, spec.width, spec.height)
    for (let f = 0; f < totalFrames; f++) {
      const t = f / fps
      const b64 = (await page.evaluate(grabFrame, t)) as string
      await pipe.write(Buffer.from(b64, "base64"))
      if (f % 8 === 0 || f === totalFrames - 1) {
        onProgress?.({ stage: "frames", frameDone: f + 1, frameTotal: totalFrames })
      }
    }
    pipe.end()
    onProgress?.({ stage: "encode", frameDone: totalFrames, frameTotal: totalFrames })
    const { code } = await pipe.finished
    if (code !== 0) throw new Error(`ffmpeg 编码失败（exit ${code}）`)
    const size = (await stat(outFile)).size
    onProgress?.({ stage: "done", frameDone: totalFrames, frameTotal: totalFrames })
    await context.close()
    return { seconds: totalFrames / fps, sizeBytes: size }
  } catch (e) {
    onProgress?.({ stage: "error", frameDone: 0, frameTotal: totalFrames, error: (e as Error).message.slice(0, 300) })
    pipe?.end()
    throw e
  } finally {
    await browser.close().catch(() => {})
    await srv.close()
  }
}

/** 静帧预览（时间点 t 的 PNG，供工作台预览卡） */
export async function renderArtStill(spec: ArtClipSpec, t: number): Promise<Buffer> {
  const srv = await startEngineServer()
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height } })
    const page = await context.newPage()
    await page.addInitScript(`window.CLIP_SPEC = ${JSON.stringify(spec)};`)
    await page.goto(`http://127.0.0.1:${srv.port}/clip.html?render=1`, { waitUntil: "load", timeout: 60_000 })
    await page.waitForFunction("window.__ready === true || !!window.__bootFailed", undefined, { timeout: 60_000 })
    const b64 = (await page.evaluate(grabFrame, Math.min(t, spec.duration))) as string
    await context.close()
    return Buffer.from(b64, "base64")
  } finally {
    await browser.close().catch(() => {})
    await srv.close()
  }
}
