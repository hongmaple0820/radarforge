import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createRun, executeRunInBackground } from "@/lib/agent/run-manager"

export async function GET() {
  const runs = await db.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { _count: { select: { inboxItems: true, ideas: true } } },
  })
  return NextResponse.json({ runs })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { skillId?: string; input?: string }
    const skillId = (body.skillId ?? "").trim()
    const input = (body.input ?? "").trim()
    if (!skillId || !input) {
      return NextResponse.json({ error: "skillId 和 input 不能为空" }, { status: 400 })
    }
    const id = await createRun({ skillId, input })
    executeRunInBackground(id)
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
