/**
 * 排版引擎：Markdown → 微信兼容 HTML（Phase 2 自研，wewrite 兼容性清单继承）
 *
 * 微信编辑器只认「内联 style + section 嵌套」，因此：
 *  - 所有样式全部内联（不用 class）
 *  - 段落用 <section> 包裹（粘贴进公众号编辑器不掉样式）
 *  - 外链不可点 → 转文末脚注
 *  - CJK 与 Latin/数字之间自动加空格（pangu 规则）
 *  - claims 引用 [n] → 上标序号 + 文末「参考来源」区
 */

export interface ThemeSpec {
  id: string
  name: string
  desc: string
  /** 预览底色 */
  pageBg: string
  accent: string
  title: string
  subtitle: string
  h2: string
  h3: string
  p: string
  quote: string
  codeInline: string
  codeBlock: string
  hr: string
  figure: string
  figcaption: string
  footnoteTitle: string
  footnoteItem: string
}

const P = (s: string) => s.replace(/\s+/g, ' ').trim()

export const THEMES: Record<string, ThemeSpec> = {
  classic: {
    id: 'classic',
    name: '雷达蓝灰',
    desc: '延续资讯雷达的 teal 主视觉，科技向克制排版',
    pageBg: '#f8fafc',
    accent: '#0f766e',
    title: P('margin:0 0 6px;font-size:22px;line-height:1.4;font-weight:700;color:#0f172a;letter-spacing:.5px;'),
    subtitle: P('margin:0 0 20px;font-size:13px;line-height:1.6;color:#64748b;'),
    h2: P('margin:32px 0 14px;font-size:17px;line-height:1.5;font-weight:700;color:#0f172a;border-left:3px solid #0f766e;padding-left:10px;'),
    h3: P('margin:24px 0 10px;font-size:15px;line-height:1.5;font-weight:700;color:#1e293b;'),
    p: P('margin:0 0 16px;font-size:15px;line-height:1.9;color:#334155;letter-spacing:.3px;text-align:justify;'),
    quote: P('margin:20px 0;padding:12px 16px;background:#f0fdfa;border-radius:6px;font-size:14px;line-height:1.8;color:#0f766e;'),
    codeInline: P('padding:1px 6px;background:#f1f5f9;border-radius:4px;font-family:Menlo,Consolas,monospace;font-size:13px;color:#0f766e;'),
    codeBlock: P('margin:18px 0;padding:14px 16px;background:#0f172a;border-radius:8px;font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#e2e8f0;overflow-x:auto;white-space:pre-wrap;'),
    hr: P('margin:28px 0;border:none;border-top:1px dashed #cbd5e1;'),
    figure: P('margin:20px 0;'),
    figcaption: P('margin:8px 0 0;font-size:12px;color:#94a3b8;text-align:center;'),
    footnoteTitle: P('margin:32px 0 10px;font-size:13px;font-weight:700;color:#475569;'),
    footnoteItem: P('margin:0 0 6px;font-size:12px;line-height:1.7;color:#94a3b8;word-break:break-all;'),
  },
  ink: {
    id: 'ink',
    name: '墨黑高对比',
    desc: '黑白灰高对比、衬线标题，深度长文的报刊质感',
    pageBg: '#ffffff',
    accent: '#111827',
    title: P('margin:0 0 6px;font-size:23px;line-height:1.4;font-weight:900;color:#111827;font-family:Georgia,"Noto Serif SC",serif;'),
    subtitle: P('margin:0 0 22px;font-size:13px;line-height:1.6;color:#6b7280;border-bottom:2px solid #111827;padding-bottom:12px;'),
    h2: P('margin:34px 0 14px;font-size:18px;line-height:1.5;font-weight:900;color:#111827;font-family:Georgia,"Noto Serif SC",serif;'),
    h3: P('margin:26px 0 10px;font-size:15px;line-height:1.5;font-weight:700;color:#374151;'),
    p: P('margin:0 0 18px;font-size:15px;line-height:2.0;color:#1f2937;letter-spacing:.4px;text-align:justify;'),
    quote: P('margin:22px 0;padding:14px 18px;background:#f9fafb;border-left:4px solid #111827;font-size:14px;line-height:1.8;color:#374151;font-family:Georgia,"Noto Serif SC",serif;'),
    codeInline: P('padding:1px 6px;background:#f3f4f6;border-radius:4px;font-family:Menlo,Consolas,monospace;font-size:13px;color:#111827;border:1px solid #e5e7eb;'),
    codeBlock: P('margin:18px 0;padding:14px 16px;background:#111827;border-radius:6px;font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#f9fafb;overflow-x:auto;white-space:pre-wrap;'),
    hr: P('margin:30px 0;border:none;border-top:1px solid #d1d5db;'),
    figure: P('margin:22px 0;'),
    figcaption: P('margin:8px 0 0;font-size:12px;color:#9ca3af;text-align:center;'),
    footnoteTitle: P('margin:34px 0 10px;font-size:13px;font-weight:700;color:#4b5563;'),
    footnoteItem: P('margin:0 0 6px;font-size:12px;line-height:1.7;color:#9ca3af;word-break:break-all;'),
  },
  warm: {
    id: 'warm',
    name: '暖白夜读',
    desc: '奶油底 + 琥珀强调色，适配「午夜朋友」人格的暖声线',
    pageBg: '#fffbf2',
    accent: '#b45309',
    title: P('margin:0 0 6px;font-size:22px;line-height:1.45;font-weight:700;color:#78350f;'),
    subtitle: P('margin:0 0 20px;font-size:13px;line-height:1.6;color:#a16207;'),
    h2: P('margin:32px 0 14px;font-size:17px;line-height:1.5;font-weight:700;color:#78350f;'),
    h3: P('margin:24px 0 10px;font-size:15px;line-height:1.5;font-weight:700;color:#92400e;'),
    p: P('margin:0 0 16px;font-size:15px;line-height:1.9;color:#57534e;letter-spacing:.3px;text-align:justify;'),
    quote: P('margin:20px 0;padding:14px 16px;background:#fef3c7;border-radius:8px;font-size:14px;line-height:1.8;color:#92400e;'),
    codeInline: P('padding:1px 6px;background:#fef9c3;border-radius:4px;font-family:Menlo,Consolas,monospace;font-size:13px;color:#b45309;'),
    codeBlock: P('margin:18px 0;padding:14px 16px;background:#451a03;border-radius:8px;font-family:Menlo,Consolas,monospace;font-size:13px;line-height:1.7;color:#fde68a;overflow-x:auto;white-space:pre-wrap;'),
    hr: P('margin:28px 0;border:none;border-top:1px dashed #fcd34d;'),
    figure: P('margin:20px 0;'),
    figcaption: P('margin:8px 0 0;font-size:12px;color:#b45309;text-align:center;'),
    footnoteTitle: P('margin:32px 0 10px;font-size:13px;font-weight:700;color:#a16207;'),
    footnoteItem: P('margin:0 0 6px;font-size:12px;line-height:1.7;color:#b45309;word-break:break-all;'),
  },
}

