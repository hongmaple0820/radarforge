// ============================================================
// aihot-p0-demo.mjs —— AIHOT 接入 P0 运行时验证（需 dev server）
// 目的：不改一行产品代码，走产品自己的 API 完成 AIHOT 双缝接入验证：
//   缝A MCP ：POST /api/agent/mcp create+test → 工具注册表 → 实调一个
//   缝B RSS ：POST /api/sources add → 全量 refresh → 条目入池 → 转选题
// 运行：bash scripts/with-server.sh "node scripts/tmp/aihot-p0-demo.mjs"
// 说明：AIHOT 服务器与源保留在 db/custom.db（gitignored，沙箱回收即清）；
//       产品化入库（默认种子）由 P1 票另行拍板，见 docs/research-aihot-agent-access.md。
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

console.log("━━━ AIHOT P0 运行时接入验证（零代码，纯产品 API）━━━")

// ---------- 缝A：MCP（Agent 运行时工具层） ----------
console.log("── 缝A：MCP 产品路径 ──")
{
  // A1 幂等查找/创建服务器条目
  const list = await j("GET", "/api/agent/mcp")
  let row = (list.json?.servers ?? []).find((s) => s.name === "AIHOT")
  if (!row) {
    const c = await j("POST", "/api/agent/mcp", {
      action: "create", name: "AIHOT", transport: "http", url: "https://aihot.news/api/mcp",
    })
    ok("create AIHOT 服务器（http 传输，匿名无鉴权头）", c.status === 200 && Boolean(c.json?.server?.id), String(c.json?.error ?? ""))
    row = c.json?.server
  } else {
    ok("AIHOT 服务器已存在（幂等跳过创建）", true, String(row.id))
  }
  const aihotId = row?.id

  // A2 握手测试（initialize → tools/list；RadarForge 硬编码协议 2025-06-18）
  const t = await j("POST", "/api/agent/mcp", { action: "test", id: aihotId })
  const res = t.json?.result
  ok("http 握手成功（协议 2025-06-18，AIHOT 无状态设计）", res?.ok === true, String(res?.detail ?? res?.error ?? "").slice(0, 90))
  ok("发现 10 个只读工具", (res?.tools ?? []).length === 10, `${res?.tools?.length ?? 0} 个：${(res?.tools ?? []).map((x) => x.name).slice(0, 3).join(",")}…`)
  ok("握手延迟可接受", typeof res?.latencyMs === "number" && res.latencyMs < 15000, `${res?.latencyMs}ms`)

  // A3 工具注册表：mcp__AIHOT__* 前缀
  const tools = await j("GET", "/api/agent/tools")
  const aihotTools = (tools.json?.tools ?? []).filter((x) => x.name.startsWith("mcp__AIHOT__"))
  ok("10 个工具以 mcp__AIHOT__ 前缀接入注册表", aihotTools.length === 10, `${aihotTools.length} 个`)

  // A4 实调一个只读工具（工具测试台同款路径：发现→注册→调用全链路）
  const call = await j("POST", "/api/agent/tools", { name: "mcp__AIHOT__aihot_get_hot_topics", input: { limit: 3 } })
  const text = String(call.json?.result?.text ?? "")
  ok("实调 aihot_get_hot_topics（limit=3）成功", call.status === 200 && call.json?.result?.ok !== false, `${text.length} 字符`)
  ok("返回中文热点 Markdown（AIHOT 回答形态）", /AIHOT/.test(text) && /名/.test(text), text.slice(0, 60).replace(/\n/g, " "))
}

// ---------- 缝B：RSS（雷达层信源） ----------
console.log("── 缝B：RSS 产品路径 ──")
{
  // B1 幂等加源（首次 GET 会自动播种 24 个默认源）
  const before = await j("GET", "/api/sources")
  const has = (before.json?.feeds ?? []).some((f) => f.url === "https://aihot.news/feed.xml")
  if (!has) {
    const a = await j("POST", "/api/sources", {
      action: "add", name: "AIHOT 精选", url: "https://aihot.news/feed.xml", category: "AI聚合",
    })
    ok("add「AIHOT 精选」源（feed.xml，50 条精选）", a.status === 200 && Boolean(a.json?.feed?.id), String(a.json?.error ?? ""))
  } else {
    ok("AIHOT 精选源已存在（幂等跳过）", true)
  }

  // B2 全量刷新（默认源 + AIHOT；其他源网络状态诚实留痕，不静默）
  const r = await j("POST", "/api/sources", { action: "refresh" })
  const results = r.json?.results ?? []
  const aihot = results.find((x) => x.feedName === "AIHOT 精选")
  ok("AIHOT 源刷新 status=ok", aihot?.status === "ok", JSON.stringify(aihot ?? { found: false }).slice(0, 140))
  ok("宽容解析器吃下 RSS 2.0（fetched=40：产品单源上限 slice(0,40)，AIHOT feed 实际 50 条）", aihot?.fetched === 40, `fetched=${aihot?.fetched}`)
  ok("条目入池（新插入或已见均算管线吃下内容）", ((aihot?.inserted ?? 0) + (aihot?.known ?? 0)) > 0, `inserted=${aihot?.inserted}｜known=${aihot?.known}｜跨源去重=${aihot?.duplicates}｜超龄=${aihot?.stale}`)
  const summary = r.json?.summary ?? {}
  console.log(`  ℹ️ 全量刷新：${summary.feeds ?? results.length} 源｜ok ${summary.ok}｜error ${summary.error}｜新增 ${summary.inserted} 条`)

  // B3 信源 → 选题动线（promote 一条 AIHOT 条目，闭环验证）
  // 注：GET /api/sources 只回最新 30 条 status=new；非首跑时 AIHOT 条目可能被
  // 本轮其他源的新条目挤出窗口——promote 闭环已在首跑实证（标题见研究文档 §3.2）。
  const after = await j("GET", "/api/sources")
  const item = (after.json?.items ?? []).find((i) => i.feed?.name === "AIHOT 精选")
  if (item) {
    const p = await j("POST", "/api/sources", { action: "promote", itemId: item.id })
    ok("AIHOT 条目转选题（信源→选题闭环）", p.status === 200 && Boolean(p.json?.ideaId), String(p.json?.title ?? p.json?.error ?? "").slice(0, 60))
  } else {
    ok("promote 闭环跳过（非首跑：AIHOT 条目被本轮新条目挤出前 30；首跑已实证，见研究文档 §3.2）", true)
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
