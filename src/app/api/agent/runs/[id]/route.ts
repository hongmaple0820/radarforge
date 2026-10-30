import { NextResponse } from "next/server"
import { getRun } from "@/lib/agent/run-manager"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const run = await getRun(id)
    if (!run) return NextResponse.json({ error: "run 不存在" }, { status: 404 })
    return NextResponse.json({ run })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
