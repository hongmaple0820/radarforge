import { NextResponse } from "next/server"
import { toolRegistry } from "@/lib/agent/tool-registry"

export async function GET() {
  return NextResponse.json({ tools: toolRegistry.list() })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; input?: Record<string, unknown> }
    const name = (body.name ?? "").trim()
    if (!name) return NextResponse.json({ error: "name 不能为空" }, { status: 400 })
    const out = await toolRegistry.execute(name, body.input ?? {})
    return NextResponse.json({ result: out })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 })
  }
}
