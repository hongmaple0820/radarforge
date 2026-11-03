/**
 * Agent Skills 加载器
 *
 * 遵循 Agent Skills 开放标准（agentskills.io，SKILL.md 声明式技能）：
 *  - 扫描两级目录：产品库 db/skills/*（git 跟踪，随仓库分发）与
 *    用户自装位 ~/.radarforge/skills/*（P2-1 安装管理的落点）
 *  - 解析 SKILL.md 的 YAML frontmatter（name / description / allowed-tools 等）
 *  - 平台把这些技能作为「工作流步骤模板」的候选池（write / review / publish / motion…）
 *
 * 目录主权（P0-3）：扫描根从平台 skills/（沙箱宿主给 AI 助手的 69 个运维技能，
 * 与内容创作无关且不受本产品控制）迁至 db/skills/——历史教训：产品首批 12 技能
 * （wewrite 十件套 + huashu 双件）寄生在平台目录下被整批覆盖且因 .gitignore
 * 从未入库，造成不可逆损失（q7 方案第三章取证）。db/skills 版本已按官方规范重建。
 *
 * P2-1 安装管理：每张卡附合规校验结果（checkSkillCompliance）与启停态
 * （SettingKV skills:disabled）——停用技能仍被加载（可管理/可再启用），
 * 但不进入 Agent 运行时候选池（agent/skill-loader 过滤）。
 */

import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { checkSkillCompliance, type ComplianceReport } from './compliance'
import { getDisabledSkills } from './state'
import { parseFrontmatter, stripFrontmatter } from './frontmatter'

export { parseFrontmatter, stripFrontmatter } from './frontmatter'

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
  /** P2-1：官方规范合规校验结果 */
  compliance: ComplianceReport
  /** P2-1：是否停用（停用 = 不进 Agent 候选池，文件保留） */
  disabled: boolean
  /** P2-1：正文预览（渐进披露第一层之后的第二层入口） */
  bodyPreview: string
  /** frontmatter 全部键（详情抽屉展示用） */
  frontmatterKeys: string[]
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


/** 加载全部技能（产品库 + 用户自装位），出错的单个技能跳过不影响整体；
 *  同 id 目录产品库优先（用户位重复不生效）；停用技能照常返回（带 disabled
 *  标记），由消费方决定过滤——/api/agent/skills 过滤，/api/skills 全量展示 */
export async function loadSkills(): Promise<SkillCard[]> {
  const cards: SkillCard[] = []
  const seen = new Set<string>()
  const disabledIds = await getDisabledSkills()
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
        const body = stripFrontmatter(raw)
        cards.push({
          id: entry,
          name: name || entry,
          description: desc,
          source: root.source,
          dir: skillDir,
          entry: entryFile,
          allowedTools: tools,
          compliance: checkSkillCompliance(entry, meta),
          disabled: disabledIds.has(entry),
          bodyPreview: body.replace(/[#*`>-]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 160),
          frontmatterKeys: Object.keys(meta),
        })
        seen.add(entry)
      } catch {
        // 无 SKILL.md 或读取失败 → 不是合法技能目录，跳过
      }
    }
  }
  return cards
}

