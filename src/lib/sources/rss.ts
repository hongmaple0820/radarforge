// ============================================================
// rss.ts —— RSS/Atom 信源层（P1 p14）
// 「雷达」二字的本分：先看见，才谈生产。信源从纯搜索扩展为
// RSS 订阅 + SimHash 跨源去重 + 双粒度新鲜度过滤，产出汇入
// 选题池（Idea），完成「信源 → 选题 → 创作」动线闭环。
// 解析器：零依赖宽容正则（RSS 2.0 / Atom / RDF），沙箱外网
// 不可达时逐源诚实留痕（lastStatus/lastError），绝不静默吞错。
// ============================================================

import { db } from "../db.ts" // .ts 扩展：Node 离线可测规约（学 card-engine）
import { simhash64, isDuplicate } from "./simhash.ts"
import http from "node:http" // 代理路径（P0-2）：绝对形式转发 / CONNECT 隧道
import https from "node:https"

// ---------- 默认源注册表（42 个 AI 资讯源：中文 5 + AIHOT 18 + 英文 10 + 研究 5 + 观点 4） ----------
// AIHOT 块（aihot.news，D2 拍板「全都要」）：中文 AI 聚合天线，6 主源 + 6 分类 + 6 全文分类，
// ETag/304 条件请求与跨站 guid 去重见同文件；许可定性（组织内部使用免费，对外商业须书面授权
// agent@virxact.com）见 docs/research-aihot-agent-access.md §4 与 docs/adr/0011。
export interface FeedSeed {
  name: string
  url: string
  category: string
  site: string
}

