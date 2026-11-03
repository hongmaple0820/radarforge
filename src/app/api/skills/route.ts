import { NextResponse } from 'next/server'
import { loadSkills } from '@/lib/skills/loader'
import { setSkillDisabled } from '@/lib/skills/state'
import { uninstallSkill, installFromUrl } from '@/lib/skills/install'

/**
 * Agent Skills 接口（P2-1 安装管理扩展）
 * GET  /api/skills                 —— 全量清单（含停用态 + 合规报告 + 来源统计）
 * POST /api/skills {action}        —— toggle（启停）/ uninstall（卸载用户技能）/ install-url（URL 安装）
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
      disabled: skills.filter((s) => s.disabled).length,
      skills,
    })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error)?.message || '技能加载失败' },
      { status: 500 }
    )
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: string; id?: string; disabled?: boolean; url?: string }

    // ---- 启停：停用 = 不进 Agent 候选池，文件保留 ----
    if (body.action === 'toggle') {
      const id = (body.id ?? '').trim()
      if (!id) return NextResponse.json({ ok: false, message: 'id 不能为空' }, { status: 400 })
      // 幽灵 id 防护：只能启停真实存在的技能（否则写入永不生效的死状态）
      const all = await loadSkills()
      if (!all.some((s) => s.id === id)) {
        return NextResponse.json({ ok: false, message: `技能 "${id}" 不存在（产品库与用户自装位均未找到）` }, { status: 404 })
      }
      const disabled = await setSkillDisabled(id, body.disabled !== false)
      return NextResponse.json({
        ok: true,
        message: body.disabled === false ? `已启用 ${id}（重新进入 Agent 候选池）` : `已停用 ${id}（不进候选池，文件保留）`,
        disabled: [...disabled],
      })
    }

    // ---- 卸载：仅用户位 ----
    if (body.action === 'uninstall') {
      const id = (body.id ?? '').trim()
      if (!id) return NextResponse.json({ ok: false, message: 'id 不能为空' }, { status: 400 })
      const result = await uninstallSkill(id)
      // 停用集同步清理（避免残留死状态）
      await setSkillDisabled(id, false)
      return NextResponse.json({ ok: result.ok, message: result.message })
    }

    // ---- URL 安装（zip 直链 / GitHub tree 页） ----
    if (body.action === 'install-url') {
      const url = (body.url ?? '').trim()
      if (!url) return NextResponse.json({ ok: false, message: 'url 不能为空' }, { status: 400 })
      const result = await installFromUrl(url)
      return NextResponse.json(result, { status: result.ok ? 200 : 409 })
    }

    return NextResponse.json({ ok: false, message: 'action 须是 toggle / uninstall / install-url' }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '操作失败' }, { status: 400 })
  }
}
