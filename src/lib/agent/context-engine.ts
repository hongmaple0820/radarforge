// ============================================================
// Context Engine —— Agent 运行时上下文组装
// 职责：skill 指令 + 用户输入 + 检索注入（经网关） → 组装成 LLM 消息
// 学 wewrite 三层解耦：Prompt（skill）/ Runtime（本引擎）/ State（DB）
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"
import { chatRetry, searchWithFallback } from "@/lib/gateway"
import { loadSkillBody } from "./skill-loader"

export interface ContextInjection {
  query: string
  mode: "REAL" | "DEMO"
  provider: string
  results: { title: string; url: string; site: string; date: string; passage: string }[]
}

const MAX_SKILL_BODY = 6000 // 防止超长 skill 挤爆上下文
const MAX_RESULTS = 8

/** 从用户输入提取检索词：优先引号内 > 前 40 字 */
export function extractQuery(input: string): string {
  const quoted = input.match(/[「"“']([^」"”']{2,40})[」"”']/)
  if (quoted) return quoted[1]
  const cleaned = input.replace(/\s+/g, " ").trim()
  return cleaned.slice(0, 40)
}

/** 检索注入：真实搜索一次，把证据塞进上下文（可溯源 [n] 的基础） */
export async function injectSearch(input: string): Promise<ContextInjection> {
  const query = extractQuery(input)
  const resp = await searchWithFallback({ query, count: MAX_RESULTS })
  return {
    query,
    mode: resp.mode,
    provider: resp.provider,
    results: resp.results.map((r) => ({
      title: r.title,
      url: r.url,
      site: r.site,
      date: r.date,
      passage: r.passage,
    })),
  }
}

/** 把检索结果编号为证据块（[n] 引用契约） */
export function renderEvidence(inj: ContextInjection): string {
  if (inj.results.length === 0) return "（本次未检索到证据）"
  return inj.results
    .map((r, i) => `[${i + 1}] ${r.title}｜${r.site}｜${r.date}\n    ${r.passage.slice(0, 200)}`)
    .join("\n")
}

export interface BuildContextArgs {
  skillId: string
  input: string
  injection?: ContextInjection
}

/** 组装执行消息（system=skill 指令，user=输入+证据） */
export async function buildRunMessages(args: BuildContextArgs): Promise<{
  messages: ChatMessage[]
  injection: ContextInjection
  skillName: string
}> {
  const skill = await loadSkillBody(args.skillId)
  if (!skill) throw new Error(`skill "${args.skillId}" 不存在`)
  const injection = args.injection ?? (await injectSearch(args.input))

  const system = [
    `你是一个严格遵循技能指令的内容 Agent。以下是你的技能指令（SKILL.md）：`,
    `---`,
    skill.body.slice(0, MAX_SKILL_BODY),
    `---`,
    `执行要求：`,
    `1. 严格按技能指令的角色、流程与风格执行任务。`,
    `2. 引用证据时使用 [n] 上标编号，编号对应下方证据块，不得编造来源。`,
    `3. 输出为 Markdown。`,
  ].join("\n")

  const user = [
    `任务输入：${args.input}`,
    ``,
    `检索证据（检索词「${injection.query}」，provider=${injection.provider}，mode=${injection.mode}）：`,
    renderEvidence(injection),
    ``,
    `请开始执行任务。`,
  ].join("\n")

  return {
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    injection,
    skillName: skill.name,
  }
}

/** 审稿消息（编辑飞轮第二步：五维审稿的轻量版） */
export function buildReviewMessages(draft: string): ChatMessage[] {
  return [
    {
      role: "system",
      content:
        "你是一名严格的技术编辑，按五个维度审稿：事实准确性、来源可溯性、逻辑连贯、表达质量、合规风险。输出简短的审稿意见（Markdown 列表，每维一行：通过/警告+一句话），最后给一个 0-10 总分。",
    },
    { role: "user", content: draft.slice(0, 8000) },
  ]
}

export { chatRetry }
