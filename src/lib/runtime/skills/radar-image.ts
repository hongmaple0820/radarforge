// ============================================================
// radar-image —— 图像生成 skill（两条线共用）
// ① 纯图线（image run）：主题 → LLM 构图方案（风格统一的
//    concept/caption 清单）→ zai-image 批量生成
// ② 图文线正文配图（illustrate 步骤）：初稿 → LLM 插图规划
//    （anchor 锚定小节标题 + concept 画面 + caption 图注）
//    → 逐张生成 → 回插 markdown
// 铁律：图是「补充信息量」不是复述文字；风格 token 统一
// 保证一组图视觉一致；失败降级留痕不阻断。
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"

// ---------- 风格预设（前端下拉 + 后端 prompt 共用） ----------

export interface ImageStylePreset {
  id: string
  label: string
  /** 追加到生图 prompt 尾部的风格 token（中英混写，模型都吃） */
  prompt: string
}

export const IMAGE_STYLES: ImageStylePreset[] = [
  {
    id: "modern-flat",
    label: "现代扁平插画",
    prompt: "现代扁平插画风，几何构图，蓝灰科技配色，大面积留白，干净利落，无文字无水印",
  },
  {
    id: "tech-data",
    label: "科技数据可视化",
    prompt: "科技感信息图风格，深色背景，发光线条与数据网格，蓝紫青配色，精确几何图形，无文字无水印",
  },
  {
    id: "hand-drawn",
    label: "手绘线稿",
    prompt: "手绘线稿风，钢笔笔触，米白纸底，单色墨线，少量琥珀色点缀， doodle 细节，无文字无水印",
  },
  {
    id: "isometric",
    label: "2.5D 等轴",
    prompt: "isometric 2.5D 等轴测风格，柔和渐变色块，微缩场景与建筑结构，精致细节，无文字无水印",
  },
  {
    id: "neon-cyber",
    label: "赛博霓虹",
    prompt: "赛博朋克霓虹风，深藏青底，品红青色霓虹光效，雨夜氛围，电影感构图，无文字无水印",
  },
]

export function getImageStyle(id: string): ImageStylePreset {
  return IMAGE_STYLES.find((s) => s.id === id) ?? IMAGE_STYLES[0]
}

// ---------- 用途预设（决定尺寸与 prompt 模板） ----------

export interface ImageUsagePreset {
  id: string
  label: string
  size: "1344x768" | "864x1152" | "1024x1024"
  desc: string
  /** 生图 prompt 的场景引导 */
  hint: string
}

export const IMAGE_USAGES: ImageUsagePreset[] = [
  {
    id: "wechat-cover",
    label: "公众号封面 / 文章头图",
    size: "1344x768",
    desc: "横版 1344×768，视觉焦点居中偏左（右侧留标题位），适合封面与文头大图",
    hint: "横版构图，主体在画面左 1/3，右侧留出呼吸空间，适合叠加标题文字",
  },
  {
    id: "xiaohongshu-set",
    label: "小红书竖版组图",
    size: "864x1152",
    desc: "竖版 864×1152（3:4），一组多张视觉连续，适合小红书/视频号卡片",
    hint: "竖版 3:4 构图，一组图之间保持同一视觉世界与主角设定，信息密度高",
  },
  {
    id: "general-square",
    label: "通用方图配图",
    size: "1024x1024",
    desc: "方图 1024×1024，通用配图与概念示意，全平台可用",
    hint: "方图构图，中心对称或对角线布局，单个清晰概念",
  },
]

export function getImageUsage(id: string): ImageUsagePreset {
  return IMAGE_USAGES.find((u) => u.id === id) ?? IMAGE_USAGES[2]
}

// ---------- ① 纯图线：构图方案 ----------

export interface ImagePlanItem {
  concept: string // 画面描述（生图 prompt 主体）
  caption: string // 中文图注（展示用）
}

