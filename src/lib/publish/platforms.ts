// ============================================================
// platforms.ts —— 多平台导出引擎（一稿多发 · 复制即用）
// 从同一份成稿 markdown + claims 账本，产出 5 个平台格式：
//   wechat      公众号富文本 HTML（复用 18 主题排版管线 renderWechatHtml）
//   markdown    原文 + 参考来源脚注（CSDN / Notion / Obsidian / 掘金）
//   zhihu       知乎结构化 HTML（标准标签 + 少量内联样式，粘贴保留层级）
//   xiaohongshu 小红书纯文本（emoji 分隔 + 话题标签，无链接无脚注）
//   toutiao     头条号富文本 HTML（大字号大行距，粘贴兼容）
// 设计：块级解析一次（parseBlocks），各平台 Formatter 各自渲染；
// claims [n] 标记 → wechat 走管线脚注 / 知乎头条转 <sup> + 文末参考 /
// 小红书直接剥离 / markdown 追加脚注列表。
// ============================================================

import { renderWechatHtml, resolveThemeId, type RenderClaim, type ThemeId } from "@/lib/runtime/render"

// ---------- 块级解析（结构中间层） ----------

type Block =
  | { t: "h"; level: number; text: string }
  | { t: "p"; text: string }
  | { t: "quote"; lines: string[] }
  | { t: "ul"; items: string[] }
  | { t: "ol"; items: string[] }
  | { t: "fence"; lang: string; code: string }
  | { t: "table"; rows: string[][] }
  | { t: "img"; alt: string; url: string }
  | { t: "hr" }

/** 行内 markdown 文本（不含 HTML 转义——由各平台 Formatter 决定） */
function parseBlocks(markdown: string): Block[] {
  const out: Block[] = []
  const lines = markdown.split(/\r?\n/)
  let quote: string[] = []
  let listMode: "ul" | "ol" | null = null
  let items: string[] = []
  let tableRows: string[][] = []
  let inFence = false
  let fenceLang = ""
  let fenceBuf: string[] = []

  const flushQuote = () => {
    if (quote.length) out.push({ t: "quote", lines: quote })
    quote = []
  }
  const flushList = () => {
    if (items.length && listMode) out.push({ t: listMode, items })
    items = []
    listMode = null
  }
  const flushTable = () => {
    if (tableRows.length) out.push({ t: "table", rows: tableRows })
    tableRows = []
  }

  for (const raw of lines) {
    const line = raw.trimEnd()
    const trimmed = line.trim()

    if (/^```/.test(trimmed)) {
      if (!inFence) {
        flushQuote(); flushList(); flushTable()
        inFence = true
        fenceLang = trimmed.replace(/^```/, "").trim()
        fenceBuf = []
      } else {
        out.push({ t: "fence", lang: fenceLang, code: fenceBuf.join("\n") })
        inFence = false
      }
      continue
    }
    if (inFence) {
      fenceBuf.push(raw)
      continue
    }

    // wewrite 容器围栏（::: xxx … :::）非微信平台不渲染容器 → 剥围栏行，内部内容按普通块解析
    if (/^:::.*::$/.test(trimmed) || /^:::/.test(trimmed)) {
      flushQuote(); flushList(); flushTable()
      continue
    }

    if (!trimmed) {
      flushQuote(); flushList(); flushTable()
      continue
    }

    if (/^&gt;\s?|^>\s?/.test(trimmed)) {
      flushList(); flushTable()
      quote.push(trimmed.replace(/^&gt;\s?|^>\s?/, ""))
      continue
    }
    flushQuote()

    if (/^\s*\|/.test(line)) {
      const cells = trimmed.replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue
      flushList()
      tableRows.push(cells)
      continue
    }
    flushTable()

    const li = line.match(/^\s*[-*]\s+(.*)$/)
    const oli = line.match(/^\s*\d+[.、]\s+(.*)$/)
    if (li || oli) {
      if (listMode !== (li ? "ul" : "ol")) {
        flushList()
        listMode = li ? "ul" : "ol"
      }
      items.push((li ?? oli)![1])
      continue
    }
    flushList()

    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      out.push({ t: "h", level: h[1].length, text: h[2] })
      continue
    }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      out.push({ t: "hr" })
      continue
    }

    // 正文配图：![图注](url)
    const im = trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/) ?? trimmed.match(/^!\[([^\]]*)\]\(([^)\s]+)\)/)
    if (im) {
      out.push({ t: "img", alt: im[1].trim(), url: im[2] })
      continue
    }

    out.push({ t: "p", text: line })
  }
  flushQuote(); flushList(); flushTable()
  if (inFence && fenceBuf.length) out.push({ t: "fence", lang: fenceLang, code: fenceBuf.join("\n") })
  return out
}

