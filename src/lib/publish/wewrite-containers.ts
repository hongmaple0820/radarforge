// ============================================================
// wewrite-containers.ts —— 9 种富容器语法（移植自 wewrite，MIT）
// :::callout / timeline / steps / quote / pullquote / label /
// highlight / summary / dialogue
// 在 Markdown 解析前把容器块替换为内联样式 HTML（容器内支持
// 行内 code/加粗/斜体）。颜色取主题 colors.primary —— 跨主题稳定。
// ============================================================

import { getWechatTheme } from "@/lib/publish/themes"

/** 行内 markdown（容器内支持：code / 粗体 / 斜体 / 删除线） */
function inlineMd(s: string): string {
  let out = s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  out = out.replace(/`([^`]+)`/g, "<code>$1</code>")
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>")
  out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
  return out
}

const CALLOUT_TYPES: Record<string, { color: string; bg: string; icon: string }> = {
  tip: { color: "#059669", bg: "#ecfdf5", icon: "💡" },
  warning: { color: "#d97706", bg: "#fffbeb", icon: "⚠️" },
  info: { color: "#2563eb", bg: "#eff6ff", icon: "ℹ️" },
  danger: { color: "#dc2626", bg: "#fef2f2", icon: "🚨" },
}

/** 是否包含容器语法（快速预检，避免全文正则空跑） */
export function hasContainerSyntax(md: string): boolean {
  return /(^|\n):::(callout|timeline|steps|quote|pullquote|label|highlight|summary|dialogue)/.test(md)
}

/**
 * 容器预处理：把 :::xxx 块替换为 <!--WWCONT:i--> 占位符 + HTML 产物列表。
 * 渲染主流程按行扫描时遇到占位符行即输出对应 HTML 块。
 * 这样容器 HTML 完全绕过 Markdown 行级解析（与 wewrite 的「先容器后解析」顺序等价）。
 */
export function extractContainers(md: string, themeName: string): { text: string; blocks: string[] } {
  const theme = getWechatTheme(themeName)
  const primary = theme.colors.primary ?? "#2563eb"
  const secondary = theme.colors.secondary ?? primary
  const text = theme.colors.text ?? "#333333"
  const textLight = theme.colors.text_light ?? "#666666"
  const radius = theme.colors.border_radius ?? "8px"
  const highlightBg = theme.colors.highlight_bg ?? "#fef7e8"
  const highlightBorder = theme.colors.highlight_border ?? "#e5d5b0"
  const summaryBg = theme.colors.summary_bg ?? "#e8f5f0"
  const summaryBorder = theme.colors.summary_border ?? "#bcd9cc"

  const blocks: string[] = []
  let out = md

  // :::dialogue（聊天气泡：> 前缀 = 右侧回复）
  out = out.replace(/:::dialogue\n([\s\S]*?)\n:::/g, (_m, body: string) => {
    const rows = String(body)
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const right = l.startsWith(">")
        const content = inlineMd(right ? l.replace(/^>\s?/, "") : l)
        const bubble = right
          ? `<section style="display:flex;justify-content:flex-end;">` +
            `<section style="display:inline-block;max-width:80%;padding:10px 14px;background:${primary};color:#ffffff;border-radius:12px 12px 2px 12px;font-size:15px;line-height:1.6;">${content}</section></section>`
          : `<section style="display:flex;justify-content:flex-start;">` +
            `<section style="display:inline-block;max-width:80%;padding:10px 14px;background:#f3f4f6;color:${text};border-radius:12px 12px 12px 2px;font-size:15px;line-height:1.6;">${content}</section></section>`
        return `<section style="margin:6px 0;">${bubble}</section>`
      })
      .join("")
    const html = `<section style="margin:18px 0;">${rows}</section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  // :::timeline（**标题** 描述）
  out = out.replace(/:::timeline\n([\s\S]*?)\n:::/g, (_m, body: string) => {
    const rows = String(body)
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => {
        const mm = l.match(/^\*\*(.+?)\*\*\s*(.*)$/)
        const title = mm ? mm[1] : ""
        const desc = mm ? mm[2] : l
        return (
          `<section style="display:flex;margin:8px 0;">` +
          `<section style="width:12px;position:relative;flex-shrink:0;">` +
          `<section style="width:10px;height:10px;border-radius:50%;background:${primary};margin:4px auto 0;"></section>` +
          `<section style="width:2px;height:calc(100% - 10px);background:#d1d5db;margin:2px auto 0;"></section>` +
          `</section>` +
          `<section style="padding-left:12px;flex:1;">` +
          (title ? `<section style="font-weight:700;font-size:15px;color:${text};margin-bottom:2px;">${inlineMd(title)}</section>` : "") +
          `<section style="font-size:14px;color:${textLight};line-height:1.6;">${inlineMd(desc)}</section>` +
          `</section></section>`
        )
      })
      .join("")
    const html = `<section style="margin:18px 0;padding:14px 16px;background:rgba(0,0,0,0.02);border-radius:${radius};">${rows}</section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  // :::callout <type>
  out = out.replace(/:::callout\s+(\w+)\n([\s\S]*?)\n:::/g, (_m, typ: string, body: string) => {
    const meta = CALLOUT_TYPES[String(typ).toLowerCase()] ?? CALLOUT_TYPES.info
    const label = String(typ).toLowerCase() in CALLOUT_TYPES ? String(typ).toUpperCase() : "INFO"
    const content = String(body)
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => `<section style="font-size:14px;color:${text};line-height:1.65;">${inlineMd(l)}</section>`)
      .join("")
    const html =
      `<section style="margin:18px 0;padding:14px 16px;background:${meta.bg};border-left:4px solid ${meta.color};border-radius:${radius};">` +
      `<section style="font-size:13px;font-weight:700;color:${meta.color};margin-bottom:6px;">${meta.icon} ${label}</section>` +
      content +
      `</section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  // :::quote（左边界引用）
  out = out.replace(/:::quote\n([\s\S]*?)\n:::/g, (_m, body: string) => {
    const content = String(body).replace(/\n+/g, "<br/>")
    const html =
      `<section style="margin:20px 0;padding:16px 20px;background:linear-gradient(135deg,#f8f9fa,#ffffff);border-left:4px solid ${primary};border-radius:0 ${radius} ${radius} 0;">` +
      `<section style="font-size:18px;color:${text};font-style:italic;line-height:1.8;">「${inlineMd(content)}」</section>` +
      `</section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  // :::pullquote（居中金句）
  out = out.replace(/:::pullquote\n([\s\S]*?)\n:::/g, (_m, body: string) => {
    const content = String(body).replace(/\n+/g, "<br/>")
    const html =
      `<section style="margin:26px 0;text-align:center;">` +
      `<section style="font-size:30px;color:${primary};font-weight:700;line-height:1;margin-bottom:8px;">“</section>` +
      `<section style="font-size:18px;font-weight:600;color:${text};line-height:1.8;">${inlineMd(content)}</section>` +
      `<section style="width:36px;height:2px;background:${primary};margin:14px auto 0;"><span leaf=""><br/></span></section>` +
      `</section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  // :::label [pill]
  out = out.replace(/:::label(\s+pill)?\n([\s\S]*?)\n:::/g, (_m, pill: string, body: string) => {
    const content = inlineMd(String(body).trim())
    const html = pill
      ? `<section style="margin:14px 0;"><section style="display:inline-block;padding:4px 14px;background:${primary};color:#ffffff;font-size:13px;font-weight:600;border-radius:999px;">${content}</section></section>`
      : `<section style="margin:14px 0;display:flex;align-items:center;">` +
        `<section style="width:4px;height:16px;background:${primary};border-radius:2px;margin-right:8px;"></section>` +
        `<section style="font-size:16px;font-weight:700;color:${text};">${content}</section></section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  // :::steps（编号步骤卡）
  out = out.replace(/:::steps\n([\s\S]*?)\n:::/g, (_m, body: string) => {
    const steps = String(body)
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
      .map((l) => l.replace(/^-\s*/, ""))
    const rows = steps
      .map((s, i) => {
        return (
          `<section style="display:flex;align-items:flex-start;margin:10px 0;">` +
          `<section style="width:22px;height:22px;border-radius:50%;background:${primary};color:#ffffff;font-size:12px;font-weight:700;line-height:22px;text-align:center;flex-shrink:0;margin-right:10px;">${i + 1}</section>` +
          `<section style="flex:1;font-size:15px;color:${text};line-height:1.7;padding-top:1px;">${inlineMd(s)}</section>` +
          `</section>`
        )
      })
      .join("")
    const html = `<section style="margin:18px 0;padding:16px;background:rgba(0,0,0,0.02);border-radius:${radius};">${rows}</section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  // :::highlight（琥珀高亮框：首行标题）
  out = out.replace(/:::highlight\n([\s\S]*?)\n:::/g, (_m, body: string) => {
    const lines = String(body)
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const title = lines.length > 1 ? lines[0] : ""
    const rest = (title ? lines.slice(1) : lines)
      .map((l) => `<section style="font-size:14px;color:${text};line-height:1.7;">${inlineMd(l)}</section>`)
      .join("")
    const html =
      `<section style="margin:18px 0;padding:14px 16px;background:${highlightBg};border:1px solid ${highlightBorder};border-radius:${radius};">` +
      (title ? `<section style="font-size:15px;font-weight:700;color:${secondary};margin-bottom:6px;">${inlineMd(title)}</section>` : "") +
      rest +
      `</section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  // :::summary（青色总结框）
  out = out.replace(/:::summary\n([\s\S]*?)\n:::/g, (_m, body: string) => {
    const lines = String(body)
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean)
    const title = lines.length > 1 ? lines[0] : "总结"
    const rest = (lines.length > 1 ? lines.slice(1) : lines)
      .map((l) => `<section style="font-size:14px;color:${text};line-height:1.7;">${inlineMd(l)}</section>`)
      .join("")
    const html =
      `<section style="margin:18px 0;padding:14px 16px;background:${summaryBg};border:1px solid ${summaryBorder};border-radius:${radius};">` +
      `<section style="font-size:15px;font-weight:700;color:${secondary};margin-bottom:6px;">${inlineMd(title)}</section>` +
      rest +
      `</section>`
    blocks.push(html)
    return `<!--WWCONT:${blocks.length - 1}-->`
  })

  return { text: out, blocks }
}
