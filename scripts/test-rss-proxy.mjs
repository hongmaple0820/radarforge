// ============================================================
// test-rss-proxy.mjs —— P0-2 RSS 编辑与代理 离线回归（零 LLM · 零外网）
// ① isValidProxyUrl：空串/合法/非法前缀
// ② 本地回环代理 E2E：目标 RSS 服务 + 最小 HTTP 代理（绝对形式转发，
//    记录收到的请求数）→ fetchAndParse 经代理成功 + 代理计数 +1；
//    直连调用代理计数不变
// ③ 不可达代理：指向已关闭端口 → 错误信息含「经代理」标记（区分源故障与代理故障）
// ④ 全局代理存取：SettingKV network:proxy → getGlobalProxyUrl + 缓存失效钩子
// ⑤ refreshFeeds 代理优先级：源A(按源代理P1) + 源B(无按源) + 全局代理P2
//    → A 的请求走 P1、B 的请求走 P2（两代理分别计数断言）
// 运行：node scripts/test-rss-proxy.mjs
// ============================================================
import http from "node:http"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const rss = await import("../src/lib/sources/rss.ts")

let pass = 0, fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

console.log("━━━ P0-2 RSS 代理层回归 ━━━")

// ---------- ① isValidProxyUrl ----------
console.log("── ① 代理地址校验 ──")
ok("空串合法（=不代理）", rss.isValidProxyUrl("") === true)
ok("http:// 合法", rss.isValidProxyUrl("http://127.0.0.1:7890") === true)
ok("https:// 合法", rss.isValidProxyUrl("https://proxy.example.com:8443") === true)
ok("socks:// 非法（仅支持 http 代理）", rss.isValidProxyUrl("socks5://127.0.0.1:1080") === false)
ok("裸 host:port 非法", rss.isValidProxyUrl("127.0.0.1:7890") === false)

// ---------- 本地服务搭建：目标 RSS + 两个最小代理 ----------
const RSS_XML = `<?xml version="1.0"?>
<rss version="2.0"><channel><title>Proxy Test Feed</title>
<item><title>代理路径第一条</title><link>http://target.local/a</link><guid>pa1</guid><pubDate>Mon, 02 Nov 2026 08:00:00 GMT</pubDate></item>
<item><title>代理路径第二条</title><link>http://target.local/b</link><guid>pa2</guid><pubDate>Mon, 02 Nov 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`

const listen = (handler) => new Promise((resolve) => {
  const srv = http.createServer(handler)
  srv.listen(0, "127.0.0.1", () => resolve({ srv, port: srv.address().port }))
})

// 目标 RSS 服务
const target = await listen((req, res) => {
  res.writeHead(200, { "Content-Type": "application/rss+xml" })
  res.end(RSS_XML)
})
const TARGET_URL = `http://127.0.0.1:${target.port}/feed.xml`

// 最小 HTTP 代理（手写 proxyGet 对 http 目标发绝对形式请求，代理直接转发原 headers）
function makeProxy() {
  let hits = 0
  const lastPaths = []
  const p = listen((req, res) => {
    hits++
    lastPaths.push(String(req.url))
    // 绝对形式：GET http://127.0.0.1:PORT/feed.xml HTTP/1.1（headers 原样转发）
    const upstream = http.request(req.url, { method: req.method, headers: req.headers }, (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers)
      up.pipe(res)
    })
    upstream.on("error", () => {
      res.writeHead(502)
      res.end("proxy upstream error")
    })
    req.pipe(upstream)
  })
  return {
    url: p.then((x) => `http://127.0.0.1:${x.port}`),
    close: () => p.then((x) => new Promise((r) => x.srv.close(() => r()))),
    hits: () => hits,
    lastPaths: () => [...lastPaths],
  }
}
const proxy1 = makeProxy() // 源A 专用
const proxy2 = makeProxy() // 全局
const P1 = await proxy1.url
const P2 = await proxy2.url

