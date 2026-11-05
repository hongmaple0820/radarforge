// ============================================================
// skill-prompt —— 流水线提示词的 SKILL.md 单一事实源（A1）
// 图文线九步的 system prompt 主体下沉 db/skills/<id>/SKILL.md，
// ts 模块退化为「编排 + 变量注入 + 解析」；用户改 SKILL.md 即改行为。
// 解析优先级：~/.radarforge/skills/<id>（用户覆盖）> db/skills/<id>（产品库）。
// 两级都没有 → 显式抛错（不静默回退，方案 A1 验收项）。
// 占位符协议：{{var}}；多 prompt 技能用 <!-- prompt: name --> 分节。
// ============================================================

import { readFile } from "fs/promises"
import path from "path"
import os from "os"

/** 流水线技能（产品基础设施）：不可在技能中心停用（停用会断产线） */
export const PIPELINE_SKILL_IDS: ReadonlySet<string> = new Set([
  "wewrite-brief",
  "wewrite-outline",
  "wewrite-draft",
  "wewrite-review",
  "wewrite-fact-check",
  "wewrite-illustrate",
  "wewrite-art-direct",
])

export class SkillPromptMissingError extends Error {
  skillId: string
  constructor(skillId: string) {
    super(`流水线技能 ${skillId} 的 SKILL.md 不存在（db/skills 与 ~/.radarforge/skills 均未找到）——产线提示词缺失，拒绝静默回退`)
    this.name = "SkillPromptMissingError"
    this.skillId = skillId
  }
}

export interface SkillPromptSource {
  id: string
  body: string
  from: "product" | "user"
}

/** 目录解析（可注入覆盖，测试用） */
export interface SkillPromptDirs {
  productDir: string
  userDir: string
}

const DEFAULT_DIRS: SkillPromptDirs = {
  productDir: path.join(process.cwd(), "db", "skills"),
  userDir: path.join(os.homedir(), ".radarforge", "skills"),
}

// 5s 热加载缓存（与 settings 同节奏；改 SKILL.md 后最长 5s 生效）
const cache = new Map<string, { at: number; src: SkillPromptSource }>()
const CACHE_TTL_MS = 5_000

async function readSkillFile(dir: string, id: string): Promise<string | null> {
  try {
    return await readFile(path.join(dir, id, "SKILL.md"), "utf-8")
  } catch {
    return null
  }
}

/** 去掉 frontmatter 取正文（与 skills/frontmatter.ts stripFrontmatter 同语义，避免运行时↔安装器循环依赖） */
function stripFrontmatter(raw: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  return m ? m[1] : raw
}

/**
 * 读取技能 prompt 正文。用户位覆盖产品位；两级都缺 → SkillPromptMissingError。
 * 注：缓存仅对默认目录（db/skills + ~/.radarforge/skills）生效；
 * 注入自定义目录（测试隔离）时直读文件，避免跨目录串味。
 */
export async function loadSkillPrompt(
  id: string,
  dirs: SkillPromptDirs = DEFAULT_DIRS,
  force = false,
): Promise<SkillPromptSource> {
  const useCache = dirs === DEFAULT_DIRS
  if (useCache) {
    const hit = cache.get(id)
    if (!force && hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.src
  }

  const userRaw = await readSkillFile(dirs.userDir, id)
  const productRaw = userRaw ?? (await readSkillFile(dirs.productDir, id))
  if (productRaw === null) throw new SkillPromptMissingError(id)
  const src: SkillPromptSource = {
    id,
    body: stripFrontmatter(productRaw).trim(),
    from: userRaw !== null ? "user" : "product",
  }
  if (useCache) cache.set(id, { at: Date.now(), src })
  return src
}

/**
 * 提取命名分节：<!-- prompt: name --> 到下一个标记（或文末）。
 * 无 section 参数或无任何标记 → 返回整个正文（单 prompt 技能）。
 */
export function extractPromptSection(body: string, section?: string): string {
  if (!section) return body.trim()
  const markerRe = /^<!--\s*prompt:\s*([A-Za-z0-9_-]+)\s*-->\s*$/gm
  type Mark = { name: string; start: number; end: number }
  const marks: Mark[] = []
  let m: RegExpExecArray | null
  while ((m = markerRe.exec(body)) !== null) {
    marks.push({ name: m[1], start: m.index, end: m.index + m[0].length })
  }
  const target = marks.find((x) => x.name === section)
  if (!target) return body.trim() // 没找到命名分节 → 整体退回（宽容解析，别炸产线）
  const next = marks.find((x) => x.start > target.start)
  return body.slice(target.end, next ? next.start : body.length).trim()
}

/**
 * 占位符渲染：{{var}} → 值；未提供/undefined → 空串；
 * 渲染后收敛 3+ 连续空行为 1 行（条件块留白不脏 prompt）。
 */
export function renderPromptTemplate(template: string, vars: Record<string, string | undefined>): string {
  let out = template.replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (_all, key: string) => {
    const v = vars[key]
    return v === undefined || v === null ? "" : String(v)
  })
  out = out.replace(/\n[ \t]*\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n") // 3+ 空行 → 1 空行
  return out.trim()
}

/**
 * 组合加载：读 SKILL.md → 取分节 → 渲染占位符（一次调用覆盖产线最常见的路径）。
 */
export async function renderSkillPrompt(
  id: string,
  section: string | undefined,
  vars: Record<string, string | undefined>,
  dirs?: SkillPromptDirs,
): Promise<string> {
  const src = await loadSkillPrompt(id, dirs)
  return renderPromptTemplate(extractPromptSection(src.body, section), vars)
}
