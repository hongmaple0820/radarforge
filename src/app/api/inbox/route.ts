import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const targetType = searchParams.get("targetType")
  const targetId = searchParams.get("targetId")
  const items = await db.inboxItem.findMany({
    where: {
      ...(targetType ? { targetType } : {}),
      ...(targetId ? { targetId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  })
  return NextResponse.json({ items })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { targetType?: string; targetId?: string; comment?: string }
    const comment = (body.comment ?? "").trim()
    if (!comment || !body.targetId) {
      return NextResponse.json({ error: "targetId 和 comment 不能为空" }, { status: 400 })
    }
    const item = await db.inboxItem.create({
      data: {
        targetType: body.targetType === "report" ? "report" : "run",
        targetId: body.targetId,
        comment: comment.slice(0, 1000),
        runId: body.targetType === "run" ? body.targetId : null,
      },
    })
    return NextResponse.json({ item })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
