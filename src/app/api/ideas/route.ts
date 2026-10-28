import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * 选题池接口
 * GET  /api/ideas?status=new     → 按状态筛选（缺省全部）
 * POST /api/ideas                → 新建选题 { title, angle?, sourceRef?, source?, score? }
 *
 * 来源说明：雷达资讯卡片「加选题」按钮（source=radar）、手动录入（manual）、
 * 后续 Agent 自动选题（agent）共用此表。
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const STATUSES = ['new', 'shortlist', 'writing', 'published', 'dropped']

export async function GET(req: NextRequest) {
  try {
    const status = req.nextUrl.searchParams.get('status')
    const where = status && STATUSES.includes(status) ? { status } : {}
    const ideas = await db.ideaCandidate.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return NextResponse.json({ ok: true, ideas })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error)?.message || '选题读取失败' },
      { status: 500 }
    )
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const title = typeof body.title === 'string' ? body.title.trim() : ''
    if (!title) {
      return NextResponse.json({ ok: false, message: 'title 不能为空' }, { status: 400 })
    }
    if (title.length > 300) {
      return NextResponse.json({ ok: false, message: 'title 过长（上限 300 字符）' }, { status: 400 })
    }

    const source = ['radar', 'manual', 'agent'].includes(body.source) ? body.source : 'manual'
    const angle = typeof body.angle === 'string' ? body.angle.trim().slice(0, 500) : ''
    const sourceRef = typeof body.sourceRef === 'string' ? body.sourceRef.trim().slice(0, 1000) : ''
    const score = typeof body.score === 'number' ? Math.max(0, Math.min(100, Math.round(body.score))) : null

    // 去重：同标题 + 同来源链接的选题不重复入池
    const existing = await db.ideaCandidate.findFirst({
      where: { title, ...(sourceRef ? { sourceRef } : {}) },
    })
    if (existing) {
      return NextResponse.json({ ok: false, message: '该选题已在池中', idea: existing }, { status: 409 })
    }

    const idea = await db.ideaCandidate.create({
      data: { title, angle, sourceRef, source, score },
    })
    return NextResponse.json({ ok: true, idea })
  } catch (e) {
    return NextResponse.json(
      { ok: false, message: (e as Error)?.message || '选题创建失败' },
      { status: 500 }
    )
  }
}
