import { NextResponse } from 'next/server'
import { getMcpServerConfig, saveMcpServerConfig } from '@/lib/mcp-server/config'
import { PLATFORM_TOOLS } from '@/lib/mcp-server/platform-tools'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * MCP 服务端配置（P2-3；插件中心「MCP 服务端开放」卡片数据源）
 * GET  /api/mcp-server/config —— 当前配置 + 工具清单（token 只回显是否已设）
 * PUT  /api/mcp-server/config —— { enabled?, token?, clearToken? }
 */

export async function GET() {
  const config = await getMcpServerConfig()
  return NextResponse.json({
    ok: true,
    config: { enabled: config.enabled, hasToken: Boolean(config.token) },
    tools: PLATFORM_TOOLS.map((t) => ({ name: t.name, description: t.description.slice(0, 120) })),
    protocol: '2025-06-18',
    transport: 'Streamable HTTP（POST JSON-RPC）',
  })
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as { enabled?: boolean; token?: string; clearToken?: boolean }
    const patch: { enabled?: boolean; token?: string } = {}
    if (typeof body.enabled === 'boolean') patch.enabled = body.enabled
    if (body.clearToken) patch.token = ''
    else if (typeof body.token === 'string') {
      const token = body.token.trim()
      if (token && !/^[A-Za-z0-9_-]{8,128}$/.test(token)) {
        return NextResponse.json({ ok: false, message: '令牌须为 8-128 位字母/数字/下划线/连字符（Bearer 友好形态）' }, { status: 400 })
      }
      patch.token = token
    }
    const next = await saveMcpServerConfig(patch)
    return NextResponse.json({
      ok: true,
      config: { enabled: next.enabled, hasToken: Boolean(next.token) },
      message: body.clearToken
        ? '令牌已清除（回到本机开放模式）'
        : typeof body.enabled === 'boolean'
          ? next.enabled
            ? 'MCP 服务端已启用'
            : 'MCP 服务端已停用（外部客户端将收到 503）'
          : '令牌已保存（外部调用需带 Authorization: Bearer 头）',
    })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '配置失败' }, { status: 400 })
  }
}
