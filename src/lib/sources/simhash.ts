// ============================================================
// simhash.ts —— 标题/摘要去重指纹（P1 p14 信源层）
// 学 TrendRadar 的 SimHash 去重：同一事件被多家源转载时，
// 标题+摘要的 SimHash 海明距离 ≤3 即判重复（跨源去重）。
// token 复用 matching.ts 的 CJK bigram + 拉丁词分词器——
// 与 claims 匹配同一套语言学假设，维护一致性。
// 64-bit 用两个 32 位半字实现（避免 BigInt 性能负担）。
// ============================================================

import { tokenize } from "../runtime/matching.ts" // .ts 扩展：Node 离线可测规约

/** SimHash：返回 64-bit 的十六进制字符串（16 字符） */
export function simhash64(text: string): string {
  const tokens = tokenize(text)
  if (tokens.length === 0) return "0".repeat(16)
  const weights = new Map<string, number>()
  for (const t of tokens) weights.set(t, (weights.get(t) ?? 0) + 1)

  const bits = new Array<number>(64).fill(0)
  for (const [tok, w] of weights) {
    const h1 = fnv32a(tok)
    const h2 = fnv32b(tok)
    for (let i = 0; i < 32; i++) {
      bits[i] += (h1 >>> i) & 1 ? w : -w
      bits[32 + i] += (h2 >>> i) & 1 ? w : -w
    }
  }
  let hi = 0
  let lo = 0
  for (let i = 0; i < 32; i++) {
    if (bits[i] > 0) lo |= 1 << i
    if (bits[32 + i] > 0) hi |= 1 << i
  }
  return (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0")
}

/** 海明距离（输入两个 16 字符十六进制串） */
export function hammingHex(a: string, b: string): number {
  if (!a || !b) return 64 // 缺指纹视为最远
  const hi = (parseInt(a.slice(0, 8), 16) ^ parseInt(b.slice(0, 8), 16)) >>> 0
  const lo = (parseInt(a.slice(8), 16) ^ parseInt(b.slice(8), 16)) >>> 0
  return popcount(hi) + popcount(lo)
}

/** 去重阈值：≤3 位不同视为同一事件（经验值，转载标题高度相似） */
export const SIMHASH_DUP_DISTANCE = 3

/** 判断两条目是否重复（跨源去重入口） */
export function isDuplicate(a: string, b: string): boolean {
  return hammingHex(a, b) <= SIMHASH_DUP_DISTANCE
}

// ---------- FNV-1a 32 位双种子（第二种子换初始值，降碰撞相关性） ----------
function fnv32a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
function fnv32b(s: string): number {
  let h = 0x9dc5811c // 位翻转的种子
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}
function popcount(x: number): number {
  x = x - ((x >> 1) & 0x55555555)
  x = (x & 0x33333333) + ((x >> 2) & 0x33333333)
  x = (x + (x >> 4)) & 0x0f0f0f0f
  return (Math.imul(x, 0x01010101) >> 24) & 0x3f
}
