// ============================================================
// test-p1-mcp.mjs —— P1-4 MCP 标准化在线集成回归（需 dev server）
// 覆盖方案第四章验收要点：
//   ① 导入标准 mcpServers JSON（含一个 stdio + 一个远程条目）→ 两服务器入库
//   ② 双传输分别测试（stdio 真握手 echo 服务器 / http 端点校验）
//   ③ 工具接入注册表：握手成功的服务器 → 工具出现在 /api/agent/tools
//      （mcp__服务器__工具 命名）→ 工具测试台可实际调用（echo 真回显）
//   ④ 导出 JSON 结构合法（mcpServers 键 + 条目形态）→ 可再导入（往返一致）
//   ⑤ 启停联动：停用服务器 → 其工具从注册表摘除；启用 → 恢复
//   ⑥ 老通道（config/mcp.json echo）测试 + file: 前缀语义
// 运行：bash scripts/with-server.sh "node scripts/test-p1-mcp.mjs"
// ============================================================

const BASE = "http://127.0.0.1:3000"

let pass = 0
let fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.error(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

async function j(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* 非 JSON */ }
  return { status: res.status, json }
}

console.log("━━━ P1-4 MCP 标准化在线集成回归 ━━━")

// ---------- ① 导入标准 mcpServers JSON ----------
console.log("── ① 标准格式导入 ──")
const IMPORT_JSON = JSON.stringify({
  mcpServers: {
    "p1-echo": { command: "node", args: ["scripts/echo-mcp-server.mjs"] },
    "p1-remote-demo": { url: "http://127.0.0.1:9/mcp", headers: { Authorization: "Bearer test-token" } },
  },
})
{
  const r = await j("POST", "/api/agent/mcp", { action: "import", json: IMPORT_JSON })
  ok("导入返回 200", r.status === 200, String(r.json?.message ?? r.json?.error ?? "").slice(0, 70))
  ok("两个条目全部导入（stdio + 远程）", (r.json?.report?.imported ?? []).length === 2, (r.json?.report?.imported ?? []).join("、"))
  ok("跳过清单为空（无静默丢弃）", (r.json?.report?.skipped ?? []).length === 0)

  const list = await j("GET", "/api/agent/mcp")
  const servers = list.json?.servers ?? []
  const echo = servers.find((s) => s.name === "p1-echo")
  const remote = servers.find((s) => s.name === "p1-remote-demo")
  ok("p1-echo 入库为 stdio 传输", echo?.transport === "stdio")
  ok("结构化 args 入库（D.2/D.3 形态）", JSON.stringify(echo?.args ?? "[]").includes("echo-mcp-server"), String(echo?.args))
  ok("p1-remote-demo 入库为 http 传输", remote?.transport === "http")
  ok("远程条目 headers 鉴权头入库", JSON.parse(remote?.headers ?? "{}").Authorization === "Bearer test-token")

  // 非法 JSON 拒绝
  const bad = await j("POST", "/api/agent/mcp", { action: "import", json: "{not-json" })
  ok("坏 JSON 被 400 拒绝（人话错误）", bad.status === 400 && /解析失败|mcpServers/.test(String(bad.json?.error)))
  const noKey = await j("POST", "/api/agent/mcp", { action: "import", json: '{"servers":{}}' })
  ok("缺 mcpServers 键被 400 拒绝", noKey.status === 400 && /mcpServers/.test(String(noKey.json?.error)))
}

// ---------- ② 双传输测试（stdio 真握手） ----------
console.log("── ② 双传输握手 ──")
let echoServerId
{
  const list = await j("GET", "/api/agent/mcp")
  const echo = (list.json?.servers ?? []).find((s) => s.name === "p1-echo")
  echoServerId = echo?.id

  const t = await j("POST", "/api/agent/mcp", { action: "test", id: echoServerId })
  const res = t.json?.result
  ok("stdio 握手成功（echo 服务器，结构化 args）", res?.ok === true, String(res?.detail ?? res?.error ?? "").slice(0, 60))
  ok("发现 2 个工具（echo / time-now）", (res?.tools ?? []).length === 2, (res?.tools ?? []).map((x) => x.name).join(","))
  ok("工具发现带 inputSchema（注册表参数说明数据源）", (res?.tools ?? []).some((x) => x.inputSchema))

  // http 到不可达端点 → 明确报错
  const remote = (list.json?.servers ?? []).find((s) => s.name === "p1-remote-demo")
  const t2 = await j("POST", "/api/agent/mcp", { action: "test", id: remote?.id })
  ok("http 不可达端点诚实报错", t2.json?.result?.ok === false, String(t2.json?.result?.error ?? "").slice(0, 50))
}