// ---------- 通用工具 ----------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

/** 行内 markdown → HTML（加粗/斜体/行内码/链接；[n] claims 标记转上标） */
function inlineHtml(text: string): string {
  let s = esc(text)
  s = s.replace(/\[([0-9]{1,3})\]/g, '<sup style="color:#2563eb;">[$1]</sup>')
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>')
  s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  s = s.replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
  s = s.replace(/`([^`]+)`/g, "<code>$1</code>")
  return s
}

/** 参考来源（claims 账本）各平台共用数据 */
function refList(claims: RenderClaim[]): { idx: number; label: string; url: string }[] {
  return claims.map((c) => ({
    idx: c.idx,
    label: `${c.sourceSite || "来源"}《${c.sourceTitle.slice(0, 60)}》${(c.sourceDate || "").slice(0, 10)}`.trim(),
    url: c.sourceUrl,
  }))
}

function extractTitle(markdown: string, fallback: string): string {
  return (markdown.match(/^#\s+(.+)$/m)?.[1] ?? fallback).slice(0, 120).trim()
}

// ---------- 平台注册表 ----------

export interface PlatformDef {
  id: string
  label: string
  desc: string
  kind: "html" | "markdown" | "text"
}

export const PLATFORMS: PlatformDef[] = [
  { id: "wechat", label: "微信公众号", desc: "18 主题富文本排版，粘贴保留样式（section 加固 + 暗黑模式）", kind: "html" },
  { id: "markdown", label: "Markdown", desc: "原文 + 参考来源脚注，粘贴到 CSDN / Notion / Obsidian / 掘金", kind: "markdown" },
  { id: "zhihu", label: "知乎", desc: "结构化 HTML：标题层级 / 引用 / 代码 / 文末外链参考", kind: "html" },
  { id: "xiaohongshu", label: "小红书", desc: "纯文本：emoji 分隔小标题 + 话题标签（正文 ≤1000 字需自查删减）", kind: "text" },
  { id: "toutiao", label: "头条号", desc: "大字号大行距富文本，粘贴兼容头条 / 百家号 / 企鹅号", kind: "html" },
]

// ---------- 各平台 Formatter ----------

function fmtWechat(markdown: string, claims: RenderClaim[], title: string, theme?: string): string {
  const tid: ThemeId = resolveThemeId(theme ?? "professional-clean")
  return renderWechatHtml(markdown, claims, { theme: tid, title, wordCount: markdown.replace(/\s/g, "").length })
}

function fmtMarkdown(markdown: string, claims: RenderClaim[]): string {
  const refs = refList(claims)
  if (!refs.length) return markdown
  const foot = refs.map((r) => (r.url ? `[${r.idx}]: ${r.url} 「${r.label}」` : `[${r.idx}]: ${r.label}`)).join("\n")
  return `${markdown}\n\n---\n\n**参考来源**\n\n${foot}\n`
}

function fmtZhihu(markdown: string, claims: RenderClaim[], title: string): string {
  const blocks = parseBlocks(markdown)
  const body: string[] = []
  for (const b of blocks) {
    if (b.t === "h") {
      if (b.level <= 1) continue
      const tag = b.level === 2 ? "h2" : b.level === 3 ? "h3" : "h4"
      const size = b.level === 2 ? "22px" : b.level === 3 ? "19px" : "17px"
      body.push(`<${tag} style="font-size:${size};font-weight:600;margin:${b.level === 2 ? 28 : 20}px 0 12px;color:#1a1a1a;">${inlineHtml(b.text)}</${tag}>`)
    } else if (b.t === "p") {
      body.push(`<p style="margin:14px 0;line-height:1.9;font-size:16px;color:#2f2f2f;">${inlineHtml(b.text)}</p>`)
    } else if (b.t === "quote") {
      body.push(`<blockquote style="border-left:3px solid #e5e7eb;padding:6px 16px;margin:18px 0;color:#6b6b6b;font-size:15px;line-height:1.8;">${b.lines.map(inlineHtml).join("<br/>")}</blockquote>`)
    } else if (b.t === "ul" || b.t === "ol") {
      const lis = b.items.map((x) => `<li style="margin:6px 0;line-height:1.8;font-size:16px;color:#2f2f2f;">${inlineHtml(x)}</li>`).join("")
      body.push(`<${b.t} style="padding-left:24px;margin:14px 0;">${lis}</${b.t}>`)
    } else if (b.t === "fence") {
      body.push(`<pre style="background:#f6f6f6;border-radius:6px;padding:14px;margin:18px 0;overflow-x:auto;"><code style="font-family:Consolas,Menlo,monospace;font-size:13.5px;line-height:1.7;color:#2f2f2f;">${esc(b.code)}</code></pre>`)
    } else if (b.t === "table") {
      const [head, ...rows] = b.rows
      const th = head.map((c) => `<th style="border:1px solid #e0e0e0;padding:8px 12px;background:#f6f6f6;font-size:14px;text-align:left;">${inlineHtml(c)}</th>`).join("")
      const trs = rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #e0e0e0;padding:8px 12px;font-size:14px;line-height:1.7;">${inlineHtml(c)}</td>`).join("")}</tr>`).join("")
      body.push(`<table style="border-collapse:collapse;margin:18px 0;max-width:100%;">${th ? `<tr>${th}</tr>` : ""}${trs}</table>`)
    } else if (b.t === "img") {
      body.push(
        `<figure style="margin:18px 0;"><img src="${esc(b.url)}" alt="${esc(b.alt)}" style="display:block;width:100%;height:auto;border-radius:8px;"/>` +
          (b.alt ? `<figcaption style="font-size:13px;color:#999;margin-top:6px;text-align:center;">${esc(b.alt)}</figcaption>` : "") +
          `</figure>`,
      )
    } else if (b.t === "hr") {
      body.push(`<hr style="border:none;border-top:1px solid #e5e7eb;margin:28px 0;"/>`)
    }
  }
  const refs = refList(claims)
  const refSection = refs.length
    ? `<hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 16px;"/><p style="font-size:14px;font-weight:600;color:#6b6b6b;margin:0 0 8px;">参考来源</p>` +
      refs.map((r) => `<p style="font-size:13px;color:#888;margin:4px 0;line-height:1.7;">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noreferrer">[${r.idx}] ${esc(r.label)}</a>` : `[${r.idx}] ${esc(r.label)}`}</p>`).join("")
    : ""
  return `<h1 style="font-size:26px;font-weight:700;margin:0 0 20px;color:#111;">${esc(title)}</h1>${body.join("")}${refSection}`
}

function fmtToutiao(markdown: string, claims: RenderClaim[], title: string): string {
  // 头条/企鹅/百家：大字号大行距（17px / 1.95），粘贴兼容性优先，结构与知乎同源
  const blocks = parseBlocks(markdown)
  const body: string[] = []
  for (const b of blocks) {
    if (b.t === "h") {
      if (b.level <= 1) continue
      const tag = b.level === 2 ? "h2" : b.level === 3 ? "h3" : "h4"
      const size = b.level === 2 ? "24px" : b.level === 3 ? "20px" : "18px"
      body.push(`<${tag} style="font-size:${size};font-weight:700;margin:${b.level === 2 ? 32 : 22}px 0 14px;color:#1c1c1c;">${inlineHtml(b.text)}</${tag}>`)
    } else if (b.t === "p") {
      body.push(`<p style="margin:16px 0;line-height:1.95;font-size:17px;color:#333;">${inlineHtml(b.text)}</p>`)
    } else if (b.t === "quote") {
      body.push(`<blockquote style="border-left:4px solid #d9d9d9;padding:8px 18px;margin:20px 0;color:#666;font-size:16px;line-height:1.85;">${b.lines.map(inlineHtml).join("<br/>")}</blockquote>`)
    } else if (b.t === "ul" || b.t === "ol") {
      const lis = b.items.map((x) => `<li style="margin:8px 0;line-height:1.9;font-size:17px;color:#333;">${inlineHtml(x)}</li>`).join("")
      body.push(`<${b.t} style="padding-left:26px;margin:16px 0;">${lis}</${b.t}>`)
    } else if (b.t === "fence") {
      body.push(`<pre style="background:#f5f5f5;border-radius:8px;padding:16px;margin:20px 0;overflow-x:auto;"><code style="font-family:Consolas,Menlo,monospace;font-size:14px;line-height:1.75;color:#333;">${esc(b.code)}</code></pre>`)
    } else if (b.t === "table") {
      const [head, ...rows] = b.rows
      const th = head.map((c) => `<th style="border:1px solid #dcdcdc;padding:9px 13px;background:#f2f2f2;font-size:15px;text-align:left;">${inlineHtml(c)}</th>`).join("")
      const trs = rows.map((r) => `<tr>${r.map((c) => `<td style="border:1px solid #dcdcdc;padding:9px 13px;font-size:15px;line-height:1.75;">${inlineHtml(c)}</td>`).join("")}</tr>`).join("")
      body.push(`<table style="border-collapse:collapse;margin:20px 0;max-width:100%;">${th ? `<tr>${th}</tr>` : ""}${trs}</table>`)
    } else if (b.t === "img") {
      body.push(
        `<figure style="margin:20px 0;"><img src="${esc(b.url)}" alt="${esc(b.alt)}" style="display:block;width:100%;height:auto;border-radius:10px;"/>` +
          (b.alt ? `<figcaption style="font-size:14px;color:#888;margin-top:8px;text-align:center;">${esc(b.alt)}</figcaption>` : "") +
          `</figure>`,
      )
    } else if (b.t === "hr") {
      body.push(`<hr style="border:none;border-top:1px solid #dcdcdc;margin:30px 0;"/>`)
    }
  }
  const refs = refList(claims)
  const refSection = refs.length
    ? `<hr style="border:none;border-top:1px solid #dcdcdc;margin:34px 0 18px;"/><p style="font-size:15px;font-weight:700;color:#555;margin:0 0 8px;">参考来源</p>` +
      refs.map((r) => `<p style="font-size:14px;color:#777;margin:5px 0;line-height:1.75;">${r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noreferrer">[${r.idx}] ${esc(r.label)}</a>` : `[${r.idx}] ${esc(r.label)}`}</p>`).join("")
    : ""
  return `<h1 style="font-size:28px;font-weight:700;margin:0 0 22px;color:#111;">${esc(title)}</h1>${body.join("")}${refSection}`
}

