// ============================================================
// aihot-p1-demo.mjs —— AIHOT 接入 P1 产品化 E2E（需 dev server）
// 验收对象：.scratch/aihot-access/ 四票的产品路径
//   A MCP 默认种子（票 01：空库首播 → 握手 → 10 工具注册）
//   B RSS 默认种子（票 02a：18 源 / 42 行幂等）
//   C 跨站 guid 去重（票 02b 红线：先刷「精选」再刷「精选全文」→ inserted=0）
//   D ETag 条件请求（票 03：周期源二刷 notModified=true）
//   E 原文直链（票 04：条目 url 指第三方原文 + 摘要尾条目页 + 转选题闭环）
// 运行：bash scripts/with-server.sh "node scripts/tmp/aihot-p1-demo.mjs"（幂等可复跑）
// 上游：docs/aihot-access-plan.md（D1~D4 拍板）、docs/research-aihot-agent-access.md
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

console.log("━━━ AIHOT P1 产品化 E2E ━━━")

// ---------- A. MCP 默认种子（票 01：清库→空库首播的确定性路径） ----------
console.log("── A：MCP 空库首播（清库重播） ──")
{
  // A0 清空 DB 级服务器行（file: 条目归 config/mcp.json 管不动；幂等：每轮都先清后种）
  const list0 = await j("GET", "/api/agent/mcp")
  for (const s of (list0.json?.servers ?? []).filter((x) => x.source === "db")) {
    await j("POST", "/api/agent/mcp", { action: "delete", id: s.id })
  }

  // A1 空库首播：GET 自愈播种 → DEFAULT_MCP_SERVERS 两行落地（DeepWiki + AIHOT 同批）
  const list = await j("GET", "/api/agent/mcp")
  const servers = list.json?.servers ?? []
  const aihot = servers.find((s) => s.name === "AIHOT" && s.url === "https://aihot.news/api/mcp")
  ok("空库首播种下 AIHOT 行（与 DeepWiki 同批，方案 D5）", Boolean(aihot), `db 行=${servers.filter((x) => x.source === "db").length}`)
  ok("DeepWiki 原行保留", servers.some((s) => s.url === "https://mcp.deepwiki.com/mcp"))

  const t = await j("POST", "/api/agent/mcp", { action: "test", id: aihot?.id })
  const res = t.json?.result
  ok("握手 aihot v2.0.0（协议 2025-06-18 回显，零代码兼容）", res?.ok === true, String(res?.error ?? res?.detail ?? "").slice(0, 80))
  ok("发现 10 个只读工具", (res?.tools ?? []).length === 10, `${res?.tools?.length ?? 0} 个｜${res?.latencyMs}ms`)

  const tools = await j("GET", "/api/agent/tools")
  const aihotTools = (tools.json?.tools ?? []).filter((x) => x.name.startsWith("mcp__AIHOT__"))
  ok("10 个工具以 mcp__AIHOT__ 前缀接入注册表", aihotTools.length === 10, `${aihotTools.length} 个`)
}

// ---------- B. RSS 默认种子（票 02a） ----------
console.log("── B：RSS 默认 18 源种子 ──")
{
  const g = await j("GET", "/api/sources")
  const feeds = g.json?.feeds ?? []
  const aihotFeeds = feeds.filter((f) => f.url.startsWith("https://aihot.news/feed"))
  ok("默认种子含 18 条 AIHOT 源（D2 全都要）", aihotFeeds.length === 18, `${aihotFeeds.length} 条｜seededNow=${g.json?.stats?.seededNow ?? "-"}`)
  ok("总源数 42（24 原有 + 18 AIHOT）", feeds.length === 42, `total=${feeds.length}`)
  const names = new Set(aihotFeeds.map((f) => f.name))
  ok("6 主源可按名定位（精选/全文/全部动态/日报/周报/月报）", ["AIHOT 精选", "AIHOT 精选全文", "AIHOT 全部动态", "AIHOT 日报", "AIHOT 周报", "AIHOT 月报"].every((n) => names.has(n)))
}

