/**
 * MCP 服务器配置
 *
 * 配置文件：项目根 config/mcp.json
 * {
 *   "servers": {
 *     "echo": { "command": "node", "args": ["scripts/echo-mcp-server.mjs"], "description": "…" }
 *   }
 * }
 *
 * 新增 MCP 服务器 = 改一个 JSON 配置，无需改代码——
 * 这正是「插件化」的最小闭环（对应 dsh 的协议族配置化思想）。
 */

import { promises as fs } from 'fs'
import path from 'path'
import type { McpServerConfig } from './client'

export interface McpConfig {
  servers: Record<string, McpServerConfig>
}

const CONFIG_PATH = path.join(process.cwd(), 'config', 'mcp.json')

export async function loadMcpConfig(): Promise<McpConfig> {
  try {
    const raw = await fs.readFile(CONFIG_PATH, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<McpConfig>
    if (parsed && typeof parsed.servers === 'object' && parsed.servers) {
      return { servers: parsed.servers }
    }
  } catch {
    // 配置缺失或损坏 → 返回空配置，API 层会明确提示
  }
  return { servers: {} }
}
