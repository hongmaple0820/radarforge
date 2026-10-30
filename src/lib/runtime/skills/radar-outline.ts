// ============================================================
// radar-outline —— 大纲先行 + 分节生成 skill（P0 质量管线 L2 结构层）
// 学 STORM outline_generation / Plan-and-Write / DOC：
// 把创作负担前移到规划期——先出 JSON 大纲（每节：论点/证据编号/
// 配图位/字数预算），再逐节聚焦写作，长文质量不再随长度衰减。
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"
import type { Brief } from "./radar-write"
import type { Persona } from "./radar-write"

// ---------- 大纲 JSON ----------

export interface OutlineSection {
  heading: string // 小节标题（## 级，将作为锚点回插配图）
  point: string // 本节论点（一句话，敢表态）
  evidence: number[] // 引用的证据块编号（对应 claims 账本 [n]）
  illustration: string // 配图位描述（无则空串）
  imageCaption: string // 图说（无则空串）
  words: number // 字数预算（120~400）
}

export interface Outline {
  title: string
  sections: OutlineSection[]
}

export function outlineMessages(input: {
  brief: Brief
  ideaTitle: string
  ideaAngle: string
  claims: { idx: number; text: string; verified: boolean | null }[]
  stylePrompt?: string
}): ChatMessage[] {
  const evidence = input.claims
    .map((c) => `[${c.idx}] ${c.verified === null ? "非事实" : c.verified ? "已核实" : "无来源"}｜${c.text}`)
    .join("\n")
  return [
    {
      role: "system",
      content: [
        "你是公众号内容主编。写之前先做大纲（wewrite 方法论 + STORM 大纲先行的共识：规划期多花一分钟，成稿少改十处）。",
        input.stylePrompt ? `\n【创作者风格定位】\n${input.stylePrompt}\n` : "",
        "根据任务书与证据账本，产出结构化大纲 JSON。要求：",
        "- 4~6 个小节，起承转合完整：开场钩子 → 展开论证（2~3 节）→ 反方与边界 → 收束与行动",
        "- 每节 point 是一个具体论点（不是话题词），敢表态、可证伪",
        "- evidence 只能填证据账本里存在的编号；没有合适证据的节填 []（靠推理而非引用）",
        "- 全文 fact 型证据至少覆盖 60% 的已核实条目，不许浪费已核实证据",
        "- illustration 给出该节配图位的概念描述（2~3 节即可，其余空串）；imageCaption 一句话图说",
        "- words 是字数预算，合计 1200~2000",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{`,
        `  "title": "文章标题（≤24 字，有信息量，不标题党）",`,
        `  "sections": [`,
        `    { "heading": "小节标题（≤12 字）", "point": "本节论点", "evidence": [1, 2], "illustration": "配图概念或空串", "imageCaption": "图说或空串", "words": 300 },`,
        `    ...`,
        `  ]`,
        `}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `选题：${input.ideaTitle}`,
        `角度：${input.ideaAngle || "（自行判断最佳角度）"}`,
        "",
        "【任务书】",
        `- 读者：${input.brief.targetReader}`,
        `- 真正问题：${input.brief.realProblem}`,
        `- 核心判断：${input.brief.coreJudgment}`,
        `- 反方观点：${input.brief.counterView}`,
        `- 适用边界：${input.brief.boundary}`,
        "",
        "【证据账本（claims）】",
        evidence || "（无证据）",
      ].join("\n"),
    },
  ]
}

const MAX_SECTIONS = 8

export function parseOutline(raw: unknown): Outline | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const sectionsRaw = Array.isArray(o.sections) ? o.sections : []
  const sections: OutlineSection[] = []
  for (const s of sectionsRaw.slice(0, MAX_SECTIONS)) {
    const x = s as Record<string, unknown>
    const heading = String(x.heading ?? "").trim().slice(0, 40)
    const point = String(x.point ?? "").trim().slice(0, 200)
    if (!heading || !point) continue
    sections.push({
      heading,
      point,
      evidence: Array.isArray(x.evidence)
        ? x.evidence.map((e) => Number(e)).filter((n) => Number.isInteger(n) && n > 0 && n < 100).slice(0, 6)
        : [],
      illustration: String(x.illustration ?? "").slice(0, 200),
      imageCaption: String(x.imageCaption ?? "").slice(0, 60),
      words: Math.min(500, Math.max(100, Math.round(Number(x.words) || 250))),
    })
  }
  if (sections.length < 3) return null
  return {
    title: String(o.title ?? "").trim().slice(0, 60) || "未命名",
    sections,
  }
}

// ---------- 分节生成（逐节聚焦写作） ----------

