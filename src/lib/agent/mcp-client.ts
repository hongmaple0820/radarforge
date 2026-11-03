// ============================================================
// MCP Client —— Model Context Protocol 统一客户端（P0-4 入口统一 + P1-4 标准化）
// 协议：JSON-RPC 2.0，两种传输归一到本模块：
//   http  ：Streamable HTTP（initialize → initialized → tools/list → tools/call）
//           Mcp-Session-Id 会话管理（initialize 响应头取、后续请求带）
//           鉴权头从 DB headers 字段注入（导入 mcpServers JSON 同步入库）
//   stdio ：子进程按行 JSON-RPC（McpClient 复用 lib/mcp/client.ts 实现）
//           结构化 command + args[] + env{}（D.2/D.3 标准形态，导入通道入库）
// P1-4 核心接线：syncMcpToolsToRegistry()——已启用且握过手的服务器，其
// 工具以 mcp__服务器__工具 命名注册进 toolRegistry（学 dsh），Agent 运行时
// 与工具测试台均可实际调用；发现→注册→调用全链路不再是「纯展示」。
// 学 dsh：未识别的服务器/协议错误必须明确报错，绝不静默吞掉。
// ============================================================

import { db } from "@/lib/db"
import { McpClient } from "@/lib/mcp/client"
import { toolRegistry } from "@/lib/agent/tool-registry"

export interface McpToolInfo {
  name: string
  description?: string
  inputSchema?: unknown
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

/** 安全解析 JSON 字段（DB 存的 args/env/headers/discoveredTools） */
export function safeJsonField<T>(raw: string | null | undefined, fallback: T): T {
  try {
    return JSON.parse(raw ?? "") as T
  } catch {
    return fallback
  }
}

/** DB 行 → 结构化服务器描述（测试/调用/注册共用） */
export interface McpServerRow {
  id: string
  name: string
  transport: string
  url: string
  command: string
  args: string
  env: string
  headers: string
  enabled: boolean
  status: string
  discoveredTools: string
  lastError: string
}

function rowToServer(row: McpServerRow): {
  id: string
  name: string
  transport: string
  url: string
  command: string
  args: string[]
  env: Record<string, string>
  headers: Record<string, string>
} {
  return {
    id: row.id,
    name: row.name,
    transport: row.transport,
    url: row.url,
    command: row.command,
    args: safeJsonField<string[]>(row.args, []),
    env: safeJsonField<Record<string, string>>(row.env, {}),
    headers: safeJsonField<Record<string, string>>(row.headers, {}),
  }
}

// ---------- stdio 传输 ----------

/** 命令行字符串 → { command, args }（兼容旧 command 全写法；新数据用结构化 args） */
export function parseCommandline(cmdline: string): { command: string; args: string[] } {
  const parts = cmdline.trim().split(/\s+/).filter(Boolean)
  return { command: parts[0] ?? "", args: parts.slice(1) }
}

/** stdio 握手（连接 → tools/list → 关闭） */
async function testStdioServer(server: {
  name: string
  command: string
  args?: string[]
  env?: Record<string, string>
}): Promise<McpTestResult> {
  const t0 = Date.now()
  const structured = server.args && server.args.length > 0
  const { command, args } = structured
    ? { command: server.command, args: server.args ?? [] }
    : parseCommandline(server.command)
  if (!command) {
    return { ok: false, serverName: server.name, tools: [], latencyMs: 0, error: "stdio 传输需要 command（如 node scripts/echo-mcp-server.mjs 或 npx）" }
  }
  const client = new McpClient(server.name, { command, args, env: server.env })
  try {
    const { serverInfo } = await client.connect(10_000)
    const tools = await client.listTools(10_000)
    return {
      ok: true,
      serverName: server.name,
      tools: tools.map((t) => ({ name: t.name, description: t.description?.slice(0, 200), inputSchema: t.inputSchema })),
      latencyMs: Date.now() - t0,
      detail: `stdio 握手成功：${serverInfo.name} v${serverInfo.version}（发现 ${tools.length} 个工具）`,
    }
  } catch (e) {
    return {
      ok: false,
      serverName: server.name,
      tools: [],
      latencyMs: Date.now() - t0,
      error: `stdio 连接失败：${(e as Error).message}`,
    }
  } finally {
    await client.close()
  }
}

/** stdio 工具调用（连接 → tools/call → 关闭；一次连接完成一次调用） */
async function callStdioTool(
  server: { name: string; command: string; args?: string[]; env?: Record<string, string> },
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const structured = server.args && server.args.length > 0
  const { command, args: cmdArgs } = structured
    ? { command: server.command, args: server.args ?? [] }
    : parseCommandline(server.command)
  if (!command) throw new Error(`stdio 服务器 "${server.name}" 缺 command`)
  const client = new McpClient(server.name, { command, args: cmdArgs, env: server.env })
  try {
    await client.connect(10_000)
    return await client.callTool(toolName, args, 60_000)
  } finally {
    await client.close()
  }
}

// ---------- http 传输 ----------

/** http 握手（initialize → tools/list，会话头管理 + 鉴权头注入） */
async function testHttpServer(server: {
  name: string
  url: string
  headers?: Record<string, string>
}): Promise<McpTestResult> {
  const t0 = Date.now()
  if (!server.url) {
    return { ok: false, serverName: server.name, tools: [], latencyMs: 0, error: "URL 为空" }
  }
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(server.headers ?? {}),
  }

