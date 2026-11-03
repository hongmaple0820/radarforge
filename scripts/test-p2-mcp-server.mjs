// ============================================================
// test-p2-mcp-server.mjs —— P2-3 MCP 服务端开放在线集成回归（需 dev server）
// 覆盖 q7 方案 P2-3 / 4.3 验收要点（外部 MCP 客户端可调用平台能力）：
//   ① initialize → Mcp-Session-Id 响应头 + capabilities + serverInfo
//   ② notifications/initialized → 202；ping → {}
//   ③ tools/list → 8 个平台工具（含 JSON Schema）
//   ④ 协议错误：未知方法 -32601 / 未知工具 -32602 / 坏 JSON -32700 / 批量 -32600
//   ⑤ 读工具真调用：radar_ping / radar_list_topics / radar_list_skills(12) / radar_search
//   ⑥ 写工具真落库：radar_create_idea → /api/ideas 可见
//   ⑦ 异步流水线：radar_start_article → runId → radar_run_status 轮询到 done
//      → radar_run_output 取成稿；参数校验人话错误（缺必填 / 未知人格）
//   ⑧ 鉴权：设 token → 401（无凭证）/ Bearer 通过 / X-Radar-Token 通过 / 清除
//   ⑨ 启停：停用 → 503 → 恢复
//   ⑩ GET → 405；DELETE 会话 → 204
//   ⑪ 自环 dogfood（双向 MCP 铁证）：把本平台自己作为 MCP 客户端导入
//      （mcpServers JSON 指向自身端点）→ 测试连接发现 8 工具 → 注册表
//      出现 mcp__radarforge-self__radar_ping → 工具测试台实际调用成功
// 运行：bash scripts/with-server.sh "node scripts/test-p2-mcp-server.mjs"
// ============================================================

const BASE = "http://127.0.0.1:3000"
const ENDPOINT = `${BASE}/api/mcp-server`

let pass = 0
let fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.error(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

async function j(method, pathName, body, headers = {}) {
  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers: body ? { "Content-Type": "application/json", ...headers } : headers,
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* 非 JSON */ }
  return { status: res.status, json, res }
}

function rpc(id, method, params) {
  return { jsonrpc: "2.0", id, method, params: params ?? {} }
}

async function mcp(method, params, headers = {}) {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...headers },
    body: JSON.stringify(rpc(1, method, params)),
  })
  let json = null
  try { json = await res.json() } catch { /* 202 等无体 */ }
  return { status: res.status, json, res }
}

/** tools/call 并解析 text content */
async function callTool(name, args, headers = {}) {
  const r = await mcp("tools/call", { name, arguments: args }, headers)
  const text = r.json?.result?.content?.[0]?.text
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = null }
  return { status: r.status, isError: r.json?.result?.isError, error: r.json?.error, parsed, raw: text }
}

