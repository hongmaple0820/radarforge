import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET() {
  const topics = await db.topic.findMany({ orderBy: { createdAt: "desc" }, include: { _count: { select: { reports: true, ideas: true } } } })
  return NextResponse.json({ topics })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; keywords?: string; description?: string }
    const name = (body.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "name 不能为空" }, { status: 400 })
    const topic = await db.topic.create({
      data: { name: name.slice(0, 80), keywords: (body.keywords ?? "").slice(0, 300), description: (body.description ?? "").slice(0, 500) },
    })
    return NextResponse.json({ topic })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
  await db.topic.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
