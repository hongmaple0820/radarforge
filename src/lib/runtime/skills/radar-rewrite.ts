// ============================================================
// radar-rewrite —— 一稿多发改写 skill
// 同一成稿 → 平台定制版（CSDN / 小红书 / 抖音口播稿）
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"

export interface RewriteTarget {
  id: string
  label: string
  instruction: string
}

export const REWRITE_TARGETS: RewriteTarget[] = [
  {
    id: "csdn",
    label: "CSDN 博客版",
    instruction: [
      "改写为 CSDN 技术博客风格：",
      "- 开头加一段「本文速览」引用块（3~5 行要点）",
      "- 标题可加技术关键词便于搜索",
      "- 文末加「参考来源」列表（带可点击 URL，CSDN 支持外链）",
      "- 保留 [n] 标记可改为 [n] 文字形式",
      "- 语气可更技术化，篇幅保持或略增",
    ].join("\n"),
  },
  {
    id: "xiaohongshu",
    label: "小红书笔记版",
    instruction: [
      "改写为小红书笔记风格：",
      "- 标题 ≤20 字带 1~2 个 emoji（用文字描述位置）",
      "- 正文 ≤600 字，短句为主，分段密集",
      "- 开头一行钩子，结尾 3~5 个话题标签（#xxx）",
      "- 去掉 [n] 上标，来源信息浓缩为文末一行「信息来源」",
    ].join("\n"),
  },
  {
    id: "shortvideo",
    label: "短视频口播稿",
    instruction: [
      "改写为 60 秒短视频口播稿：",
      "- 前 3 秒钩子（提问/冲突/反常识）",
      "- 全文口语化短句，总字数 220~280 字",
      "- 用「——」标注分镜停顿，重要数字单独一行",
      "- 结尾一个互动引导 + 信息来源一句话",
    ].join("\n"),
  },
]

export function rewriteMessages(markdown: string, target: RewriteTarget): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是多平台内容运营，擅长一稿多发改写。${target.instruction}\n输出改写后的完整内容，格式用 Markdown。不要解释。`,
    },
    { role: "user", content: markdown.slice(0, 9000) },
  ]
}

// ---------- 视频分镜脚本（视频线 MVP：脚本先行，成片渲染属 Phase 3） ----------

export interface StoryboardScene {
  id: number
  seconds: number
  visual: string // 画面描述（拍摄/素材建议）
  narration: string // 口播文本
  subtitle: string // 屏幕字幕
  broll: string // B-roll 素材建议
}

export interface Storyboard {
  title: string
  hook: string // 前 3 秒钩子
  totalSeconds: number
  scenes: StoryboardScene[]
  bgm: string // 音乐风格建议
  caption: string // 发布文案 + 话题标签
}

export function storyboardMessages(markdown: string, platform: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是短视频编导，把图文成稿改编为可拍摄的分镜脚本。",
        `目标平台：${platform}。总时长 45~75 秒，6~9 个分镜。`,
        "要求：",
        "- hook：前 3 秒钩子（提问/冲突/反常识），一句话",
        "- 每个分镜：seconds（2~12 秒）、visual（画面怎么做：实拍/屏幕录制/AI 素材）、narration（口播，口语短句）、subtitle（屏幕大字 ≤12 字）、broll（空镜素材建议）",
        "- caption：发布文案（含 3~5 个 #话题标签）",
        "- 事实数字保留原文，不得新增未经证实的数字",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{`,
        `  "title": "视频标题",`,
        `  "hook": "前3秒钩子",`,
        `  "totalSeconds": 60,`,
        `  "scenes": [ { "id": 1, "seconds": 5, "visual": "...", "narration": "...", "subtitle": "...", "broll": "..." } ],`,
        `  "bgm": "音乐风格建议",`,
        `  "caption": "发布文案 #标签"`,
        `}`,
      ].join("\n"),
    },
    { role: "user", content: markdown.slice(0, 9000) },
  ]
}

// ---------- 视频成片（TTS 口播音色清单，客户端与服务端共用） ----------

export const TTS_VOICES: { id: string; label: string }[] = [
  { id: "xiaochen", label: "小陈 · 沉稳专业" },
  { id: "tongtong", label: "彤彤 · 温暖亲切" },
  { id: "chuichui", label: "吹吹 · 活泼可爱" },
  { id: "kazi", label: "卡兹 · 清晰标准" },
  { id: "douji", label: "豆吉 · 自然流畅" },
  { id: "luodo", label: "罗多 · 富有感染力" },
  { id: "jam", label: "Jam · 英音绅士" },
]

// ---------- 艺术动画线：分镜 → clip spec（huashu-art-motion 契约） ----------

export interface ArtSpecItem {
  sceneId: number
  grammar: string
  theme?: string
  data: Record<string, unknown>
  cues: { at: number; kind: string; text?: string; sub?: string; data?: Record<string, unknown> }[]
}