try {
  // ---------- ② 经代理抓取 E2E ----------
  console.log("── ② 经代理抓取 ──")
  const parsed = await rss.fetchAndParse(TARGET_URL, 5000, P1)
  ok("经代理抓取成功且解析出 2 条", parsed.items.length === 2, `got ${parsed.items.length}`)
  ok("代理确实收到请求（计数 ≥1）", proxy1.hits() >= 1, `hits=${proxy1.hits()}`)
  ok("代理收到的是绝对形式 URL（含目标 host）", proxy1.lastPaths().some((u) => u.includes(String(target.port))))
  const before = proxy1.hits()
  await rss.fetchAndParse(TARGET_URL, 5000) // 直连（无代理参数）
  ok("直连调用不经代理（计数不变）", proxy1.hits() === before, `hits=${proxy1.hits()} == ${before}`)

  // ---------- ③ 不可达代理 → 「经代理」标记 ----------
  console.log("── ③ 不可达代理留痕 ──")
  const deadPort = 1 // 不可达端口（无监听）
  let errMsg = ""
  try {
    await rss.fetchAndParse(TARGET_URL, 3000, `http://127.0.0.1:${deadPort}`)
  } catch (e) {
    errMsg = String(e.message)
  }
  ok("不可达代理抛错", errMsg !== "")
  ok("错误信息含「经代理」标记（区分源故障与代理故障）", /经代理/.test(errMsg), String(errMsg).slice(0, 90))

  // ---------- ④ 全局代理存取 + 缓存 ----------
  console.log("── ④ 全局代理 SettingKV ──")
  await db.settingKV.upsert({
    where: { key: "network:proxy" },
    update: { value: JSON.stringify({ proxyUrl: P2 }) },
    create: { key: "network:proxy", value: JSON.stringify({ proxyUrl: P2 }) },
  })
  rss.resetGlobalProxyCache()
  const gp = await rss.getGlobalProxyUrl()
  ok("getGlobalProxyUrl 读到全局代理", gp === P2, `got ${gp}`)
  await db.settingKV.upsert({
    where: { key: "network:proxy" },
    update: { value: JSON.stringify({ proxyUrl: "" }) },
    create: { key: "network:proxy", value: JSON.stringify({ proxyUrl: "" }) },
  })
  rss.resetGlobalProxyCache()
  ok("清除后恢复直连（空串）", (await rss.getGlobalProxyUrl()) === "")
  // 还原全局代理供 ⑤ 用
  await db.settingKV.upsert({
    where: { key: "network:proxy" },
    update: { value: JSON.stringify({ proxyUrl: P2 }) },
    create: { key: "network:proxy", value: JSON.stringify({ proxyUrl: P2 }) },
  })
  rss.resetGlobalProxyCache()

  // ---------- ⑤ refreshFeeds 优先级：按源 > 全局 > 直连 ----------
  console.log("── ⑤ 代理优先级（按源 > 全局 > 直连）──")
  const feedA = await db.sourceFeed.create({
    data: { name: "P2测试-按源代理A", url: `${TARGET_URL}?a=1&src=A`, site: "target.local", category: "测试", proxyUrl: P1, lastStatus: "pending" },
  })
  const feedB = await db.sourceFeed.create({
    data: { name: "P2测试-全局代理B", url: `${TARGET_URL}?b=2&src=B`, site: "target.local", category: "测试", lastStatus: "pending" },
  })
  try {
    const p1Before = proxy1.hits()
    const p2Before = proxy2.hits()
    const results = await rss.refreshFeeds({ feedIds: [feedA.id, feedB.id], perFeedTimeoutMs: 6000 })
    ok("两源刷新均成功", results.length === 2 && results.every((r) => r.status === "ok"), JSON.stringify(results.map((r) => `${r.feedName}:${r.status}:${r.error.slice(0, 40)}`)))
    // 每源一次抓取（2 条 item 由一次 fetchAndParse 解析）
    ok("代理路径条目正常入库", results.every((r) => r.fetched === 2), `fetched=[${results.map((r) => r.fetched).join(",")}]`)
    const p1Delta = proxy1.hits() - p1Before
    const p2Delta = proxy2.hits() - p2Before
    ok("源A 走按源代理 P1（增量 ≥1）", p1Delta >= 1, `ΔP1=${p1Delta}`)
    ok("源B 走全局代理 P2（增量 ≥1）", p2Delta >= 1, `ΔP2=${p2Delta}`)
    ok("两代理均被经过（按源与全局各自生效）", p1Delta >= 1 && p2Delta >= 1, `ΔP1=${p1Delta} ΔP2=${p2Delta}`)
    const errNote = results.find((r) => r.error)?.error ?? ""
    ok("成功时无「经代理」错误留痕", !errNote || !/经代理/.test(errNote))
  } finally {
    // 清理测试源（级联清条目）
    await db.sourceFeed.delete({ where: { id: feedA.id } }).catch(() => {})
    await db.sourceFeed.delete({ where: { id: feedB.id } }).catch(() => {})
  }

  // 还原全局代理为空（不污染后续测试/运行态）
  await db.settingKV.upsert({
    where: { key: "network:proxy" },
    update: { value: JSON.stringify({ proxyUrl: "" }) },
    create: { key: "network:proxy", value: JSON.stringify({ proxyUrl: "" }) },
  })
  rss.resetGlobalProxyCache()
} finally {
  await proxy1.close()
  await proxy2.close()
  await new Promise((r) => target.srv.close(() => r()))
  await db.$disconnect()
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
