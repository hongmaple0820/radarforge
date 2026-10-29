// ============================================================
// Skill Loader —— SKILL.md 开放标准热加载（学 pi-agent）
// 兼容 Claude Code / Codex / pi 的 Agent Skills 规范：
//   ---
//   name: xxx
//   description: xxx
//   ---
//   # 正文（指令与工作流）
// 扫描目录默认 /home/z/my-project/skills，支持追加自定义目录
// ============================================================

import { readFile, readdir, stat } from "fs/promises"
import path from "path"

export interface LoadedSkill {
  id: string // 目录名
  name: string // frontmatter name
  description: string
  bodyPreview: string
  bodyLength: number
  path: string
  frontmatterKeys: string[]
}

const DEFAULT_SKILL_DIRS = ["/home/z/my-project/skills"]

/** 轻量 YAML frontmatter 解析（浅层 key: value，够用且零依赖） */
function parseFrontmatter(raw: string): { fm: Record<string, string>; body: string } {
  const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { fm: {}, body: raw }
  const fm: Record<string, string> = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/)
    if (kv) {
      let v = kv[2].trim()
      // 去掉成对引号
      if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) {
        v = v.slice(1, -1)
      }
      if (v) fm[kv[1]] = v
    }
  }
  return { fm, body: m[2] }
}

let cache: { at: number; skills: LoadedSkill[] } | null = null
const CACHE_TTL = 30_000 // 30s 热加载缓存

export async function loadSkills(extraDirs: string[] = [], force = false): Promise<LoadedSkill[]> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.skills
  const dirs = [...DEFAULT_SKILL_DIRS, ...extraDirs]
  const skills: LoadedSkill[] = []
  for (const dir of dirs) {
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      const skillPath = path.join(dir, entry, "SKILL.md")
      try {
        const st = await stat(skillPath)
        if (!st.isFile()) continue
        const raw = await readFile(skillPath, "utf-8")
        const { fm, body } = parseFrontmatter(raw)
        skills.push({
          id: entry,
          name: fm.name ?? entry,
          description: (fm.description ?? "").slice(0, 500),
          bodyPreview: body.replace(/[#*`>-]/g, " ").replace(/\s+/g, " ").trim().slice(0, 220),
          bodyLength: body.length,
          path: skillPath,
          frontmatterKeys: Object.keys(fm),
        })
      } catch {
        // 单个 skill 解析失败不阻塞整体加载
      }
    }
  }
  cache = { at: Date.now(), skills }
  return skills
}

export async function loadSkillBody(id: string): Promise<{ name: string; body: string } | null> {
  for (const dir of DEFAULT_SKILL_DIRS) {
    const skillPath = path.join(dir, id, "SKILL.md")
    try {
      const raw = await readFile(skillPath, "utf-8")
      const { fm, body } = parseFrontmatter(raw)
      return { name: fm.name ?? id, body }
    } catch {
      continue
    }
  }
  return null
}
