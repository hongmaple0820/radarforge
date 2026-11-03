// ============================================================
// config —— MCP 服务端配置（P2-3）
// SettingKV `mcp:server` = { enabled, token }
//   enabled：服务端是否对外（默认 true——单用户本地服务，装好即可接）
//   token  ：可选 Bearer 令牌；设置后要求 Authorization: Bearer <token>
//            或 X-Radar-Token 头（暴露到非本机网络时建议启用）
// 独立小模块（学 skills/state.ts——MCP 域单独演进，不扩 AppSettings）
// ============================================================

import { db } from "@/lib/db"

const KEY = "mcp:server"
const CACHE_TTL = 5_000

export interface McpServerConfig {
  enabled: boolean
  token: string
}

const DEFAULT: McpServerConfig = { enabled: true, token: "" }

let cache: { at: number; config: McpServerConfig } | null = null

export async function getMcpServerConfig(force = false): Promise<McpServerConfig> {
  if (!force && cache && Date.now() - cache.at < CACHE_TTL) return cache.config
  let config = DEFAULT
  try {
    const row = await db.settingKV.findUnique({ where: { key: KEY } })
    if (row) {
      const parsed = JSON.parse(row.value) as Partial<McpServerConfig>
      config = {
        enabled: typeof parsed.enabled === "boolean" ? parsed.enabled : DEFAULT.enabled,
        token: typeof parsed.token === "string" ? parsed.token : "",
      }
    }
  } catch {
    // 值损坏 → 默认（开放本机）
  }
  cache = { at: Date.now(), config }
  return config
}

export async function saveMcpServerConfig(patch: Partial<McpServerConfig>): Promise<McpServerConfig> {
  const current = await getMcpServerConfig(true)
  const next: McpServerConfig = {
    enabled: typeof patch.enabled === "boolean" ? patch.enabled : current.enabled,
    token: typeof patch.token === "string" ? patch.token : current.token,
  }
  await db.settingKV.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  })
  cache = { at: Date.now(), config: next }
  return next
}

/** 校验请求鉴权：token 未配置 → 放行（本机开放）；已配置 → 匹配 Bearer / X-Radar-Token */
export function checkMcpAuth(req: Request, config: McpServerConfig): boolean {
  if (!config.token) return true
  const auth = req.headers.get("authorization")
  if (auth === `Bearer ${config.token}`) return true
  const custom = req.headers.get("x-radar-token")
  if (custom === config.token) return true
  return false
}