  try {
    // 1) initialize（取 Mcp-Session-Id 会话头，后续请求携带）
    const initRes = await fetch(server.url, {
      method: "POST",
      headers: baseHeaders,
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
        error: `initialize HTTP ${initRes.status}（请确认 URL 指向 MCP endpoint 且支持 POST JSON-RPC${server.headers ? "；若 401/403 请检查鉴权头" : ""}）`,
      }
    }
    const sessionId = initRes.headers.get("mcp-session-id")
    const sessionHeaders = sessionId ? { ...baseHeaders, "Mcp-Session-Id": sessionId } : baseHeaders
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

    // 2) notifications/initialized + tools/list（带会话头）
    await fetch(server.url, {
      method: "POST",
      headers: sessionHeaders,
      body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
      signal: AbortSignal.timeout(5000),
    }).catch(() => {
      /* 通知失败不致命 */
    })
    const toolsRes = await fetch(server.url, {
      method: "POST",
      headers: sessionHeaders,
      body: makeRpc(2, "tools/list"),
      signal: AbortSignal.timeout(8000),
    })
    const toolsText = await toolsRes.text()
    const toolsJson = parseSseBody(toolsText)
    const tools = ((toolsJson?.result as { tools?: McpToolInfo[] })?.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description?.slice(0, 200),
      inputSchema: t.inputSchema,
    }))

    return {
      ok: true,
      serverName: server.name,
      tools,
      latencyMs: Date.now() - t0,
      detail:
        (serverInfo ? `握手成功：${serverInfo.name ?? "?"} v${serverInfo.version ?? "?"}（协议 ${PROTOCOL_VERSION}）` : "握手成功") +
        (sessionId ? " · 会话已建立" : ""),
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

/** http 工具调用（initialize → tools/call，带会话与鉴权头） */
async function callHttpTool(
  server: { name: string; url: string; headers?: Record<string, string> },
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const baseHeaders: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
    ...(server.headers ?? {}),
  }
  const initRes = await fetch(server.url, {
    method: "POST",
    headers: baseHeaders,
    body: makeRpc(1, "initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "ai-radar-workflow", version: "2.0" },
    }),
    signal: AbortSignal.timeout(8000),
  })
  if (!initRes.ok) throw new Error(`initialize HTTP ${initRes.status}`)
  const sessionId = initRes.headers.get("mcp-session-id")
  const sessionHeaders = sessionId ? { ...baseHeaders, "Mcp-Session-Id": sessionId } : baseHeaders
  await fetch(server.url, {
    method: "POST",
    headers: sessionHeaders,
    body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {})
  const callRes = await fetch(server.url, {
    method: "POST",
    headers: sessionHeaders,
    body: makeRpc(2, "tools/call", { name: toolName, arguments: args }),
    signal: AbortSignal.timeout(60_000),
  })
  const callText = await callRes.text()
  const callJson = parseSseBody(callText)
  if (callJson?.error) {
    throw new Error(`MCP 调用错误：${(callJson.error as { message?: string }).message ?? JSON.stringify(callJson.error).slice(0, 120)}`)
  }
  return callJson?.result ?? null
}