export const DEFAULT_FEEDS: FeedSeed[] = [
  // —— 中文综合（探活 2026-10-31；机器之心/36氪官方 RSS 已停（返回 HTML）、虎嗅/AIbase/差评不可达，均剔除） ——
  { name: "量子位", url: "https://www.qbitai.com/feed", category: "中文综合", site: "qbitai.com" },
  { name: "InfoQ 中文", url: "https://www.infoq.cn/feed", category: "中文综合", site: "infoq.cn" },
  { name: "少数派", url: "https://sspai.com/feed", category: "中文社区", site: "sspai.com" },
  { name: "阮一峰科技爱好者周刊", url: "http://www.ruanyifeng.com/blog/atom.xml", category: "中文社区", site: "ruanyifeng.com" },
  { name: "Solidot", url: "https://www.solidot.org/index.rss", category: "中文社区", site: "solidot.org" },
  // —— AIHOT 聚合（aihot.news；插在中文源后：createdAt 序决定跨 feed 去重时「精选摘要版」先入池） ——
  { name: "AIHOT 精选", url: "https://aihot.news/feed.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 精选全文", url: "https://aihot.news/feed/full.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 全部动态", url: "https://aihot.news/feed/all.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 日报", url: "https://aihot.news/feed/daily.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 周报", url: "https://aihot.news/feed/weekly.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 月报", url: "https://aihot.news/feed/monthly.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 分类·AI 模型", url: "https://aihot.news/feed/category/ai-models.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 分类·AI 产品", url: "https://aihot.news/feed/category/ai-products.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 分类·行业", url: "https://aihot.news/feed/category/industry.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 分类·论文", url: "https://aihot.news/feed/category/paper.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 分类·技巧", url: "https://aihot.news/feed/category/tip.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 分类·观点", url: "https://aihot.news/feed/category/opinion.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 全文分类·AI 模型", url: "https://aihot.news/feed/full/category/ai-models.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 全文分类·AI 产品", url: "https://aihot.news/feed/full/category/ai-products.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 全文分类·行业", url: "https://aihot.news/feed/full/category/industry.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 全文分类·论文", url: "https://aihot.news/feed/full/category/paper.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 全文分类·技巧", url: "https://aihot.news/feed/full/category/tip.xml", category: "AI聚合", site: "aihot.news" },
  { name: "AIHOT 全文分类·观点", url: "https://aihot.news/feed/full/category/opinion.xml", category: "AI聚合", site: "aihot.news" },
  // —— 英文资讯 ——
  { name: "Hacker News · AI 高赞", url: "https://hnrss.org/newest?q=AI&points=100", category: "英文社区", site: "news.ycombinator.com" },
  { name: "Hacker News · 头版", url: "https://hnrss.org/frontpage", category: "英文社区", site: "news.ycombinator.com" },
  { name: "TechCrunch · AI", url: "https://techcrunch.com/category/artificial-intelligence/feed/", category: "英文综合", site: "techcrunch.com" },
  { name: "VentureBeat · AI", url: "https://venturebeat.com/category/ai/feed/", category: "英文综合", site: "venturebeat.com" },
  { name: "The Verge · AI", url: "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml", category: "英文综合", site: "theverge.com" },
  { name: "MIT Tech Review · AI", url: "https://www.technologyreview.com/topic/artificial-intelligence/feed", category: "英文综合", site: "technologyreview.com" },
  { name: "MarkTechPost", url: "https://www.marktechpost.com/feed/", category: "英文综合", site: "marktechpost.com" },
  { name: "AI News", url: "https://artificialintelligence-news.com/feed/", category: "英文综合", site: "artificialintelligence-news.com" },
  { name: "Techmeme", url: "https://www.techmeme.com/feed.xml", category: "英文综合", site: "techmeme.com" },
  { name: "Wired · AI", url: "https://www.wired.com/feed/tag/ai/latest/rss", category: "英文综合", site: "wired.com" },
  // —— 研究前沿 ——
  { name: "Google DeepMind Blog", url: "https://deepmind.google/blog/rss.xml", category: "研究前沿", site: "deepmind.google" },
  { name: "OpenAI News", url: "https://openai.com/news/rss.xml", category: "研究前沿", site: "openai.com" },
  { name: "Google AI Blog", url: "https://blog.google/technology/ai/rss/", category: "研究前沿", site: "blog.google" },
  { name: "BAIR Blog", url: "https://bair.berkeley.edu/blog/feed.xml", category: "研究前沿", site: "bair.berkeley.edu" },
  { name: "arXiv · cs.AI 新论文", url: "http://export.arxiv.org/rss/cs.AI", category: "研究前沿", site: "arxiv.org" },
  // —— 观点与评论 ——
  { name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", category: "观点评论", site: "simonwillison.net" },
  { name: "AI Snake Oil", url: "https://www.aisnakeoil.com/feed", category: "观点评论", site: "aisnakeoil.com" },
  { name: "Latent Space", url: "https://www.latent.space/feed", category: "观点评论", site: "latent.space" },
  { name: "Interconnects", url: "https://www.interconnects.ai/feed", category: "观点评论", site: "interconnects.ai" },
]

// ---------- 解析（零依赖宽容正则） ----------

export interface RawFeedItem {
  guid: string
  title: string
  url: string
  summary: string
  publishedAt: Date | null
  originalUrl: string // description 内「阅读原文」锚发现的第三方原文直链（无则 ""；只发现不改写，aihot-access P1 票 04）
}

export interface ParsedFeed {
  title: string
  items: RawFeedItem[]
}

/** 解码 CDATA / 常见实体 / 数字实体 */
function decodeText(raw: string): string {
  let s = raw.trim()
  const cdata = s.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/)
  if (cdata) s = cdata[1]
  s = s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&")
  return s.trim()
}

/** 去标签 + 压空白 + 截断（摘要清洗） */
function cleanSummary(raw: string, max = 300): string {
  const s = raw
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return s.length > max ? s.slice(0, max) + "…" : s
}

/** AIHOT 条目 description HTML 内「阅读原文」锚 → 第三方原文直链（aihot-access P1 票 04）
 *  只认带「阅读原文」锚文本的 href（「via AIHOT」站内链、成刊条目内链不构成原文信号），
 *  非 http(s) 协议拒收；无标签锚返回 null。层职责：本函数与 parseFeed 只「发现」不改写，
 *  是否回填条目 url 由 refreshFeeds 存储层按源门控（site==="aihot.news"，方案 D8）。 */
