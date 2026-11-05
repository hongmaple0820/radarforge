// ============================================================
// radar-outline —— 大纲先行 + 分节生成 skill（编排层）
// A1 接管后：prompt 主体在 db/skills/wewrite-outline 与
// wewrite-draft（prompt: section 分节）/SKILL.md；
// A2：篇幅三档驱动节数/字数指令与解析钳制（替代 100~500/8 节硬编码）；
// 上下文滚动窗（rollingContext）防 deep 档上下文撑爆。
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"
import type { Brief } from "./radar-write"
import type { Persona } from "./radar-write"
import {
  clampSectionWords,
  maxSections,
  resolveLengthTier,
  rollingContext,
  tierOutlineRule,
  tierSectionWordsRule,
  tierTotalWordsRule,
  type LengthTier,
} from "../length-tier.ts"
import { renderSkillPrompt } from "../skill-prompt.ts"
import { skeletonBlock, type NarrativeSkeleton } from "../narrative-skeletons.ts"

// ---------- 大纲 JSON ----------

export interface OutlineSection {
  heading: string // 小节标题（## 级，将作为锚点回插配图）
  point: string // 本节论点（一句话，敢表态）
  evidence: number[] // 引用的证据块编号（对应 claims 账本 [n]）
  illustration: string // 配图位描述（无则空串）
  imageCaption: string // 图说（无则空串）
  words: number // 字数预算（档位钳制）
}

export interface Outline {
  title: string
  sections: OutlineSection[]
}

export async function outlineMessages(input: {
  brief: Brief
  ideaTitle: string
  ideaAngle: string
  claims: { idx: number; text: string; verified: boolean | null }[]
  stylePrompt?: string
  tier?: LengthTier // A2：篇幅档位（缺省 medium，与设置默认一致）
  skeleton?: NarrativeSkeleton | null // A3：叙事骨架（null = 默认结构；自动轮换由调用方决定后传入）
  /** A4：研究缺口清单（单轮检索未证实的 fact 主张；大纲规避或标注不确定性） */
  researchGaps?: string[]
}): Promise<ChatMessage[]> {
  const tier = input.tier ?? resolveLengthTier()
  const evidence = input.claims
    .map((c) => `[${c.idx}] ${c.verified === null ? "非事实" : c.verified ? "已核实" : "无来源"}｜${c.text}`)
    .join("\n")
  const gapBlock =
    input.researchGaps && input.researchGaps.length > 0
      ? [
          "",
          "【已知研究缺口（单轮检索未证实——大纲与写作时规避引用，或明确标注「未经证实」）】",
          ...input.researchGaps.map((g) => `- ${g}`),
        ].join("\n")
      : ""
  const system = await renderSkillPrompt("wewrite-outline", undefined, {
    style_block: input.stylePrompt ? `\n【创作者风格定位】\n${input.stylePrompt}\n` : "",
    sections_rule: tierOutlineRule(tier),
    total_words_rule: tierTotalWordsRule(tier),
    section_words_rule: tierSectionWordsRule(tier),
    skeleton_block: skeletonBlock(input.skeleton ?? null),
  })
  return [
    { role: "system", content: system },
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
        gapBlock,
      ].join("\n"),
    },
  ]
}

export function parseOutline(raw: unknown, tier?: LengthTier): Outline | null {
  const t = tier ?? resolveLengthTier()
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const sectionsRaw = Array.isArray(o.sections) ? o.sections : []
  const sections: OutlineSection[] = []
  for (const s of sectionsRaw.slice(0, maxSections(t))) {
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
      words: clampSectionWords(x.words, t),
    })
  }
  if (sections.length < 3) return null
  normalizeSectionBudgets(sections, t)
  return {
    title: String(o.title ?? "").trim().slice(0, 60) || "未命名",
    sections,
  }
}

/**
 * A2 合计预算带归一化：每节 words 各自钳制后，预算总和可能仍落在
 * 档位总带之外（实测：8 节 × 300 = 2400 < medium 下限 2500 → 成稿 2257 字）。
 * 规则：总和 < totalMin → 等比放大到 totalMin×1.1（留 10% 落笔余量，
 * 实测成稿约为预算的 94%）；总和 > totalMax → 等比缩到 totalMax×0.9。
 * 放大受每节上限约束（不够就到顶为止），两轮迭代收敛钳制漂移。
 */
function normalizeSectionBudgets(sections: OutlineSection[], t: import("../length-tier.ts").LengthTier): void {
  if (sections.length === 0) return
  const sum = () => sections.reduce((a, s) => a + s.words, 0)
  for (let round = 0; round < 2; round++) {
    const cur = sum()
    let target = cur
    if (cur < t.totalMin) target = Math.round(t.totalMin * 1.1)
    else if (cur > t.totalMax) target = Math.round(t.totalMax * 0.9)
    if (target === cur) break
    const k = target / cur
    for (const s of sections) s.words = clampSectionWords(Math.round(s.words * k), t)
    if (sum() === cur) break // 钳制吃掉了全部缩放（节数太少/太多到顶）→ 尽力而为
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
  /** P1 p15 调优指令（评测驱动选优后的变体注入；v0 基线为空） */
  tunePrompt?: string
  /** 已写完的各节正文（A2：调用方先过 rollingContext 滚动窗再传入） */
  writtenSoFar: string[]
  /** A2：字数偏离重生时的一次性反馈（如「上次生成 320 字，偏离预算 800 字」）；常规生成不传 */
  retryNote?: string
}

export async function sectionMessages(input: SectionDraftInput): Promise<ChatMessage[]> {
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

  const system = await renderSkillPrompt("wewrite-draft", "section", {
    persona_label: input.persona.label,
    persona_voice: input.persona.voice,
    style_block: input.stylePrompt ? `\n【创作者风格定位】\n${input.stylePrompt}` : "",
    exemplar_block: input.exemplarPrompt ? `\n${input.exemplarPrompt}` : "",
    tune_block: input.tunePrompt ? `\n${input.tunePrompt}` : "",
    rules_block:
      input.rules.length > 0
        ? "5. 编辑飞轮稳定规则，必须遵守：\n" + input.rules.map((r) => `   - ${r}`).join("\n")
        : "",
  })

  const context = input.writtenSoFar.length
    ? ["【已写各节（保持衔接，不要重复其中内容）】", ...input.writtenSoFar].join("\n\n")
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
    input.retryNote ? `- 字数反馈（上一次生成偏离预算，本次严格贴近）：${input.retryNote}` : "",
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

/** rollingContext 再导出（run-manager 组装滚动窗用；语义见 length-tier.ts） */
export { rollingContext }

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