// ---------- 统一门面 ----------

/** 对一个 MCP server 执行 initialize + tools/list 握手（http / stdio 双传输） */
export async function testMcpServer(server: {
  name: string
  transport: string
  url: string
  command?: string
  args?: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
}): Promise<McpTestResult> {
  if (server.transport === "stdio") {
    return testStdioServer({ name: server.name, command: server.command ?? "", args: server.args, env: server.env })
  }
  return testHttpServer({ name: server.name, url: server.url, headers: server.headers })
}

/** 调用一个 MCP 工具（http / stdio 双传输；注册表接入的执行路径） */
export async function callMcpTool(
  server: {
    name: string
    transport: string
    url: string
    command?: string
    args?: string[]
    env?: Record<string, string>
    headers?: Record<string, string>
  },
  toolName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  if (server.transport === "stdio") {
    return callStdioTool({ name: server.name, command: server.command ?? "", args: server.args, env: server.env }, toolName, args)
  }
  return callHttpTool({ name: server.name, url: server.url, headers: server.headers }, toolName, args)
}

/** DB 记录 + 握手测试 + 工具发现落库 + 注册表同步（P1-4：发现即接入） */
export async function testAndSave(serverId: string): Promise<McpTestResult> {
  const row = await db.mcpServer.findUnique({ where: { id: serverId } })
  if (!row) throw new Error(`MCP server "${serverId}" 不存在`)
  const server = rowToServer(row as McpServerRow)
  const result = await testMcpServer(server)
  await db.mcpServer.update({
    where: { id: serverId },
    data: {
      status: result.ok ? "connected" : "error",
      discoveredTools: JSON.stringify(result.tools),
      lastError: result.error ?? "",
      lastCheckedAt: new Date(),
    },
  })
  if (result.ok && row.enabled) {
    await syncMcpToolsToRegistry() // 发现即接入（await：测试返回时注册表已更新，消除竞态）
  }
  return result
}

// ---------- P1-4 核心：发现工具接入注册表（mcp__服务器__工具，学 dsh 命名） ----------

/** 已注册的 MCP 工具名集合（防重复注册 & 支持移除） */
const registeredMcpTools = new Map<string, string>() // toolName → serverId

/** inputSchema（JSON Schema）→ 注册表 params 说明（极简版） */
function schemaToParams(inputSchema: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  const schema = inputSchema as { properties?: Record<string, { type?: string; description?: string }>; required?: string[] } | undefined
  if (!schema?.properties || typeof schema.properties !== "object") return out
  for (const [key, prop] of Object.entries(schema.properties)) {
    const req = schema.required?.includes(key) ? "（必填）" : ""
    out[key] = `${prop.type ?? "any"}${prop.description ? `：${prop.description}` : ""}${req}`
  }
  return out
}

/**
 * 同步所有「已启用 + 握过手」的服务器工具进工具注册表。
 * 幂等：先移除不再存在/已停用的旧注册，再按最新 discoveredTools 重注册。
 * Agent 运行时与工具测试台从此可直接调用 mcp__服务器__工具。
 */
