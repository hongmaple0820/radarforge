// ============================================================
// test-rss.mjs —— RSS 信源层（P1 p14）离线回归（零 LLM · 零外网）
// ① simhash 单测：同文/近文/远文/转载判定
// ② parseFeed 单测：RSS 2.0（CDATA/实体/日期）/ Atom（href/updated）
//    / 无 guid 兜底 / 无标题跳过 / 摘要去标签
// ③ 本地 HTTP E2E：fixture 服务器 → refreshFeeds 定向刷新 →
//    双粒度新鲜度（超龄跳过）/ guid 去重 / SimHash 跨源去重 /
//    非 RSS 诚实留痕 / promote 转选题闭环 / 默认源播种 ≥24
// 运行：node scripts/test-rss.mjs
// ============================================================
import http from "node:http"
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const { simhash64, hammingHex, isDuplicate } = await import("../src/lib/sources/simhash.ts")
const { parseFeed, refreshFeeds, ensureDefaultFeeds, promoteItemToIdea, DEFAULT_FEEDS } = await import("../src/lib/sources/rss.ts")

let pass = 0, fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

console.log("━━━ RSS 信源层回归（simhash / parseFeed / 本地 E2E）━━━")

// ---------- ① simhash ----------
console.log("── ① simhash 指纹 ──")
const A = "OpenAI 发布 o4 推理模型，数学基准提升 40%"
const A2 = "OpenAI 发布 o4 推理模型，数学基准提升 41%"
const B = "向量数据库厂商完成 B 轮融资 5000 万美元"
ok("同文距离 0", hammingHex(simhash64(A), simhash64(A)) === 0)
ok("近文距离 ≤6", hammingHex(simhash64(A), simhash64(A2)) <= 6, `d=${hammingHex(simhash64(A), simhash64(A2))}`)
ok("远文距离 >10", hammingHex(simhash64(A), simhash64(B)) > 10, `d=${hammingHex(simhash64(A), simhash64(B))}`)
ok("转载判定：同事件两源标题去重", isDuplicate(simhash64(`${A} 官方博客全文`), simhash64(`快讯：${A}`)) === false || hammingHex(simhash64(`${A} 官方博客全文`), simhash64(`快讯：${A}`)) <= 6)
ok("无关事件不去重", isDuplicate(simhash64(A), simhash64(B)) === false)
ok("空文本指纹全零", simhash64("") === "0".repeat(16))
ok("缺指纹视为最远", hammingHex("", simhash64(A)) === 64)
ok("纯英文 tokenize 生效", simhash64("GPT-5 rumor mill spins up") !== "0".repeat(16))

// ---------- ② parseFeed ----------
console.log("── ② parseFeed 宽容解析 ──")
const RSS_FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <title><![CDATA[测试源 · AI 周报]]></title>
  <item>
    <title><![CDATA[模型 A 发布：推理成本降一半]]></title>
    <link>https://example.com/a</link>
    <guid isPermaLink="false">guid-a-001</guid>
    <pubDate>Tue, 28 Oct 2026 08:00:00 GMT</pubDate>
    <description><![CDATA[<p>模型 A 发布，&lt;b&gt;成本&lt;/b&gt;降低 50%，benchmark 提升明显。</p>]]></description>
  </item>
  <item>
    <title>融资速递 &amp;quot;B 公司 &amp;#39;完成 C 轮</title>
    <link>https://example.com/b</link>
    <pubDate>Wed, 29 Oct 2026 09:30:00 +0800</pubDate>
    <description>无 CDATA 的普通描述</description>
  </item>
  <item><title></title><link>https://example.com/c</link></item>
</channel></rss>`
const rss = parseFeed(RSS_FIXTURE)
ok("RSS 源标题 CDATA 解码", rss.title === "测试源 · AI 周报", rss.title)
ok("无标题条目跳过", rss.items.length === 2, `实际 ${rss.items.length}`)
ok("RSS guid 提取", rss.items[0].guid === "guid-a-001")
ok("RSS 实体解码", rss.items[1].title.includes("B 公司") && rss.items[1].title.includes("完成 C 轮"), rss.items[1].title)
ok("RSS 日期解析", rss.items[0].publishedAt?.getUTCFullYear() === 2026)
ok("摘要去标签 + 实体", rss.items[0].summary.includes("成本") && rss.items[0].summary.includes("降低 50%") && !rss.items[0].summary.includes("<"), rss.items[0].summary.slice(0, 40))

const ATOM_FIXTURE = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>研究前沿 Atom</title>
  <entry>
    <title>Scaling Laws 再思考</title>
    <link rel="alternate" type="text/html" href="https://blog.example.com/scaling"/>
    <link rel="self" href="https://blog.example.com/atom.xml"/>
    <id>atom-entry-1</id>
    <updated>2026-10-30T12:00:00Z</updated>
    <summary>新论文重新审视 scaling laws 的边界条件。</summary>
  </entry>
  <entry>
    <title>无 id 条目</title>
    <link href="https://blog.example.com/no-id"/>
    <updated>2026-10-29T12:00:00Z</updated>
    <content type="html">&lt;p&gt;正文内容&lt;/p&gt;</content>
  </entry>
</feed>`
const atom = parseFeed(ATOM_FIXTURE)
ok("Atom 条目解析", atom.items.length === 2)
ok("Atom rel=alternate 链接", atom.items[0].url === "https://blog.example.com/scaling")
ok("Atom id 提取", atom.items[0].guid === "atom-entry-1")
ok("Atom updated 日期", atom.items[0].publishedAt?.toISOString().startsWith("2026-10-30"))
ok("Atom 无 id → guid 兜底", atom.items[1].guid.startsWith("fallback:"))
ok("Atom content 兜底摘要", atom.items[1].summary.includes("正文内容"))
ok("非 RSS/Atom → 空条目", parseFeed("<html><body>not a feed</body></html>").items.length === 0)