async function main() {
  // 收尾清场函数（先定义）
  const cleanup = async () => {
    await j("PUT", "/api/mcp-server/config", { enabled: true, clearToken: true })
    // 删除自环导入的服务器
    const list = await j("GET", "/api/agent/mcp")
    for (const s of list.json?.servers ?? []) {
      if (s.name === "radarforge-self") await j("POST", "/api/agent/mcp", { action: "delete", id: s.id })
    }
  }
  await cleanup()

  console.log("━━ ① initialize 握手 ━━")
  {
    const r = await mcp("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test-client", version: "1.0" },
    })
    ok("initialize 200", r.status === 200)
    const sid = r.res.headers.get("mcp-session-id")
    ok("Mcp-Session-Id 响应头下发", Boolean(sid && sid.length >= 8), sid?.slice(0, 12))
    ok("协议版本回显", r.json?.result?.protocolVersion === "2025-06-18")
    ok("capabilities.tools 声明", Boolean(r.json?.result?.capabilities?.tools))
    ok("serverInfo = radarforge", r.json?.result?.serverInfo?.name === "radarforge")
    ok("instructions 非空（客户端可读引导）", typeof r.json?.result?.instructions === "string" && r.json.result.instructions.length > 0)
  }

  console.log("━━ ② 通知与 ping ━━")
  {
    const res = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) })
    ok("notifications/initialized → 202 无响应体", res.status === 202)
    const p = await mcp("ping")
    ok("ping → {}", p.json?.result && Object.keys(p.json.result).length === 0)
  }

  console.log("━━ ③ tools/list ━━")
  {
    const r = await mcp("tools/list")
    const tools = r.json?.result?.tools ?? []
    const expected = ["radar_ping", "radar_list_topics", "radar_create_idea", "radar_start_article", "radar_run_status", "radar_run_output", "radar_list_skills", "radar_search"]
    ok("8 个平台工具", tools.length === 8, tools.map((t) => t.name).join(","))
    ok("工具名逐一匹配", expected.every((n) => tools.some((t) => t.name === n)))
    ok("带 description 与 inputSchema（JSON Schema）", tools.every((t) => t.description && t.inputSchema?.type === "object"))
    const start = tools.find((t) => t.name === "radar_start_article")
    ok("radar_start_article 声明必填参数", start?.inputSchema?.required?.includes("ideaTitle"))
  }

  console.log("━━ ④ 协议错误 ━━")
  {
    const unknown = await mcp("resources/list")
    ok("未知方法 → -32601", unknown.json?.error?.code === -32601, JSON.stringify(unknown.json?.error))
    const badTool = await mcp("tools/call", { name: "radar_no_such", arguments: {} })
    ok("未知工具 → -32602 且列出可用工具", badTool.json?.error?.code === -32602 && /radar_ping/.test(String(badTool.json?.error?.message)))
    const badJson = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: "not-json{{" })
    const badJsonBody = await badJson.json().catch(() => null)
    ok("坏 JSON → -32700", badJsonBody?.error?.code === -32700)
    const batch = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify([rpc(1, "ping")]) })
    const batchBody = await batch.json().catch(() => null)
    ok("批量请求 → -32600 明确拒绝", batchBody?.error?.code === -32600)
  }

  console.log("━━ ⑤ 读工具真调用 ━━")
  {
    const ping = await callTool("radar_ping", {})
    ok("radar_ping → ok:true", ping.parsed?.ok === true, ping.raw?.slice(0, 60))
    const topics = await callTool("radar_list_topics", {})
    ok("radar_list_topics → 数组结构", Array.isArray(topics.parsed?.topics) && typeof topics.parsed?.total === "number")
    const skills = await callTool("radar_list_skills", {})
    ok("radar_list_skills → 12 个产品技能", skills.parsed?.total === 12 && skills.parsed.skills.every((s) => s.source === "product"), `total=${skills.parsed?.total}`)
    const search = await callTool("radar_search", { query: "AI Agent 最新进展", count: 3 })
    ok("radar_search → 降级链结果（mode+results）", typeof search.parsed?.mode === "string" && Array.isArray(search.parsed?.results) && search.parsed.results.length > 0, `mode=${search.parsed?.mode}`)
  }

  console.log("━━ ⑥ 写工具真落库 ━━")
  const ideaTitle = `MCP 服务端写入 ${new Date().toISOString().slice(11, 19)}`
  {
    const c = await callTool("radar_create_idea", { title: ideaTitle, angle: "从 MCP 协议侧验证写入链路", score: 8 })
    ok("radar_create_idea → ideaId", typeof c.parsed?.ideaId === "string" && c.parsed.ideaId.length > 0, c.raw?.slice(0, 80))
    const ideas = await j("GET", "/api/ideas?limit=200")
    const found = (ideas.json?.ideas ?? []).find((i) => i.title === ideaTitle)
    ok("选题池可见（/api/ideas 断言）", Boolean(found), `score=${found?.score}`)
    // 必填参数校验
    const missing = await callTool("radar_create_idea", {})
    ok("缺必填 → isError + 人话错误", missing.isError === true && /title/.test(String(missing.parsed?.error)), String(missing.parsed?.error))
  }

  console.log("━━ ⑦ 异步流水线（start → status → output） ━━")
  {
    const badPersona = await callTool("radar_start_article", { ideaTitle: "人格校验", persona: "no-such-persona" })
    ok("未知人格 → isError 且列出可选项", badPersona.isError === true && /cold-analyst/.test(String(badPersona.parsed?.error)), String(badPersona.parsed?.error).slice(0, 60))

    const start = await callTool("radar_start_article", { ideaTitle: `MCP 端到端 ${new Date().toISOString().slice(11, 19)}`, ideaAngle: "验证 MCP 异步流水线契约" })
    const runId = start.parsed?.runId
    ok("radar_start_article → runId + 轮询指引", typeof runId === "string" && /radar_run_status/.test(String(start.parsed?.hint)), `runId=${String(runId).slice(0, 10)}…`)

    // 轮询到 done（图文九步，REAL 模式 1-5 分钟）
    let status = null
    const t0 = Date.now()
    for (let i = 0; i < 90; i++) {
      const s = await callTool("radar_run_status", { runId })
      status = s.parsed
      if (s.parsed?.status === "done" || s.parsed?.status === "error") break
      await new Promise((r) => setTimeout(r, 4000))
    }
    ok("radar_run_status 轮询到终态", status?.status === "done" || status?.status === "error", `status=${status?.status} · ${Math.round((Date.now() - t0) / 1000)}s · mode=${status?.mode}`)
    ok("九步步骤摘要返回", Array.isArray(status?.steps) && status.steps.length >= 9, `${status?.steps?.length} 步`)
    if (status?.status === "done") {
      const out = await callTool("radar_run_output", { runId })
      ok("radar_run_output → 成稿 Markdown", out.parsed?.markdown?.length > 500, `${out.parsed?.wordCount} 字`)
      ok("成稿含引用标注 [1]", /\[1\]/.test(String(out.parsed?.markdown)))
    } else {
      ok("失败留痕（error 非空）", typeof status?.error === "string" && status.error.length > 0, String(status?.error).slice(0, 80))
    }
    // 不存在的 run
    const ghost = await callTool("radar_run_status", { runId: "ghost-run" })
    ok("不存在 run → isError 人话错误", ghost.isError === true && /不存在/.test(String(ghost.parsed?.error)))
  }

  console.log("━━ ⑧ 鉴权 ━━")
  {
    await j("PUT", "/api/mcp-server/config", { token: "test-token-12345" })
    const noAuth = await mcp("tools/list")
    ok("无凭证 → 401 + -32001", noAuth.status === 401 && noAuth.json?.error?.code === -32001, JSON.stringify(noAuth.json?.error))
    const bearer = await mcp("tools/list", undefined, { Authorization: "Bearer test-token-12345" })
    ok("Bearer 通过", bearer.json?.result?.tools?.length === 8)
    const custom = await mcp("ping", undefined, { "X-Radar-Token": "test-token-12345" })
    ok("X-Radar-Token 通过", custom.json?.result !== undefined)
    const wrong = await mcp("ping", undefined, { Authorization: "Bearer wrong-token" })
    ok("错令牌 → 401", wrong.status === 401)
    const short = await j("PUT", "/api/mcp-server/config", { token: "abc" })
    ok("短令牌 → 400 格式校验", short.status === 400)
    await j("PUT", "/api/mcp-server/config", { clearToken: true })
    const after = await mcp("tools/list")
    ok("清除令牌 → 回到本机开放", after.json?.result?.tools?.length === 8)
  }

  console.log("━━ ⑨ 启停 ━━")
  {
    await j("PUT", "/api/mcp-server/config", { enabled: false })
    const off = await mcp("tools/list")
    ok("停用 → 503 + 人话指引", off.status === 503 && /插件中心/.test(String(off.json?.error?.message)), String(off.json?.error?.message).slice(0, 60))
    await j("PUT", "/api/mcp-server/config", { enabled: true })
    const on = await mcp("ping")
    ok("恢复启用", on.json?.result !== undefined)
  }

  console.log("━━ ⑩ GET / DELETE ━━")
  {
    const g = await fetch(ENDPOINT, { method: "GET" })
    ok("GET → 405（不提供 SSE 流）", g.status === 405)
    const init = await mcp("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } })
    const sid = init.res.headers.get("mcp-session-id")
    const d = await fetch(ENDPOINT, { method: "DELETE", headers: { "Mcp-Session-Id": sid ?? "" } })
    ok("DELETE 会话 → 204", d.status === 204)
  }

  console.log("━━ ⑪ 自环 dogfood（双向 MCP 铁证） ━━")
  {
    // 本平台作为 MCP 客户端，导入指向自身端点的标准 mcpServers JSON
    const importJson = JSON.stringify({ mcpServers: { "radarforge-self": { url: ENDPOINT } } })
    const imp = await j("POST", "/api/agent/mcp", { action: "import", json: importJson })
    ok("导入自身端点 → 1 个服务器", (imp.json?.report?.imported ?? []).some((x) => String(x).startsWith("radarforge-self")), imp.json?.message)

    const list = await j("GET", "/api/agent/mcp")
    const self = (list.json?.servers ?? []).find((s) => s.name === "radarforge-self")
    ok("客户端清单出现 radarforge-self", Boolean(self))

    const test = await j("POST", "/api/agent/mcp", { action: "test", id: self.id })
    const r = test.json?.result
    ok("测试连接握手成功（http 传输）", r?.ok === true && /握手成功/.test(String(r?.detail)), `${r?.detail ?? ""} · ${r?.tools?.length ?? 0} 工具 · ${r?.latencyMs ?? 0}ms`)
    ok("发现 8 个平台工具", r?.tools?.length === 8)

    // 工具接入注册表（发现即接入）
    const toolsApi = await j("GET", "/api/agent/tools")
    const registered = (toolsApi.json?.tools ?? []).filter((t) => t.name?.startsWith("mcp__radarforge-self__"))
    ok("注册表出现 mcp__radarforge-self__* 工具", registered.length === 8, registered.map((t) => t.name).join(","))

    // 工具测试台实际调用（经统一工具注册表 → 我们自己的 MCP 服务端）
    const exec = await j("POST", "/api/agent/tools", { name: "mcp__radarforge-self__radar_ping", input: {} })
    const execResult = exec.json?.result
    const execText = typeof execResult === "string" ? execResult : JSON.stringify(execResult ?? {})
    ok("工具测试台实调自环工具成功", exec.status === 200 && /radarforge/.test(execText), execText.slice(0, 80))

    // 清理自环服务器
    await j("POST", "/api/agent/mcp", { action: "delete", id: self.id })
    const after = await j("GET", "/api/agent/tools")
    const registeredAfter = (after.json?.tools ?? []).filter((t) => t.name?.startsWith("mcp__radarforge-self__"))
    ok("删除服务器 → 工具同步摘除", registeredAfter.length === 0)
  }

  await cleanup()

  console.log(`\n━━ test-p2-mcp-server：${pass} 通过 / ${fail} 失败 ━━`)
  if (fail > 0) process.exit(1)
}

main().catch(async (e) => {
  console.error("测试执行异常：", e)
  await fetch(`${BASE}/api/mcp-server/config`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ enabled: true, clearToken: true }) }).catch(() => {})
  process.exit(1)
})