// ---------- C. 跨站 guid 去重（票 02b 红线） ----------
console.log("── C：定向刷新 + 跨站 guid 去重 ──")
{
  const g = await j("GET", "/api/sources")
  const idOf = (name) => (g.json?.feeds ?? []).find((f) => f.name === name)?.id

  // C1 定向刷新「AIHOT 精选」（feed.xml：50 条精选，产品单源 slice(0,40) 防洪水上限）
  //    复跑兼容：上一轮已存 ETag → 本轮 304 notModified 是正确行为（零正文传输）
  const r1 = await j("POST", "/api/sources", { action: "refresh", feedIds: [idOf("AIHOT 精选")] })
  const c1 = (r1.json?.results ?? [])[0]
  ok("feedIds 定向刷新只刷指定源（results=1）", (r1.json?.results ?? []).length === 1)
  ok("AIHOT 精选刷新 ok（首轮 fetched=40 单源上限；复跑未变化 304 零正文）", c1?.status === "ok" && (c1.notModified === true || c1.fetched === 40), `status=${c1?.status}｜fetched=${c1?.fetched}｜304=${c1?.notModified}`)
  ok("条目入池（或复跑未变化）", (c1?.inserted ?? 0) + (c1?.known ?? 0) > 0 || c1?.notModified === true, `inserted=${c1?.inserted}｜known=${c1?.known}｜304=${c1?.notModified}`)

  // C2 再刷「AIHOT 精选全文」（feed/full.xml：同一批条目、guid 同）
  //    红线探究结论（本批实测被证伪的假设）：预判「全文版摘要不同 → SimHash 漏判 → inserted>0，
  //    需跨站 guid 去重」；实测 duplicates=40 全拦截——同 guid 条目同标题 + cleanSummary 截断
  //    300 字后同摘要 → 同 SimHash，跨源去重已覆盖全部 AIHOT feed 重量对。跨站 guid 去重
  //    转留观（触发条件：实测出现同 guid 双条入池，见 ADR-0011）。
  const r2 = await j("POST", "/api/sources", { action: "refresh", feedIds: [idOf("AIHOT 精选全文")] })
  const c2 = (r2.json?.results ?? [])[0]
  ok("同 guid 条目只入池一次（全文 feed 二刷 inserted=0，SimHash 跨源去重覆盖）", c2?.status === "ok" && c2?.inserted === 0, `fetched=${c2?.fetched}｜inserted=${c2?.inserted}｜duplicates=${c2?.duplicates}｜known=${c2?.known}`)
  ok("全文 feed 条目全部被识别（duplicates+known=fetched）", Boolean(c2) && c2.duplicates + c2.known === c2.fetched, `dup=${c2?.duplicates}｜known=${c2?.known}｜fetched=${c2?.fetched}`)
}

// ---------- D. ETag 条件请求（票 03：周期源二轮 304） ----------
console.log("── D：ETag 条件请求（304 零正文） ──")
{
  const g = await j("GET", "/api/sources")
  const idOf = (name) => (g.json?.feeds ?? []).find((f) => f.name === name)?.id
  const periodNames = ["AIHOT 日报", "AIHOT 周报", "AIHOT 月报"]

  // D1 周期源首轮：200 全量（成刊 feed：日报 30 期 / 周报 12 期 / 月报 12 期）
  const r1 = await j("POST", "/api/sources", { action: "refresh", feedIds: periodNames.map((n) => idOf(n)).filter(Boolean) })
  const d1 = r1.json?.results ?? []
  ok("周期源首轮刷新全部 ok 且条目入池（或复跑未变化 304）", d1.length === 3 && d1.every((x) => x.status === "ok") && (d1.reduce((s, x) => s + (x.inserted ?? 0) + (x.known ?? 0), 0) > 0 || d1.every((x) => x.notModified === true)), d1.map((x) => `${x.feedName}:${x.notModified ? "304" : `f=${x.fetched}/i=${x.inserted}`}`).join("｜"))

  // D2 同一批源立刻二轮：ETag 命中 → 304 notModified 零正文（成刊日内稳定）
  //    容差单源轮换：成刊 feed 可能因撤稿/更正或 CDN 回源轮换出新 ETag → 200 重解析，
  //    如实留痕不算失败；断言至少 2/3 命中（日报/月报日内固定不变）
  const r2 = await j("POST", "/api/sources", { action: "refresh", feedIds: periodNames.map((n) => idOf(n)).filter(Boolean) })
  const d2 = r2.json?.results ?? []
  const nmCount = d2.filter((x) => x.notModified === true).length
  ok("周期源二轮至少 2/3 命中 304（If-None-Match 零正文；单源轮换如实留痕）", d2.length === 3 && nmCount >= 2, d2.map((x) => `${x.feedName}:${x.notModified ? "304" : `f=${x.fetched}/i=${x.inserted}`}`).join("｜"))
  ok("304 轮 status=ok 不入 error（未变化≠失败；轮换轮重解析也不入 error）", d2.every((x) => x.status === "ok" && x.error === ""))
  ok("summary.notModified 计数透出（≥2）", (r2.json?.summary?.notModified ?? 0) >= 2, `summary=${JSON.stringify(r2.json?.summary ?? {}).slice(0, 110)}`)
}