export function originalLinkFromDescription(html: string): string | null {
  const anchors = [...html.matchAll(/<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  const labeled = anchors.find((m) => /阅读原文/.test(m[2] ?? ""))
  const href = (labeled?.[1] ?? "").trim()
  return /^https?:\/\//i.test(href) ? href.slice(0, 500) : null
}

function pickField(block: string, tag: string): string {
  const m = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, "i"))
  return m ? decodeText(m[1]) : ""
}

function pickLink(block: string, isAtom: boolean): string {
  if (isAtom) {
    // 多 link 取 rel=alternate（缺省 rel 也算）
    const links = [...block.matchAll(/<link\b([^>]*)\/?>(?:([\s\S]*?)<\/link>)?/gi)]
    for (const l of links) {
      const attrs = l[1] ?? ""
      if (/rel=["']alternate["']|rel=["']["']/i.test(attrs) || !/rel=/i.test(attrs)) {
        const href = attrs.match(/href=["']([^"']+)["']/i)
        if (href) return decodeText(href[1])
      }
    }
    return ""
  }
  return pickField(block, "link")
}

function pickDate(block: string, isAtom: boolean): Date | null {
  const raw = isAtom
    ? pickField(block, "updated") || pickField(block, "published") || pickField(block, "date")
    : pickField(block, "pubDate") || pickField(block, "date") || pickField(block, "updated")
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isFinite(t) ? new Date(t) : null
}

function guidFallback(item: RawFeedItem): string {
  // 无 guid/id 时用 link 优先，link 也缺则用标题（前 120 字符）
  const base = item.url || item.title.slice(0, 120)
  let h = 0
  for (let i = 0; i < base.length; i++) h = (Math.imul(h, 31) + base.charCodeAt(i)) | 0
  return `fallback:${(h >>> 0).toString(16)}`
}

/** 从 URL 提取域名（site 兜底显示用） */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return ""
  }
}

/** 宽容解析 RSS 2.0 / Atom / RDF */
export function parseFeed(xml: string): ParsedFeed {
  const isAtom = /<feed[\s>]/i.test(xml) && !/<rss[\s>]/i.test(xml)
  const blocks = isAtom
    ? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) ?? []
    : xml.match(/<item[\s>][\s\S]*?<\/item>/gi) ?? []
  const feedTitle = pickField(xml.split(/<(?:item|entry)[\s>]/i)[0] ?? "", isAtom ? "title" : "title") || "未命名源"

  const items: RawFeedItem[] = []
  for (const b of blocks.slice(0, 40)) {
    const title = pickField(b, "title")
    if (!title) continue // 无标题条目无法进选题池，跳过
    const url = pickLink(b, isAtom)
    const summaryRaw = isAtom
      ? pickField(b, "summary") || pickField(b, "content") || pickField(b, "description")
      : pickField(b, "description") || pickField(b, "content:encoded") || pickField(b, "summary")
    const guidRaw = isAtom ? pickField(b, "id") : pickField(b, "guid")
    const item: RawFeedItem = {
      guid: guidRaw || "",
      title: title.slice(0, 200),
      url: url.slice(0, 500),
      summary: cleanSummary(summaryRaw),
      publishedAt: pickDate(b, isAtom),
      originalUrl: summaryRaw ? (originalLinkFromDescription(summaryRaw) ?? "") : "",
    }
    item.guid = item.guid || guidFallback(item)
    items.push(item)
  }
  return { title: feedTitle.slice(0, 80), items }
}

// ---------- 抓取与入库（诚实留痕） ----------

export interface FeedRefreshResult {
  feedId: string
  feedName: string
  status: "ok" | "partial" | "error"
  error: string
  fetched: number
  inserted: number
  stale: number // 粗粒度：超龄跳过
  known: number // 细粒度：guid 已见
  duplicates: number // 跨源：SimHash 重复
  notModified: boolean // ETag 304 命中：源未变化零正文（aihot-access P1 票 03）
}

export interface RefreshOptions {
  maxAgeDays?: number // 粗粒度新鲜度（默认 14 天）
  perFeedTimeoutMs?: number
  limit?: number // 只刷前 N 个源（调试/回归用）
  feedIds?: string[] // 定向刷新指定源（单源重试/回归隔离）
}

