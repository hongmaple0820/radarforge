// ============================================================
// radar-write —— 图文线写作 skill（编排层）
// A1 接管后：prompt 主体在 db/skills/wewrite-brief 与
// wewrite-draft/SKILL.md（唯一事实源，用户位可覆盖），
// 本模块只负责变量注入、消息组装与人格数据。
// A2：篇幅三档（tier）注入字数铁律。
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"
import { renderSkillPrompt } from "../skill-prompt.ts"
import { resolveLengthTier, tierWordRule, type LengthTier } from "../length-tier.ts"

export interface Persona {
  id: string
  label: string
  desc: string
  voice: string // 注入 system 的文风规则
}

export const PERSONAS: Persona[] = [
  {
    id: "midnight-friend",
    label: "深夜老友",
    desc: "像深夜陪聊的朋友，温和、真诚、有共情，偶尔自嘲",
    voice: [
      "口吻像给一位老朋友深夜写信：温和、直接、不装。",
      "多用短句和口语化表达，允许偶尔的自嘲，但绝不卖惨。",
      "先共情读者的处境，再给出判断，不说教。",
    ].join(""),
  },
  {
    id: "cold-analyst",
    label: "冷面分析师",
    desc: "数据驱动、结论前置、克制冷静，零形容词堆砌",
    voice: [
      "冷静克制的分析文体：结论前置，证据跟随，每段一个论点。",
      "禁用情绪化形容词和感叹号；用数据与对比说话。",
      "承认不确定性时直接写「不确定」，不闪烁其词。",
    ].join(""),
  },
  {
    id: "tech-coder",
    label: "极客工程师",
    desc: "上手实测派，讲原理也讲坑，代码味十足",
    voice: [
      "工程师视角：先讲「这东西为什么这样设计」，再讲「我怎么实测的」，最后讲「你会在哪踩坑」。",
      "允许出现技术术语，但每个术语首次出现用一句人话解释。",
      "宁可少说，不可说错；没实测过的结论标注「未验证」。",
    ].join(""),
  },
  {
    id: "sharp-editor",
    label: "犀利主笔",
    desc: "观点锋利、逻辑链严密，敢下判断也敢认错",
    voice: [
      "主笔视角：开篇三句内亮明立场，正文用严密逻辑链推进。",
      "敢下判断，同时明确写出「我可能是错的」条件边界。",
      "对值得批评的现象点名批评，但不做人身攻击。",
    ].join(""),
  },
  {
    id: "warm-mentor",
    label: "温暖导师",
    desc: "循循善诱，把复杂讲简单，给行动清单",
    voice: [
      "导师视角：把复杂概念拆成「是什么—为什么—怎么做」三段式。",
      "每个抽象概念配一个生活化类比。",
      "结尾给出可执行的行动清单（3 条以内）。",
    ].join(""),
  },
  {
    id: "news-anchor",
    label: "新闻主播",
    desc: "快讯节奏，事实密度高，克制中立",
    voice: [
      "快讯文体：导语一句话讲完全部要点，正文按重要性递减展开。",
      "每段以事实开头，来源标注 [n]；观点单独放「快评」小节。",
      "语言中性克制，禁用夸张修辞。",
    ].join(""),
  },
  {
    id: "story-teller",
    label: "故事叙述者",
    desc: "场景开场、叙事推进，把信息藏进故事里",
    voice: [
      "叙事文体：用一个具体场景开场（时间、地点、人物、动作）。",
      "信息点藏进故事推进里，避免大段说明文。",
      "结尾回到开场场景，完成情感闭环。",
    ].join(""),
  },
]

export function getPersona(id: string): Persona {
  return PERSONAS.find((p) => p.id === id) ?? PERSONAS[1]
}

// ---------- Brief 任务书 ----------

export interface BriefClaim {
  type: "fact" | "inference" | "opinion" | "experience"
  text: string
}

export interface Brief {
  targetReader: string
  realProblem: string
  coreJudgment: string
  counterView: string
  boundary: string
  claims: BriefClaim[]
}