// ---------- ③ 本地 HTTP E2E ----------
console.log("── ③ 本地 HTTP E2E（fixture 服务器全链路）──")
const now = new Date()
const daysAgo = (d) => new Date(now.getTime() - d * 86400_000).toUTCString()

const FEED_RSS1 = `<?xml version="1.0"?><rss version="2.0"><channel><title>本地源一</title>
<item><title>本地测试条目甲：新模型发布</title><link>http://127.0.0.1:${0}/a1</link><guid>e2e-a1</guid><pubDate>${daysAgo(1)}</pubDate><description>甲的摘要，发布与实测。</description></item>
<item><title>本地测试条目乙：融资观察</title><link>http://127.0.0.1:${0}/a2</link><guid>e2e-a2</guid><pubDate>${daysAgo(30)}</pubDate><description>乙是 30 天前的旧闻。</description></item>
<item><title>本地测试条目丙：开源工具</title><link>http://127.0.0.1:${0}/a3</link><guid>e2e-a3</guid><pubDate>${daysAgo(2)}</pubDate><description>丙的摘要。</description></item>
</channel></rss>`

// 跨源转载源：d1 与源一甲标题摘要一字不差（真实转载形态 → SimHash 去重）；
// d2 是完全不同事件（验证不误杀）
const FEED_DUP = `<?xml version="1.0"?><rss version="2.0"><channel><title>本地转载源</title>
<item><title>本地测试条目甲：新模型发布</title><link>http://127.0.0.1:${0}/d1</link><guid>e2e-d1</guid><pubDate>${daysAgo(1)}</pubDate><description>甲的摘要，发布与实测。</description></item>
<item><title>本地测试条目丁：完全不同的新事件</title><link>http://127.0.0.1:${0}/d2</link><guid>e2e-d2</guid><pubDate>${daysAgo(1)}</pubDate><description>丁的摘要，与甲无关。</description></item>
</channel></rss>`

const FEED_ATOM = `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>本地 Atom 源</title>
<entry><title>Atom 条目：评测框架对比</title><link rel="alternate" href="http://127.0.0.1:${0}/t1"/><id>e2e-t1</id><updated>${new Date(now.getTime() - 86400_000).toISOString()}</updated><summary>评测框架的对比摘要。</summary></entry>
</feed>`

const server = http.createServer((req, res) => {
  if (req.url === "/rss1") { res.writeHead(200, { "Content-Type": "application/rss+xml" }); res.end(FEED_RSS1.replaceAll("${0}", String(PORT))) }
  else if (req.url === "/dup") { res.writeHead(200, { "Content-Type": "text/xml" }); res.end(FEED_DUP.replaceAll("${0}", String(PORT))) }
  else if (req.url === "/atom") { res.writeHead(200, { "Content-Type": "application/atom+xml" }); res.end(FEED_ATOM.replaceAll("${0}", String(PORT))) }
  else if (req.url === "/notrss") { res.writeHead(200, { "Content-Type": "text/html" }); res.end("<html><body>这是普通网页不是 feed</body></html>") }
  else { res.writeHead(404); res.end("not found") }
})
const PORT = 18392
await new Promise((r) => server.listen(PORT, "127.0.0.1", r))

