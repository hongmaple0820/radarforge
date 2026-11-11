// ============================================================
// mcp-seeds —— MCP 默认服务器种子表（aihot-access P1 票 01）
// 独立零依赖模块：离线契约测试（b2 ⑧）经相对路径直读本表；
// 消费方是 mcp-client.ts 的 seedDefaultServer（空库首播语义，
// 用户删除默认服务器不复活——循 DeepWiki 先例，方案 §5 D5）。
// 种子语义与决策依据见 docs/aihot-access-plan.md §3 线A。
// ============================================================

export interface McpServerSeed {
  name: string
  transport: "http" | "stdio"
  url: string
  enabled: boolean
}

export const DEFAULT_MCP_SERVERS: McpServerSeed[] = [
  {
    name: "DeepWiki MCP（公开示例）",
    transport: "http",
    url: "https://mcp.deepwiki.com/mcp",
    enabled: true,
  },
  {
    // AIHOT：中文 AI 资讯聚合（匿名只读 MCP，10 工具全 readOnlyHint）
    // 协议兼容实证（2025-06-18 回显）见 docs/research-aihot-agent-access.md §3.1
    name: "AIHOT",
    transport: "http",
    url: "https://aihot.news/api/mcp",
    enabled: true,
  },
]
