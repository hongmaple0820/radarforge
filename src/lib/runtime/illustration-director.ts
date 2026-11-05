// ============================================================
// illustration-director —— 配图导演（B1 提示词工程管线）
// 把「配图概念一句话」升级为结构化专业生图提示词：
//   主体（中英）+ 构图 + 色调光线 + 风格 + 负面词。
// 参考 dsh-imagegen-video 的 promptModel 思想：复用现有 LLM
// 通道做提示词增强（无新密钥成本），中英双语（生图模型对
// 英文 prompt 响应更好——3774 条模板库同为双语结构）。
// prompt 主体在 db/skills/wewrite-art-direct/SKILL.md（A1）。
// 失败/超时/解析失败 → legacy 降级（概念+风格 token 拼接），
// 显式标注 source=legacy（降级不消失）。
// ============================================================

import { extractJson } from "./json.ts"
import { renderSkillPrompt } from "./skill-prompt.ts"
import { exemplarBlock as buildExemplarBlock, retrieveTemplates } from "./prompt-library.ts"
import type { ChatMessage } from "../gateway/types.ts"

/** 可注入的对话函数（默认惰性走 gateway；测试可注入 mock 零依赖） */
export type DirectorChat = (messages: ChatMessage[], opts: { temperature: number }) => Promise<string>

const defaultChat: DirectorChat = async (messages, opts) => {
  // 惰性导入：离线测试 import 本模块时不拖 gateway/prisma 依赖链
  const { chatRetry } = await import("../gateway/index.ts")
  return chatRetry(messages, opts)
}

export interface DirectedPromptParts {
  subjectZh: string
  subjectEn: string
  composition: string
  lighting: string
  styleRef: string
  negative: string
}

export interface DirectedImagePrompt {
  /** 拼装好的完整生图提示词（直接喂 generateImage） */
  promptFull: string
  /** 结构化明细（留痕/调试/测试断言用） */
  parts: DirectedPromptParts | null
  /** director=导演生成；legacy=降级拼接（LLM 不可用/解析失败） */
  source: "director" | "legacy"
  note?: string
}

function clampStr(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max)
}

export function parseDirectorReply(raw: string): DirectedPromptParts | null {
  const j = extractJson<Record<string, unknown>>(raw)
  if (!j) return null
  const parts: DirectedPromptParts = {
    subjectZh: clampStr(j.subject_zh, 160),
    subjectEn: clampStr(j.subject_en, 300),
    composition: clampStr(j.composition, 120),
    lighting: clampStr(j.lighting, 120),
    styleRef: clampStr(j.style_ref, 160),
    negative: clampStr(j.negative, 160),
  }
  // 主体中英至少有一版可用，否则视为解析失败
  if (!parts.subjectZh && !parts.subjectEn) return null
  return parts
}

