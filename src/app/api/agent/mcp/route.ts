import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { seedDefaultServer, testAndSave } from "@/lib/agent/mcp-client"

export async function GET() {
  await seedDefaultServer()
  const servers = await db.mcpServer.findMany({ orderBy: { createdAt: "desc" } })
  return NextResponse.json({ servers })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: "create" | "test" | "delete" | "toggle"
      name?: string
      transport?: string
      url?: string
      command?: string
      id?: string
    }
    const action = body.action ?? "create"

    if (action === "create") {
      const name = (body.name ?? "").trim()
      if (!name) return NextResponse.json({ error: "name 不能为空" }, { status: 400 })
      const server = await db.mcpServer.create({
        data: {
          name: name.slice(0, 80),
          transport: (body.transport ?? "http").slice(0, 20),
          url: (body.url ?? "").slice(0, 500),
          command: (body.command ?? "").slice(0, 300),
        },
      })
      return NextResponse.json({ server })
    }

    if (action === "test") {
      if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
      const result = await testAndSave(body.id)
      return NextResponse.json({ result })
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
      await db.mcpServer.delete({ where: { id: body.id } })
      return NextResponse.json({ ok: true })
    }

    if (action === "toggle") {
      if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
      const server = await db.mcpServer.findUnique({ where: { id: body.id } })
      if (!server) return NextResponse.json({ error: "server 不存在" }, { status: 404 })
      const updated = await db.mcpServer.update({ where: { id: body.id }, data: { enabled: !server.enabled } })
      return NextResponse.json({ server: updated })
    }

    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