// ---------- ③ 工具接入注册表 + 实际调用 ----------
console.log("── ③ 工具接入注册表 ──")
{
  const tools = await j("GET", "/api/agent/tools")
  const all = tools.json?.tools ?? []
  const mcpEcho = all.find((t) => t.name === "mcp__p1-echo__echo")
  const mcpTime = all.find((t) => t.name === "mcp__p1-echo__time-now")
  ok("echo 工具以 mcp__服务器__工具 命名出现在注册表", Boolean(mcpEcho), all.filter((t) => t.name.startsWith("mcp__")).map((t) => t.name).join(","))
  ok("time-now 工具同样接入", Boolean(mcpTime))
  ok("MCP 工具带参数说明（schemaToParams）", mcpEcho ? typeof mcpEcho.params?.text === "string" : false, JSON.stringify(mcpEcho?.params ?? {}))
  ok("MCP 工具标注非内置（MCP 徽章数据源）", mcpEcho?.builtin === false)

  // 实际调用：echo 真回显（发现→注册→调用全链路，不再是纯展示）
  const call = await j("POST", "/api/agent/tools", { name: "mcp__p1-echo__echo", input: { text: "P1-4 全链路验证" } })
  const result = JSON.stringify(call.json?.result ?? "")
  ok("工具测试台实调 echo 成功（注册表可调）", call.status === 200 && call.json?.result?.ok !== false, String(call.json?.result?.text ?? call.json?.error ?? "").slice(0, 60))
  ok("echo 真回显输入文本（含时间戳前缀）", /\[echo@/.test(result) && result.includes("P1-4 全链路验证"), result.slice(0, 80))

  // GET /api/agent/mcp 附带注册清单
  const list = await j("GET", "/api/agent/mcp")
  ok("GET 返回 registeredMcpTools 清单", (list.json?.registeredMcpTools ?? []).some((t) => t.name === "mcp__p1-echo__echo"))
}

// ---------- ④ 导出往返一致 ----------
console.log("── ④ 导出/往返 ──")
{
  const e = await j("POST", "/api/agent/mcp", { action: "export" })
  ok("导出返回 200", e.status === 200)
  const exported = JSON.parse(e.json?.json ?? "{}")
  ok("导出为标准 mcpServers 键结构", typeof exported.mcpServers === "object" && !Array.isArray(exported.mcpServers))
  const entry = exported.mcpServers?.["p1-echo"]
  ok("stdio 条目导出 command+args 结构化形态", entry?.command === "node" && Array.isArray(entry?.args) && entry.args.some((a) => String(a).includes("echo-mcp-server")), JSON.stringify(entry))
  const rEntry = exported.mcpServers?.["p1-remote-demo"]
  ok("远程条目导出 url+headers", rEntry?.url?.startsWith("http://") && rEntry?.headers?.Authorization === "Bearer test-token")

  // 删除测试条目后再导入导出的 JSON（往返验证）——先清掉两个再导入
  const list = await j("GET", "/api/agent/mcp")
  for (const s of list.json?.servers ?? []) {
    if (s.name === "p1-echo" || s.name === "p1-remote-demo") {
      await j("POST", "/api/agent/mcp", { action: "delete", id: s.id })
    }
  }
  // 工具应已摘除
  const toolsAfterDel = await j("GET", "/api/agent/tools")
  ok("删除服务器后其工具从注册表摘除", !(toolsAfterDel.json?.tools ?? []).some((t) => t.name === "mcp__p1-echo__echo"))

  const reimport = await j("POST", "/api/agent/mcp", { action: "import", json: e.json?.json })
  ok("导出的 JSON 可再导入（往返一致）", (reimport.json?.report?.imported ?? []).length === 2, (reimport.json?.report?.imported ?? []).join("、"))
}

// ---------- ⑤ 启停联动 ----------
console.log("── ⑤ 启停联动 ──")
{
  // 重新测试握手 → 注册
  const list = await j("GET", "/api/agent/mcp")
  const echo = (list.json?.servers ?? []).find((s) => s.name === "p1-echo")
  await j("POST", "/api/agent/mcp", { action: "test", id: echo?.id })
  const tools1 = await j("GET", "/api/agent/tools")
  ok("测试成功后工具自动接入（发现即接入）", (tools1.json?.tools ?? []).some((t) => t.name === "mcp__p1-echo__echo"))

  // 停用 → 摘除
  await j("POST", "/api/agent/mcp", { action: "toggle", id: echo?.id })
  const tools2 = await j("GET", "/api/agent/tools")
  ok("停用后工具即时摘除", !(tools2.json?.tools ?? []).some((t) => t.name === "mcp__p1-echo__echo"))

  // 启用 + sync → 恢复
  await j("POST", "/api/agent/mcp", { action: "toggle", id: echo?.id })
  const sync = await j("POST", "/api/agent/mcp", { action: "sync-tools" })
  const tools3 = await j("GET", "/api/agent/tools")
  ok("重新启用 + 同步后工具恢复", (tools3.json?.tools ?? []).some((t) => t.name === "mcp__p1-echo__echo"), sync.json?.message?.slice(0, 60))
}

// ---------- ⑥ 老通道兼容 + 收尾清理 ----------
console.log("── ⑥ 老通道 + 清理 ──")
{
  // config/mcp.json 的 echo（file: 前缀）
  const t = await j("POST", "/api/agent/mcp", { action: "test", id: "file:echo" })
  ok("老通道 file:echo 测试仍通过（迁移期双读）", t.json?.result?.ok === true, String(t.json?.result?.detail ?? "").slice(0, 50))

  // 收尾：删除两个测试服务器（幂等清理）
  const list = await j("GET", "/api/agent/mcp")
  for (const s of list.json?.servers ?? []) {
    if (s.name === "p1-echo" || s.name === "p1-remote-demo") {
      await j("POST", "/api/agent/mcp", { action: "delete", id: s.id })
    }
  }
  const toolsFinal = await j("GET", "/api/agent/tools")
  ok("清理后 p1 测试工具已摘除（其他服务器工具合法保留）", !(toolsFinal.json?.tools ?? []).some((t) => t.name.startsWith("mcp__p1-") || t.name.startsWith("mcp__p1-remote")), `${(toolsFinal.json?.tools ?? []).length} 个工具（含既有服务器）`)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
