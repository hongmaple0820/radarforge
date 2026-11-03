/**
 * Agent Skills 加载器
 *
 * 遵循 Agent Skills 开放标准（agentskills.io，SKILL.md 声明式技能）：
 *  - 扫描两级目录：产品库 db/skills/*（git 跟踪，随仓库分发）与
 *    用户自装位 ~/.radarforge/skills/*（P2 安装管理的落点）
 *  - 解析 SKILL.md 的 YAML frontmatter（name / description / allowed-tools 等）
 *  - 平台把这些技能作为「工作流步骤模板」的候选池（write / review / publish / motion…）
 *
 * 目录主权（P0-3）：扫描根从平台 skills/（沙箱宿主给 AI 助手的 69 个运维技能，
 * 与内容创作无关且不受本产品控制）迁至 db/skills/——历史教训：产品首批 12 技能
 * （wewrite 十件套 + huashu 双件）寄生在平台目录下被整批覆盖且因 .gitignore
 * 从未入库，造成不可逆损失（q7 方案第三章取证）。db/skills 版本已按官方规范重建。
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
  source: 'product' | 'user'
  /** 技能目录绝对路径 */
  dir: string
  entry: string
  allowedTools: string[]
}

interface SkillRoot {
  source: 'product' | 'user'
  dir: string
}

export function skillRoots(): SkillRoot[] {
  // 顺序即优先级：产品库在前；同 id 时产品库优先（用户位可覆盖待 P2 安装管理实现）
  return [
    { source: 'product', dir: path.join(process.cwd(), 'db', 'skills') },
    { source: 'user', dir: path.join(os.homedir(), '.radarforge', 'skills') },
  ]
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

/** 加载全部技能（产品库 + 用户自装位），出错的单个技能跳过不影响整体；
 *  同 id 目录产品库优先（用户位视为待装覆盖位，P2 安装管理接入） */
export async function loadSkills(): Promise<SkillCard[]> {
  const cards: SkillCard[] = []
  const seen = new Set<string>()
  for (const root of skillRoots()) {
    let entries: string[] = []
    try {
      entries = await fs.readdir(root.dir)
    } catch {
      continue // 目录不存在（如用户位尚未安装任何技能）属正常
    }
    for (const entry of entries) {
      if (seen.has(entry)) continue // 同 id 产品库优先，跳过用户位重复
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
        seen.add(entry)
      } catch {
        // 无 SKILL.md 或读取失败 → 不是合法技能目录，跳过
      }
    }
  }
  return cards
}
