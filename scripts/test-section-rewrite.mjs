// ============================================================
// test-section-rewrite.mjs —— 指着改图文（P1 p13）离线单测（零 LLM）
// 覆盖：splitMarkdownSections 分节 / normalizeSectionRewrite 归一化
//       （## 契约、防全文输出）/ sectionRewriteMessages 提示词结构
// 运行：node scripts/test-section-rewrite.mjs
// ============================================================
const { splitMarkdownSections, sectionRewriteMessages, normalizeSectionRewrite } = await import("../src/lib/runtime/skills/radar-rewrite.ts")

let pass = 0, fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

console.log("━━━ 指着改 · 离线单测 ━━━")

// ---------- splitMarkdownSections ----------
console.log("── splitMarkdownSections ──")
const MD = [
  "# 标题",
  "",
  "前言第一段。",
  "",
  "## 第一节",
  "",
  "内容 A [1]。",
  "",
  "## 第二节",
  "",
  "内容 B [2]。",
  "",
  "## 第三节",
  "",
  "内容 C。",
].join("\n")
const secs = splitMarkdownSections(MD)
ok("前言+3 节 → 4 段", secs.length === 4, `实际 ${secs.length}`)
ok("前言 heading 为空", secs[0].heading === "" && secs[0].text.includes("前言第一段") && secs[0].text.includes("# 标题"))
ok("节标题解析", secs[1].heading === "第一节" && secs[2].heading === "第二节" && secs[3].heading === "第三节")
ok("节文本含 ## 行", secs[1].text.startsWith("## 第一节"))
ok("index 连续", secs.every((s, i) => s.index === i))

const noH2 = "只有一段没有小节标题的文章。"
const s1 = splitMarkdownSections(noH2)
ok("无 ## → 单节整体", s1.length === 1 && s1[0].heading === "")

const onlyBlank = "# T\n\n\n\n## A\n\n\n"
const s2 = splitMarkdownSections(onlyBlank)
ok("空行不产生空节", s2.length === 2, `实际 ${s2.length}`)

const h3only = "### 三级不算分节\n正文"
ok("### 不切分（只按 ##）", splitMarkdownSections(h3only).length === 1)

// ---------- normalizeSectionRewrite ----------
console.log("── normalizeSectionRewrite ──")
const secA = { heading: "第一节", text: "## 第一节\n\n内容 A。" }
ok("健康输出直通", normalizeSectionRewrite("## 第一节\n\n内容 A 改。", secA).startsWith("## 第一节"))
ok("丢标题自动补回", normalizeSectionRewrite("内容 A 改写版。", secA) === "## 第一节\n\n内容 A 改写版。")
ok("代码围栏剥离", normalizeSectionRewrite("```markdown\n## 第一节\n\n改。\n```", secA).includes("## 第一节") && !normalizeSectionRewrite("```markdown\n## 第一节\n\n改。\n```", secA).includes("```"))
ok("客套行剥离", normalizeSectionRewrite("以下是改写后的内容：\n## 第一节\n\n改。", secA).startsWith("## 第一节"))
ok("无原标题节不补标题", normalizeSectionRewrite("前言改写。", { heading: "", text: "前言原文。" }) === "前言改写。")
const fullArticle = "## 第一节\n\nA\n\n## 第二节\n\nB\n\n## 第三节\n\nC"
ok("输出全文（3 个 ##）→ 拒绝返空", normalizeSectionRewrite(fullArticle, secA) === "")
ok("输出两个 ## 仍接受（标题+子结构边界内）", normalizeSectionRewrite("## 第一节\n\nA\n\n## 副标题\n\nB", secA).length > 0)
ok("空输入返空", normalizeSectionRewrite("", secA) === "")
ok("纯空白返空", normalizeSectionRewrite("   \n\n  ", secA) === "")

// ---------- sectionRewriteMessages ----------
console.log("── sectionRewriteMessages ──")
const msgs = sectionRewriteMessages({
  articleTitle: "测试文章",
  sectionIndex: 2,
  totalSections: 5,
  sectionHeading: "第三节",
  sectionText: "## 第三节\n\n本节原文内容 [3]。",
  prevDigest: "上一节摘要ABC",
  nextDigest: "下一节摘要XYZ",
  feedback: "压缩到 150 字，结论前置",
})
const sys = msgs[0].content
const usr = msgs[1].content
ok("两条消息（system+user）", msgs.length === 2 && msgs[0].role === "system" && msgs[1].role === "user")
ok("system 含铁律（优先级最高）", sys.includes("铁律") && sys.includes("优先级最高"))
ok("system 禁编造来源", sys.includes("禁止编造"))
ok("system 只输出本节", sys.includes("只输出本节"))
ok("system ## 开头契约", sys.includes("「## 」开头"))
ok("user 含节序号定位", usr.includes("3/5") && usr.includes("「第三节」"))
ok("user 含本节原文", usr.includes("本节原文") && usr.includes("本节原文内容 [3]。"))
ok("user 含前后节摘要", usr.includes("上一节摘要ABC") && usr.includes("下一节摘要XYZ"))
ok("user 含改稿意见（最高优先级）", usr.includes("最高优先级") && usr.includes("压缩到 150 字"))
const msgsNoFb = sectionRewriteMessages({ articleTitle: "t", sectionIndex: 0, totalSections: 3, sectionHeading: "", sectionText: "前言", prevDigest: "", nextDigest: "下", feedback: "" })
ok("空意见 → 默认改进指令", msgsNoFb[1].content.includes("提升表达密度"))
ok("首节标注开篇", msgsNoFb[1].content.includes("开篇前言"))

console.log("")
console.log(`━━━ 结果：${pass} 通过 / ${fail} 失败 ━━━`)
process.exit(fail === 0 ? 0 : 1)
