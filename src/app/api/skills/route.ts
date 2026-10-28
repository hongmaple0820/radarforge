import { NextResponse } from 'next/server'
import { loadSkills } from '@/lib/skills/loader'

/**
 * Agent Skills 接口
 * GET /api/skills
 *
 * 扫描用户级（~/.claude/skills）与项目级（<project>/skills）技能目录，
 * 解析每个 SKILL.md 的 frontmatter，返回技能清单。
 * 本地已装 12 个技能（wewrite 十件套 + huashu 双件），即为平台首批工作流模板。
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const skills = await loadSkills()
    return NextResponse.json({
      ok: true,
      total: skills.length,
      bySource: {
        user: skills.filter((s) => s.source === 'user').length,
        project: skills.filter((s) => s.source === 'project').length,
      },
      skills,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error)?.message || '技能加载失败' },
      { status: 500 }
    )
  }
}
