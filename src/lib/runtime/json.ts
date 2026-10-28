/**
 * LLM JSON 输出解析工具
 *
 * prompt 层要求模型输出 JSON，但真实返回常带 ```json 围栏或前后缀说明，
 * 这里用「首个平衡大括号块」策略稳健提取，失败时给出明确错误（不静默）。
 */

export class LlmJsonError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LlmJsonError'
  }
}

/** 从 LLM 返回文本中提取第一个平衡的 JSON 对象并解析 */
export function extractJson<T>(raw: string): T {
  if (!raw || !raw.trim()) throw new LlmJsonError('LLM 返回为空')

  // 优先：```json ... ``` 围栏
  const fenced = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(raw)
  const candidates: string[] = []
  if (fenced?.[1]) candidates.push(fenced[1].trim())

  // 兜底：首个平衡大括号块
  const start = raw.indexOf('{')
  if (start >= 0) {
    let depth = 0
    let inStr = false
    let esc = false
    for (let i = start; i < raw.length; i++) {
      const ch = raw[i]
      if (esc) {
        esc = false
        continue
      }
      if (ch === '\\') {
        esc = true
        continue
      }
      if (ch === '"') inStr = !inStr
      if (inStr) continue
      if (ch === '{') depth++
      else if (ch === '}') {
        depth--
        if (depth === 0) {
          candidates.push(raw.slice(start, i + 1))
          break
        }
      }
    }
  }

  // 最后尝试整体
  candidates.push(raw.trim())

  for (const c of candidates) {
    try {
      return JSON.parse(c) as T
    } catch {
      /* 尝试下一个候选 */
    }
  }
  throw new LlmJsonError(`无法从 LLM 输出中解析 JSON（前 120 字符：${raw.slice(0, 120)}…）`)
}

/** 数组也支持（部分输出是 [...] 顶层形态） */
export function extractJsonArray<T>(raw: string): T[] {
  const arr = /```(?:json)?\s*\n?([\s\S]*?)\n?```/.exec(raw)?.[1]?.trim() ?? raw.trim()
  const start = arr.indexOf('[')
  const end = arr.lastIndexOf(']')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(arr.slice(start, end + 1)) as T[]
    } catch {
      /* fallthrough */
    }
  }
  try {
    return JSON.parse(arr) as T[]
  } catch {
    throw new LlmJsonError(`无法解析 JSON 数组（前 120 字符：${raw.slice(0, 120)}…）`)
  }
}
