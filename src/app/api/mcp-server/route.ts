import { NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { PLATFORM_TOOLS, findPlatformTool } from '@/lib/mcp-server/platform-tools'
import { getMcpServerConfig, checkMcpAuth } from '@/lib/mcp-server/config'

// ============================================================
// /api/mcp-server —— RadarForge 作为 MCP server 对外（P2-3 双向 MCP）
// Streamable HTTP 传输 · JSON-RPC 2.0 · 协议 2025-06-18：
//   POST   initialize                → capabilities + Mcp-Session-Id 响应头
//          notifications/initialized → 202（通知无响应体）
//          tools/list                → 平台工具定义（含 JSON Schema）
//          tools/call                → 执行平台工具，文本 content 回传
//          ping                      → {}
//   GET    → 405（不提供 SSE 流；客户端可只用 POST 请求/响应形态）
//   DELETE → 会话注销（200）
// 鉴权：配置了 token 时要求 Authorization: Bearer 或 X-Radar-Token。
// 会话：initialize 生成 uuid；后续请求容忍无会话头（单用户本地服务
//       的宽容语义——严格校验只做「携带即登记」）。
// 工具执行失败 → result.isError=true + 人话错误（MCP 规范语义）；
// 协议错误（未知方法/未知工具/坏请求）→ JSON-RPC error。
// ============================================================

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const PROTOCOL_VERSION = '2025-06-18'
const SERVER_INFO = { name: 'radarforge', version: '2.0.0' }

/** 活跃会话登记（诊断用；单用户本地服务不做强校验） */
const sessions = new Map<string, { createdAt: number; lastSeenAt: number }>()

function rpcResult(id: unknown, result: unknown, extraHeaders: Record<string, string> = {}) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: extraHeaders })
}

function rpcError(id: unknown, code: number, message: string, httpStatus = 200) {
  return NextResponse.json({ jsonrpc: '2.0', id, error: { code, message } }, { status: httpStatus })
}

export async function POST(req: Request) {
  // ---- 启用与鉴权 ----
  const config = await getMcpServerConfig()
  if (!config.enabled) {
    return rpcError(null, -32000, 'MCP 服务端未启用（在插件中心「MCP 服务端开放」卡片可开启）', 503)
  }
  if (!checkMcpAuth(req, config)) {
    return rpcError(null, -32001, '鉴权失败：需要 Authorization: Bearer <token> 或 X-Radar-Token 头（与配置的令牌一致）', 401)
  }

  // ---- 解析请求 ----
  let body: { jsonrpc?: string; id?: unknown; method?: string; params?: Record<string, unknown> }
  try {
    body = await req.json()
  } catch {
    return rpcError(null, -32700, '请求体不是合法 JSON')
  }
  if (Array.isArray(body)) {
    return rpcError(null, -32600, '暂不支持批量请求（batch）——请逐条发送')
  }
  const { id, method, params } = body
  if (typeof method !== 'string' || !method) {
    return rpcError(id ?? null, -32600, '缺少 method 字段（JSON-RPC 2.0）')
  }

  // ---- 会话登记（携带即刷新；不强校验——单用户本地服务宽容语义） ----
  const sessionId = req.headers.get('mcp-session-id')
  if (sessionId && sessions.has(sessionId)) {
    sessions.set(sessionId, { ...sessions.get(sessionId)!, lastSeenAt: Date.now() })
  }

  // ---- 通知（无 id）：202 无响应体 ----
  if (id === undefined || id === null) {
    if (method.startsWith('notifications/')) {
      return new NextResponse(null, { status: 202 })
    }
    return rpcError(null, -32600, '无 id 的消息只允许 notifications/* 方法')
  }

  // ---- 请求分发 ----
  switch (method) {
    case 'initialize': {
      const newSession = randomUUID()
      sessions.set(newSession, { createdAt: Date.now(), lastSeenAt: Date.now() })
      return rpcResult(
        id,
        {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions:
            'RadarForge 自媒体工作流平台：选题池 / 图文九步流水线 / 技能库 / 联网检索。先用 tools/list 查看平台工具；出稿用 radar_start_article（异步，runId 轮询）。',
        },
        { 'Mcp-Session-Id': newSession }
      )
    }

    case 'ping': {
      return rpcResult(id, {})
    }

    case 'tools/list': {
      return rpcResult(id, {
        tools: PLATFORM_TOOLS.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
        })),
      })
    }

    case 'tools/call': {
      const name = typeof params?.name === 'string' ? params.name : ''
      const args = (params?.arguments ?? {}) as Record<string, unknown>
      if (!name) return rpcError(id, -32602, 'tools/call 需要 params.name')
      const tool = findPlatformTool(name)
      if (!tool) {
        return rpcError(id, -32602, `未知工具 "${name}"；可用：${PLATFORM_TOOLS.map((t) => t.name).join(', ')}`)
      }
      // required 参数校验（人话错误，不静默）
      for (const req1 of tool.inputSchema.required ?? []) {
        const v = args[req1]
        if (v === undefined || v === null || v === '') {
          return rpcResult(id, {
            content: [{ type: 'text', text: JSON.stringify({ error: `工具 ${name} 缺少必填参数 ${req1}` }) }],
            isError: true,
          })
        }
      }
      try {
        const result = await tool.handler(args)
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          isError: false,
        })
      } catch (e) {
        // 工具执行失败 → isError=true + 人话错误（MCP 规范：工具错误不是协议错误）
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify({ error: (e as Error).message }) }],
          isError: true,
        })
      }
    }

    default:
      return rpcError(id, -32601, `未知方法 "${method}"；支持 initialize / notifications/initialized / ping / tools/list / tools/call`)
  }
}

/** GET：不提供 SSE 流（客户端用 POST 请求/响应形态）——规范允许的 405 */
export async function GET() {
  return NextResponse.json(
    { error: '本 MCP 服务端不提供 GET 流（Streamable HTTP 的 POST 形态即可完成全部交互）' },
    { status: 405, headers: { Allow: 'POST, DELETE' } }
  )
}

/** DELETE：会话注销 */
export async function DELETE(req: Request) {
  const sessionId = req.headers.get('mcp-session-id')
  if (sessionId) sessions.delete(sessionId)
  return new NextResponse(null, { status: 204 })
}