// ---------- 代理层（P0-2：可选配置，按源 > 全局 > 直连） ----------

/** 代理地址合法性：http(s)://host:port（与源 url 同规则，空串=不代理） */
export function isValidProxyUrl(p: string): boolean {
  return !p || /^https?:\/\/.+/i.test(p)
}

/** 经代理的 GET 请求（Node 标准库手写，无三方依赖）。
 *  注：undici 7.30 的 ProxyAgent 在本环境实测挂死（请求级 dispatcher 不发任何字节），
 *  故手写两条标准路径——
 *  · http 目标：绝对形式请求（GET http://host/path）直接发往代理，代理转发；
 *  · https 目标：CONNECT 隧道建裸 TCP，再在其上发 TLS 请求（真实代理通行行为）。
 *  失败快速抛错（不可达代理毫秒级 ECONNREFUSED，不无限等待）。 */
interface ProxyGetResult {
  status: number
  contentType: string
  body: string
  etag: string // 响应 ETag（304 回显或 200 头，无则 ""——aihot-access P1 票 03）
}

function proxyGet(targetUrl: string, proxyUrl: string, timeoutMs: number, etag = ""): Promise<ProxyGetResult> {
  return new Promise((resolve, reject) => {
    const t = new URL(targetUrl)
    const p = new URL(proxyUrl)
    const headers: Record<string, string> = {
      "User-Agent": "RadarForge/2.0 (+rss-reader)",
      Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
      ...(etag ? { "If-None-Match": etag } : {}),
    }
    const fail = (e: unknown): void => reject(e instanceof Error ? e : new Error(String(e)))

    const collect = (res: import("node:http").IncomingMessage): Promise<ProxyGetResult> =>
      new Promise((res2) => {
        const chunks: Buffer[] = []
        res.on("data", (c: Buffer) => chunks.push(c))
        res.on("end", () => {
          const ct = res.headers["content-type"]
          const et = res.headers.etag
          res2({
            status: res.statusCode ?? 0,
            contentType: Array.isArray(ct) ? String(ct[0]) : String(ct ?? ""),
            body: Buffer.concat(chunks).toString("utf-8"),
            etag: Array.isArray(et) ? String(et[0]) : String(et ?? ""),
          })
        })
      })

    if (t.protocol === "https:") {
      // CONNECT 隧道：代理建到目标的裸 TCP，再在其上发 TLS 请求
      const req = http.request({
        host: p.hostname,
        port: Number(p.port) || 80,
        method: "CONNECT",
        path: `${t.hostname}:${t.port || 443}`,
        headers: { host: `${t.hostname}:${t.port || 443}` },
        timeout: timeoutMs,
      })
      req.on("connect", (res: { statusCode?: number }, socket: import("node:stream").Duplex) => {
        if (res.statusCode !== 200) {
          socket.destroy()
          reject(new Error(`代理 CONNECT 失败：HTTP ${res.statusCode}（经代理 ${proxyUrl}）`))
          return
        }
        const tlsReq = https.request({
          socket,
          servername: t.hostname,
          method: "GET",
          path: `${t.pathname}${t.search}`,
          headers: { ...headers, host: t.host },
          timeout: timeoutMs,
        } as import("node:https").RequestOptions)
        tlsReq.on("response", (r2: import("node:http").IncomingMessage) => { void collect(r2).then(resolve, fail) })
        tlsReq.on("timeout", () => tlsReq.destroy(new Error(`经代理 ${proxyUrl} 请求超时（${timeoutMs}ms）`)))
        tlsReq.on("error", fail)
        tlsReq.end()
      })
      req.on("timeout", () => req.destroy(new Error(`连接代理 ${proxyUrl} 超时（${timeoutMs}ms）`)))
      req.on("error", fail)
      req.end()
    } else {
      // http 目标：绝对形式请求直接发往代理
      const req = http.request({
        host: p.hostname,
        port: Number(p.port) || 80,
        method: "GET",
        path: targetUrl,
        headers: { ...headers, host: t.host },
        timeout: timeoutMs,
      })
      req.on("response", (r2: import("node:http").IncomingMessage) => { void collect(r2).then(resolve, fail) })
      req.on("timeout", () => req.destroy(new Error(`经代理 ${proxyUrl} 请求超时（${timeoutMs}ms）`)))
      req.on("error", fail)
      req.end()
    }
  })
}