export const THEME_LIST = Object.values(THEMES).map((t) => ({ id: t.id, name: t.name, desc: t.desc }))

export interface RenderSource {
  title: string
  url: string
  site: string
  date?: string
}

/** CJK 与 Latin/数字 之间自动加空格（pangu 核心规则的轻量实现） */
export function spacingCJK(text: string): string {
  const cjk = '\\u2e80-\\u9fff\\u3400-\\u4dbf\\uf900-\\ufaff'
  return text
    .replace(new RegExp(`([${cjk}])([A-Za-z0-9])`, 'g'), '$1 $2')
    .replace(new RegExp(`([A-Za-z0-9])([${cjk}])`, 'g'), '$1 $2')
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

/** 行内元素渲染：粗体 / 斜体 / 行内代码 / 引用[n] / 链接转脚注 */
function inline(md: string, theme: ThemeSpec, linkFootnotes: string[]): string {
  let s = esc(md)

  // 行内代码（先处理，避免内部被其它规则改写）
  s = s.replace(/`([^`]+)`/g, (_m, c: string) => `<code style="${theme.codeInline}">${c}</code>`)

  // Markdown 链接 [text](url) → text + 脚注登记（微信外链不可点）
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, text: string, url: string) => {
    linkFootnotes.push(url)
    return `${text}<sup style="color:${theme.accent};font-size:11px;">&nbsp;${linkFootnotes.length}</sup>`
  })

  // 粗体
  s = s.replace(/\*\*([^*]+)\*\*/g, `<strong style="font-weight:700;color:${theme.accent};">$1</strong>`)
  // 斜体
  s = s.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>')

  // claims 引用 [1] / [2] → 上标序号（与来源账本编号对应）
  s = s.replace(/\[(\d{1,2})\]/g, (m, d: string) => {
    const n = parseInt(d, 10)
    return n >= 1 && n <= 30 ? `<sup style="color:${theme.accent};font-size:11px;">&nbsp;[${d}]</sup>` : m
  })

  // CJK-Latin 空格：只处理标签之间的文本段，避免破坏 HTML 属性
  const parts = s.split(/(<[^>]+>)/g)
  s = parts.map((seg) => (seg.startsWith('<') ? seg : spacingCJK(seg))).join('')
  return s
}

/** Markdown 块级解析结果 */
interface BlocksResult {
  html: string
  footnotes: string[]
}

/** 轻量 Markdown 块级解析（标题/段落/引用/列表/代码块/分割线/图片/表格） */
export function renderMarkdownBlocks(md: string, theme: ThemeSpec): BlocksResult {
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  const footnotes: string[] = []
  let i = 0

  const flushParagraph = (buf: string[]) => {
    if (buf.length === 0) return
    const text = buf.join('\n').trim()
    if (text) out.push(`<section style="${theme.p}">${inline(text, theme, footnotes)}</section>`)
    buf.length = 0
  }

  const paraBuf: string[] = []
  while (i < lines.length) {
    const line = lines[i]
    const t = line.trim()

    if (t === '') {
      flushParagraph(paraBuf)
      i++
      continue
    }

    // 代码块 ```
    if (t.startsWith('```')) {
      flushParagraph(paraBuf)
      const codeLines: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i])
        i++
      }
      i++ // 跳过收尾 ```
      out.push(`<section style="${theme.codeBlock}">${esc(codeLines.join('\n'))}</section>`)
      continue
    }

    // 分割线
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushParagraph(paraBuf)
      out.push(`<section style="${theme.hr}">&nbsp;</section>`)
      i++
      continue
    }

    // 标题
    const h = /^(#{1,6})\s+(.*)$/.exec(t)
    if (h) {
      flushParagraph(paraBuf)
      const level = h[1].length
      const text = inline(h[2], theme, footnotes)
      if (level <= 2) out.push(`<section style="${theme.h2}">${text}</section>`)
      else out.push(`<section style="${theme.h3}">${text}</section>`)
      i++
      continue
    }

    // 引用块
    if (t.startsWith('> ')) {
      flushParagraph(paraBuf)
      const qLines: string[] = []
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        qLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i++
      }
      out.push(`<section style="${theme.quote}">${inline(qLines.join('\n'), theme, footnotes)}</section>`)
      continue
    }

    // 图片 ![alt](url)
    const img = /^!\[([^\]]*)\]\(([^)\s]+)\)$/.exec(t)
    if (img) {
      flushParagraph(paraBuf)
      const alt = img[1] || '配图'
      const url = img[2]
      if (url.startsWith('http') || url.startsWith('/')) {
        out.push(
          `<section style="${theme.figure}"><img src="${esc(url)}" alt="${esc(alt)}" style="width:100%;border-radius:8px;display:block;"/>` +
            (alt ? `<section style="${theme.figcaption}">${esc(alt)}</section>` : '') +
            `</section>`
        )
      }
      i++
      continue
    }

    // 无序列表
    if (/^[-*+]\s+/.test(t)) {
      flushParagraph(paraBuf)
      const items: string[] = []
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''))
        i++
      }
      const lis = items
        .map((it) => `<section style="${P(theme.p + 'margin:0 0 8px;padding-left:16px;')}"><span style="color:${theme.accent};">•&nbsp;</span>${inline(it, theme, footnotes)}</section>`)
        .join('')
      out.push(`<section style="margin:0 0 16px;">${lis}</section>`)
      continue
    }

    // 有序列表
    if (/^\d+\.\s+/.test(t)) {
      flushParagraph(paraBuf)
      const items: string[] = []
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''))
        i++
      }
      const lis = items
        .map((it, idx) => `<section style="${P(theme.p + 'margin:0 0 8px;padding-left:20px;')}"><span style="color:${theme.accent};font-weight:700;">${idx + 1}.&nbsp;</span>${inline(it, theme, footnotes)}</section>`)
        .join('')
      out.push(`<section style="margin:0 0 16px;">${lis}</section>`)
      continue
    }

    // 表格（管道语法）
    if (t.includes('|') && i + 1 < lines.length && /^\s*\|?[\s:|-]+\|[\s:|-]*$/.test(lines[i + 1])) {
      flushParagraph(paraBuf)
      const strip = (row: string) => {
        const cells = row.trim().split('|').map((c) => c.trim())
        if (cells[0] === '') cells.shift()
        if (cells[cells.length - 1] === '') cells.pop()
        return cells
      }
      const headCells = strip(t)
      i += 2
      const rows: string[][] = []
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(strip(lines[i]))
        i++
      }
      const border = theme.pageBg === '#ffffff' ? '#f3f4f6' : '#e2e8f0'
      const th = headCells
        .map((c) => `<span style="flex:1;padding:8px 10px;font-size:13px;font-weight:700;color:${theme.accent};">${inline(c, theme, footnotes)}</span>`)
        .join('')
      const trs = rows
        .map(
          (r) =>
            `<section style="display:flex;border-top:1px solid ${border};">` +
            r.map((c) => `<span style="flex:1;padding:8px 10px;font-size:13px;line-height:1.7;color:#475569;">${inline(c, theme, footnotes)}</span>`).join('') +
            `</section>`
        )
        .join('')
      out.push(
        `<section style="margin:18px 0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">` +
          `<section style="display:flex;background:${theme.pageBg === '#ffffff' ? '#f9fafb' : '#f1f5f9'};">${th}</section>${trs}</section>`
      )
      continue
    }

    // 普通段落
    paraBuf.push(line)
    i++
  }
  flushParagraph(paraBuf)

  return { html: out.join('\n'), footnotes }
}