/** 8 语法速查（喂给 LLM 的契约摘要，源自 clip_schema.json） */
const GRAMMAR_CHEATSHEET = [
  "t2_keynote_ui（发布会卡片）：specData eyebrow/title/subtitle/accent；cue kind: title/card/step/highlight/number；适合观点卡、步骤、大数字",
  "t3_finance_chart（财经图表）：specData title/unit/source/chart(bar|line)/series[{label,value}]/highlight；cue kind: bar/line/highlight/number；适合数据与对比",
  "y5_kinetic_type（动态大字）：specData palette；cue kind: title/point/number/highlight；适合金句与情绪节奏",
  "y3_whiteboard（白板手绘）：cue kind: title/point/draw(image 必填 data.icon)/image；适合过程讲解",
  "y1_kurzgesagt（科普穿行）：cue kind: title/point/enter；适合概念类比",
  "y2_vox（剪报调查）：cue kind: image/clip/title/point/highlight(data.rect)；适合新闻线索调查感",
  "t1_3b1b（公式形变）：cue kind: title/equation(data.tokens)/point/line；适合推理链",
  "y4_storytime（故事帧库）：specData character；cue kind: title/point/react/insert；适合叙事段",
].join("\n")

export function artSpecMessages(storyboard: Storyboard, aspect: "9:16" | "16:9"): ChatMessage[] {
  const dims = aspect === "9:16" ? "720×1280（竖屏）" : "1280×720（横屏）"
  const scenes = storyboard.scenes
    .map((s) => `分镜${s.id}（${s.seconds}s）：字幕「${s.subtitle}」；口播：${s.narration}；画面意图：${s.visual}`)
    .join("\n")
  return [
    {
      role: "system",
      content: [
        "你是动画导演，把分镜脚本转成艺术动画引擎的 clip spec（JSON）。",
        `画布 ${dims}，fps 30。每个分镜产出一个 spec：duration = 分镜秒数（2~8s），grammar 从下面 8 语法中按内容类型选最合适的一个：`,
        GRAMMAR_CHEATSHEET,
        "主题 theme 八选一：paper/poster/ink/navy/bauhaus/snow/wood/chalk（全片统一）。",
        "规则：",
        "- cues.at 从 0.3s 起排，与口播节奏对齐（每秒约 4 字）；kind 必须是该语法支持的",
        "- subtitle 的字放进 cue 的 text；数字事实保留原文，不得编造 series 数值——没有数据就用 t2/y5 文字卡，不要硬造图表",
        "- data 里只写该语法 specData 认识的字段",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{ "specs": [ { "sceneId": 1, "grammar": "t2_keynote_ui", "theme": "paper", "data": { "title": "…", "subtitle": "…" }, "cues": [ { "at": 0.3, "kind": "title" } ] } ] }`,
      ].join("\n"),
    },
    { role: "user", content: `标题：${storyboard.title}\n钩子：${storyboard.hook}\n${scenes}` },
  ]
}

const VALID_GRAMMARS = new Set(["t1_3b1b", "t2_keynote_ui", "t3_finance_chart", "y1_kurzgesagt", "y2_vox", "y3_whiteboard", "y4_storytime", "y5_kinetic_type"])
const VALID_THEMES = new Set(["paper", "poster", "ink", "navy", "bauhaus", "snow", "wood", "chalk"])

export function parseArtSpecs(raw: unknown): ArtSpecItem[] {
  if (!raw || typeof raw !== "object") return []
  const o = raw as Record<string, unknown>
  const list = Array.isArray(o.specs) ? o.specs : []
  const out: ArtSpecItem[] = []
  for (const item of list) {
    const x = item as Record<string, unknown>
    const grammar = String(x.grammar ?? "")
    if (!VALID_GRAMMARS.has(grammar)) continue
    const theme = VALID_THEMES.has(String(x.theme)) ? String(x.theme) : undefined
    const cuesRaw = Array.isArray(x.cues) ? x.cues : []
    const cues = cuesRaw
      .map((c) => {
        const q = c as Record<string, unknown>
        return {
          at: Math.min(15, Math.max(0, Number(q.at) || 0)),
          kind: String(q.kind ?? "").slice(0, 20),
          text: q.text !== undefined ? String(q.text).slice(0, 60) : undefined,
          sub: q.sub !== undefined ? String(q.sub).slice(0, 60) : undefined,
          data: q.data && typeof q.data === "object" ? (q.data as Record<string, unknown>) : undefined,
        }
      })
      .filter((q) => q.kind)
    out.push({
      sceneId: Number(x.sceneId) || out.length + 1,
      grammar,
      theme,
      data: x.data && typeof x.data === "object" ? (x.data as Record<string, unknown>) : {},
      cues,
    })
  }
  return out.slice(0, 12)
}

export function parseStoryboard(raw: unknown): Storyboard | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const scenesRaw = Array.isArray(o.scenes) ? o.scenes : []
  const scenes: StoryboardScene[] = scenesRaw
    .map((s, i) => {
      const x = s as Record<string, unknown>
      return {
        id: Number(x.id) || i + 1,
        seconds: Math.min(20, Math.max(1, Number(x.seconds) || 4)),
        visual: String(x.visual ?? "").slice(0, 200),
        narration: String(x.narration ?? "").slice(0, 300),
        subtitle: String(x.subtitle ?? "").slice(0, 30),
        broll: String(x.broll ?? "").slice(0, 120),
      }
    })
    .filter((x) => x.narration || x.visual)
  if (scenes.length < 3) return null
  const totalSeconds = Number(o.totalSeconds) || scenes.reduce((s, x) => s + x.seconds, 0)
  return {
    title: String(o.title ?? "").slice(0, 80),
    hook: String(o.hook ?? "").slice(0, 80),
    totalSeconds: Math.min(180, Math.max(10, totalSeconds)),
    scenes: scenes.slice(0, 12),
    bgm: String(o.bgm ?? "").slice(0, 80),
    caption: String(o.caption ?? "").slice(0, 300),
  }
}
