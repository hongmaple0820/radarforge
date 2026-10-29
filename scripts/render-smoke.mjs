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