const proxyLogged = new Set<string>()
function logProxyOnce(proxyUrl: string): void {
  if (proxyLogged.has(proxyUrl)) return
  proxyLogged.add(proxyUrl)
  console.log(`[rss] 代理已启用：${proxyUrl}（按源或全局配置生效）`)
}

/** 全局代理（SettingKV network:proxy；rss.ts 为离线可测模块，不 import 别名路径的 settings.ts） */
let globalProxyCache: { url: string; at: number } | null = null
export async function getGlobalProxyUrl(): Promise<string> {
  if (globalProxyCache && Date.now() - globalProxyCache.at < 30_000) return globalProxyCache.url
  let url = ""
  try {
    const row = await db.settingKV.findUnique({ where: { key: "network:proxy" } })
    if (row) {
      try {
        const parsed = JSON.parse(row.value) as { proxyUrl?: string }
        url = typeof parsed.proxyUrl === "string" ? parsed.proxyUrl.trim() : ""
      } catch {
        /* 坏 JSON → 直连 */
      }
    }
  } catch {
    /* DB 未就绪 → 直连 */
  }
  globalProxyCache = { url, at: Date.now() }
  return url
}

/** 测试钩子：清空全局代理缓存（保存代理后由调用方失效） */
export function resetGlobalProxyCache(): void {
  globalProxyCache = null
}

/** 单源抓取（fetch + 解析；网络类瞬时错误自动重试 1 次——探活实证沙箱外网抖动，curl 三连可达而 fetch 偶发 failed）。
 *  P0-2：proxyUrl 非空时经手写代理路径发请求；失败错误信息带「经代理」标记。
 *  P1（aihot-access 票 03）：etag 非空时发 If-None-Match 条件请求，304 → notModified 零正文返回；
 *  无 etag 的源不发条件头、解析路径零变化（IN1）。etag 解析单一事实源在本函数：
 *  304 → 响应回显或保留传入值；200 → 响应 ETag 或 ""（服务器不提供则清空，下轮不首发条件头）。 */
export interface FeedFetchOutcome {
  notModified: boolean // 304 命中：源未变化，零正文传输
  feed: ParsedFeed // notModified=true 时为空壳 { title: "", items: [] }
  etag: string // 供调用方回存 SourceFeed.etag
}

