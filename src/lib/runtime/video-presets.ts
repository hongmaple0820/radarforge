// ============================================================
// video-presets.ts —— 视频产线纯预设与工具（C5/C3）
// 从 video.ts 抽出的零副作用层：布局/分辨率缩放、BGM 六预设
// 配方、字幕三预设与 drawtext 工具。独立成模块是为了可离线
// 自测（video.ts 依赖 sharp/playwright/db，纯 node 拖不动）。
// ============================================================

import { existsSync } from "fs"
import type { StoryboardScene } from "./skills/radar-rewrite"

// ---------- 分辨率与布局 ----------

export type VideoResolution = "720P" | "1080P"

export interface Layout {
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

export const LAYOUTS: Record<"9:16" | "16:9", Layout> = {
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

/** C5 分辨率缩放：720P 基准 1x，1080P = 1.5x（字体/间距等比放大，文字不模糊） */
export function scaledLayout(aspect: "9:16" | "16:9", resolution: VideoResolution): Layout {
  const s = resolution === "1080P" ? 1.5 : 1
  const base = LAYOUTS[aspect]
  return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * s)])) as unknown as Layout
}

/** 成片像素尺寸（C3 协议族能力闸门后的实际档位）：720×1280 / 1280×720 / 1080×1920 / 1920×1080 */
export function dimsFor(aspect: "9:16" | "16:9", resolution: VideoResolution): { w: number; h: number } {
  const base = aspect === "9:16" ? { w: 720, h: 1280 } : { w: 1280, h: 720 }
  return resolution === "1080P" ? { w: Math.round(base.w * 1.5), h: Math.round(base.h * 1.5) } : base
}

// ---------- BGM 六预设（C5；本地 aevalsrc 合成，无版权；AI 配乐接口预留未接） ----------

export type BgmPreset = "none" | "uplift" | "tech" | "calm" | "tense" | "suspense" | "warm"

export const BGM_PRESETS: Record<Exclude<BgmPreset, "none">, { label: string; desc: string }> = {
  uplift: { label: "明快琶音", desc: "大三和弦垫 + 4Hz 律动（本地合成，无版权）" },
  tech: { label: "科技脉冲", desc: "低频正弦 + 2Hz 脉冲调制（本地合成）" },
  calm: { label: "沉静长音", desc: "纯五度长音 + 慢波动 + 回声（本地合成）" },
  tense: { label: "紧张脉冲", desc: "小二度拍频 + 6Hz 快律动（本地合成）" },
  suspense: { label: "悬念长音", desc: "三全音叠置 + 缓慢起伏（本地合成）" },
  warm: { label: "温暖行进", desc: "大六度 + 轻律动 + 柔回声（本地合成）" },
}

export const BGM_RECIPES: Record<Exclude<BgmPreset, "none">, { expr: string; chain: string; volume: number }> = {
  // C 大三和弦 + 八度垫（262/330/392/524Hz），4Hz 律动调制 + 空间回声
  uplift: {
    expr: "0.13*sin(262*2*PI*t)+0.10*sin(330*2*PI*t)+0.08*sin(392*2*PI*t)+0.06*sin(524*2*PI*t)",
    chain: "tremolo=f=4:d=0.55,aecho=0.6:0.35:120|180:0.22|0.15,afade=t=in:st=0:d=1.2",
    volume: 0.24,
  },
  // 低频双正弦（110/220Hz），2Hz 脉冲感
  tech: {
    expr: "0.16*sin(110*2*PI*t)+0.09*sin(220*2*PI*t)",
    chain: "tremolo=f=2:d=0.75,aecho=0.5:0.3:80|160:0.18|0.12,afade=t=in:st=0:d=0.8",
    volume: 0.22,
  },
  // 纯五度长音（196/294/392Hz），慢波动 + 长回声
  calm: {
    expr: "0.11*sin(196*2*PI*t)+0.09*sin(294*2*PI*t)+0.07*sin(392*2*PI*t)",
    chain: "tremolo=f=0.6:d=0.3,aecho=0.6:0.45:240|380:0.28|0.2,afade=t=in:st=0:d=1.5",
    volume: 0.18,
  },
  // C5 新增：小二度拍频（紧张）
  tense: {
    expr: "0.12*sin(220*2*PI*t)+0.10*sin(233*2*PI*t)+0.07*sin(110*2*PI*t)",
    chain: "tremolo=f=6:d=0.7,aecho=0.5:0.28:90|150:0.2|0.14,afade=t=in:st=0:d=0.6",
    volume: 0.2,
  },
  // C5 新增：三全音叠置（悬念）
  suspense: {
    expr: "0.10*sin(196*2*PI*t)+0.09*sin(277*2*PI*t)+0.06*sin(98*2*PI*t)",
    chain: "tremolo=f=0.8:d=0.5,aecho=0.6:0.4:200|340:0.26|0.18,afade=t=in:st=0:d=2",
    volume: 0.18,
  },
  // C5 新增：大六度（温暖）
  warm: {
    expr: "0.12*sin(262*2*PI*t)+0.09*sin(440*2*PI*t)+0.07*sin(330*2*PI*t)",
    chain: "tremolo=f=2.5:d=0.35,aecho=0.55:0.3:150|260:0.2|0.12,afade=t=in:st=0:d=1",
    volume: 0.2,
  },
}

