/**
 * radar-learn —— 编辑飞轮 skill（wewrite「学习我的修改」的自研版）
 *
 * 用户在预览中改稿保存时触发：把「改前 / 改后」交给 LLM 做差异归纳，
 * 提炼成可复用的写作规则，落 LearningRule 表（proposed 状态，用户确认后
 * 变 active，注入后续所有写作）。谨慎升级原则：规则必须来自「真实发生的
 * 修改」，不做过度概括。
 */

import type { ChatMessage } from '@/lib/gateway/types'
import { extractJson } from '../json'

export interface LearnResult {
  rules: Array<{ ruleText: string; examples: Array<{ before: string; after: string }> }>
  noPattern: boolean
}

export function buildLearnMessages(args: { before: string; after: string }): ChatMessage[] {
  return [
    {
      role: 'system',
      content:
        '你是写作规则提炼器。对比「改前 / 改后」两版文本，归纳作者（人类编辑）的修改偏好。只输出 JSON，不要解释。',
    },
    {
      role: 'user',
      content: `对比以下两版文本，回答：这位编辑的修改反映了哪些**可复用的写作规则**？

改前：
${args.before.slice(0, 6000)}

改后：
${args.after.slice(0, 6000)}

输出 JSON：
{
  "rules": [
    {
      "ruleText": "一句话规则（40 字内，可执行，如「数字一律用阿拉伯数字而非汉字」「删除所有『值得注意的是』类填充句」）",
      "examples": [{ "before": "改前片段（30 字内）", "after": "改后片段（30 字内）" }]
    }
  ]
}

要求：
- 只提炼「重复出现或非常明确」的稳定偏好，宁缺毋滥
- 一次性措辞润色、个别事实修正不算规则，不要硬凑
- 如果修改只是无关紧要的微调，输出 {"rules": []}
- 最多 3 条`,
    },
  ]
}

export function parseLearnResult(rawLlm: string): LearnResult {
  const parsed = extractJson<{ rules?: unknown }>(rawLlm)
  const rules = Array.isArray(parsed.rules)
    ? parsed.rules
        .map((r) => {
          const obj = r as { ruleText?: unknown; examples?: unknown }
          const ruleText = typeof obj.ruleText === 'string' ? obj.ruleText.trim() : ''
          const examples = Array.isArray(obj.examples)
            ? obj.examples
                .map((e) => {
                  const eo = e as { before?: unknown; after?: unknown }
                  return {
                    before: String(eo.before ?? '').slice(0, 60),
                    after: String(eo.after ?? '').slice(0, 60),
                  }
                })
                .filter((e) => e.before || e.after)
                .slice(0, 3)
            : []
          return { ruleText, examples }
        })
        .filter((r) => r.ruleText.length >= 4 && r.ruleText.length <= 80)
        .slice(0, 3)
    : []
  return { rules, noPattern: rules.length === 0 }
}

/** 极简字符级差异摘要（供「改了什么」的人话描述，不进 LLM） */
export function summarizeDiff(before: string, after: string): string {
  const same = before === after
  if (same) return '文本未变化'
  const added = Math.max(0, after.length - before.length)
  const removed = Math.max(0, before.length - after.length)
  const pct = before.length === 0 ? 100 : Math.round((Math.abs(after.length - before.length) / before.length) * 100)
  return `改前 ${before.length} 字 → 改后 ${after.length} 字（${added > 0 ? `+${added}` : ''}${added > 0 && removed > 0 ? ' / ' : ''}${removed > 0 ? `-${removed}` : ''}，幅度约 ${pct}%）`
}