export async function syncMcpToolsToRegistry(): Promise<{ servers: number; tools: number }> {
  // ① 清掉本模块注册的、其服务器已不存在或已停用/未握手的工具
  const rows = await db.mcpServer.findMany()
  const activeIds = new Set(
    rows
      .filter((r) => r.enabled && r.status === "connected")
      .map((r) => r.id),
  )
  for (const [toolName, serverId] of registeredMcpTools) {
    if (!activeIds.has(serverId)) {
      toolRegistry.unregister(toolName)
      registeredMcpTools.delete(toolName)
    }
  }

  // ② 注册启用的已连接服务器的工具
  let toolCount = 0
  let serverCount = 0
  for (const row of rows) {
    if (!row.enabled || row.status !== "connected") continue
    const server = rowToServer(row as McpServerRow)
    const tools = safeJsonField<McpToolInfo[]>(row.discoveredTools, [])
    serverCount++
    for (const t of tools) {
      // dsh 命名学：mcp__服务器名__工具名（服务器名去空格与特殊字符）
      const serverKey = server.name.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 30) || "server"
      const toolName = `mcp__${serverKey}__${t.name}`
      const captured = { ...server }
      toolRegistry.register({
        name: toolName,
        description: `[MCP:${server.name}] ${t.description ?? "外部 MCP 服务器工具"}`,
        builtin: false,
        params: schemaToParams(t.inputSchema),
        async run(input: Record<string, unknown>) {
          const result = (await callMcpTool(captured, t.name, input)) as {
            content?: { type: string; text?: string }[]
            isError?: boolean
          } | null
          if (!result) return { ok: false, error: "空响应" }
          // MCP content 块 → 文本拼接（模型可读形态）
          const text = (result.content ?? [])
            .map((c) => (c.type === "text" ? c.text ?? "" : `[$ {c.type}]`))
            .join("\n")
            .slice(0, 8000)
          if (result.isError) throw new Error(`MCP 工具报错：${text.slice(0, 200)}`)
          return { ok: true, text, raw: result.content?.length === 1 ? undefined : result }
        },
      })
      registeredMcpTools.set(toolName, row.id)
      toolCount++
    }
  }
  if (toolCount > 0) {
    console.log(`[mcp] 注册表已接入 ${toolCount} 个外部工具（来自 ${serverCount} 个已启用服务器，命名 mcp__服务器__工具）`)
  }
  return { servers: serverCount, tools: toolCount }
}

