// ============================================================
// prompt-library —— 图像提示词模板库检索（B4）
// 事实源：db/asset/image-prompt-library/*.json（3774 条中英双语
// 专业生图提示词，来源 @q253595422/dsh-imagegen-video，署名见同目录
// THIRD_PARTY_NOTICES.md）。
// 用法（方案 B4「检索式使用」）：配图导演生成前，按
// 「选题+锚点+概念」检索 top-N 范例，作为 few-shot 参考注入——
// 学结构与用词，不整库塞上下文，不照抄内容。
// 检索：CJK 二元组（bigram）+ 拉丁词干双通道匹配，
// title/categoryZh/styles/prompt 四字段加权计分。
// ============================================================

import { readFile, readdir } from "fs/promises"
import path from "path"

export interface LibraryCase {
  /** 条目标题（中文） */
  title: string
  /** 中英双语完整提示词（含「英文版：」段） */
  prompt: string
  category: string
  categoryZh: string
  styles: string[]
  /** 来源快照文件名（署名溯源） */
  sourceFile: string
}

export interface RetrieveOptions {
  /** 返回条数上限（默认 3） */
  limit?: number
  /** 命中分数下限（默认 1：至少一个 bigram/词命中） */
  minScore?: number
}

const LIB_DIR = path.join(process.cwd(), "db", "asset", "image-prompt-library")

// ---------- 惰性全库加载（进程内缓存；7MB JSON 首读 ~几十 ms） ----------

let cache: LibraryCase[] | null = null
let loading: Promise<LibraryCase[]> | null = null

function extractCases(raw: unknown, sourceFile: string): LibraryCase[] {
  if (!raw || typeof raw !== "object") return []
  const o = raw as Record<string, unknown>
  const arr = Array.isArray(o.cases) ? o.cases : []
  const out: LibraryCase[] = []
  for (const c of arr) {
    if (!c || typeof c !== "object") continue
    const x = c as Record<string, unknown>
    const title = String(x.title ?? "").trim()
    const prompt = String(x.prompt ?? "").trim()
    if (!title || !prompt) continue
    out.push({
      title: title.slice(0, 120),
      prompt: prompt.slice(0, 2000),
      category: String(x.category ?? "").slice(0, 60),
      categoryZh: String(x.categoryZh ?? "").slice(0, 60),
      styles: Array.isArray(x.styles) ? x.styles.map((s) => String(s).slice(0, 40)).slice(0, 8) : [],
      sourceFile,
    })
  }
  return out
}

async function loadLibrary(dir = LIB_DIR): Promise<LibraryCase[]> {
  if (cache) return cache
  if (loading) return loading
  loading = (async () => {
    const out: LibraryCase[] = []
    let files: string[] = []
    try {
      files = (await readdir(dir)).filter((f) => f.endsWith("cases.json"))
    } catch {
      cache = [] // 目录缺失（资产未安装）→ 空库诚实降级，不炸产线
      return cache
    }
    for (const f of files) {
      try {
        const raw = JSON.parse(await readFile(path.join(dir, f), "utf-8"))
        out.push(...extractCases(raw, f))
      } catch {
        /* 单文件坏 JSON 跳过（不因一个快照拖垮整库） */
      }
    }
    cache = out
    return out
  })()
  return loading
}

/** 测试/热加载用：清空缓存 */
export function resetLibraryCache(): void {
  cache = null
  loading = null
}

// ---------- 分词与计分 ----------

/** 查询 → bigram（CJK）+ 小写拉丁词 双通道 token */
export function queryTokens(query: string): string[] {
  const tokens: string[] = []
  // 拉丁词（含数字）
  for (const m of query.match(/[A-Za-z][A-Za-z0-9_-]{1,}/g) ?? []) tokens.push(m.toLowerCase())
  // CJK 连续段 → bigram
  for (const seg of query.match(/[\u4e00-\u9fff]{2,}/g) ?? []) {
    for (let i = 0; i + 2 <= seg.length; i++) tokens.push(seg.slice(i, i + 2))
  }
  return tokens
}

const SCORE_FIELDS: Array<{ key: keyof LibraryCase; weight: number }> = [
  { key: "title", weight: 6 }, // 标题命中权重最高（主题对口）
  { key: "categoryZh", weight: 4 },
  { key: "styles", weight: 2 },
  { key: "prompt", weight: 1 }, // 提示词正文命中兜底（大字段，权重低防刷分）
]

/** 全库检索：多字段加权 bigram/词匹配，返回按分降序的 top-N */
export async function retrieveTemplates(query: string, opts: RetrieveOptions = {}): Promise<LibraryCase[]> {
  const limit = Math.min(10, Math.max(1, opts.limit ?? 3))
  const minScore = opts.minScore ?? 1
  const tokens = queryTokens(query)
  if (tokens.length === 0) return []
  const lib = await loadLibrary()
  const scored: { c: LibraryCase; s: number }[] = []
  for (const c of lib) {
    let s = 0
    for (const { key, weight } of SCORE_FIELDS) {
      const hay = Array.isArray(c[key]) ? (c[key] as string[]).join(" ") : String(c[key])
      if (!hay) continue
      const lower = hay.toLowerCase()
      for (const t of tokens) {
        if (lower.includes(t)) s += weight
      }
    }
    if (s >= minScore) scored.push({ c, s })
  }
  scored.sort((a, b) => b.s - a.s || (a.c.title < b.c.title ? -1 : 1)) // 分同→标题字典序稳定
  return scored.slice(0, limit).map((x) => x.c)
}

/** 库存统计（测试与诊断用） */
export async function libraryStats(): Promise<{ total: number; files: number }> {
  const lib = await loadLibrary()
  const files = new Set(lib.map((c) => c.sourceFile)).size
  return { total: lib.length, files }
}

/**
 * 范例块拼装：top-N 条目 → 导演 user 消息的「参考范例」注入块。
 * 每条截取中文段（到「英文版：」为止，≤160 字），学结构不灌全文。
 */
export function exemplarBlock(hits: LibraryCase[], maxChars = 160): string {
  if (hits.length === 0) return ""
  const lines = hits.map((h, i) => {
    const zhPart = h.prompt.split(/英文版[：:]/)[0].replace(/\s+/g, " ").trim().slice(0, maxChars)
    const tags = [h.categoryZh, ...h.styles.slice(0, 2)].filter(Boolean).join("/")
    return `范例${i + 1}（${tags}）：${zhPart}`
  })
  return ["【专业生图提示词范例（学其结构与用词密度，不照抄具体内容）】", ...lines].join("\n")
}
