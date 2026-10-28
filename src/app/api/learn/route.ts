import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * 编辑飞轮规则 API
 * GET    /api/learn                     → 规则列表（按状态）
 * POST   /api/learn  { id, status }     → 规则状态流转（proposed → active / dismissed）
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES = ['proposed', 'active', 'dismissed']

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status')
    const where = status && STATUSES.includes(status) ? { status } : {}
    const rules = await db.learningRule.findMany({ where, orderBy: { createdAt: 'desc' }, take: 200 })
    const counts = {
      proposed: await db.learningRule.count({ where: { status: 'proposed' } }),
      active: await db.learningRule.count({ where: { status: 'active' } }),
      dismissed: await db.learningRule.count({ where: { status: 'dismissed' } }),
    }
    return NextResponse.json({ ok: true, rules, counts })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '规则读取失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const id = typeof body.id === 'string' ? body.id : ''
    const status = typeof body.status === 'string' && STATUSES.includes(body.status) ? body.status : null
    if (!id || !status) {
      return NextResponse.json({ ok: false, message: '需要 { id, status: proposed|active|dismissed }' }, { status: 400 })
    }
    const rule = await db.learningRule.findUnique({ where: { id } })
    if (!rule) {
      return NextResponse.json({ ok: false, message: '规则不存在' }, { status: 404 })
    }
    // 谨慎升级：确认生效时计一次命中
    const updated = await db.learningRule.update({
      where: { id },
      data: { status, ...(status === 'active' ? { hits: rule.hits + 1 } : {}) },
    })
    return NextResponse.json({ ok: true, rule: updated })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '规则更新失败' }, { status: 500 })
  }
}