export async function fetchAndParse(url: string, timeoutMs = 15_000, proxyUrl = "", etag = ""): Promise<FeedFetchOutcome> {
  const viaProxy = proxyUrl.trim() !== ""
  if (viaProxy) logProxyOnce(proxyUrl.trim())
  const attempt = async (): Promise<FeedFetchOutcome> => {
    let status: number
    let ctype: string
    let text: string
    let etagOut: string
    if (viaProxy) {
      // 代理路径：手写 proxyGet（绝对形式 / CONNECT 隧道），失败快速抛错
      const res = await proxyGet(url, proxyUrl.trim(), timeoutMs, etag)
      status = res.status
      ctype = res.contentType
      text = res.body
      etagOut = res.etag
    } else {
      // 直连路径：全局 fetch（零行为变化 + 条件请求头）
      const res = await fetch(url, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          "User-Agent": "RadarForge/2.0 (+rss-reader)",
          Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, */*",
          ...(etag ? { "If-None-Match": etag } : {}),
        },
        redirect: "follow",
      })
      status = res.status
      ctype = res.headers.get("content-type") ?? ""
      etagOut = res.headers.get("etag") ?? ""
      text = status === 304 ? "" : await res.text()
    }
    if (status === 304) {
      // 条件请求命中（AIHOT 等 ETag 源零正文；实测见外部笔记 §1.3）
      return { notModified: true, feed: { title: "", items: [] }, etag: etagOut || etag }
    }
    if (status < 200 || status >= 300) throw new Error(`HTTP ${status}${viaProxy ? "（经代理）" : ""}`)
    if (!/<(rss|feed|rdf|RDF)[:\s>]/i.test(text) && !/<(item|entry)[\s>]/i.test(text)) {
      throw new Error(`非 RSS/Atom 内容（${ctype || "未知类型"}，${text.length} 字符）${viaProxy ? "（经代理）" : ""}`)
    }
    return { notModified: false, feed: parseFeed(text), etag: etagOut }
  }
  try {
    return await attempt()
  } catch (e) {
    const firstMsg = String((e as Error).message ?? "")
    // 只重试网络类瞬时错误（fetch failed / timeout / aborted / ECONNRESET / 5xx）；304 不入此路径，4xx 与内容错误不重试
    const transient = /fetch failed|timeout|aborted|ECONNRESET|ECONNREFUSED|HTTP 5\d\d/i.test(firstMsg)
    if (!transient) {
      // 代理连接类错误（ProxyAgent 典型报错）补「经代理」标记，区分源故障与代理故障
      if (viaProxy && !/经代理/.test(firstMsg)) {
        throw new Error(`${firstMsg}（经代理 ${proxyUrl.trim()}——请确认代理服务可达，其余源不受影响）`)
      }
      throw e
    }
    await new Promise((r) => setTimeout(r, 1500))
    try {
      return await attempt()
    } catch (e2) {
      const msg2 = String((e2 as Error).message ?? "")
      if (viaProxy && !/经代理/.test(msg2)) {
        throw new Error(`${msg2}（经代理 ${proxyUrl.trim()}——请确认代理服务可达，其余源不受影响）`)
      }
      throw e2
    }
  }
}

/** 全量刷新：逐源抓取 → 双粒度新鲜度 → 三层去重 → 入库 */
export async function refreshFeeds(opts: RefreshOptions = {}): Promise<FeedRefreshResult[]> {
  const maxAgeDays = opts.maxAgeDays ?? 14
  const timeoutMs = opts.perFeedTimeoutMs ?? 15_000
  const feeds = await db.sourceFeed.findMany({
    where: { active: true, ...(opts.feedIds ? { id: { in: opts.feedIds } } : {}) },
    orderBy: { createdAt: "asc" },
    ...(opts.limit ? { take: opts.limit } : {}),
  })
  const globalProxy = await getGlobalProxyUrl()

  // 近 7 天已有条目指纹（跨源去重基准）
  const since = new Date(Date.now() - 7 * 86400_000)
  const recentItems = await db.feedItem.findMany({
    where: { createdAt: { gte: since } },
    select: { simhash: true },
    take: 2000,
  })
  const knownHashes = recentItems.map((x) => x.simhash).filter(Boolean)

  // 单源处理（抓取 → 三层过滤去重 → 入库 → 状态留痕）
  const processFeed = async (feed: {
    id: string
    name: string
    url: string
    site: string
    proxyUrl?: string
    etag?: string
  }): Promise<FeedRefreshResult> => {
    const r: FeedRefreshResult = { feedId: feed.id, feedName: feed.name, status: "ok", error: "", fetched: 0, inserted: 0, stale: 0, known: 0, duplicates: 0, notModified: false }
    // 代理优先级（P0-2）：按源 proxyUrl > 全局代理 > 直连
    const effectiveProxy = feed.proxyUrl?.trim() || globalProxy
    let nextEtag: string | undefined // 抓取成功才回存（undefined = 失败轮保持库中旧值）
    try {
      const out = await fetchAndParse(feed.url, timeoutMs, effectiveProxy, feed.etag ?? "")
      r.notModified = out.notModified
      nextEtag = out.etag
      if (!out.notModified) {
        r.fetched = out.feed.items.length
        const now = Date.now()
        for (const it of out.feed.items) {
          // 粗粒度新鲜度：超龄跳过（无日期字段视为新鲜，宽容）
          if (it.publishedAt && now - it.publishedAt.getTime() > maxAgeDays * 86400_000) {
            r.stale++
            continue
          }
          // 细粒度新鲜度：feed 内 guid 已见
          const exists = await db.feedItem.findUnique({ where: { feedId_guid: { feedId: feed.id, guid: it.guid } }, select: { id: true } })
          if (exists) {
            r.known++
            continue
          }
          // 跨源去重：SimHash（标题+摘要——用解析层原值，不掺存储层回填后缀，
          // 部署前后哈希口径一致，跨 feed 同条目判重不受票 04 变换影响）
          const hash = simhash64(`${it.title} ${it.summary}`)
          if (hash !== "0".repeat(16) && knownHashes.some((h) => isDuplicate(hash, h))) {
            r.duplicates++
            continue
          }
          // 原文直链回填（票 04，存储层门控）：AIHOT 源条目 url 指向第三方原文，
          // 条目页链接保留在摘要尾（溯源 + 条款「保留机器来源信息」双满足）
          const isAihotFeed = feed.site === "aihot.news"
          const backfilled = isAihotFeed && it.originalUrl !== "" && it.originalUrl !== it.url
          const finalUrl = backfilled ? it.originalUrl : it.url
          const finalSummary = backfilled ? `${it.summary}（AIHOT 条目页：${it.url}）`.slice(0, 400) : it.summary
          await db.feedItem.create({
            data: {
              feedId: feed.id,
              guid: it.guid,
              title: it.title,
              url: finalUrl,
              site: feed.site || hostOf(it.url),
              summary: finalSummary,
              simhash: hash,
              publishedAt: it.publishedAt,
            },
          })
          knownHashes.push(hash)
          r.inserted++
        }
      }
    } catch (e) {
      r.status = "error"
      r.error = (e as Error).message?.slice(0, 200) ?? "未知错误"
    }
    await db.sourceFeed.update({
      where: { id: feed.id },
      data: {
        lastFetchedAt: new Date(),
        lastStatus: r.status,
        lastError: r.error,
        lastItemCount: r.inserted,
        // 抓取失败（nextEtag 未定义）保持库中旧值；成功轮次回存（304 → 回显/旧值，200 → 新值或清空）
        ...(nextEtag !== undefined ? { etag: nextEtag } : {}),
      },
    })
    return r
  }

  // 有界并发（6 路）：42 源顺序抓取的吞吐上限收敛；SQLite 写入天然串行安全
  const results: FeedRefreshResult[] = []
  const queue = [...feeds]
  const workers = Array.from({ length: Math.min(6, queue.length) }, async () => {
    for (;;) {
      const feed = queue.shift()
      if (!feed) return
      results.push(await processFeed(feed))
    }
  })
  await Promise.all(workers)
  return results
}

/** 首次访问自动播种默认源（幂等：已有源则只补缺） */
export async function ensureDefaultFeeds(): Promise<number> {
  let added = 0
  for (const f of DEFAULT_FEEDS) {
    const exists = await db.sourceFeed.findUnique({ where: { url: f.url }, select: { id: true } })
    if (!exists) {
      await db.sourceFeed.create({ data: { name: f.name, url: f.url, category: f.category, site: f.site } })
      added++
    }
  }
  return added
}

/** 条目转选题（信源 → 选题池动线闭环），回填 ideaId 溯源 */
export async function promoteItemToIdea(itemId: string): Promise<{ ideaId: string; title: string }> {
  const item = await db.feedItem.findUnique({ where: { id: itemId }, include: { feed: true } })
  if (!item) throw new Error("条目不存在")
  if (item.status === "promoted" && item.ideaId) throw new Error("该条目已转选题")
  const idea = await db.idea.create({
    data: {
      title: item.title.slice(0, 200),
      angle: `信源 ${item.feed.name}${item.publishedAt ? `（${new Date(item.publishedAt).toISOString().slice(0, 10)}）` : ""}：${item.summary.slice(0, 260)}`,
      score: 0,
      status: "new",
      source: "rss",
    },
  })
  await db.feedItem.update({ where: { id: itemId }, data: { status: "promoted", ideaId: idea.id } })
  return { ideaId: idea.id, title: idea.title }
}
