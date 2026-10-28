import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/**
 * Run 详情 API
 * GET    /api/runs/[id]  → run + claims + articles + reviews + assets + publishes
 * DELETE /api/runs/[id]  → 删除 run 及全部从属记录
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const run = await db.run.findUnique({ where: { id } })
    if (!run) {
      return NextResponse.json({ ok: false, message: 'Run 不存在' }, { status: 404 })
    }
    const [claims, articles, reviews, assets, publishes, idea] = await Promise.all([
      db.claim.findMany({ where: { runId: id }, orderBy: { createdAt: 'asc' } }),
      db.article.findMany({ where: { runId: id }, orderBy: { createdAt: 'asc' } }),
      db.reviewRecord.findMany({ where: { runId: id }, orderBy: { createdAt: 'desc' } }),
      db.asset.findMany({ where: { runId: id }, orderBy: { createdAt: 'desc' } }),
      db.publishRecord.findMany({ where: { runId: id }, orderBy: { createdAt: 'desc' } }),
      run.ideaId ? db.ideaCandidate.findUnique({ where: { id: run.ideaId }, select: { title: true, angle: true, sourceRef: true } }) : null,
    ])
    return NextResponse.json({
      ok: true,
      run: {
        ...run,
        idea,
        claims,
        articles,
        reviews,
        assets,
        publishes,
      },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || 'Run 详情读取失败' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const run = await db.run.findUnique({ where: { id } })
    if (!run) {
      return NextResponse.json({ ok: false, message: 'Run 不存在' }, { status: 404 })
    }
    await Promise.all([
      db.claim.deleteMany({ where: { runId: id } }),
      db.article.deleteMany({ where: { runId: id } }),
      db.reviewRecord.deleteMany({ where: { runId: id } }),
      db.asset.deleteMany({ where: { runId: id } }),
      db.publishRecord.deleteMany({ where: { runId: id } }),
    ])
    await db.run.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || 'Run 删除失败' }, { status: 500 })
  }
}