function fmtXiaohongshu(markdown: string, claims: RenderClaim[], title: string): string {
  const blocks = parseBlocks(markdown)
  const body: string[] = []
  const plain = (s: string) =>
    s
      .replace(/\[([0-9]{1,3})\]/g, "") // 剥离 [n] 来源标记（小红书不放脚注）
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, "$1") // 链接只留文字
      .replace(/\*\*([^*]+)\*\*/g, "「$1」") // 加粗 → 「」（小红书无富文本）
      .replace(/`([^`]+)`/g, "$1")

  for (const b of blocks) {
    if (b.t === "h") {
      if (b.level <= 1) continue
      body.push(`\n◆ ${plain(b.text)}\n`)
    } else if (b.t === "p") {
      body.push(plain(b.text))
    } else if (b.t === "quote") {
      body.push(b.lines.map((l) => `┃ ${plain(l)}`).join("\n"))
    } else if (b.t === "ul" || b.t === "ol") {
      body.push(b.items.map((x, i) => `${b.t === "ol" ? `${i + 1}.` : "·"} ${plain(x)}`).join("\n"))
    } else if (b.t === "fence") {
      const code = b.code.split("\n").slice(0, 12).join("\n") // 小红书不适合长代码：截前 12 行
      body.push(`⌨️ 代码（超长已截断，完整版见公众号/知乎）\n${code}`)
    } else if (b.t === "table") {
      body.push(b.rows.map((r) => r.map(plain).join("｜")).join("\n"))
    } else if (b.t === "img") {
      // 小红书：图片需手动上传，正文里留图注占位提醒发布者
      body.push(b.alt ? `📷 ${plain(b.alt)}` : "📷 配图")
    } else if (b.t === "hr") {
      body.push("· · · · · · · · · ·")
    }
  }

  // 话题标签：标题 + 首个二级标题提取关键词（2+ 字词干，最多 5 个，不编造内容）
  const words = new Set<string>()
  for (const src of [title, ...blocks.filter((b) => b.t === "h" && b.level === 2).slice(0, 3).map((b) => (b as { t: "h"; level: number; text: string }).text)]) {
    for (const w of src.split(/[，。：:、！？?·\s—\-|｜/\\]+/)) {
      const t = w.replace(/[「」《》()（）\[\]#*]/g, "").trim()
      if (t.length >= 2 && t.length <= 10 && !/^[0-9.]+$/.test(t)) words.add(t)
    }
  }
  const tags = [...words].slice(0, 5).map((w) => `#${w}`).join(" ")

  const refs = refList(claims)
  const srcLine = refs.length ? `\n\n📄 信息来源：${refs.slice(0, 4).map((r) => r.label.split("《")[0]).join(" / ")}` : ""

  const text = body.join("\n\n").trim()
  const header = `${title}\n${"─".repeat(Math.min(24, title.length + 4))}\n\n`
  const out = `${header}${text}${srcLine}${tags ? `\n\n${tags}` : ""}`
  return out
}

