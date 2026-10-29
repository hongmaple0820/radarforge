import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  const ideas = await db.idea.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { topic: { select: { name: true } } } })
  return NextResponse.json({ ideas })
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