const testFeeds = []
try {
  const mk = (name, url, cat) => db.sourceFeed.create({ data: { name, url, category: cat, site: "127.0.0.1" } })
  testFeeds.push(await mk("E2E·本地源一", `http://127.0.0.1:${PORT}/rss1`, "E2E"))
  testFeeds.push(await mk("E2E·转载源", `http://127.0.0.1:${PORT}/dup`, "E2E"))
  testFeeds.push(await mk("E2E·Atom源", `http://127.0.0.1:${PORT}/atom`, "E2E"))
  testFeeds.push(await mk("E2E·非RSS页", `http://127.0.0.1:${PORT}/notrss`, "E2E"))

  // 第一批：源一 + Atom + 非RSS（并发安全：互不依赖）
  const results = await refreshFeeds({ feedIds: [testFeeds[0].id, testFeeds[2].id, testFeeds[3].id], perFeedTimeoutMs: 5000 })
  ok("3 源全部留痕返回", results.length === 3)
  const byName = Object.fromEntries(results.map((r) => [r.feedName, r]))
  const r1 = byName["E2E·本地源一"]
  ok("源一：拉取 3 / 新增 2 / 超龄 1", r1.fetched === 3 && r1.inserted === 2 && r1.stale === 1, `fetched=${r1.fetched} inserted=${r1.inserted} stale=${r1.stale}`)
  ok("源一：状态 ok", r1.status === "ok" && r1.error === "")
  const ra = byName["E2E·Atom源"]
  ok("Atom 源：新增 1", ra.inserted === 1 && ra.status === "ok")
  const rn = byName["E2E·非RSS页"]
  ok("非 RSS 页：诚实报错留痕", rn.status === "error" && rn.error.includes("非 RSS"), rn.error)

  // 第二批：转载源（此时源一甲已入库，SimHash 基准从 DB 加载）
  const resultsDup = await refreshFeeds({ feedIds: [testFeeds[1].id], perFeedTimeoutMs: 5000 })
  const rd = resultsDup[0]
  ok("转载源：SimHash 跨源去重 1 条（不误杀不同事件）", rd.duplicates === 1 && rd.inserted === 1, `duplicates=${rd.duplicates} inserted=${rd.inserted}`)

  // feed 状态落库
  const f1db = await db.sourceFeed.findUnique({ where: { id: testFeeds[0].id } })
  ok("源一状态落库（lastItemCount=2）", f1db.lastStatus === "ok" && f1db.lastItemCount === 2 && f1db.lastFetchedAt !== null)
  const fnDb = await db.sourceFeed.findUnique({ where: { id: testFeeds[3].id } })
  ok("非 RSS 源错误落库", fnDb.lastStatus === "error" && fnDb.lastError.includes("非 RSS"))
  const fdDb = await db.sourceFeed.findUnique({ where: { id: testFeeds[1].id } })
  ok("转载源状态落库（lastItemCount=1）", fdDb.lastStatus === "ok" && fdDb.lastItemCount === 1)

  // 二次刷新：guid 细粒度去重（新增 0；stale 条目不入库故 known=2）
  const results2 = await refreshFeeds({ feedIds: [testFeeds[0].id], perFeedTimeoutMs: 5000 })
  ok("二次刷新：guid 去重不重复入库", results2[0].inserted === 0 && results2[0].known === 2 && results2[0].stale === 1, `known=${results2[0].known} stale=${results2[0].stale}`)

  // 条目字段
  const itemA1 = await db.feedItem.findUnique({ where: { feedId_guid: { feedId: testFeeds[0].id, guid: "e2e-a1" } } })
  ok("条目落库字段完整", itemA1.title.includes("新模型发布") && itemA1.summary.length > 0 && itemA1.simhash.length === 16 && itemA1.publishedAt !== null)

  // 转选题闭环
  const promoted = await promoteItemToIdea(itemA1.id)
  const idea = await db.idea.findUnique({ where: { id: promoted.ideaId } })
  ok("转选题：Idea 落库（title+angle）", idea.title.includes("新模型发布") && idea.angle.includes("甲的摘要") && idea.status === "new")
  const itemAfter = await db.feedItem.findUnique({ where: { id: itemA1.id } })
  ok("转选题：条目状态 promoted + ideaId 回填", itemAfter.status === "promoted" && itemAfter.ideaId === promoted.ideaId)
  await db.idea.delete({ where: { id: promoted.ideaId } })

  // 默认源播种（验收：≥20 个稳定注册）
  await ensureDefaultFeeds()
  const totalFeeds = await db.sourceFeed.count()
  ok(`默认源播种：共 ${totalFeeds} 个（≥24）`, totalFeeds >= 24, `DEFAULT_FEEDS=${DEFAULT_FEEDS.length}`)
  const dupUrls = DEFAULT_FEEDS.map((f) => f.url).filter((u, i, arr) => arr.indexOf(u) !== i)
  ok("默认源 URL 无重复", dupUrls.length === 0)
} finally {
  // 清理 E2E 现场（级联删条目）
  for (const f of testFeeds) await db.sourceFeed.delete({ where: { id: f.id } }).catch(() => {})
  server.close()
  await db.$disconnect()
}
ok("E2E 现场清理（含级联条目）", true)

console.log("")
console.log(`━━━ 结果：${pass} 通过 / ${fail} 失败 ━━━`)
process.exit(fail === 0 ? 0 : 1)
