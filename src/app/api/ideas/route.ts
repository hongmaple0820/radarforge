import { NextResponse } from "next/server"
import { db } from "@/lib/db"

// GET /api/ideas?status=new|picked|done&limit=50 —— 列表（默认全部）+ 池统计
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const status = ["new", "picked", "done"].includes(searchParams.get("status") ?? "") ? searchParams.get("status")! : undefined
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 50))
  const [ideas, total, byStatus, bySource] = await Promise.all([
    db.idea.findMany({ where: status ? { status } : undefined, orderBy: { createdAt: "desc" }, take: limit, include: { topic: { select: { name: true } } } }),
    db.idea.count(),
    db.idea.groupBy({ by: ["status"], _count: { _all: true } }),
    db.idea.groupBy({ by: ["source"], _count: { _all: true } }),
  ])
  return NextResponse.json({
    ideas,
    stats: {
      total,
      new: byStatus.find((s) => s.status === "new")?._count._all ?? 0,
      picked: byStatus.find((s) => s.status === "picked")?._count._all ?? 0,
      done: byStatus.find((s) => s.status === "done")?._count._all ?? 0,
      bySource: Object.fromEntries(bySource.map((s) => [s.source, s._count._all])),
    },
  })
}

export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as { id?: string; status?: string }
    if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
    const status = ["new", "picked", "done"].includes(body.status ?? "") ? body.status! : "new"
    const idea = await db.idea.update({ where: { id: body.id }, data: { status } })
    return NextResponse.json({ idea })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
  await db.idea.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
