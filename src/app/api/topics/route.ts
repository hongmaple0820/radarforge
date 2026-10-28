import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/** 默认话题: 首次访问自动播种，开箱即用 */
const DEFAULT_TOPICS = ['人工智能 大模型', 'AI Agent 智能体', 'AI芯片 算力', '自动驾驶 智驾', '具身智能 机器人', 'AI搜索 元宝搜索']

async function ensureSeeded() {
  const count = await db.topic.count()
  if (count === 0) {
    // SQLite createMany 不支持 skipDuplicates；仅在空表时播种，天然无冲突
    await db.topic.createMany({
      data: DEFAULT_TOPICS.map((name) => ({ name })),
    })
  }
}

/** GET /api/topics — 话题列表（按创建时间正序） */
export async function GET() {
  try {
    await ensureSeeded()
    const topics = await db.topic.findMany({ orderBy: { createdAt: 'asc' } })
    return NextResponse.json({ ok: true, topics })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '读取话题失败' }, { status: 500 })
  }
}

/** POST /api/topics — 新增话题 body: { name } */
export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json()
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (!trimmed) {
      return NextResponse.json({ ok: false, message: '话题名称不能为空' }, { status: 400 })
    }
    if (trimmed.length > 60) {
      return NextResponse.json({ ok: false, message: '话题名称过长（上限 60 字）' }, { status: 400 })
    }
    const exists = await db.topic.findFirst({ where: { name: trimmed } })
    if (exists) {
      return NextResponse.json({ ok: false, message: '该话题已存在' }, { status: 409 })
    }
    const topic = await db.topic.create({ data: { name: trimmed } })
    return NextResponse.json({ ok: true, topic })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '创建话题失败' }, { status: 500 })
  }
}

/** DELETE /api/topics?id=xxx — 删除话题 */
export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) {
      return NextResponse.json({ ok: false, message: '缺少话题 id' }, { status: 400 })
    }
    // 兜底: 至少保留一个话题
    const count = await db.topic.count()
    if (count <= 1) {
      return NextResponse.json({ ok: false, message: '至少保留一个追踪话题' }, { status: 400 })
    }
    await db.topic.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '删除话题失败' }, { status: 500 })
  }
}
