// render-smoke.mjs —— 排版引擎 v2 冒烟测试（18 主题 × 容器语法 × 暗黑 × leaf）
// 用 tsx 直接跑 TS（devDependencies 已有 tsx）
const { execSync } = await import("child_process")

const code = `
import { renderWechatHtml, themeList, resolveThemeId, cjkLatinSpace } from "./src/lib/runtime/render"
import { WECHAT_THEMES } from "./src/lib/publish/themes"

const md = [
  "# 测试标题",
  "",
  "AI 搜索驱动的情报底座，2024 年融资 12 亿美元。",
  "",
  ":::callout warning",
  "这是警示内容，支持 **加粗** 和 \`code\`。",
  ":::",
  "",
  "## 第二章",
  "",
  "- 列表项一",
  "- 列表项二",
  "",
  "1. 有序一",
  "2. 有序二",
  "",
  ":::timeline",
  "**2024 Q1** 立项启动",
  "**2024 Q3** MVP 上线",
  ":::",
  "",
  ":::steps",
  "第一步：搜索取证",
  "第二步：人格初稿",
  ":::",
  "",
  "> 引用块一行",
  "> 引用块两行",
  "",
  "\`\`\`python",
  "print('hello')",
  "\`\`\`",
  "",
  "| 列A | 列B |",
  "| --- | --- |",
  "| 1 | 2 |",
  "",
  ":::quote",
  "好的排版让读者忘记设计。",
  ":::",
  "",
  ":::pullquote",
  "证据驱动，每条主张可溯源。",
  ":::",
  "",
  ":::highlight",
  "关键要点",
  "这里是正文说明。",
  ":::",
  "",
  ":::summary",
  "总结",
  "全文核心判断一句话。",
  ":::",
  "",
  ":::label pill",
  "标签药丸",
  ":::",
  "",
  ":::dialogue",
  "这个功能怎么用？",
  "> 很简单，直接写就行。",
  ":::",
  "",
  "外链 [示例](https://example.com) 与脚注 [1]。",
].join("\\n")

const claims = [{ idx: 1, sourceSite: "36Kr", sourceTitle: "测试来源文章标题", sourceDate: "2026-10-01", sourceUrl: "https://example.com" }]

let failures = []
for (const t of WECHAT_THEMES) {
  const html = renderWechatHtml(md, claims, { theme: t.name, title: "冒烟测试", wordCount: 1234 })
  const checks = {
    root: html.includes("<section"),
    leaf: html.includes('<span leaf="">'),
    refs: html.includes("参考来源"),
    aigc: t.aigcFooter ? html.includes("AI 辅助") : true,
    callout: html.includes("border-left:4px solid"),
    timeline: html.includes("border-radius:50%"),
    steps: html.includes("22px"),
    quote: html.includes("font-style:italic"),
    pullquote: html.includes("text-align:center"),
    dialogue: html.includes("justify-content:flex-end"),
    code: html.includes("pre-wrap"),
    table: html.includes("<table"),
    list: html.includes("flex;align-items:flex-start"),
    darkmode: Object.keys(t.darkmode ?? {}).length > 0 ? html.includes("data-darkmode-") : true,
    noDiv: !html.includes("<div"),
    noClass: !html.includes('class='),
  }
  const bad = Object.entries(checks).filter(([, v]) => !v).map(([k]) => k)
  if (bad.length) failures.push(t.name + ": " + bad.join(","))
  if (t.name === "professional-clean" || t.name === "midnight") {
    console.log(t.name, "len=" + html.length, "leaf-count=" + (html.match(/<span leaf="">/g) || []).length)
  }
}

// 旧主题兼容
const legacy = resolveThemeId("radar")
if (legacy !== "professional-clean") failures.push("legacy radar -> " + legacy)
if (resolveThemeId("nonexistent") !== "professional-clean") failures.push("fallback failed")
if (resolveThemeId("sspai") !== "sspai") failures.push("sspai failed")

// ---- S4 引用留痕：引用一致性（citation-provenance） ----
// 编号空间：claims 上标 [1..N] 原编号保留；md 链接上标从 N+1 起——
// 正文链接 sup 编号必须与脚注区 allRefs 编号一致（现状错位=正文 [1] 被读者
// 误读为 claims[1]，脚注区却在 [N+1] 位置）。paste-safe 后 sup 内容为
// <span leaf="">[n]</span>——断言按实际形态钉。
const mdLink = "外链 [示例](https://example.com) 与脚注 [2]。"
const claimsLink = [
  { idx: 1, sourceSite: "A站", sourceTitle: "来源一", sourceDate: "2026-10-01", sourceUrl: "https://a.example" },
  { idx: 2, sourceSite: "B站", sourceTitle: "来源二", sourceDate: "2026-10-02", sourceUrl: "https://b.example" },
]
const htmlLink = renderWechatHtml(mdLink, claimsLink, { theme: "professional-clean", title: "一致性", wordCount: 10 })
// paste-safe 会给脚注区也包 leaf span——正文判据必须切到「参考来源」标题之前
const bodyPart = htmlLink.slice(0, htmlLink.indexOf("参考来源</span>"))
if (!bodyPart.includes('<span leaf="">[3]</span>')) failures.push("link-sup: 正文链接上标应为 [3]（claims.length=2 偏移+1）——错位修复未生效")
if (!htmlLink.includes("https://example.com")) failures.push("link-refs: 脚注区含外链 label")
if (!bodyPart.includes('<span leaf="">[2]</span>')) failures.push("claim-sup: claims 上标 [2] 保留原编号")
// IN1：空 claims 且无 md 链接 → 不出现参考来源区（不新增 DOM，字节级不变路径）
const htmlNoRefs = renderWechatHtml("一句普通稿。", [], { theme: "professional-clean", title: "空", wordCount: 5 })
if (htmlNoRefs.includes("参考来源</span>")) failures.push("IN1: 空 claims 无链接时不出现参考来源区（AIGC 声明含『参考来源核对』字样——以标题闭合形态为判据）")
// IN1b：空 claims 时 md 链接上标回落 [1]（claimsCount=0 偏移归零，与旧版一致）
const htmlEmpty = renderWechatHtml("一句[链接](https://example.com)的稿。", [], { theme: "professional-clean", title: "空", wordCount: 5 })
if (!htmlEmpty.includes('<span leaf="">[1]</span>')) failures.push("IN1: 空 claims 时链接上标回落 [1]（旧版字节一致）")

console.log("themes:", themeList().length, "categories:", new Set(themeList().map((t) => t.category)).size)
console.log("CJK space:", JSON.stringify(cjkLatinSpace("中文English混排2024年")))

if (failures.length) {
  console.log("FAILURES:\\n" + failures.join("\\n"))
  process.exit(1)
}
console.log("ALL THEMES PASS ✓")
`

await import("fs").then((fs) => fs.writeFileSync("/home/z/my-project/.render-smoke.ts", code))
try {
  execSync("npx tsx /home/z/my-project/.render-smoke.ts", { cwd: "/home/z/my-project", stdio: "inherit" })
} finally {
  await import("fs").then((fs) => fs.unlinkSync("/home/z/my-project/.render-smoke.ts"))
}
