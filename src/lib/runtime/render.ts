// ============================================================
// render.ts —— 微信排版引擎 v2（wewrite 17 步管线 TS 移植，MIT 精神）
// 七项质量点 + wewrite 增强：
// 1. 全内联样式（主题 base_css 规则 → 逐元素内联，已有内联优先）
// 2. 18 主题注册表（YAML 驱动，见 publish/themes.ts）
// 3. 9 种 :::容器语法（publish/wewrite-containers.ts）
// 4. CJK-Latin 自动加空格
// 5. 外链/claims → [n] 脚注 + 参考来源区
// 6. 暗黑模式 data-darkmode-* 注入（微信暗色不掉色）
// 7. span leaf 粘贴加固（复制进公众号编辑器样式不丢）
// + H2 章节编号（主题开启时）/ AIGC 声明（主题可控）
// ============================================================

import { getWechatTheme, wechatThemeList, LEGACY_THEME_ALIAS, WECHAT_THEMES, type WechatTheme } from "@/lib/publish/themes"
import { extractContainers, hasContainerSyntax } from "@/lib/publish/wewrite-containers"

export interface RenderClaim {
  idx: number
  sourceSite: string
  sourceTitle: string
  sourceDate: string
  sourceUrl: string
}

/** 主题 id = wewrite 主题名（旧版 radar/ink/cream 走兼容映射） */
export type ThemeId = string

export function themeList() {
  return wechatThemeList()
}

/** 校验/解析主题 id：注册表命中 → 旧别名映射 → 默认 professional-clean */
export function resolveThemeId(theme: string): ThemeId {
  const names = new Set(WECHAT_THEMES.map((t) => t.name))
  if (names.has(theme)) return theme
  const alias = LEGACY_THEME_ALIAS[theme]
  if (alias && names.has(alias)) return alias
  return "professional-clean"
}

// ---------- CJK-Latin 自动空格 ----------