// ---------- 统一入口 ----------

export interface PlatformExportResult {
  platform: string
  label: string
  kind: "html" | "markdown" | "text"
  content: string
  /** 复制后怎么用（平台特性提示） */
  instruction: string
  /** 结构化提示（如小红书超长警告） */
  note?: string
}

export function buildPlatformExport(
  platform: string,
  markdown: string,
  claims: RenderClaim[],
  opts: { title: string; theme?: string },
): PlatformExportResult {
  const def = PLATFORMS.find((p) => p.id === platform)
  if (!def) throw new Error(`未知导出平台：${platform}（可选：${PLATFORMS.map((p) => p.id).join(" / ")}）`)
  const title = extractTitle(markdown, opts.title)
  // 含正文配图时的平台提醒（图片是本站 /assets 路径，粘贴到外部平台需重新上传）
  const imgCount = (markdown.match(/!\[[^\]]*\]\(/g) ?? []).length

  let content: string
  let instruction: string
  let note: string | undefined

  switch (platform) {
    case "wechat":
      content = fmtWechat(markdown, claims, title, opts.theme)
      instruction = "已复制富文本，直接粘贴进公众号编辑器，样式保留（含暗黑模式适配）"
      if (imgCount > 0) note = `文中含 ${imgCount} 张配图（本站路径），粘贴后请在公众号编辑器中逐张上传替换`
      break
    case "markdown":
      content = fmtMarkdown(markdown, claims)
      instruction = "已复制 Markdown，粘贴到 CSDN / 掘金 / Notion / Obsidian 等编辑器"
      if (imgCount > 0) note = `文中含 ${imgCount} 张配图（/assets/ 本站路径），发布到外部平台时请先上传图片并替换链接`
      break
    case "zhihu":
      content = fmtZhihu(markdown, claims, title)
      instruction = "已复制富文本，粘贴进知乎回答/文章编辑器（标题层级、引用、代码、文末参考均保留）"
      break
    case "xiaohongshu": {
      content = fmtXiaohongshu(markdown, claims, title)
      instruction = "已复制纯文本，粘贴进小红书笔记正文（标题单独填到标题栏）"
      if (content.length > 1000) note = `正文 ${content.length} 字超过小红书 1000 字上限，建议删减（或拆成多篇「合集」）`
      break
    }
    case "toutiao":
      content = fmtToutiao(markdown, claims, title)
      instruction = "已复制富文本，粘贴进头条号/百家号/企鹅号编辑器（大字号版式）"
      break
    default:
      throw new Error(`平台 ${platform} 未实现`)
  }

  return { platform: def.id, label: def.label, kind: def.kind, content, instruction, note }
}
