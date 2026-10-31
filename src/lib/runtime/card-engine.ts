// ============================================================
// card-engine —— 纯图线 2.0「版式骨架」（P1）
// 学 guizang-social-card-skill 的模板化思路：文字由代码排版而非
// 模型生成（可控、零错字），Editorial（杂志衬线）与 Swiss（瑞士
// 网格）两系 × 封面卡/金句卡/数据卡 三模板 × 4 色板。
// 渲染：Playwright chromium 页面 setContent(HTML) → 截图 PNG，
// 尺寸白名单与生图线一致（1344×768 / 864×1152 / 1024×1024）。
// 与视频线 8 语法同构：模板即语法，LLM 只产文案 JSON。
// ============================================================

import { chromium } from "playwright"
import { mkdir, writeFile } from "fs/promises"
import path from "path"

const ASSET_DIR = "/home/z/my-project/public/assets"

// ---------- 模板与色板注册表（前端下拉 + 后端渲染共用） ----------

export const CARD_FAMILIES = [
  { id: "editorial", label: "Editorial 杂志", desc: "衬线大标题 + 细分割线 + 米白纸底，人文学术气质，适合深度观察与专栏封面" },
  { id: "swiss", label: "Swiss 瑞士网格", desc: "无衬线粗黑标题 + 大色块 + 网格留白，现代硬朗，适合数据速递与科技资讯" },
] as const

export type CardFamily = (typeof CARD_FAMILIES)[number]["id"]

export const CARD_TEMPLATES = [
  { id: "cover", label: "封面卡", desc: "眉题 + 大标题 + 副题 + 页脚，用于公众号头图 / 组图开篇" },
  { id: "quote", label: "金句卡", desc: "引文 + 署名 + 出处，用于观点金句 / 转发卡" },
  { id: "data", label: "数据卡", desc: "标题 + 2~4 组大数字指标 + 来源注，用于数据速递 / 盘点" },
] as const

export type CardTemplate = (typeof CARD_TEMPLATES)[number]["id"]

export const CARD_PALETTES: Record<CardFamily, { id: string; accent: string; soft: string; label: string }[]> = {
  editorial: [
    { id: "ink", accent: "#1F1B16", soft: "#B85042", label: "墨黑朱砂" },
    { id: "forest", accent: "#2F5D50", soft: "#C9A227", label: "松绿鎏金" },
    { id: "navy", accent: "#1F3A5F", soft: "#C05746", label: "藏青赭红" },
    { id: "plum", accent: "#4A3157", soft: "#B48EAD", label: "绛紫" },
  ],
  swiss: [
    { id: "crimson", accent: "#DC2626", soft: "#FEE2E2", label: "瑞士红" },
    { id: "cobalt", accent: "#2563EB", soft: "#DBEAFE", label: "钴蓝" },
    { id: "amber", accent: "#D97706", soft: "#FEF3C7", label: "信号橙" },
    { id: "teal", accent: "#0D9488", soft: "#CCFBF1", label: "青碧" },
  ],
}

export function getPalette(family: CardFamily, id?: string, index = 0) {
  const list = CARD_PALETTES[family]
  return list.find((p) => p.id === id) ?? list[index % list.length]
}

// ---------- LLM 文案规划产物（版式线的「构图方案」） ----------

export interface CardMetric {
  value: string // 大数字（含单位/符号，如 "87.4%"、"3.2×"）
  label: string // 指标名
}

export interface CardPlanItem {
  template: CardTemplate
  family: CardFamily
  palette?: string // 缺省按序轮换
  eyebrow?: string // 眉题（栏目/系列名）
  title: string // 主标题（≤ 22 字）
  subtitle?: string // 副题（≤ 32 字）
  quote?: string // 金句正文（quote 卡必填）
  attribution?: string // 署名与身份（quote 卡）
  metrics?: CardMetric[] // data 卡 2~4 组
  footer?: string // 页脚（来源/日期，≤ 28 字）
  caption?: string // 画廊图注（≤ 30 字）
}

// ---------- HTML 生成（纯函数，可离线单测） ----------

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