// ---------- C5 字幕三预设（i2v 片段烧录；文本由合成层渲染，生图文字不可靠） ----------

export type SubtitleStyle = "clean" | "strong" | "soft"

export const SUBTITLE_STYLES: Record<SubtitleStyle, { label: string; desc: string }> = {
  clean: { label: "清爽描边", desc: "白字细黑边，最轻干扰（默认）" },
  strong: { label: "强调底条", desc: "大字 + 半透明黑底条，强可读" },
  soft: { label: "柔和暗底", desc: "小字 + 淡暗底，氛围优先" },
}

/** drawtext 字体（Noto Sans SC；缺失时自动降级无字幕） */
export const SUBTITLE_FONT = "/usr/share/fonts/truetype/chinese/NotoSansSC-Regular.ttf"

// ---------- 文本工具 ----------

/** CJK 按字符数折行（无空格语义），返回至多 maxLines 行 */
export function wrapCJK(text: string, max: number, maxLines: number): string[] {
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

// ---------- drawtext 字幕工具 ----------

/** drawtext 文本转义（expansion=none 关闭模板展开；单引号换弯引号免引号地狱） */
export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/'/g, "\u2019")
    .replace(/[\r\n]+/g, " ")
}

/** 字幕分行（CJK 按字数折行，最多 2 行） */
export function subtitleLines(scene: StoryboardScene): string[] {
  const text = (scene.subtitle || scene.narration).replace(/\s+/g, " ").trim()
  return wrapCJK(text, 16, 2)
}

/** 字幕滤镜链：每行一条 drawtext（避开换行转义）；字体缺失返回空链（诚实降级无字幕） */
export function subtitleFilters(scene: StoryboardScene, style: SubtitleStyle, dims: { w: number; h: number }): string[] {
  const lines = subtitleLines(scene)
  if (lines.length === 0 || !existsSync(SUBTITLE_FONT)) return []
  const size = Math.round(dims.h * (style === "strong" ? 0.05 : style === "soft" ? 0.04 : 0.045))
  const lineH = Math.round(size * 1.4)
  const filters: string[] = []
  lines.forEach((line, k) => {
    const y = dims.h - Math.round(dims.h * 0.09) - (lines.length - 1 - k) * lineH
    const common = `drawtext=fontfile=${SUBTITLE_FONT}:text='${escapeDrawtext(line)}':fontcolor=${
      style === "strong" ? "0xFFE082" : style === "soft" ? "white@0.92" : "white"
    }:fontsize=${size}:x=(w-text_w)/2:y=${y}:expansion=none`
    if (style === "strong") filters.push(`${common}:box=1:boxcolor=black@0.6:boxborderw=${Math.round(size * 0.35)}`)
    else if (style === "soft") filters.push(`${common}:box=1:boxcolor=black@0.35:boxborderw=${Math.round(size * 0.25)}`)
    else filters.push(`${common}:borderw=${Math.max(2, Math.round(size * 0.06))}:bordercolor=black@0.85`)
  })
  return filters
}
