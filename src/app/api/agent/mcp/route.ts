// ============================================================
// /api/agent/mcp —— MCP 统一入口（P0-4：两套客户端收口为一路由族）
// GET  ：双读返回服务器清单——DB McpServer 表（UI 添加）+ config/mcp.json
//        stdio 套（文件级条目，id 带 "file:" 前缀，迁移期双读；P1 移除旧通道）
// POST ：create / test / delete / toggle
//   - create 接受 transport=http（url）或 transport=stdio（command 命令行）
//   - test 对两种传输都做真实握手（stdio 走子进程 JSON-RPC，见 mcp-client.ts）
// UI（插件中心 MCP 卡）是唯一界面入口；旧 /api/mcp 保留为只读兼容。
// ============================================================

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { seedDefaultServer, testAndSave, testMcpServer } from "@/lib/agent/mcp-client"
import { loadMcpConfig } from "@/lib/mcp/config"

export async function GET() {
  await seedDefaultServer()
  const servers = await db.mcpServer.findMany({ orderBy: { createdAt: "desc" } })
  // 迁移期双读（P0-4）：config/mcp.json 的 stdio 服务器并入清单（source: "file"）
  const config = await loadMcpConfig()
  const fileServers = Object.entries(config.servers).map(([name, cfg]) => ({
    id: `file:${name}`,
    name: `${name}（config/mcp.json）`,
    transport: "stdio",
    url: "",
    command: [cfg.command, ...(cfg.args ?? [])].join(" "),
    enabled: true,
    status: "unknown",
    discoveredTools: "[]",
    lastError: "",
    lastCheckedAt: null,
    createdAt: new Date(0),
    source: "file" as const,
  }))
  return NextResponse.json({
    servers: [
      ...servers.map((s) => ({ ...s, source: "db" as const })),
      ...fileServers,
    ],
  })
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
      const transport = (body.transport ?? "http").trim().toLowerCase()
      if (transport !== "http" && transport !== "stdio") {
        return NextResponse.json({ error: "transport 必须是 http 或 stdio" }, { status: 400 })
      }
      if (transport === "http") {
        const url = (body.url ?? "").trim()
        if (!/^https?:\/\//i.test(url)) {
          return NextResponse.json({ error: "http 传输需要以 http(s):// 开头的 URL" }, { status: 400 })
        }
        const server = await db.mcpServer.create({
          data: { name: name.slice(0, 80), transport, url: url.slice(0, 500), enabled: true },
        })
        return NextResponse.json({ server })
      }
      // stdio：command 必填（如 node scripts/echo-mcp-server.mjs 或 npx -y @modelcontextprotocol/server-xxx）
      const command = (body.command ?? "").trim()
      if (!command) {
        return NextResponse.json({ error: "stdio 传输需要 command（完整命令行，如 npx -y @modelcontextprotocol/server-github）" }, { status: 400 })
      }
      const server = await db.mcpServer.create({
        data: { name: name.slice(0, 80), transport, url: "", command: command.slice(0, 500), enabled: true },
      })
      return NextResponse.json({ server })
    }

    if (action === "test") {
      if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
      // 文件级条目（config/mcp.json）：读配置直接握手，结果不落库（文件是唯一事实源）
      if (body.id.startsWith("file:")) {
        const name = body.id.slice(5)
        const config = await loadMcpConfig()
        const cfg = config.servers[name]
        if (!cfg) return NextResponse.json({ error: `config/mcp.json 中没有服务器 "${name}"` }, { status: 404 })
        const result = await testMcpServer({
          name: `${name}（config/mcp.json）`,
          transport: "stdio",
          url: "",
          command: [cfg.command, ...(cfg.args ?? [])].join(" "),
        })
        return NextResponse.json({ result })
      }
      const result = await testAndSave(body.id)
      return NextResponse.json({ result })
    }

    if (action === "delete") {
      if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
      if (body.id.startsWith("file:")) {
        return NextResponse.json({ error: "文件级条目由 config/mcp.json 管理——编辑该文件的 servers 段即可增删" }, { status: 400 })
      }
      await db.mcpServer.delete({ where: { id: body.id } })
      return NextResponse.json({ ok: true })
    }

    if (action === "toggle") {
      if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
      if (body.id.startsWith("file:")) {
        return NextResponse.json({ error: "文件级条目启停请编辑 config/mcp.json" }, { status: 400 })
      }
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