export function cjkLatinSpace(s: string): string {
  return s
    .replace(/([\u4e00-\u9fa5\u3001\u3002\uff0c\uff1a\uff1b\uff1f\uff01\uff08\uff09])([A-Za-z0-9@$#])/g, "$1 $2")
    .replace(/([A-Za-z0-9@$#])([\u4e00-\u9fa5\u3001\u3002\uff0c\uff1a\uff1b\uff1f\uff01\uff08\uff09])/g, "$1 $2")
}

// ---------- 主题样式工具 ----------

type StyleDict = Record<string, string>

/** 多选择器级联合并（wewrite _apply_inline_styles 语义：后者只补缺失属性） */
function mergeThemeStyles(theme: WechatTheme, selectors: string[]): StyleDict {
  const out: StyleDict = {}
  for (const sel of selectors) {
    const props = theme.rules[sel]
    if (!props) continue
    for (const [k, v] of Object.entries(props)) {
      if (!(k in out)) out[k] = v
    }
  }
  return out
}

/** extra 覆盖主题规则（元素特有样式优先） */
function applyExtra(base: StyleDict, extra: StyleDict): StyleDict {
  return { ...base, ...extra }
}

function styleAttr(styles: StyleDict): string {
  return Object.entries(styles)
    .map(([k, v]) => `${k}:${v}`)
    .join(";")
}

/** 暗黑属性注入（wewrite _inject_darkmode 语义按标签族） */
function darkAttrs(theme: WechatTheme, kind: "text" | "heading" | "pre" | "code" | "strong" | "quote"): string {
  const dm = theme.darkmode ?? {}
  if (Object.keys(dm).length === 0) return ""
  switch (kind) {
    case "text":
      return ` data-darkmode-color="${dm.text ?? "#c8c8c8"}" data-darkmode-bgcolor="transparent"`
    case "heading":
      return ` data-darkmode-color="${dm.text ?? "#e0e0e0"}" data-darkmode-bgcolor="transparent"`
    case "pre":
      return ` data-darkmode-bgcolor="${dm.code_bg ?? "#2d2d2d"}" data-darkmode-color="${dm.code_color ?? "#d4d4d4"}"`
    case "code":
      return ` data-darkmode-color="${dm.code_color ?? "#d4d4d4"}"`
    case "strong":
      return ` data-darkmode-color="${dm.primary ?? "#6aadff"}"`
    case "quote":
      return ` data-darkmode-bgcolor="${dm.quote_bg ?? "#2a2a2a"}" data-darkmode-color="${dm.text ?? "#c8c8c8"}"`
  }
}

// ---------- 转义 ----------

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
}

// ---------- 行内 markdown（主题规则内联 + 暗黑属性） ----------

interface InlineCtx {
  theme: WechatTheme
  /** claims 渲染上标 [n]（已核实脚注）；markdown 原生链接追加到 linkRefs */
  linkRefs: string[]
}

function inlineMd(s: string, ctx: InlineCtx): string {
  const t = ctx.theme
  const strongStyle = styleAttr(mergeThemeStyles(t, ["strong"]))
  const codeStyle = styleAttr(mergeThemeStyles(t, ["code"]))
  const emStyle = styleAttr(mergeThemeStyles(t, ["em"]))
  let out = esc(s)
  // 行内代码
  out = out.replace(/`([^`]+)`/g, (_m, c: string) => `<code style="${codeStyle}"${darkAttrs(t, "code")}>${c}</code>`)
  // 粗体
  out = out.replace(/\*\*([^*]+)\*\*/g, (_m, c: string) => `<strong style="${strongStyle}"${darkAttrs(t, "strong")}>${c}</strong>`)
  // 删除线
  out = out.replace(/~~([^~]+)~~/g, `<del style="color:${t.colors.text_light ?? "#666"};">$1</del>`)
  // 斜体
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, `$1<em style="${emStyle}">$2</em>`)
  // markdown 链接 [text](url) → text + 脚注编号（微信正文不支持 a）
  out = out.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, text: string, url: string) => {
    ctx.linkRefs.push(url)
    const n = ctx.linkRefs.length
    return `${text}<sup style="color:${t.colors.primary ?? "#2563eb"};font-size:0.72em;font-weight:600;">[${n}]</sup>`
  })
  // claims 上标 [n]
  out = out.replace(/\[(\d{1,2})\]/g, `<sup style="color:${t.colors.primary ?? "#2563eb"};font-size:0.72em;font-weight:600;">[$1]</sup>`)
  return out
}

// ---------- 粘贴加固（wewrite make_paste_safe 语义） ----------
// 非空文本节点包 <span leaf="">（跳过 pre/code）——我们生成的 HTML
// 标签均衡、属性无裸 >，按标签切分逐段包裹即等价于 DOM 文本节点包裹。

function makePasteSafe(html: string): string {
  const parts = html.split(/(<[^>]+>)/)
  let depthPre = 0
  let depthCode = 0
  const out: string[] = []
  for (const part of parts) {
    if (part.startsWith("<")) {
      if (/^<pre[\s>]/i.test(part)) depthPre++
      else if (/^<\/pre/i.test(part)) depthPre = Math.max(0, depthPre - 1)
      else if (/^<code[\s>]/i.test(part)) depthCode++
      else if (/^<\/code/i.test(part)) depthCode = Math.max(0, depthCode - 1)
      out.push(part)
      continue
    }
    if (depthPre > 0 || depthCode > 0 || !part.trim()) {
      out.push(part)
      continue
    }
    out.push(`<span leaf="">${part}</span>`)
  }
  return out.join("")
}

// ---------- Markdown → 微信 HTML ----------

export interface RenderOptions {
  theme?: ThemeId
  title?: string
  wordCount?: number
}

export function renderWechatHtml(markdown: string, claims: RenderClaim[], opts: RenderOptions = {}): string {
  const theme = getWechatTheme(opts.theme ?? "professional-clean")
  const t = theme
  const pStyle = mergeThemeStyles(t, ["p"])
  const h2Style = mergeThemeStyles(t, ["h2"])
  const h3Style = mergeThemeStyles(t, ["h3"])
  const h4Style = mergeThemeStyles(t, ["h4"])
  const bqStyle = mergeThemeStyles(t, ["blockquote"])
  const bqPStyle = mergeThemeStyles(t, ["p", "blockquote p"])
  const preStyle = mergeThemeStyles(t, ["pre"])
  const preCodeStyle = mergeThemeStyles(t, ["code", "pre code"])
  const tableStyle = mergeThemeStyles(t, ["table"])
  const tdStyle = mergeThemeStyles(t, ["td"])
  const thStyle = mergeThemeStyles(t, ["th", "td"])
  const primary = t.colors.primary ?? "#2563eb"
  const text = t.colors.text ?? "#333333"
  const textLight = t.colors.text_light ?? "#666666"

  // ---- Step 1: 容器语法抽取（先于 Markdown 行级解析，产物绕过解析） ----
  let workText = markdown
  let containerBlocks: string[] = []
  if (hasContainerSyntax(markdown)) {
    const extracted = extractContainers(markdown, t.name)
    workText = extracted.text
    containerBlocks = extracted.blocks
  }

  // ---- Step 2: 行级扫描 ----
  const ctx: InlineCtx = { theme: t, linkRefs: [] }
  const bodyBlocks: string[] = []
  const lines = workText.split(/\r?\n/)

  let h2Counter = 0
  let inQuote = false
  const quoteBuf: string[] = []
  const flushQuote = () => {
    if (quoteBuf.length > 0) {
      bodyBlocks.push(
        `<blockquote style="${styleAttr(bqStyle)}"${darkAttrs(t, "quote")}>` +
          `<p style="${styleAttr(bqPStyle)}"${darkAttrs(t, "text")}>${quoteBuf.join("<br/>")}</p>` +
          `</blockquote>`,
      )
      quoteBuf.length = 0
    }
    inQuote = false
  }

  let listMode: "ul" | "ol" | null = null
  const listBuf: string[] = []
  const flushList = () => {
    if (listBuf.length > 0 && listMode) {
      // wewrite 列表语义：原生列表不稳定 → 样式化 section + 主题色圆点/编号
      const items = listBuf
        .map((li, i) => {
          const marker =
            listMode === "ul"
              ? `<section style="width:6px;height:6px;border-radius:50%;background:${primary};margin-top:9px;flex-shrink:0;"></section>`
              : `<section style="min-width:18px;font-size:15px;font-weight:600;color:${primary};flex-shrink:0;">${i + 1}.</section>`
          return (
            `<section style="display:flex;align-items:flex-start;margin:6px 0;">` +
            marker +
            `<section style="flex:1;padding-left:8px;font-size:15px;line-height:1.8;color:${text};">${li}</section>` +
            `</section>`
          )
        })
        .join("")
      bodyBlocks.push(`<section style="margin:16px 0;padding-left:4px;">${items}</section>`)
      listBuf.length = 0
    }
    listMode = null
  }

  // 代码块状态
  let inFence = false
  let fenceLang = ""
  const fenceBuf: string[] = []
  // 表格状态
  let tableRows: string[][] = []

  const flushTable = () => {
    if (tableRows.length > 0) {
      const [head, ...body] = tableRows
      const tr = (cells: string[], isHead: boolean) =>
        `<tr>${cells
          .map(
            (c) =>
              `<${isHead ? "th" : "td"} style="${styleAttr(isHead ? thStyle : tdStyle)}"${isHead ? "" : darkAttrs(t, "text")}>${inlineMd(c, ctx)}</${isHead ? "th" : "td"}>`,
          )
          .join("")}</tr>`
      bodyBlocks.push(
        `<table style="${styleAttr(tableStyle)}">${tr(head, true)}${body.map((r) => tr(r, false)).join("")}</table>`,
      )
      tableRows = []
    }
  }

  for (const raw of lines) {
    const line = raw.trimEnd()

    // 围栏代码块
    if (/^```/.test(line.trim())) {
      if (!inFence) {
        flushQuote()
        flushList()
        flushTable()
        inFence = true
        fenceLang = line.trim().replace(/^```/, "").trim()
        fenceBuf.length = 0
        continue
      }
      inFence = false
      const codeSt = applyExtra(preCodeStyle, {
        "font-family": "Consolas,monospace",
        "font-size": "13px",
        "white-space": "pre-wrap",
        "word-break": "break-all",
      })
      bodyBlocks.push(
        `<pre style="${styleAttr(applyExtra(preStyle, { "white-space": "pre-wrap" }))}"${fenceLang ? ` data-lang="${esc(fenceLang)}"` : ""}${darkAttrs(t, "pre")}>` +
          `<code style="${styleAttr(codeSt)}">${esc(fenceBuf.join("\n"))}</code></pre>`,
      )
      continue
    }
    if (inFence) {
      fenceBuf.push(raw)
      continue
    }

    // 容器占位符 → 原样输出（绕过 Markdown 解析）
    const cont = line.trim().match(/^<!--WWCONT:(\d+)-?->$/)
    if (cont) {
      flushQuote()
      flushList()
      flushTable()
      const block = containerBlocks[Number(cont[1])]
      if (block) bodyBlocks.push(block)
      continue
    }

    // 空行
    if (!line.trim()) {
      flushQuote()
      flushList()
      flushTable()
      continue
    }

    // 正文配图：![图注](url) → figure + img + figcaption（微信需上传素材库，导出说明里提示替换）
    const img = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/)
    if (img) {
      flushQuote()
      flushList()
      flushTable()
      const alt = img[1].trim()
      const url = img[2]
      const cap = alt
        ? `<figcaption style="font-size:12px;color:${textLight};text-align:center;margin:8px 0 0;line-height:1.6;">${esc(alt)}</figcaption>`
        : ""
      bodyBlocks.push(
        `<figure style="margin:18px 0;">` +
          `<img src="${esc(url)}" alt="${esc(alt)}" style="display:block;width:100%;height:auto;border-radius:8px;"/>` +
          cap +
          `</figure>`,
      )
      continue
    }

    // 引用块
    if (/^&gt;|^>/.test(line.trim())) {
      flushList()
      flushTable()
      inQuote = true
      quoteBuf.push(inlineMd(cjkLatinSpace(line.trim().replace(/^&gt;\s?|^>\s?/, "")), ctx))
      continue
    }
    flushQuote()

    // 表格行
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim())
      if (cells.every((c) => /^:?-{3,}:?$/.test(c))) continue // 分隔行
      flushList()
      tableRows.push(cells)
      continue
    }
    flushTable()

    // 列表
    const li = line.match(/^\s*[-*]\s+(.*)$/)
    const oli = line.match(/^\s*\d+[.、]\s+(.*)$/)
    if (li || oli) {
      if (listMode !== (li ? "ul" : "ol")) {
        flushList()
        listMode = li ? "ul" : "ol"
      }
      listBuf.push(inlineMd(cjkLatinSpace((li ?? oli)![1]), ctx))
      continue
    }
    flushList()

    // 标题
    const h = line.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const level = h[1].length
      if (level <= 1) continue // H1 由头部渲染
      const content = inlineMd(cjkLatinSpace(h[2]), ctx)
      if (level === 2) {
        h2Counter++
        const num = t.sectionNumbering
          ? `<span style="color:${primary};font-weight:800;margin-right:8px;">${String(h2Counter).padStart(2, "0")}</span>`
          : ""
        bodyBlocks.push(`<h2 style="${styleAttr(h2Style)}"${darkAttrs(t, "heading")}>${num}${content}</h2>`)
      } else if (level === 3) {
        bodyBlocks.push(`<h3 style="${styleAttr(h3Style)}"${darkAttrs(t, "heading")}>${content}</h3>`)
      } else {
        bodyBlocks.push(`<h4 style="${styleAttr(h4Style)}"${darkAttrs(t, "heading")}>${content}</h4>`)
      }
      continue
    }

    // 分隔线
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      bodyBlocks.push(
        `<section style="margin:22px 0;border-bottom:1px solid ${t.colors.border ?? "#e5e7eb"};"><span leaf=""><br/></span></section>`,
      )
      continue
    }

    // 普通段落（微信兜底：强制显式 color）
    const paraStyle = applyExtra(pStyle, pStyle.color ? {} : { color: text })
    bodyBlocks.push(`<p style="${styleAttr(paraStyle)}"${darkAttrs(t, "text")}>${inlineMd(cjkLatinSpace(line), ctx)}</p>`)
  }
  flushQuote()
  flushList()
  flushTable()
  if (inFence && fenceBuf.length > 0) {
    bodyBlocks.push(`<pre style="${styleAttr(preStyle)}"${darkAttrs(t, "pre")}><code>${esc(fenceBuf.join("\n"))}</code></pre>`)
  }

  // ---- Step 3: 参考来源区（claims 账本 + markdown 链接脚注合并编号） ----
  const allRefs: { idx: number; label: string }[] = [
    ...claims.map((c) => ({ idx: c.idx, label: `${c.sourceSite || "来源"}《${c.sourceTitle.slice(0, 60)}》${(c.sourceDate || "").slice(0, 10)}` })),
    ...ctx.linkRefs.map((url, i) => ({ idx: claims.length + i + 1, label: url.slice(0, 80) })),
  ]
  let refsSection = ""
  if (allRefs.length > 0) {
    const refItems = allRefs
      .map(
        (r) =>
          `<section style="margin:8px 0;font-size:12px;line-height:1.6;color:${textLight};">` +
          `<span style="color:${primary};font-weight:600;">[${r.idx}]</span> ${esc(r.label)}</section>`,
      )
      .join("")
    refsSection =
      `<section style="margin:30px 0 12px;padding-top:16px;border-top:1px solid ${t.colors.border ?? "#e5e7eb"};"${darkAttrs(t, "text")}>` +
      `<span style="font-size:13px;font-weight:700;color:${textLight};">参考来源</span>${refItems}</section>`
  }

  // ---- Step 4: AIGC 声明（主题可控，默认开） ----
  const aigc = t.aigcFooter
    ? `<section style="margin:20px 0 0;padding:10px 14px;background:${t.colors.quote_bg ?? "rgba(0,0,0,0.03)"};border-radius:${t.colors.border_radius ?? "8px"};"${darkAttrs(t, "text")}>` +
      `<p style="margin:0;font-size:11px;line-height:1.6;color:${textLight};">本文由 AI 辅助生成，经人工审校；事实性内容均标注 [n] 来源，可通过参考来源核对。生成工具：AI 资讯雷达 · 工作流平台。</p></section>`
    : ""

  // ---- Step 5: 头部（标题 + 字数徽章） ----
  const h1Style = mergeThemeStyles(t, ["h1"])
  const titleHtml = opts.title
    ? `<h1 style="${styleAttr(h1Style)}"${darkAttrs(t, "heading")}>${esc(cjkLatinSpace(opts.title))}</h1>`
    : ""
  const wordBadge = opts.wordCount
    ? `<section style="margin:6px 0 18px;"><section style="display:inline-block;padding:2px 10px;border-radius:999px;background:rgba(0,0,0,0.04);color:${primary};font-size:11px;"${darkAttrs(t, "text")}>全文约 ${opts.wordCount} 字 · ${t.name} 主题</section></section>`
    : ""

  // ---- Step 6: 根容器 + 粘贴加固 ----
  const rootStyle = applyExtra(mergeThemeStyles(t, ["body"]), {
    "max-width": "100%",
    margin: "0 auto",
    padding: "18px 16px 24px",
    background: t.colors.background ?? "#ffffff",
    "box-sizing": "border-box",
    "word-wrap": "break-word",
  })
  const raw =
    `<section style="${styleAttr(rootStyle)}"${darkAttrs(t, "text")}>` +
    titleHtml +
    wordBadge +
    bodyBlocks.join("") +
    refsSection +
    aigc +
    `</section>`
  return makePasteSafe(raw)
}
