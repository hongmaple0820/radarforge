// ============================================================
// Skill Loader —— SKILL.md 开放标准热加载（学 pi-agent）
// 兼容 Claude Code / Codex / pi 的 Agent Skills 规范：
//   ---
//   name: xxx
//   description: xxx
//   ---
//   # 正文（指令与工作流）
// 扫描根（P0-3 目录主权）：产品库 db/skills（git 跟踪随仓库分发）
// + 用户自装位 ~/.radarforge/skills；平台 skills/ 已移出（宿主运维
// 技能与内容创作无关，且曾整批覆盖产品技能——不可逆损失根因）。
// P2-1：候选池过滤停用技能（SettingKV skills:disabled）——停用 =
// 不进 Agent 候选池但文件保留；loadSkillBody 不拦（详情/回读仍可）。
// ============================================================

import { readFile, readdir, stat } from "fs/promises"
import path from "path"
import os from "os"
import { getDisabledSkills } from "@/lib/skills/state"

export interface LoadedSkill {
  id: string // 目录名
  name: string // frontmatter name
  description: string
  bodyPreview: string
  bodyLength: number
  path: string
  frontmatterKeys: string[]
}

const DEFAULT_SKILL_DIRS = [path.join(process.cwd(), "db", "skills"), path.join(os.homedir(), ".radarforge", "skills")]

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
  const disabled = await getDisabledSkills()
  for (const dir of dirs) {
    let entries: string[] = []
    try {
      entries = await readdir(dir)
    } catch {
      continue
    }
    for (const entry of entries) {
      if (disabled.has(entry)) continue // P2-1：停用技能不进候选池
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