export function imagePlanMessages(input: {
  subject: string
  usageId: string
  styleId: string
  count: number
}): ChatMessage[] {
  const usage = getImageUsage(input.usageId)
  const style = getImageStyle(input.styleId)
  return [
    {
      role: "system",
      content: [
        "你是视觉导演。为一个主题规划一组生图方案：每张图一个独立概念，组合起来讲同一个故事。",
        `用途：${usage.label}（${usage.hint}）。`,
        "要求：",
        "1. 概念之间不重复、有递进或互补关系（如：总览 → 关键概念 → 对比/转折 → 收束）。",
        "2. concept 用具象画面语言描述（主体、场景、动作、构图、光线），可直接作为文生图 prompt，不含抽象词堆砌。",
        "3. caption 是中文图注（≤18 字），给发布者看，说明这张图在组里的角色。",
        "4. 禁止在 concept 里要求生成文字（模型写不好字）。",
        "严格输出 JSON 数组（不要 markdown 代码块、不要多余文字）：",
        `[{"concept":"画面描述（30~80 字）","caption":"图注（≤18 字）"}]`,
      ].join("\n"),
    },
    {
      role: "user",
      content: `主题：${input.subject}\n需要 ${input.count} 张。`,
    },
  ]
}

// ---------- ② 图文线：正文插图规划 ----------

export interface IllustrationPlanItem {
  anchor: string // 锚定的小节标题原文（必须逐字来自正文 ## 标题）
  concept: string // 画面描述
  caption: string // 图注
}

export const ILLUSTRATION_STYLE_TOKEN =
  "现代扁平插画风，几何构图，蓝灰科技配色，与文章气质一致的克制配色，干净留白，无文字无水印"

export function illustrationPlanMessages(draft: string, outlineHints?: { heading: string; illustration: string; imageCaption: string }[]): ChatMessage[] {
  const hintBlock =
    outlineHints && outlineHints.length > 0
      ? [
          "",
          "【大纲期插图位参考（编辑已在大纲规划了这些配图位，优先采纳或改进，不要无视）】",
          ...outlineHints
            .filter((h) => h.illustration)
            .map((h) => `- 「${h.heading}」：${h.illustration}${h.imageCaption ? `（图说方向：${h.imageCaption}）` : ""}`),
        ].join("\n")
      : ""
  return [
    {
      role: "system",
      content: [
        "你是公众号配图编辑。阅读文章，规划 2~3 张正文插图：图必须提供文字之外的信息量（示意结构、对比、场景、时间线），绝不复述段落文字。",
        "规则：",
        "1. anchor 必须逐字复制文中已存在的二级标题（## 后的文字，去掉前后空格）；插图将插入该小节标题之后。",
        "2. 优先选信息密度高、有画面感的小节；开篇第一个小节和结尾小节通常适合放图。",
        "3. concept 用具象画面语言（主体/场景/构图/光线），30~80 字，可直接作为文生图 prompt；禁止要求生成文字。",
        "4. caption 是中文图注（≤16 字），是对图的说明，不是小节标题的重复。",
        "严格输出 JSON 数组（不要 markdown 代码块、不要多余文字）：",
        `[{"anchor":"## 后的小节标题原文","concept":"画面描述","caption":"图注"}]`,
      ].join("\n") + hintBlock,
    },
    { role: "user", content: draft.slice(0, 6000) },
  ]
}

// ---------- 插图回插 markdown ----------

/**
 * 定位锚定小节标题所在行号。
 * 匹配策略：标题原文精确匹配（trim 后逐字）→ 包含式匹配（anchor 是标题子串或反之）。
 * 找不到返回 -1。
 */
export function findHeadingIndex(markdown: string, anchor: string): number {
  const a = anchor.trim()
  if (!a) return -1
  const lines = markdown.split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,4}\s+(.+)$/)
    if (m && m[1].trim() === a) return i
  }
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^#{1,4}\s+(.+)$/)
    if (m && (m[1].includes(a) || a.includes(m[1].trim()))) return i
  }
  return -1
}

/**
 * 在锚定小节标题行之后插入一行 markdown 图片。
 * 找不到锚点或该锚点已插图 → 返回 null（调用方跳过）。
 */
export function insertImageAfterHeading(markdown: string, anchor: string, imageLine: string): string | null {
  const idx = findHeadingIndex(markdown, anchor)
  if (idx < 0) return null
  const lines = markdown.split(/\r?\n/)
  // 同一锚点只插一次（避免重复插图）
  const already = lines.slice(idx + 1, idx + 4).some((l) => l.trim().startsWith("!["))
  if (already) return null
  lines.splice(idx + 1, 0, "", imageLine, "")
  return lines.join("\n")
}
