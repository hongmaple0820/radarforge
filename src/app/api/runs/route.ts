import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { startRun } from '@/lib/runtime/run-manager'
import { PERSONAS } from '@/lib/runtime/skills/radar-write'
import { THEME_LIST } from '@/lib/runtime/render'

/**
 * 创作运行 API
 * GET  /api/runs            → Run 列表（含最近文章/审稿概要）
 * POST /api/runs            → 创建并后台执行 { ideaId? , title?, persona?, theme?, withCover? }
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const runs = await db.run.findMany({ orderBy: { createdAt: 'desc' }, take: 50 })
    const enriched = await Promise.all(
      runs.map(async (r) => {
        const article = await db.article.findFirst({
          where: { runId: r.id, target: 'wechat' },
          orderBy: { createdAt: 'desc' },
          select: { id: true, content: true, note: true, createdAt: true },
        })
        const review = await db.reviewRecord.findFirst({
          where: { runId: r.id },
          orderBy: { createdAt: 'desc' },
          select: { scores: true, verdict: true },
        })
        const claimCount = await db.claim.count({ where: { runId: r.id } })
        return {
          ...r,
          articleChars: article?.content.length ?? 0,
          articleNote: article?.note ?? null,
          reviewScores: review?.scores ?? null,
          reviewVerdict: review?.verdict ?? null,
          claimCount,
        }
      })
    )
    return NextResponse.json({
      ok: true,
      runs: enriched,
      meta: { personas: PERSONAS.map((p) => ({ id: p.id, name: p.name, desc: p.desc })), themes: THEME_LIST },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || 'Run 列表读取失败' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    let title = typeof body.title === 'string' ? body.title.trim() : ''
    let angle = typeof body.angle === 'string' ? body.angle.trim() : ''
    let ideaId: string | undefined

    // 从选题池启动：以 idea 的标题/角度为准
    if (typeof body.ideaId === 'string' && body.ideaId) {
      const idea = await db.ideaCandidate.findUnique({ where: { id: body.ideaId } })
      if (!idea) {
        return NextResponse.json({ ok: false, message: '选题不存在' }, { status: 404 })
      }
      ideaId = idea.id
      title = idea.title
      angle = idea.angle ?? ''
    }

    if (!title) {
      return NextResponse.json({ ok: false, message: 'title 或 ideaId 至少提供一个' }, { status: 400 })
    }
    if (title.length > 120) title = title.slice(0, 120)

    // 同一选题避免并发重跑（写作中状态拦截）
    if (ideaId) {
      const active = await db.run.findFirst({
        where: { ideaId, status: { in: ['pending', 'running'] } },
      })
      if (active) {
        return NextResponse.json(
          { ok: false, message: '该选题已有正在进行的运行', runId: active.id },
          { status: 409 }
        )
      }
    }

    const persona = PERSONAS.find((p) => p.id === body.persona)?.id
    const theme = THEME_LIST.find((t) => t.id === body.theme)?.id

    const { id } = await startRun({
      ideaId,
      title,
      ...(angle ? { angle } : {}),
      ...(persona ? { persona } : {}),
      ...(theme ? { theme } : {}),
      withCover: body.withCover === true,
    })
    return NextResponse.json({ ok: true, runId: id })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || 'Run 创建失败' }, { status: 500 })
  }
}
