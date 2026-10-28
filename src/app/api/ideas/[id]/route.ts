import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * 单个选题接口
 * PATCH  /api/ideas/[id]  → 更新状态 / 补充角度 { status?, angle? }
 * DELETE /api/ideas/[id]  → 移出选题池
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES = ['new', 'shortlist', 'writing', 'published', 'dropped']

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    const body = await req.json()
    const data: { status?: string; angle?: string } = {}

    if (typeof body.status === 'string') {
      if (!STATUSES.includes(body.status)) {
        return NextResponse.json({ ok: false, message: `非法状态，允许值: ${STATUSES.join(' / ')}` }, { status: 400 })
      }
      data.status = body.status
    }
    if (typeof body.angle === 'string') data.angle = body.angle.trim().slice(0, 500)

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ ok: false, message: '没有可更新字段' }, { status: 400 })
    }

    const idea = await db.ideaCandidate.update({ where: { id }, data })
    return NextResponse.json({ ok: true, idea })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error)?.message || '更新失败（选题可能已删除）' },
      { status: 500 }
    )
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  try {
    await db.ideaCandidate.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error)?.message || '删除失败（选题可能已删除）' },
      { status: 500 }
    )
  }
}
