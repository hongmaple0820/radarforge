# 01-mcp-default-seed：MCP 默认种子加 AIHOT 行（与 DeepWiki 并列）

Status: resolved（四票全勾，2026-11-11）
Blocked by: （无）

## 目标

全新库首次 `GET /api/agent/mcp` 自愈播种后，McpServer 表同时含 DeepWiki 与 AIHOT（`https://aihot.news/api/mcp`，http 传输，enabled）；Agent 工具层 `test` 握手后 10 个 `mcp__AIHOT__*` 只读工具可注册。

## 改动

- `src/lib/agent/mcp-client.ts`：`seedDefaultServer()` 的硬编码单行改为遍历导出常量 `DEFAULT_MCP_SERVERS`（DeepWiki 原行字节不变 + AIHOT 新行）；保持「空库首播」语义（`count>0` 即返回，方案 D5）。

## 验收

- [x] b2 ⑧ 节先红：`import { DEFAULT_MCP_SERVERS }` 失败（MODULE_NOT_FOUND）
- [x] `DEFAULT_MCP_SERVERS.length === 2`，AIHOT 行四元组精确（name `AIHOT` / transport `http` / url `https://aihot.news/api/mcp` / enabled true）
- [x] DeepWiki 原行保留（url `https://mcp.deepwiki.com/mcp`）
- [x] E2E（随 p1 demo）：清库重播确定性路径实证空库首播（db 行=2）+ 握手 + 10 个 `mcp__AIHOT__*` 入注册表
- [x] 回归门：tsc 零错 + 离线三套全绿（b2 101→104）

## Comments
