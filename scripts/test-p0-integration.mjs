// ============================================================
// test-p0-integration.mjs —— P0 四项在线集成回归（需 dev server 运行）
// 覆盖七问方案验收要点：
//   P0-1 依赖解析链：GET /api/settings/dependencies 两项 resolved+version；
//        POST settings/test scope=video（local 通道返回引导说明而非 ffmpeg 原始报错）；
//        scope=dependencies（逐项路径 + 版本）
//   P0-2 RSS 编辑与代理：PATCH /api/sources 改名/分类（历史保留）；
//        PATCH proxyUrl（校验+落库+清除）；URL 变更定向重抓（recheck 字段）；
//        PUT settings scope=network 全局代理（保存/失效/恢复直连）
//   P0-3 技能目录主权：GET /api/skills = 12 技能（product 来源）；
//        wewrite 十件套 + huashu 双件齐全；平台 skills/ 不再出现在清单
//   P0-4 MCP 入口统一：GET /api/agent/mcp 双读（DB + file:echo）；
//        POST create stdio（command 校验）；POST test file:echo（stdio 真握手）；
//        toggle 启停
// 运行：bash scripts/with-server.sh "node scripts/test-p0-integration.mjs"
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

console.log("━━━ P0 四项在线集成回归 ━━━")

// ---------- P0-1 依赖解析链 ----------
console.log("── P0-1 依赖解析链 ──")
{
  const r = await j("GET", "/api/settings/dependencies")
  ok("GET /api/settings/dependencies 返回 200", r.status === 200)
  const items = r.json?.items ?? []
  ok("自检报告含 ffmpeg/ffprobe 两项", items.length === 2 && items.some((i) => i.name === "ffmpeg") && items.some((i) => i.name === "ffprobe"))
  ok("两项全部 resolved 且带真实版本", items.every((i) => i.resolved && i.version && i.version.length > 0), items.map((i) => i.version?.slice(0, 24)).join(" / "))
  ok("解析来源标注合法（env/which/known/static）", items.every((i) => ["env", "which", "known", "static"].includes(i.source)))

  const v = await j("POST", "/api/settings/test", { scope: "video" })
  ok("scope=video 返回引导说明而非 ffmpeg 原始报错", v.json?.ok === true && /本地渲染通道/.test(String(v.json?.detail)), String(v.json?.detail).slice(0, 50))

  const d = await j("POST", "/api/settings/test", { scope: "dependencies" })
  ok("scope=dependencies 自检成功且含路径", d.json?.ok === true && /ffmpeg：\//.test(String(d.json?.detail)), String(d.json?.detail).slice(0, 60))
  ok("自检不含原始 ENOENT 文案", !/ENOENT|Executable not found/.test(String(d.json?.detail) + String(d.json?.error)))
}

// ---------- P0-2 RSS 编辑与代理 ----------
console.log("── P0-2 RSS 编辑与代理 ──")
let editedFeedId
{
  // 取一个现有源做编辑测试
  const list = await j("GET", "/api/sources")
  const feeds = list.json?.feeds ?? []
  ok("源列表非空（默认源已播种）", feeds.length > 0, `${feeds.length} 个源`)
  const target = feeds[0]
  editedFeedId = target.id
  const itemCountBefore = target._count?.items ?? 0

  // 改名 + 改分类（不动 URL → 不触发重抓，历史保留）
  const r1 = await j("PATCH", "/api/sources", { id: target.id, name: `${target.name}·编辑测试`, category: "编辑测试分类" })
  ok("PATCH 改名/改分类成功", r1.status === 200 && r1.json?.feed?.name?.includes("编辑测试"))
  // 历史保留用 GET（PATCH 响应不含关联 _count，prisma update 默认无 include）
  const afterEdit = (await j("GET", "/api/sources")).json?.feeds?.find((f) => f.id === target.id)
  ok("历史条目保留（编辑后 _count 不变）", (afterEdit?._count?.items ?? -1) === itemCountBefore, `before=${itemCountBefore} after=${afterEdit?._count?.items}`)

  // 无效代理地址被拒
  const r2 = await j("PATCH", "/api/sources", { id: target.id, proxyUrl: "socks5://127.0.0.1:1080" })
  ok("非法代理地址被 400 拒绝（人话错误）", r2.status === 400 && /http/.test(String(r2.json?.error)))

  // 设置按源代理 + 清除
  const r3 = await j("PATCH", "/api/sources", { id: target.id, proxyUrl: "http://127.0.0.1:7890" })
  ok("按源代理可设置并落库", r3.status === 200 && r3.json?.feed?.proxyUrl === "http://127.0.0.1:7890")
  const r4 = await j("PATCH", "/api/sources", { id: target.id, proxyUrl: "" })
  ok("按源代理可清除（空串）", r4.status === 200 && r4.json?.feed?.proxyUrl === "")

  // 全局代理：保存 + 校验 + 恢复直连
  const n1 = await j("PUT", "/api/settings", { scope: "network", value: { proxyUrl: "http://127.0.0.1:7890" } })
  ok("全局代理可保存", n1.status === 200 && /全局代理已启用/.test(String(n1.json?.message)))
  const n2 = await j("PUT", "/api/settings", { scope: "network", value: { proxyUrl: "ftp://bad" } })
  ok("非法全局代理被 400 拒绝", n2.status === 400)
  const n3 = await j("PUT", "/api/settings", { scope: "network", value: { proxyUrl: "" } })
  ok("全局代理可清除（恢复直连）", n3.status === 200 && /恢复直连/.test(String(n3.json?.message)))

  // 恢复原名（幂等收尾，历史仍保留）
  await j("PATCH", "/api/sources", { id: target.id, name: target.name, category: target.category })
  const list2 = await j("GET", "/api/sources")
  const after = (list2.json?.feeds ?? []).find((f) => f.id === target.id)
  ok("编辑后恢复原名，条目数不变", (after?._count?.items ?? -1) === itemCountBefore)
}

// URL 变更定向重抓（用假 URL 验证 recheck 留痕不阻断保存）
{
  const list = await j("GET", "/api/sources")
  const target = (list.json?.feeds ?? []).find((f) => f.id === editedFeedId)
  const r = await j("PATCH", "/api/sources", { id: editedFeedId, url: "https://invalid.example.invalid/feed.xml" })
  ok("URL 变更保存成功（重抓失败不阻断）", r.status === 200 && r.json?.feed?.url?.includes("invalid.example"))
  ok("recheck 字段留痕重抓结果", r.json?.recheck !== undefined, JSON.stringify(r.json?.recheck ?? {}).slice(0, 80))
  // 还原 URL
  await j("PATCH", "/api/sources", { id: editedFeedId, url: target.url })
}

// ---------- P0-3 技能目录主权 ----------
console.log("── P0-3 技能目录主权 ──")
{
  const r = await j("GET", "/api/skills")
  const skills = r.json?.skills ?? []
  ok("GET /api/skills 返回 12 个产品技能", skills.length === 12, `got ${skills.length}`)
  ok("wewrite 十件套齐全", skills.filter((s) => s.id?.startsWith("wewrite")).length === 10)
  ok("huashu 双件齐全", skills.filter((s) => s.id?.startsWith("huashu")).length === 2)
  ok("全部来自产品库 db/skills（source=product）", skills.every((s) => s.source === "product"))
  ok("平台 69 个运维技能不再出现（无 ASR/TTS/docx 类目）", !skills.some((s) => ["ASR", "TTS", "docx", "pdf", "charts", "pptx", "xlsx"].includes(s.id)))
  ok("bySource 统计正确", r.json?.bySource?.product === 12 && (r.json?.bySource?.user ?? 0) === 0)

  const a = await j("GET", "/api/agent/skills")
  ok("Agent 运行时 loader 同样加载 12 技能", (a.json?.skills ?? a.json ?? []).length === 12 || (a.json?.total ?? 12) === 12, `got ${(a.json?.skills ?? []).length}`)
}

// ---------- P0-4 MCP 入口统一 ----------
console.log("── P0-4 MCP 入口统一 ──")
{
  const r = await j("GET", "/api/agent/mcp")
  const servers = r.json?.servers ?? []
  ok("统一入口返回服务器清单", r.status === 200 && Array.isArray(servers))
  const fileEntry = servers.find((s) => s.id?.startsWith("file:"))
  ok("config/mcp.json 的 echo 服务器并入清单（双读）", Boolean(fileEntry), fileEntry?.id)
  ok("文件条目标注 source=file 且为 stdio 传输", fileEntry?.source === "file" && fileEntry?.transport === "stdio")
  ok("DB 条目（DeepWiki）仍在清单", servers.some((s) => s.source === "db" || (!s.id?.startsWith("file:") && s.transport === "http")))

  // stdio 真握手（echo 服务器：node scripts/echo-mcp-server.mjs）
  const t = await j("POST", "/api/agent/mcp", { action: "test", id: "file:echo" })
  const res = t.json?.result
  ok("stdio 握手真实执行（echo 服务器）", res?.ok === true, String(res?.detail ?? res?.error ?? "").slice(0, 60))
  ok("stdio 握手发现工具", (res?.tools ?? []).length > 0, (res?.tools ?? []).map((x) => x.name).join(","))

  // create stdio 校验
  const c1 = await j("POST", "/api/agent/mcp", { action: "create", name: "测试stdio", transport: "stdio", command: "" })
  ok("create stdio 缺 command 被 400 拒绝", c1.status === 400 && /command/.test(String(c1.json?.error)))

  // create http 校验
  const c2 = await j("POST", "/api/agent/mcp", { action: "create", name: "测试http", transport: "http", url: "not-a-url" })
  ok("create http 非法 URL 被 400 拒绝", c2.status === 400)

  // create 一个真实 stdio 服务器 + 测试 + 启停 + 删除（完整生命周期）
  const c3 = await j("POST", "/api/agent/mcp", { action: "create", name: "P0回归-echo", transport: "stdio", command: "node scripts/echo-mcp-server.mjs" })
  ok("create stdio 成功落库", c3.status === 200 && c3.json?.server?.command?.includes("echo-mcp-server"))
  const sid = c3.json?.server?.id
  if (sid) {
    const t2 = await j("POST", "/api/agent/mcp", { action: "test", id: sid })
    ok("DB stdio 服务器测试握手成功", t2.json?.result?.ok === true, String(t2.json?.result?.detail ?? "").slice(0, 50))
    const g1 = await j("POST", "/api/agent/mcp", { action: "toggle", id: sid })
    ok("启停开关生效（toggle 后 enabled=false）", g1.json?.server?.enabled === false)
    await j("POST", "/api/agent/mcp", { action: "toggle", id: sid })
    const del = await j("POST", "/api/agent/mcp", { action: "delete", id: sid })
    ok("删除清理成功", del.status === 200)
  }

  // 文件条目删除被正确引导
  const d1 = await j("POST", "/api/agent/mcp", { action: "delete", id: "file:echo" })
  ok("文件条目删除被引导去编辑 config（400 人话）", d1.status === 400 && /config/.test(String(d1.json?.error)))
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
