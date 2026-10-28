/**
 * Agent Skills 加载器
 *
 * 遵循 Agent Skills 开放标准（SKILL.md 声明式技能，Claude Code / Codex / pi 通用）：
 *  - 扫描两级目录：用户级 ~/.claude/skills/* 与项目级 <project>/skills/*
 *  - 解析 SKILL.md 的 YAML frontmatter（name / description / allowed-tools 等）
 *  - 平台把这些技能作为「工作流步骤模板」的候选池（write / review / publish / motion…）
 *
 * 本地已安装 12 个技能（wewrite 十件套 + huashu 双件），即刻成为平台首批能力。
 */

import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

export interface SkillCard {
  /** 目录名（全局唯一键） */
  id: string
  /** frontmatter 声明的技能名 */
  name: string
  description: string
  source: 'user' | 'project'
  /** 技能目录绝对路径 */
  dir: string
  entry: string
  allowedTools: string[]
}

interface SkillRoot {
  source: 'user' | 'project'
  dir: string
}

export function skillRoots(): SkillRoot[] {
  const roots: SkillRoot[] = [{ source: 'user', dir: path.join(os.homedir(), '.claude', 'skills') }]
  const project = path.join(process.cwd(), 'skills')
  roots.push({ source: 'project', dir: project })
  return roots
}

/**
 * 精简 YAML frontmatter 解析（不引入 gray-matter 依赖）：
 * 覆盖 SKILL.md 常见形态——顶层标量、`|` 多行块标量（折叠为一行）、`- item` 列表。
 */
export function parseFrontmatter(raw: string): Record<string, string | string[]> {
  const meta: Record<string, string | string[]> = {}
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!m) return meta

  const lines = m[1].split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i])
    if (!kv) {
      i++
      continue
    }
    const key = kv[1]
    const value = kv[2].trim()

    if (value === '|' || value === '>') {
      // 块标量：收集后续缩进行，折叠为单行
      const buf: string[] = []
      i++
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim()) buf.push(lines[i].trim())
        i++
      }
      meta[key] = buf.join(' ')
      continue
    }

    if (value === '') {
      // 空值：向后看是否是 `- item` 列表
      const arr: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const item = /^\s+-\s+(.*)$/.exec(lines[j])
        if (!item) break
        arr.push(item[1].trim())
        j++
      }
      if (arr.length > 0) {
        meta[key] = arr
        i = j
      } else {
        meta[key] = ''
        i++
      }
      continue
    }

    // 普通标量（去掉成对引号）
    meta[key] = value.replace(/^["']|["']$/g, '')
    i++
  }
  return meta
}

/** 加载全部技能（用户级 + 项目级），出错的单个技能跳过不影响整体 */
export async function loadSkills(): Promise<SkillCard[]> {
  const cards: SkillCard[] = []
  for (const root of skillRoots()) {
    let entries: string[] = []
    try {
      entries = await fs.readdir(root.dir)
    } catch {
      continue // 目录不存在（如项目级尚未创建）属正常
    }
    for (const entry of entries) {
      const skillDir = path.join(root.dir, entry)
      const entryFile = path.join(skillDir, 'SKILL.md')
      try {
        const raw = await fs.readFile(entryFile, 'utf-8')
        const meta = parseFrontmatter(raw)
        const name = typeof meta['name'] === 'string' ? meta['name'].trim() : entry
        const desc = typeof meta['description'] === 'string' ? meta['description'].trim() : ''
        const tools = Array.isArray(meta['allowed-tools']) ? meta['allowed-tools'] : []
        cards.push({
          id: entry,
          name: name || entry,
          description: desc,
          source: root.source,
          dir: skillDir,
          entry: entryFile,
          allowedTools: tools,
        })
      } catch {
        // 无 SKILL.md 或读取失败 → 不是合法技能目录，跳过
      }
    }
  }
  return cards
}