export interface SectionDraftInput {
  outline: Outline
  sectionIndex: number // 当前写第几节（0 起）
  brief: Brief
  persona: Persona
  claims: {
    idx: number
    text: string
    claimType: string
    verified: boolean | null
    sourceSite: string
    sourceTitle: string
    sourceDate: string
    sourceUrl: string
  }[]
  rules: string[] // 飞轮 active 规则
  ideaTitle: string
  ideaAngle: string
  stylePrompt?: string
  exemplarPrompt?: string
  /** 已写完的各节正文（上下文连贯性） */
  writtenSoFar: string[]
}

export function sectionMessages(input: SectionDraftInput): ChatMessage[] {
  const sec = input.outline.sections[input.sectionIndex]
  const isFirst = input.sectionIndex === 0
  const isLast = input.sectionIndex === input.outline.sections.length - 1
  const evidenceIds = new Set(sec.evidence)
  const evidence = input.claims
    .filter((c) => evidenceIds.has(c.idx))
    .map(
      (c) =>
        `[${c.idx}] ${c.claimType}｜${c.text}\n     来源：${c.verified ? `${c.sourceSite}《${c.sourceTitle}》${c.sourceDate}` : "（未找到直接来源，不得作为事实陈述）"}\n     URL：${c.sourceUrl || "无"}`,
    )
    .join("\n")

  const system = [
    "你是一名遵循大纲逐节写作的公众号作者。只写指定的这一节，写好它。",
    "",
    "【写作人格】",
    `${input.persona.label}：${input.persona.voice}`,
    input.stylePrompt ? `\n【创作者风格定位】\n${input.stylePrompt}` : "",
    input.exemplarPrompt ? `\n${input.exemplarPrompt}` : "",
    "",
    "【铁律（优先级最高）】",
    "1. 引用事实时句尾标 [n] 上标编号，n 对应证据块编号，禁止编造来源。",
    "2. verified=false 或无来源的主张，不得作为事实陈述；可作为「有观点认为」或删去。",
    "3. 禁止编造作者个人经历（「我上周去…」类内容一律禁止）。",
    "4. 只输出本节正文（以「## 小节标题」开头），不要写其他小节，不要全文。",
    input.rules.length > 0 ? "5. 编辑飞轮稳定规则，必须遵守：\n" + input.rules.map((r) => `   - ${r}`).join("\n") : "",
  ]
    .filter(Boolean)
    .join("\n")

  const context = input.writtenSoFar.length
    ? ["【已写各节（保持衔接，不要重复其中内容）】", ...input.writtenSoFar.map((t) => t.slice(0, 600))].join("\n\n")
    : ""

  const user = [
    `文章标题：${input.outline.title}`,
    `选题：${input.ideaTitle}｜角度：${input.ideaAngle || "按任务书"}`,
    "",
    "【全文大纲（你只写第 " + (input.sectionIndex + 1) + " 节）】",
    ...input.outline.sections.map(
      (s, i) => `${i + 1}. ${s.heading} —— ${s.point}${i === input.sectionIndex ? " ◀ 本节" : ""}`,
    ),
    "",
    "【本节任务】",
    `- 小节标题：${sec.heading}`,
    `- 本节论点：${sec.point}`,
    `- 引用证据编号：${sec.evidence.length ? sec.evidence.join(", ") : "（本节靠推理，不引数据）"}`,
    `- 字数预算：${sec.words} 字（±20%）`,
    isFirst ? "- 这是第一节：开场要有钩子，三句内让读者知道「这篇为什么值得读」。" : "",
    isLast ? "- 这是最后一节：收束核心判断，给出可执行结论（3 条以内），不要开新话题。" : "",
    "",
    "【证据块（本节相关）】",
    evidence || "（本节无指定证据，靠推理推进，不得编造数据）",
    context ? "\n" + context : "",
  ]
    .filter(Boolean)
    .join("\n")

  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

/** 拼装全文：H1 标题 + 各节正文（去重小节标题行，规范 ## 层级） */
export function assembleDraft(outline: Outline, sectionBodies: string[]): string {
  const parts: string[] = [`# ${outline.title}`, ""]
  for (const body of sectionBodies) {
    const cleaned = body
      .trim()
      // 统一小节层级：正文里出现的 #/### 一律归一到 ##
      .replace(/^#{1,6}\s+/gm, "## ")
      // 去掉正文里重复的全文标题行
      .replace(new RegExp(`^##\\s+${outline.title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`, "m"), "")
    parts.push(cleaned.trim(), "")
  }
  return parts.join("\n").trim() + "\n"
}