/** 硬截断（防 LLM 超长导致溢出；VLM 质检兜底） */
const clamp = (s: string | undefined, n: number): string => {
  const t = (s ?? "").trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

const FONT_SERIF = `'Noto Serif SC','Noto Serif CJK SC',Georgia,'Times New Roman',serif`
const FONT_SANS = `'Noto Sans SC','Noto Sans CJK SC',Helvetica,Arial,sans-serif`

function baseCss(family: CardFamily, accent: string, soft: string): string {
  const isEditorial = family === "editorial"
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { width: 100%; height: 100%; overflow: hidden; }
    body {
      font-family: ${isEditorial ? FONT_SERIF : FONT_SANS};
      background: ${isEditorial ? "#F7F3EC" : "#FFFFFF"};
      color: ${isEditorial ? "#1F1B16" : "#111111"};
      display: flex; flex-direction: column;
      position: relative;
    }
    .accent { color: ${accent}; }
    .softbg { background: ${soft}; }
    .rule { height: 1px; background: ${isEditorial ? "rgba(31,27,22,0.25)" : "#E5E7EB"}; }
    .eyebrow {
      font-family: ${FONT_SANS};
      font-size: 1.9vmin; letter-spacing: 0.5vmin;
      text-transform: uppercase; color: ${accent}; font-weight: 700;
    }
    .footer {
      font-family: ${FONT_SANS}; font-size: 1.8vmin; color: rgba(0,0,0,0.45);
      letter-spacing: 0.08vmin;
    }
  `
}

function editorialCover(p: CardPlanItem, accent: string, soft: string): string {
  return `
    <div style="flex:1; display:flex; flex-direction:column; padding:7vmin 8vmin;">
      <div style="display:flex; align-items:baseline; justify-content:space-between;">
        <div class="eyebrow">${esc(clamp(p.eyebrow ?? "AI 资讯雷达", 14))}</div>
        <div style="font-family:${FONT_SANS}; font-size:1.8vmin; color:rgba(0,0,0,0.4); letter-spacing:0.3vmin;">VOL. ${new Date().getFullYear()}</div>
      </div>
      <div class="rule" style="margin:2.4vmin 0 0;"></div>
      <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:3vmin;">
        <div style="width:9vmin; height:0.9vmin; background:${soft};"></div>
        <h1 style="font-size:8.4vmin; line-height:1.22; font-weight:700; letter-spacing:0.06vmin;">${esc(clamp(p.title, 22))}</h1>
        ${p.subtitle ? `<p style="font-size:3vmin; line-height:1.7; color:rgba(31,27,22,0.72); letter-spacing:0.1vmin;">${esc(clamp(p.subtitle, 34))}</p>` : ""}
      </div>
      <div class="rule" style="margin:0 0 2.2vmin;"></div>
      <div style="display:flex; justify-content:space-between; align-items:baseline;">
        <div class="footer">${esc(clamp(p.footer ?? "AI 资讯雷达 · 每日情报", 30))}</div>
        <div style="width:3.2vmin; height:3.2vmin; border:0.28vmin solid ${accent}; border-radius:50%; display:flex; align-items:center; justify-content:center;">
          <div style="width:1.1vmin; height:1.1vmin; background:${accent}; border-radius:50%;"></div>
        </div>
      </div>
    </div>`
}

function swissCover(p: CardPlanItem, accent: string, soft: string): string {
  return `
    <div style="flex:1; display:flex; flex-direction:column;">
      <div style="height:2.6vmin; background:${accent};"></div>
      <div style="flex:1; display:flex; flex-direction:column; padding:6vmin 7vmin 4.5vmin;">
        <div class="eyebrow">${esc(clamp(p.eyebrow ?? "AI RADAR BRIEFING", 16))}</div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; gap:2.6vmin;">
          <h1 style="font-size:9.2vmin; line-height:1.16; font-weight:900; letter-spacing:-0.05vmin;">${esc(clamp(p.title, 20))}</h1>
          ${p.subtitle ? `<p style="font-size:2.9vmin; line-height:1.65; color:rgba(0,0,0,0.62); max-width:72%;">${esc(clamp(p.subtitle, 36))}</p>` : ""}
          <div style="display:flex; gap:1.2vmin; margin-top:1vmin;">
            <div style="width:6vmin; height:1vmin; background:${accent};"></div>
            <div style="width:2vmin; height:1vmin; background:${soft};"></div>
          </div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; border-top:0.14vmin solid #E5E7EB; padding-top:2vmin;">
          <div class="footer">${esc(clamp(p.footer ?? "AI NEWS RADAR", 30))}</div>
          <div class="softbg" style="font-family:${FONT_SANS}; font-size:1.8vmin; font-weight:800; color:${accent}; padding:0.7vmin 1.4vmin; letter-spacing:0.2vmin;">${esc(clamp(p.eyebrow ?? "DAILY", 12))}</div>
        </div>
      </div>
    </div>`
}

function editorialQuote(p: CardPlanItem, accent: string, soft: string): string {
  const quote = clamp(p.quote ?? p.title, 64)
  return `
    <div style="flex:1; display:flex; flex-direction:column; padding:8vmin 9vmin; justify-content:center; position:relative;">
      <div style="position:absolute; top:6vmin; left:8vmin; font-size:14vmin; line-height:1; color:${soft}; font-weight:900; font-family:${FONT_SERIF};">“</div>
      <div style="display:flex; flex-direction:column; gap:4vmin;">
        <div class="eyebrow">${esc(clamp(p.eyebrow ?? "本周金句", 14))}</div>
        <blockquote style="font-size:5.6vmin; line-height:1.5; font-weight:600; letter-spacing:0.05vmin; text-indent:2vmin;">${esc(quote)}</blockquote>
        <div style="display:flex; align-items:center; gap:2vmin;">
          <div style="width:5vmin; height:0.6vmin; background:${accent};"></div>
          <div style="font-family:${FONT_SANS}; font-size:2.4vmin; color:rgba(31,27,22,0.75); letter-spacing:0.12vmin;">${esc(clamp(p.attribution ?? "—— 匿名", 24))}</div>
        </div>
      </div>
      <div style="position:absolute; bottom:5vmin; right:8vmin;" class="footer">${esc(clamp(p.footer ?? "AI 资讯雷达", 30))}</div>
    </div>`
}

function swissQuote(p: CardPlanItem, accent: string, soft: string): string {
  const quote = clamp(p.quote ?? p.title, 64)
  return `
    <div style="flex:1; display:flex; flex-direction:column;">
      <div style="flex:1; display:flex; align-items:stretch;">
        <div style="width:26%; background:${accent}; display:flex; align-items:flex-end; padding:4vmin;">
          <div style="font-family:${FONT_SANS}; color:#fff; font-size:10vmin; font-weight:900; line-height:0.9;">“”</div>
        </div>
        <div style="flex:1; display:flex; flex-direction:column; justify-content:center; padding:6vmin 6vmin; gap:3.4vmin; background:${soft};">
          <div class="eyebrow">${esc(clamp(p.eyebrow ?? "QUOTE OF THE WEEK", 16))}</div>
          <blockquote style="font-size:4.9vmin; line-height:1.48; font-weight:800; letter-spacing:-0.01vmin; color:#111;">${esc(quote)}</blockquote>
          <div style="display:flex; align-items:center; gap:1.6vmin;">
            <div style="width:1.1vmin; height:1.1vmin; background:${accent};"></div>
            <div style="font-family:${FONT_SANS}; font-size:2.2vmin; color:rgba(0,0,0,0.65); font-weight:700;">${esc(clamp(p.attribution ?? "—— 匿名", 26))}</div>
          </div>
        </div>
      </div>
      <div style="height:2.2vmin; background:${accent};"></div>
    </div>`
}

function editorialData(p: CardPlanItem, accent: string, soft: string): string {
  const metrics = (p.metrics ?? []).slice(0, 4)
  const cols = metrics.length >= 4 ? 2 : 1
  return `
    <div style="flex:1; display:flex; flex-direction:column; padding:6.5vmin 8vmin;">
      <div class="eyebrow">${esc(clamp(p.eyebrow ?? "数据速递", 14))}</div>
      <h2 style="font-size:5.4vmin; line-height:1.3; font-weight:700; margin:2vmin 0 1vmin;">${esc(clamp(p.title, 24))}</h2>
      ${p.subtitle ? `<p style="font-family:${FONT_SANS}; font-size:2.3vmin; color:rgba(31,27,22,0.6); margin-bottom:3vmin;">${esc(clamp(p.subtitle, 34))}</p>` : ""}
      <div class="rule"></div>
      <div style="flex:1; display:grid; grid-template-columns:repeat(${cols},1fr); gap:3.5vmin 5vmin; align-content:center; padding:2vmin 0;">
        ${metrics
          .map(
            (m) => `
          <div style="display:flex; flex-direction:column; gap:0.8vmin;">
            <div style="font-size:${cols === 2 ? 6.6 : 8.2}vmin; font-weight:700; line-height:1.05; color:${accent};">${esc(clamp(m.value, 12))}</div>
            <div style="width:4vmin; height:0.5vmin; background:${soft};"></div>
            <div style="font-family:${FONT_SANS}; font-size:2.2vmin; color:rgba(31,27,22,0.72); letter-spacing:0.08vmin;">${esc(clamp(m.label, 18))}</div>
          </div>`,
          )
          .join("")}
      </div>
      <div class="rule" style="margin-bottom:2vmin;"></div>
      <div class="footer">${esc(clamp(p.footer ?? "数据来源见正文引用", 30))}</div>
    </div>`
}

function swissData(p: CardPlanItem, accent: string, soft: string): string {
  const metrics = (p.metrics ?? []).slice(0, 4)
  const cols = metrics.length >= 4 ? 2 : metrics.length >= 3 ? 3 : 1
  return `
    <div style="flex:1; display:flex; flex-direction:column;">
      <div style="padding:5.5vmin 7vmin 0;">
        <div class="eyebrow">${esc(clamp(p.eyebrow ?? "DATA BRIEFING", 16))}</div>
        <h2 style="font-size:6vmin; line-height:1.2; font-weight:900; letter-spacing:-0.03vmin; margin:1.6vmin 0 0;">${esc(clamp(p.title, 22))}</h2>
      </div>
      <div style="flex:1; display:grid; grid-template-columns:repeat(${cols},1fr); gap:0; margin-top:4vmin; border-top:0.3vmin solid ${accent};">
        ${metrics
          .map(
            (m, i) => `
          <div style="padding:4vmin 4.5vmin; border-right:${i < metrics.length - 1 ? "0.14vmin solid #E5E7EB" : "none"}; display:flex; flex-direction:column; gap:1vmin; justify-content:center; ${i % 2 === 1 ? `background:${soft};` : ""}">
            <div style="font-size:${cols >= 3 ? 5.8 : 7.6}vmin; font-weight:900; line-height:1; color:${i % 2 === 1 ? accent : "#111"}; letter-spacing:-0.03vmin;">${esc(clamp(m.value, 12))}</div>
            <div style="font-family:${FONT_SANS}; font-size:2vmin; color:rgba(0,0,0,0.6); font-weight:600; letter-spacing:0.06vmin;">${esc(clamp(m.label, 18))}</div>
          </div>`,
          )
          .join("")}
      </div>
      <div style="padding:2.4vmin 7vmin 3vmin; display:flex; justify-content:space-between; border-top:0.14vmin solid #E5E7EB;">
        <div class="footer">${esc(clamp(p.footer ?? "AI NEWS RADAR", 30))}</div>
        <div class="footer" style="color:${accent}; font-weight:700;">${esc(clamp(p.subtitle ?? "", 20))}</div>
      </div>
    </div>`
}

/** 生成整卡 HTML（导出供离线单测/预览调试） */
export function cardHtml(p: CardPlanItem, size: { width: number; height: number }): string {
  const family: CardFamily = p.family === "swiss" ? "swiss" : "editorial"
  const palette = getPalette(family, p.palette)
  const tpl = p.template
  const body =
    family === "editorial"
      ? tpl === "quote"
        ? editorialQuote(p, palette.accent, palette.soft)
        : tpl === "data"
          ? editorialData(p, palette.accent, palette.soft)
          : editorialCover(p, palette.accent, palette.soft)
      : tpl === "quote"
        ? swissQuote(p, palette.accent, palette.soft)
        : tpl === "data"
          ? swissData(p, palette.accent, palette.soft)
          : swissCover(p, palette.accent, palette.soft)
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><style>${baseCss(family, palette.accent, palette.soft)}</style></head><body>${body}</body></html>`
}

/** 渲染一张版式卡 → PNG Buffer（Playwright setContent 截图） */
export async function renderCardImage(
  p: CardPlanItem,
  size: { width: number; height: number },
): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true })
  try {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      deviceScaleFactor: 1,
    })
    const page = await context.newPage()
    await page.setContent(cardHtml(p, size), { waitUntil: "load", timeout: 30_000 })
    // 等字体就绪（本地 Noto 字体注册后才有正确衬线/黑体形态）
    await page.evaluate("document.fonts ? document.fonts.ready.then(() => true) : true")
    await page.waitForTimeout(120)
    const buf = await page.screenshot({ type: "png", fullPage: false })
    await context.close()
    if (!buf || buf.length < 5_000) throw new Error(`版式卡渲染结果过小（${buf?.length ?? 0}B）`)
    return buf
  } finally {
    await browser.close().catch(() => {})
  }
}

/** 渲染并落盘（文件名与生图线同规约：{slug}-{runId}.png） */
export async function renderCardToAsset(
  p: CardPlanItem,
  opts: { runId: string; slug: string; size: { width: number; height: number } },
): Promise<{ filePath: string; absPath: string; sizeBytes: number }> {
  await mkdir(ASSET_DIR, { recursive: true })
  const safeSlug = (opts.slug || "card").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "card"
  const fileName = `${safeSlug}-${opts.runId}.png`
  const absPath = path.join(ASSET_DIR, fileName)
  const buf = await renderCardImage(p, opts.size)
  await writeFile(absPath, buf)
  return { filePath: `/assets/${fileName}`, absPath, sizeBytes: buf.length }
}