/** 当前注册表中的 MCP 工具清单（UI 展示 + 联调用） */
export function listRegisteredMcpTools(): { name: string; serverId: string }[] {
  return [...registeredMcpTools.entries()].map(([name, serverId]) => ({ name, serverId }))
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

// ---------- mcpServers 标准格式导入导出（D.3：一份 JSON 多处可用） ----------

export interface ImportReport {
  imported: string[]
  skipped: { name: string; reason: string }[]
}

/** 导入标准 mcpServers JSON（Cursor / Claude Desktop / VS Code 同构格式）
 *  规则：有 url 判远程（headers/auth 同步入库）；有 command 判 stdio（args/env 入库）；
 *  不支持字段（envFile 等）逐条列出并跳过，不静默丢弃。 */
export async function importMcpServersJson(raw: string): Promise<ImportReport> {
  let parsed: { mcpServers?: Record<string, Record<string, unknown>> }
  try {
    parsed = JSON.parse(raw)
  } catch (e) {
    throw new Error(`JSON 解析失败：${(e as Error).message.slice(0, 80)}（合法格式：{ "mcpServers": { ... } }）`)
  }
  const servers = parsed?.mcpServers
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) {
    throw new Error('缺少 "mcpServers" 对象（顶层键必须叫 mcpServers）')
  }

  const report: ImportReport = { imported: [], skipped: [] }
  for (const [name, cfg] of Object.entries(servers)) {
    if (!cfg || typeof cfg !== "object") {
      report.skipped.push({ name, reason: "条目不是对象" })
      continue
    }
    const url = typeof cfg.url === "string" ? cfg.url.trim() : ""
    const command = typeof cfg.command === "string" ? cfg.command.trim() : ""
    if (!url && !command) {
      report.skipped.push({ name, reason: "既无 url（远程）也无 command（stdio），无法判别类型" })
      continue
    }

    // 不支持字段显式列出（不静默丢弃）
    for (const k of ["envFile", "type", "alwaysAllow", "disabled"]) {
      if (k in cfg) report.skipped.push({ name, reason: `字段 "${k}" 暂不支持，已忽略（其余字段正常导入）` })
    }

    // 查重：同名或同 url/command 已存在则跳过
    const dup = await db.mcpServer.findFirst({
      where: url ? { OR: [{ name }, { url }] } : { OR: [{ name }, { command }] },
      select: { id: true },
    })
    if (dup) {
      report.skipped.push({ name, reason: "同名或同地址的服务器已存在" })
      continue
    }

    const common = { name: name.slice(0, 80), enabled: true }
    if (url) {
      // 远程条目：url + headers/auth
      const headers: Record<string, string> = {}
      const h = cfg.headers
      if (h && typeof h === "object" && !Array.isArray(h)) {
        for (const [hk, hv] of Object.entries(h as Record<string, unknown>)) {
          if (typeof hv === "string") headers[hk] = hv
        }
      }
      // Cursor 静态 OAuth 凭据形态
      const auth = cfg.auth as { token?: string; type?: string } | undefined
      if (auth?.token && !headers.Authorization) {
        headers.Authorization = auth.type?.toLowerCase().includes("bearer") ? `Bearer ${auth.token}` : auth.token
      }
      await db.mcpServer.create({
        data: { ...common, transport: "http", url: url.slice(0, 500), headers: JSON.stringify(headers) },
      })
      report.imported.push(`${name}（http）`)
    } else {
      // stdio 条目：command + args[] + env{}
      const args = Array.isArray(cfg.args) ? cfg.args.filter((a) => typeof a === "string") : []
      const env: Record<string, string> = {}
      const e = cfg.env
      if (e && typeof e === "object" && !Array.isArray(e)) {
        for (const [ek, ev] of Object.entries(e as Record<string, unknown>)) {
          if (typeof ev === "string") env[ek] = ev
        }
      }
      await db.mcpServer.create({
        data: {
          ...common,
          transport: "stdio",
          url: "",
          command: command.slice(0, 300),
          args: JSON.stringify(args),
          env: JSON.stringify(env),
        },
      })
      report.imported.push(`${name}（stdio）`)
    }
  }
  return report
}

/** 导出为标准 mcpServers JSON（可直接粘进 Cursor / Claude Desktop 配置） */
export async function exportMcpServersJson(): Promise<string> {
  const rows = await db.mcpServer.findMany({ orderBy: { createdAt: "asc" } })
  const out: Record<string, Record<string, unknown>> = {}
  for (const row of rows) {
    if (row.transport === "http" && row.url) {
      const headers = safeJsonField<Record<string, string>>(row.headers, {})
      const entry: Record<string, unknown> = { url: row.url }
      if (Object.keys(headers).length > 0) entry.headers = headers
      if (!row.enabled) entry.disabled = true
      out[row.name.replace(/\s+/g, "-")] = entry
    } else if (row.transport === "stdio" && row.command) {
      const args = safeJsonField<string[]>(row.args, [])
      const env = safeJsonField<Record<string, string>>(row.env, {})
      const structured = args.length > 0
      const parsed = structured ? { command: row.command, args } : parseCommandline(row.command)
      const entry: Record<string, unknown> = { command: parsed.command }
      if (parsed.args.length > 0) entry.args = parsed.args
      if (Object.keys(env).length > 0) entry.env = env
      if (!row.enabled) entry.disabled = true
      out[row.name.replace(/\s+/g, "-")] = entry
    }
  }
  return JSON.stringify({ mcpServers: out }, null, 2)
}
