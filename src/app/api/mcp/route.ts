import { NextResponse } from 'next/server'
import { loadMcpConfig } from '@/lib/mcp/config'
import { probeServer } from '@/lib/mcp/client'

/**
 * MCP（Model Context Protocol）接口
 * GET /api/mcp[?name=echo]
 *
 * 读取 config/mcp.json，对每个（或指定的）服务器做
 * 连接握手 → tools/list 枚举 → 关闭，返回工具清单与错误信息。
 * 任何 MCP 服务器的工具都能以此挂进平台工具注册表。
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const only = searchParams.get('name')

  const config = await loadMcpConfig()
  const names = Object.keys(config.servers).filter((n) => !only || n === only)

  if (names.length === 0) {
    return NextResponse.json({
      ok: true,
      servers: [],
      hint: '尚未配置 MCP 服务器。在 config/mcp.json 的 servers 下添加即可，无需改代码。',
    })
  }

  const results = await Promise.all(
    names.map(async (name) => {
      const cfg = config.servers[name]
      const { tools, error } = await probeServer(name, cfg)
      return {
        name,
        description: cfg.description ?? '',
        command: [cfg.command, ...(cfg.args ?? [])].join(' '),
        toolCount: tools.length,
        tools: tools.map((t) => ({
          name: t.name,
          description: t.description ?? '',
        })),
        error: error ?? null,
      }
    })
  )

  return NextResponse.json({ ok: true, servers: results })
}