/** 完整渲染：标题区 + 正文 + 参考来源 + 脚注区 + AIGC 声明 */
export function renderWechatArticle(opts: {
  title: string
  markdown: string
  themeId?: string
  sources?: RenderSource[]
  coverUrl?: string
  aigcNote?: boolean
}): string {
  const theme = THEMES[opts.themeId ?? 'classic'] ?? THEMES.classic
  const { html: bodyHtml, footnotes: linkFootnotes } = renderMarkdownBlocks(opts.markdown, theme)
  const sources = opts.sources ?? []

  const sections: string[] = []

  // 封面
  if (opts.coverUrl) {
    sections.push(
      `<section style="margin:0 0 20px;"><img src="${esc(opts.coverUrl)}" alt="封面" style="width:100%;border-radius:10px;display:block;"/></section>`
    )
  }

  // 标题
  sections.push(`<section style="${theme.title}">${esc(spacingCJK(opts.title))}</section>`)

  // 正文
  sections.push(bodyHtml)

  // 参考来源（claims 账本渲染，编号与正文 [n] 对应）
  if (sources.length > 0) {
    const items = sources
      .map(
        (s, idx) =>
          `<section style="${theme.footnoteItem}">[${idx + 1}] ${esc(s.site)}${s.date ? `（${esc(s.date)}）` : ''}：${esc(s.title)}<br/><span style="color:${theme.accent};opacity:.7;">${esc(s.url)}</span></section>`
      )
      .join('\n')
    sections.push(`<section style="${theme.footnoteTitle}">参考来源</section>\n${items}`)
  }

  // 外链脚注（微信外链不可点的兜底）
  if (linkFootnotes.length > 0) {
    const items = linkFootnotes
      .map((u, idx) => `<section style="${theme.footnoteItem}">[链接${idx + 1}] ${esc(u)}</section>`)
      .join('\n')
    sections.push(`<section style="${theme.footnoteTitle}">文中链接</section>\n${items}`)
  }

  // AIGC 声明（合规脚注，wewrite 内置清单继承）
  if (opts.aigcNote !== false) {
    sections.push(
      `<section style="${P(theme.footnoteItem + 'margin-top:24px;padding-top:10px;border-top:1px dashed #cbd5e1;')}">本文由 AI 辅助生成并经人工审校，事实主张均附可溯源参考来源。</section>`
    )
  }

  // 外层加固 section（微信粘贴不掉样式的关键）
  return `<section style="max-width:677px;margin:0 auto;padding:24px 20px;background:${theme.pageBg};font-family:-apple-system,BlinkMacSystemFont,'Helvetica Neue','PingFang SC','Hiragino Sans GB','Microsoft YaHei',sans-serif;">\n${sections.join('\n')}\n</section>`
}
