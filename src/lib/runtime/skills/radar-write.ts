// ============================================================
// radar-write —— 图文线写作 skill
// 7 套写作人格（学 wewrite 人格注入，禁止编造作者经历）
// brief 任务书：目标读者/真正问题/核心判断/反方/边界 五要素
// 初稿：人格 + brief + claims 账本 + 飞轮规则注入，[n] 引用
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"

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

export function briefMessages(ideaTitle: string, ideaAngle: string, stylePrompt?: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是公众号内容策划编辑。为给定选题生成「文章任务书」（brief），这是 wewrite 方法论的核心：写之前先定义清楚要写什么，避免 AI 自己扩写跑偏。",
        stylePrompt ? `\n【创作者风格定位（任务书必须贴合）】\n${stylePrompt}\n` : "",
        "严格输出 JSON（不要 markdown 代码块、不要多余文字）：",
        `{`,
        `  "targetReader": "目标读者画像（一句话，具体到人群与处境）",`,
        `  "realProblem": "读者真正的問題（表面诉求之下的深层困扰）",`,
        `  "coreJudgment": "本文的核心判断（一句话，敢表态）",`,
        `  "counterView": "最强反方观点（诚实写出对立面）",`,
        `  "boundary": "适用边界（本文观点在什么条件下失效）",`,
        `  "claims": [`,
        `    { "type": "fact", "text": "一条需要事实核对的具体主张（含数字/事件/日期为佳）" },`,
        `    { "type": "inference", "text": "一条基于事实的推断" },`,
        `    { "type": "opinion", "text": "一条作者观点" }`,
        `  ]`,
        `}`,
        "claims 给 3~5 条，其中 fact 型 2~4 条（这些将逐一联网取证）。",
      ].join("\n"),
    },
    {
      role: "user",
      content: `选题：${ideaTitle}\n切入角度：${ideaAngle || "（无，自行判断最佳角度）"}`,
    },
  ]
}

// ---------- 初稿 ----------

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
}

export function draftMessages(input: DraftInput): ChatMessage[] {
  const evidence = input.claims
    .map(
      (c) =>
        `[${c.idx}] ${c.claimType}｜${c.text}\n     来源：${c.verified ? `${c.sourceSite}《${c.sourceTitle}》${c.sourceDate}` : "（未找到直接来源，不得作为事实陈述）"}\n     URL：${c.sourceUrl || "无"}`,
    )
    .join("\n")

  const system = [
    "你是一名遵循任务书写作的公众号作者。严格按照以下人格与规则写作。",
    "",
    "【写作人格】",
    `${input.persona.label}：${input.persona.voice}`,
    input.stylePrompt ? `\n【创作者风格定位（与人格叠加生效）】\n${input.stylePrompt}` : "",
    input.exemplarPrompt ? `\n${input.exemplarPrompt}` : "",
    input.tunePrompt ? `\n${input.tunePrompt}` : "",
    "",
    "【铁律（优先级最高）】",
    "1. 引用事实时句尾标 [n] 上标编号，n 对应证据块编号，禁止编造来源。",
    "2. verified=false 或无来源的主张，不得作为事实陈述；可作为「有观点认为」或删去。",
    "3. 禁止编造作者个人经历（「我上周去…」类内容一律禁止）。",
    "4. 字数 1200~2000 字，Markdown 格式：# 标题 / ## 小节 / 段落。",
    input.rules.length > 0 ? "5. 以下为编辑飞轮沉淀的稳定写作规则，必须遵守：\n" + input.rules.map((r) => `   - ${r}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n")

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