/** 拼装完整提示词：中文主体，英文主体+构图+光线（模型吃英文关键词），风格收尾 */
export function assemblePromptFull(parts: DirectedPromptParts, fallbackStyle: string): string {
  const segments = [
    parts.subjectZh || parts.subjectEn,
    parts.subjectEn,
    parts.composition,
    parts.lighting,
    parts.styleRef || fallbackStyle,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
  const negative = parts.negative ? `。avoid: ${parts.negative}` : ""
  return segments.join("，") + negative
}

/** legacy 降级：概念 + 风格 token 直接拼接（旧管线行为，标注来源） */
function legacyPrompt(concept: string, stylePrompt: string, note: string): DirectedImagePrompt {
  return {
    promptFull: `${concept}，${stylePrompt}`,
    parts: null,
    source: "legacy",
    note: note.slice(0, 120),
  }
}

// ---------- 正文插图导演 ----------

export interface DirectInlineInput {
  topic: string // 文章选题（导演知道整篇在讲什么）
  anchor: string // 小节标题
  concept: string // 插图规划的概念描述
  caption: string // 图注
  /** 风格基准（IMAGE_STYLES.prompt；图文线由 settings.article.imageStyleId 决定） */
  stylePrompt: string
  /** 上一次质检未过的改进建议（重生时注入；首次不传） */
  retryHint?: string
  /** B4：模板库检索范例块（调用方可用 injectExemplars 自动生成；也可显式传入） */
  exemplarBlock?: string
}

/** B4：按「选题+锚点+概念」检索模板库并拼范例块（导演 few-shot 参考） */
export async function exemplarHintFor(topic: string, anchor: string, concept: string, limit = 2): Promise<string> {
  try {
    const hits = await retrieveTemplates([topic, anchor, concept].join(" "), { limit })
    return buildExemplarBlock(hits)
  } catch {
    return "" // 检索失败不影响导演主链路
  }
}

export async function directInlineIllustration(input: DirectInlineInput, chat: DirectorChat = defaultChat): Promise<DirectedImagePrompt> {
  try {
    const system = await renderSkillPrompt("wewrite-art-direct", "inline", {})
    const exemplar = input.exemplarBlock ?? (await exemplarHintFor(input.topic, input.anchor, input.concept))
    const user = [
      `文章选题：${input.topic.slice(0, 120)}`,
      `小节标题：${input.anchor.slice(0, 60)}`,
      `配图概念：${input.concept.slice(0, 200)}`,
      `图注：${input.caption.slice(0, 40)}`,
      `风格基准（style_ref 从此发展）：${input.stylePrompt.slice(0, 200)}`,
      exemplar ? `\n${exemplar}` : "",
      input.retryHint ? `\n【上一次质检未过的改进建议（针对性修正）】\n${input.retryHint.slice(0, 160)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
    for (const temp of [0.4, 0.2]) {
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: temp },
      )
      if (!raw) continue
      const parts = parseDirectorReply(raw)
      if (parts) return { promptFull: assemblePromptFull(parts, input.stylePrompt), parts, source: "director" }
    }
    return legacyPrompt(input.concept, input.stylePrompt, "导演两档温度后仍不可解析，回退概念拼接")
  } catch (e) {
    return legacyPrompt(input.concept, input.stylePrompt, `导演调用失败：${(e as Error).message}`)
  }
}

// ---------- 封面导演 ----------

export interface DirectCoverInput {
  title: string // 文章标题
  /** 风格基准 */
  stylePrompt: string
  /** 上一次质检未过的改进建议（重生时注入） */
  retryHint?: string
  /** B4：模板库检索范例块（不传则按标题自动检索） */
  exemplarBlock?: string
}

export async function directCoverImage(input: DirectCoverInput, chat: DirectorChat = defaultChat): Promise<DirectedImagePrompt> {
  const legacy = () =>
    legacyPrompt(
      `微信公众号文章封面，主题：${input.title}`,
      input.stylePrompt,
      "封面导演不可达，回退固定模板",
    )
  try {
    const system = await renderSkillPrompt("wewrite-art-direct", "cover", {})
    const exemplar = input.exemplarBlock ?? (await exemplarHintFor(input.title, "公众号文章封面", "封面概念图", 2))
    const user = [
      `文章标题：${input.title.slice(0, 120)}`,
      `风格基准（style_ref 从此发展）：${input.stylePrompt.slice(0, 200)}`,
      exemplar ? `\n${exemplar}` : "",
      input.retryHint ? `\n【上一次质检未过的改进建议（针对性修正）】\n${input.retryHint.slice(0, 160)}` : "",
    ]
      .filter(Boolean)
      .join("\n")
    for (const temp of [0.4, 0.2]) {
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: temp },
      )
      if (!raw) continue
      const parts = parseDirectorReply(raw)
      if (parts) return { promptFull: assemblePromptFull(parts, input.stylePrompt), parts, source: "director" }
    }
    return legacy()
  } catch {
    return legacy()
  }
}
