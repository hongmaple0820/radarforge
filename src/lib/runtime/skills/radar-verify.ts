// ============================================================
// radar-verify —— 原子断言核验 skill（P0 质量管线 L1 事实层）
// 学 FActScore（2305.14247）：长文拆原子断言 → 逐条检索核验；
// SAFE（2403.18802）：成本约人工 2%，自媒体生命线——一次事实
// 翻车抵消一百篇好文。无据率超阈值 → 发布门禁拦截。
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"

export interface AtomicAssertion {
  text: string // 自包含的原子事实断言（含数字/日期/名称/事件）
}

/** 从成稿抽取原子断言（10~20 条，只抽可核验的事实型） */
export function atomicAssertionsMessages(markdown: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是事实核查员。把文章拆解为原子断言（atomic claims）：每条是一个自包含、可独立核验的事实陈述。",
        "抽取规则：",
        "- 只抽事实型断言：含数字、日期、公司/产品/人名、事件、比例、排名的陈述",
        "- 不抽：观点、预测、建议、修辞、常识性背景",
        "- 每条改写为主语+具体事实的完整短句（脱离上下文也能看懂），保留原文数字与专有名词，不加主观修饰",
        "- 抽 10~20 条（按文章事实密度；事实不足 10 条时宁少勿滥）",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{ "assertions": [ { "text": "OpenAI 于 2024 年 5 月发布 GPT-4o" }, ... ] }`,
      ].join("\n"),
    },
    { role: "user", content: markdown.slice(0, 12000) },
  ]
}

export function parseAssertions(raw: unknown): AtomicAssertion[] {
  if (!raw || typeof raw !== "object") return []
  const o = raw as Record<string, unknown>
  const list = Array.isArray(o.assertions) ? o.assertions : []
  const out: AtomicAssertion[] = []
  const seen = new Set<string>()
  for (const item of list) {
    const text = String((item as Record<string, unknown>)?.text ?? item ?? "").trim().slice(0, 160)
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push({ text })
  }
  return out.slice(0, 20)
}

// ---------- 无据率与门禁阈值 ----------

export interface AssertionStats {
  total: number
  verified: number
  unsupported: number
  unsupportedRate: number // 0~1
  threshold: number // 门禁阈值（0~1）
  gateBlocked: boolean
}

export const ASSERT_GATE_THRESHOLD = 0.3 // 无据率 >30% → 门禁拦截（P0 方案定值）

export function assertionStats(verifiedCount: number, totalCount: number): AssertionStats {
  const unsupported = Math.max(0, totalCount - verifiedCount)
  const unsupportedRate = totalCount > 0 ? unsupported / totalCount : 0
  return {
    total: totalCount,
    verified: verifiedCount,
    unsupported,
    unsupportedRate: Math.round(unsupportedRate * 1000) / 1000,
    threshold: ASSERT_GATE_THRESHOLD,
    gateBlocked: totalCount > 0 && unsupportedRate > ASSERT_GATE_THRESHOLD,
  }
}
