import { NextResponse } from 'next/server'
import { loadSkills } from '@/lib/skills/loader'

/**
 * Agent Skills 接口
 * GET /api/skills
 *
 * 扫描产品库（db/skills，git 跟踪随仓库分发）与用户自装位
 * （~/.radarforge/skills）技能目录，解析每个 SKILL.md 的 frontmatter。
 * P0-3 目录主权后：平台 skills/ 不再进入扫描根；产品 12 技能
 * （wewrite 十件套 + huashu 双件，按 agentskills.io 规范重建）随仓库分发。
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
        product: skills.filter((s) => s.source === 'product').length,
        user: skills.filter((s) => s.source === 'user').length,
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