// ---------- E. 原文直链（票 04：AIHOT 条目 url 指第三方原文） ----------
console.log("── E：原文直链回填（删源重种 → 新条目验证） ──")
{
  // E0 删除「AIHOT 精选」源（级联删其条目）→ GET 重播种 → 新一轮条目按票 04 语义入库
  //    （既有条目是部署前语义存的，known 跳过不回填——删源重取是确定性路径）
  const g0 = await j("GET", "/api/sources")
  const feedRow = (g0.json?.feeds ?? []).find((f) => f.name === "AIHOT 精选")
  if (feedRow) await j("DELETE", `/api/sources?id=${feedRow.id}`)
  const g1 = await j("GET", "/api/sources")
  const idOf = (name) => (g1.json?.feeds ?? []).find((f) => f.name === name)?.id
  ok("删源后幂等重种（ensureDefaultFeeds 按 url 补种）", Boolean(idOf("AIHOT 精选")), `total=${g1.json?.stats?.total}`)

  // E1 定向重抓：新条目入库，url 应指向第三方原文（description 内「阅读原文」锚）
  const r1 = await j("POST", "/api/sources", { action: "refresh", feedIds: [idOf("AIHOT 精选")] })
  const e1 = (r1.json?.results ?? [])[0]
  ok("重抓入池（inserted>0）", (e1?.inserted ?? 0) > 0, `inserted=${e1?.inserted}｜known=${e1?.known}`)

  // E2 条目形态：url 域名 ≠ aihot.news（原文直链），摘要尾保留条目页链接
  const g2 = await j("GET", "/api/sources")
  const items = (g2.json?.items ?? []).filter((i) => i.feed?.name === "AIHOT 精选")
  const host = (u) => { try { return new URL(u).hostname } catch { return "" } }
  const withOriginal = items.filter((i) => /^https?:\/\//.test(i.url ?? "") && host(i.url) !== "aihot.news")
  ok("条目 url 指向第三方原文（host≠aihot.news）", withOriginal.length > 0, `${withOriginal.length}/${items.length} 条｜样例=${withOriginal[0]?.url?.slice(0, 60) ?? "无"}`)
  ok("AIHOT 条目页链接保留在摘要尾", withOriginal.some((i) => String(i.summary ?? "").includes("AIHOT 条目页：https://aihot.news")), withOriginal[0]?.summary?.slice(-90) ?? "")

  // E3 信源 → 选题闭环（P0 已实证的动线不回退；angle 携带条目页溯源）
  const item = items.find((i) => /^https?:\/\//.test(i.url ?? "") && host(i.url) !== "aihot.news") ?? items[0]
  if (item) {
    const p = await j("POST", "/api/sources", { action: "promote", itemId: item.id })
    ok("AIHOT 条目转选题（原文直链随条目入池）", p.status === 200 && Boolean(p.json?.ideaId), String(p.json?.title ?? p.json?.error ?? "").slice(0, 50))
  } else {
    ok("转选题闭环跳过（无条目，见上相取证）", false, "E2 未取到条目")
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
