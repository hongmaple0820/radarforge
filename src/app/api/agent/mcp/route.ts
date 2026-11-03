// ============================================================
// /api/agent/mcp —— MCP 统一入口（P0-4 收口 + P1-4 标准化）
// GET  ：双读返回服务器清单——DB McpServer 表（UI 添加）+ config/mcp.json
//        stdio 套（文件级条目，id 带 "file:" 前缀，迁移期双读）
// POST ：create / test / delete / toggle / import / export / sync-tools
//   - create 接受 transport=http（url+headers）或 transport=stdio
//     （command + args[] + env{}，D.2/D.3 结构化标准形态）
//   - test 双传输真实握手 + 工具发现落库 + 注册表同步（发现即接入）
//   - import：标准 mcpServers JSON（Cursor/Claude Desktop/VS Code 同构）
//     逐条校验，不支持字段显式列出，不静默丢弃
//   - export：导出同构 JSON，可直接粘进 Cursor
//   - sync-tools：把已启用+已连接服务器的工具以 mcp__服务器__工具
//     注册进工具注册表（Agent 运行时与工具测试台均可调用）
// UI（插件中心 MCP 卡）是唯一界面入口；旧 /api/mcp 保留为只读兼容。
// ============================================================

import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import {
  seedDefaultServer,
  testAndSave,
  testMcpServer,
  syncMcpToolsToRegistry,
  listRegisteredMcpTools,
  importMcpServersJson,
  exportMcpServersJson,
} from "@/lib/agent/mcp-client"
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
    args: "[]",
    env: "{}",
    headers: "{}",
    enabled: true,
    status: "unknown",
    discoveredTools: "[]",
    lastError: "",
    lastCheckedAt: null,
    createdAt: new Date(0),
    source: "file" as const,
  }))
  // P1-4：附带当前注册表已接入的 MCP 工具清单（生态页显示「已接入 N 个工具」）
  const registeredMcp = listRegisteredMcpTools()
  return NextResponse.json({
    servers: [
      ...servers.map((s) => ({ ...s, source: "db" as const })),
      ...fileServers,
    ],
    registeredMcpTools: registeredMcp,
  })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: "create" | "test" | "delete" | "toggle" | "import" | "export" | "sync-tools"
      name?: string
      transport?: string
      url?: string
      command?: string
      args?: string[]
      env?: Record<string, string>
      headers?: Record<string, string>
      id?: string
      json?: string
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
        const headers = body.headers && typeof body.headers === "object" ? body.headers : {}
        const server = await db.mcpServer.create({
          data: {
            name: name.slice(0, 80),
            transport,
            url: url.slice(0, 500),
            headers: JSON.stringify(headers),
            enabled: true,
          },
        })
        return NextResponse.json({ server })
      }
      // stdio：command 必填 + 结构化 args[]/env{}（P1-4 标准形态）
      const command = (body.command ?? "").trim()
      if (!command) {
        return NextResponse.json({ error: "stdio 传输需要 command（可执行命令，如 npx / node / uvx）" }, { status: 400 })
      }
      const args = Array.isArray(body.args) ? body.args.filter((a) => typeof a === "string").map((a) => a.slice(0, 200)) : []
      const env = body.env && typeof body.env === "object" ? body.env : {}
      const server = await db.mcpServer.create({
        data: {
          name: name.slice(0, 80),
          transport,
          url: "",
          command: command.slice(0, 300),
          args: JSON.stringify(args),
          env: JSON.stringify(env),
          enabled: true,
        },
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
          command: cfg.command,
          args: cfg.args,
          env: cfg.env,
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
      await syncMcpToolsToRegistry() // 移除其已注册工具
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
      await syncMcpToolsToRegistry() // 停用即摘除其工具；启用即恢复
      return NextResponse.json({ server: updated })
    }

    // ---------- P1-4：mcpServers 标准格式导入导出 ----------
    if (action === "import") {
      const raw = body.json ?? ""
      if (!raw.trim()) {
        return NextResponse.json({ error: "json 不能为空（合法格式：{ \"mcpServers\": { ... } }，可从 Cursor / Claude Desktop 配置直接粘贴）" }, { status: 400 })
      }
      try {
        const report = await importMcpServersJson(raw)
        return NextResponse.json({
          report,
          message:
            report.imported.length > 0
              ? `已导入 ${report.imported.length} 个服务器：${report.imported.join("、")}${report.skipped.length > 0 ? `；跳过 ${report.skipped.length} 条（详见 report.skipped）` : ""}`
              : "没有导入任何条目（详见 report.skipped 的逐条原因）",
        })
      } catch (e) {
        // 格式错误属用户输入问题 → 400 与人话信息（非服务器 500）
        return NextResponse.json({ error: (e as Error).message }, { status: 400 })
      }
    }

    if (action === "export") {
      const json = await exportMcpServersJson()
      return NextResponse.json({
        json,
        message: "已导出标准 mcpServers JSON——可直接粘贴进 Cursor（.cursor/mcp.json）或 Claude Desktop 配置",
      })
    }

    // ---------- P1-4：注册表同步（手动触发；test 成功后自动调用） ----------
    if (action === "sync-tools") {
      const r = await syncMcpToolsToRegistry()
      const tools = listRegisteredMcpTools()
      return NextResponse.json({
        servers: r.servers,
        toolCount: r.tools,
        tools,
        message:
          r.tools > 0
            ? `已接入 ${r.tools} 个外部工具（来自 ${r.servers} 个已启用且握过手的服务器，命名 mcp__服务器__工具）——Agent 运行时与工具测试台均可调用`
            : "没有可接入的工具——先对启用的服务器点「测试连接」完成握手与工具发现",
      })
    }

    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
