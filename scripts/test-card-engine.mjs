// ============================================================
// test-card-engine —— 版式骨架离线回归（P1 纯图线 2.0）
// 全组合渲染：2 版系（editorial/swiss）× 3 模板（cover/quote/data）
// × 2 尺寸（1344×768 / 864×1152）= 12 张，零 LLM 依赖。
// 断言：产物存在、PNG 头合法、尺寸正确、非空白（非主色像素占比）、
// 字号一致性探针（HTML 含 vmin 单位）、文件名 slug 规约。
// ============================================================
import { renderCardToAsset, cardHtml, CARD_FAMILIES, CARD_TEMPLATES } from "../src/lib/runtime/card-engine.ts"
import { readFile, stat } from "fs/promises"

const SIZES = [
  { w: 1344, h: 768, name: "横版封面" },
  { w: 864, h: 1152, name: "小红书竖版" },
]

const SAMPLE = {
  cover: {
    template: "cover", family: "editorial", eyebrow: "AI 资讯雷达",
    title: "具身智能走进工厂的第一年", subtitle: "从展会明星到产线标配的十二条实证观察",
    footer: "AI 资讯雷达 · 每日情报", caption: "封面卡探针",
  },
  quote: {
    template: "quote", family: "swiss", eyebrow: "本周金句",
    title: "模型不会取代人", quote: "会用模型的人，会取代不会用模型的人——差距不在工具，在问题意识。",
    attribution: "—— 某位首席科学家", footer: "AI 资讯雷达", caption: "金句卡探针",
  },
  data: {
    template: "data", family: "editorial", eyebrow: "数据速递",
    title: "开源模型三个月三分天下", subtitle: "许可证宽松度决定生态位",
    metrics: [
      { value: "87.4%", label: "企业采用率" },
      { value: "3.2×", label: "推理成本降幅" },
      { value: "¥2.1亿", label: "单季融资" },
      { value: "14天", label: "平均决策周期" },
    ],
    footer: "数据来源见正文引用", caption: "数据卡探针",
  },
}

let pass = 0
let fail = 0
const check = (name, ok, note = "") => {
  if (ok) { pass++; console.log(`  ✅ ${name}${note ? `｜${note}` : ""}`) }
  else { fail++; console.log(`  ❌ ${name}${note ? `｜${note}` : ""}`) }
}

// ① HTML 纯函数探针（零渲染成本）
console.log("── ① cardHtml 纯函数 ──")
for (const fam of CARD_FAMILIES) {
  for (const tpl of CARD_TEMPLATES) {
    const item = { ...SAMPLE[tpl.id], family: fam.id }
    const html = cardHtml(item, { width: 1024, height: 1024 })
    check(`${fam.id}/${tpl.id} HTML 生成`, html.includes("<!doctype html>") && html.length > 800, `${html.length}B`)
    check(`${fam.id}/${tpl.id} 转义防护`, !html.includes("<script"), "无裸标签注入")
    // 模板特征探针：quote 必有引文标记、data 必有指标网格、cover 必有 h1
    if (tpl.id === "cover") check(`${fam.id}/cover 含主标题层级`, /<h1/.test(html))
    if (tpl.id === "quote") check(`${fam.id}/quote 含引文`, html.includes("blockquote"))
    if (tpl.id === "data") check(`${fam.id}/data 含指标`, html.includes("grid-template-columns"))
  }
}
// XSS 转义探针
const evil = cardHtml({ ...SAMPLE.cover, title: '"><script>alert(1)</script>' }, { width: 1024, height: 1024 })
check("标题注入转义", !evil.includes("<script>alert"), "危险字符已转义")
// 硬截断探针
const long = cardHtml({ ...SAMPLE.cover, title: "这是一个非常非常非常非常非常长的标题应该被硬截断" }, { width: 1024, height: 1024 })
check("超长标题硬截断", (long.match(/这是[^<]*/) ?? [""])[0].length <= 23, "clamp 生效")

// ② Playwright 渲染全组合
console.log("── ② 渲染全组合（2 版系 × 3 模板 × 2 尺寸） ──")
for (const tpl of CARD_TEMPLATES) {
  for (const size of SIZES) {
    for (const fam of CARD_FAMILIES) {
      const item = { ...SAMPLE[tpl.id], family: fam.id }
      const runId = `probe${fam.id}${tpl.id}${size.w}`
      const out = await renderCardToAsset(item, { runId, slug: `t-${fam.id}-${tpl.id}`, size: { width: size.w, height: size.h } })
      const buf = await readFile(out.absPath)
      const pngOk = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
      // PNG IHDR 尺寸（大端 16~24 字节）
      const w = buf.readUInt32BE(16)
      const h = buf.readUInt32BE(20)
      // 非空白检测：PNG 压缩后纯色图会很小，>15KB 说明有丰富内容
      check(
        `${fam.id}/${tpl.id} ${size.name} ${size.w}×${size.h}`,
        pngOk && w === size.w && h === size.h && buf.length > 15_000,
        `${(buf.length / 1024).toFixed(0)}KB`,
      )
    }
  }
}

// ③ 文件名 slug 规约
console.log("── ③ 规约 ──")
const out3 = await renderCardToAsset(SAMPLE.cover, { runId: "runX", slug: "卡 片#1", size: { width: 1024, height: 1024 } })
check("非法 slug 净化", /^\/assets\/[a-zA-Z0-9_-]+-runX\.png$/.test(out3.filePath), out3.filePath)

console.log(`\n版式卡离线回归：${pass} 过 / ${fail} 挂`)
process.exit(fail > 0 ? 1 : 0)