export async function briefMessages(ideaTitle: string, ideaAngle: string, stylePrompt?: string): Promise<ChatMessage[]> {
  const system = await renderSkillPrompt("wewrite-brief", undefined, {
    style_block: stylePrompt ? `\n【创作者风格定位（任务书必须贴合）】\n${stylePrompt}\n` : "",
  })
  return [
    { role: "system", content: system },
    {
      role: "user",
      content: `选题：${ideaTitle}\n切入角度：${ideaAngle || "（无，自行判断最佳角度）"}`,
    },
  ]
}

// ---------- 初稿（单遍回退；分节写作见 radar-outline.sectionMessages） ----------

export interface DraftInput {
  brief: Brief
  persona: Persona
  claims: {
    idx: number
    text: string
    claimType: string
    verified: boolean | null
    sourceTitle: string
    sourceSite: string
    sourceDate: string
    sourceUrl: string
  }[]
  rules: string[] // 飞轮 active 规则
  ideaTitle: string
  ideaAngle: string
  stylePrompt?: string // 创作者风格定位（设置中心）
  exemplarPrompt?: string // 文风校准档案（学习中心；仅结构节奏，安全条款内置）
  tunePrompt?: string // P1 p15 调优指令（评测驱动选优变体；v0 基线为空）
  tier?: LengthTier // 篇幅档位（A2；缺省 medium，与设置默认一致）
}

export async function draftMessages(input: DraftInput): Promise<ChatMessage[]> {
  const evidence = input.claims
    .map(
      (c) =>
        `[${c.idx}] ${c.claimType}｜${c.text}\n     来源：${c.verified ? `${c.sourceSite}《${c.sourceTitle}》${c.sourceDate}` : "（未找到直接来源，不得作为事实陈述）"}\n     URL：${c.sourceUrl || "无"}`,
    )
    .join("\n")

  const system = await renderSkillPrompt("wewrite-draft", "single", {
    persona_label: input.persona.label,
    persona_voice: input.persona.voice,
    style_block: input.stylePrompt ? `\n【创作者风格定位（与人格叠加生效）】\n${input.stylePrompt}` : "",
    exemplar_block: input.exemplarPrompt ? `\n${input.exemplarPrompt}` : "",
    tune_block: input.tunePrompt ? `\n${input.tunePrompt}` : "",
    tier_word_rule: tierWordRule(input.tier ?? resolveLengthTier()),
    rules_block:
      input.rules.length > 0
        ? "5. 以下为编辑飞轮沉淀的稳定写作规则，必须遵守：\n" + input.rules.map((r) => `   - ${r}`).join("\n")
        : "",
  })

  const user = [
    `选题：${input.ideaTitle}`,
    `角度：${input.ideaAngle || "（按任务书判断）"}`,
    "",
    "【文章任务书（brief）】",
    `- 目标读者：${input.brief.targetReader}`,
    `- 真正问题：${input.brief.realProblem}`,
    `- 核心判断：${input.brief.coreJudgment}`,
    `- 反方观点：${input.brief.counterView}`,
    `- 适用边界：${input.brief.boundary}`,
    "",
    "【证据块（claims 账本，经元宝搜索核对）】",
    evidence || "（无证据）",
    "",
    "请开始写作。文末不要出现「参考来源」区（排版引擎会自动生成）。",
  ].join("\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

// ---------- A5 扩写补救（低于档位下限的一次定向扩写，不注水原则） ----------

export async function expandMessages(input: {
  draft: string
  persona: Persona
  tier: LengthTier
  stylePrompt?: string
}): Promise<ChatMessage[]> {
  const system = await renderSkillPrompt("wewrite-draft", "expand", {
    tier_word_rule: tierWordRule(input.tier),
    style_block: input.stylePrompt ? `\n【创作者风格定位（扩写同此风格）】\n${input.stylePrompt}` : "",
  })
  const current = input.draft.replace(/\s/g, "").length
  const user = [
    `当前 ${current} 字，目标 ${input.tier.totalMin}~${input.tier.totalMax} 字（还差约 ${Math.max(0, input.tier.totalMin - current)} 字）。`,
    `人格基调：${input.persona.label}（${input.persona.voice.slice(0, 60)}）`,
    "",
    "【待扩写全文】",
    input.draft.slice(0, 12000),
  ].join("\n")
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}
