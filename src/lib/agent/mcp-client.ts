// ============================================================
// MCP Client —— Model Context Protocol 客户端接入
// 协议：JSON-RPC 2.0 over HTTP（SSE/HTTP transport）
//   initialize → initialized → tools/list → tools/call
// 学 dsh：未识别的服务器/协议错误必须明确报错，绝不静默吞掉
// stdio 传输需要本地进程运行时，Web 环境标注不支持并说明原因
// ============================================================

import { db } from "@/lib/db"

export interface McpToolInfo {
  name: string
  description?: string
}

export interface McpTestResult {
  ok: boolean
  serverName: string
  tools: McpToolInfo[]
  latencyMs: number
  error?: string
  detail?: string
}

const PROTOCOL_VERSION = "2025-06-18"
const MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
}

function makeRpc(id: number, method: string, params?: unknown): string {
  return JSON.stringify({ jsonrpc: "2.0", id, method, params: params ?? {} })
}

/** 从 SSE 流式响应中抽取 JSON 行 */
function parseSseBody(text: string): Record<string, unknown> | null {
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (trimmed.startsWith("data:")) {
      const payload = trimmed.slice(5).trim()
      try {
        return JSON.parse(payload)
      } catch {
        continue
      }
    }
  }
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

/** 对一个 MCP server 执行 initialize + tools/list 握手 */
export async function testMcpServer(server: {
  name: string
  transport: string
  url: string
}): Promise<McpTestResult> {
  const t0 = Date.now()
  if (server.transport === "stdio") {
    return {
      ok: false,
      serverName: server.name,
      tools: [],
      latencyMs: 0,
      error: "stdio 传输需要本地进程运行时（Node 子进程），Web 服务环境暂不支持",
    }
  }
  if (!server.url) {
    return { ok: false, serverName: server.name, tools: [], latencyMs: 0, error: "URL 为空" }
  }

  try {
    // 1) initialize
    const initRes = await fetch(server.url, {
      method: "POST",
      headers: MCP_HEADERS,
      body: makeRpc(1, "initialize", {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "ai-radar-workflow", version: "2.0" },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!initRes.ok) {
      return {
        ok: false,
        serverName: server.name,
        tools: [],
        latencyMs: Date.now() - t0,
        error: `initialize HTTP ${initRes.status}（请确认 URL 指向 MCP endpoint 且支持 POST JSON-RPC）`,
      }
    }
    const initText = await initRes.text()
    const initJson = parseSseBody(initText)
    if (!initJson || !("result" in initJson)) {
      const err = (initJson as { error?: { message?: string } })?.error?.message
      return {
        ok: false,
        serverName: server.name,
        tools: [],
        latencyMs: Date.now() - t0,
        error: err ?? "initialize 响应不含 result（非 MCP 协议或需要会话头）",
      }
    }
    const serverInfo = (initJson.result as { serverInfo?: { name?: string; version?: string } }).serverInfo

    // 2) notifications/initialized + tools/list
    await fetch(server.url, {
      method: "POST",
      headers: MCP_HEADERS,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      /* 通知失败不致命 */
    })
    const toolsRes = await fetch(server.url, {
      method: "POST",
      headers: MCP_HEADERS,
      body: makeRpc(2, "tools/list"),
      signal: AbortSignal.timeout(8000),
    })
    const toolsText = await toolsRes.text()
    const toolsJson = parseSseBody(toolsText)
    const tools = ((toolsJson?.result as { tools?: McpToolInfo[] })?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description?.slice(0, 200),
    }))

    return {
      ok: true,
      serverName: server.name,
      tools,
      latencyMs: Date.now() - t0,
      detail: serverInfo ? `握手成功：${serverInfo.name ?? "?"} v${serverInfo.version ?? "?"}（协议 ${PROTOCOL_VERSION}）` : "握手成功",
    }
  } catch (e) {
    return {
      ok: false,
      serverName: server.name,
      tools: [],
      latencyMs: Date.now() - t0,
      error: `连接失败：${(e as Error).message}`,
    }
  }
}

/** DB 记录 + 握手测试 + 工具发现落库 */
export async function testAndSave(serverId: string): Promise<McpTestResult> {
  const server = await db.mcpServer.findUnique({ where: { id: serverId } })
  if (!server) throw new Error(`MCP server "${serverId}" 不存在`)
  const result = await testMcpServer({ name: server.name, transport: server.transport, url: server.url })
  await db.mcpServer.update({
    where: { id: serverId },
    data: {
      status: result.ok ? "connected" : "error",
      discoveredTools: JSON.stringify(result.tools),
      lastError: result.error ?? "",
      lastCheckedAt: new Date(),
    },
  })
  return result
}

/** 预置一个公开可用的 MCP server（DeepWiki，真实 JSON-RPC 握手可验证） */
export async function seedDefaultServer(): Promise<void> {
  const count = await db.mcpServer.count()
  if (count > 0) return
  await db.mcpServer.create({
    data: {
      name: "DeepWiki MCP（公开示例）",
      transport: "http",
      url: "https://mcp.deepwiki.com/mcp",
      enabled: true,
    },
  })
}
