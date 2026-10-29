// ============================================================
// LLM JSON 稳健解析 —— 流水线各级 JSON 产物的统一入口
// 处理：```json 代码块包裹 / 尾逗号 / 截断 / 前后缀噪声
// 失败返回 null（调用方自行降级），绝不抛异常炸流水线
// ============================================================

/** 从 LLM 输出中提取第一个合法 JSON 对象/数组 */
export function extractJson<T = unknown>(raw: string): T | null {
  if (!raw) return null
  let s = raw.trim()

  // 1) 剥 ```json ... ``` 代码块
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()

  // 2) 定位首个 { 或 [
  const start = s.search(/[{[]/)
  if (start === -1) return null
  const open = s[start]
  const close = open === "{" ? "}" : "]"
  // 取到最后一个匹配的闭括号（容忍尾随文字）
  const end = s.lastIndexOf(close)
  if (end <= start) return null
  let candidate = s.slice(start, end + 1)

  const tryParse = (text: string): T | null => {
    try {
      return JSON.parse(text) as T
    } catch {
      return null
    }
  }

  // 3) 直接解析
  let out = tryParse(candidate)
  if (out !== null) return out

  // 4) 修复常见毛病：尾逗号 / 智能引号 key / 单引号包裹值
  const repaired = candidate
    .replace(/,\s*([}\]])/g, "$1") // 尾逗号
    .replace(/[""]([^""：]*?)[""](\s*:)/g, '"$1"$2') // 中文引号 key
  out = tryParse(repaired)
  if (out !== null) return out

  // 5) 截断修复：逐字符扫描找最深合法前缀（闭合到顶层）
  let depth = 0
  let inStr = false
  let esc = false
  for (let i = 0; i < candidate.length; i++) {
    const c = candidate[i]
    if (esc) {
      esc = false
      continue
    }
    if (c === "\\") {
      if (inStr) esc = true
      continue
    }
    if (c === '"') {
      inStr = !inStr
      continue
    }
    if (inStr) continue
    if (c === "{" || c === "[") depth++
    else if (c === "}" || c === "]") {
      depth--
      if (depth === 0) {
        const prefix = candidate.slice(0, i + 1)
        const fixed = prefix.replace(/,\s*([}\]]?)$/g, "$1")
        out = tryParse(fixed) ?? tryParse(prefix)
        if (out !== null) return out
      }
    }
  }
  return null
}

/** 安全读取嵌套字段 */
export function pick(obj: unknown, path: string): unknown {
  let cur: unknown = obj
  for (const key of path.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined
    cur = (cur as Record<string, unknown>)[key]
  }
  return cur
}

/** 数字钳制 */
export function clampNum(v: unknown, min: number, max: number, dflt: number): number {
  const n = typeof v === "number" ? v : Number(v)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}
