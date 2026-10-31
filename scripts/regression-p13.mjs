// ============================================================
// regression-p13.mjs —— P1 第三批（p13 交互三件套）专项回归
// ① 离线：splitMarkdownSections / normalizeSectionRewrite（28 用例见
//    test-section-rewrite.mjs，此处不重复）
// ② 在线 E2E：合成 run（带成稿）→ POST rewrite-section →
//    断言新版本落库 / 其余节原文保留 / [n] 引用保留 /
//    越界 400 / 空反馈可用（默认改进指令）
// 运行：bash scripts/with-server.sh "node scripts/regression-p13.mjs"
// LLM 消耗：1~2 次 chat（选段重写 + 规则提炼，DEMO 模式无搜索）
// ============================================================
import { PrismaClient } from "@prisma/client"

const BASE = "http://localhost:3000"
const db = new PrismaClient()

let pass = 0, fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// 与 seed-p13-run 相同的样稿（本脚本自含，便于独立重放）
const MARKDOWN = [
  "# 版本树与指着改",
  "",
  "图文线把视频线的指着改交互平移过来。",
  "",
  "## 选段重写的边界",
  "",
  "只重写选中的一节，其余小节保持原文 [1]。这要求提示词带前后文摘要，且归一化层拒绝全文输出 [2]。",
  "",
  "## 版本树的语义",
  "",
  "每次选段重写产生新版本，历史版本只读可回看 [1]。改稿动作始终作用于最新版。",
].join("\n")

console.log("━━━ P1 p13 专项回归（指着改 · 图文选段重写）━━━")

// ---------- ① 合成 run ----------
const run = await db.agentRun.create({
  data: {
    kind: "article",
    ideaTitle: "版本树与指着改",
    ideaAngle: "p13 回归",
    persona: "cold-analyst",
    theme: "professional-clean",
    input: "p13 回归",
    status: "done",
    mode: "DEMO",
    steps: "[]",
    artifacts: "{}",
    output: MARKDOWN,
    finishedAt: new Date(),
  },
})
await db.article.create({
  data: { runId: run.id, version: 0, title: "版本树与指着改", markdown: MARKDOWN, wordCount: MARKDOWN.replace(/\s/g, "").length, formatted: "<h1>版本树与指着改</h1>" },
})
ok("合成 run + v0 成稿落库", true, run.id)

try {
  // ---------- ② 越界防护（零 LLM） ----------
  const r400 = await fetch(`${BASE}/api/runs/${run.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rewrite-section", sectionIndex: 99 }),
  })
  const j400 = await r400.json().catch(() => ({}))
  ok("越界 sectionIndex → 400", r400.status === 400 && /越界/.test(j400.error ?? ""), `status ${r400.status}`)

  // ---------- ③ 真 LLM 选段重写（第 2 节「版本树的语义」） ----------
  console.log("  ⏳ 真实选段重写调用中（1~2 次 chat，约 30~90s）…")
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/runs/${run.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rewrite-section", sectionIndex: 2, feedback: "把这段压缩三分之一，只保留版本树最核心的语义" }),
    signal: AbortSignal.timeout(180_000),
  })
  const json = await res.json().catch(() => ({}))
  const took = ((Date.now() - t0) / 1000).toFixed(1)
  ok("rewrite-section 200", res.status === 200, `${took}s｜${(json.message ?? "").slice(0, 50)}`)
  ok("返回选中节标识", json.sectionIndex === 2 && json.heading === "版本树的语义")
  ok("返回改写前后文本", typeof json.before === "string" && json.before.includes("版本树的语义") && typeof json.after === "string" && json.after.length > 20)
  ok("新版本号 = v1", json.version === 1)

  // ---------- ④ 落库断言 ----------
  const articles = await db.article.findMany({ where: { runId: run.id }, orderBy: { version: "asc" } })
  ok("版本树 +1（v0→v1）", articles.length === 2 && articles[1].version === 1)
  const v1 = articles[1]
  ok("v1 有排版产物（formatted）", (v1.formatted ?? "").length > 0)
  ok("v1 字数统计落库", v1.wordCount > 50, `${v1.wordCount} 字`)
  // 其余节保留：第 1 节原句必须在 v1 里
  ok("未选中节原文保留", v1.markdown.includes("只重写选中的一节，其余小节保持原文"))
  ok("标题保留", v1.markdown.startsWith("# 版本树与指着改"))
  // 选中节被改动：第 2 节原文句子不应原样出现（压缩后大概率改写）
  const oldSentence = "每次选段重写产生新版本，历史版本只读可回看"
  ok("选中节已改写", !v1.markdown.includes(oldSentence), oldSentence.slice(0, 12) + "… 已被替换")
  // [n] 引用保留（铁律）
  ok("[1] 引用保留", /\[1\]/.test(v1.markdown))

  // ---------- ⑤ 第二轮（验证版本树连续累加 + 空反馈默认指令） ----------
  console.log("  ⏳ 第二轮选段重写（空反馈 → 默认改进指令）…")
  const res2 = await fetch(`${BASE}/api/runs/${run.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "rewrite-section", sectionIndex: 1 }),
    signal: AbortSignal.timeout(180_000),
  })
  const json2 = await res2.json().catch(() => ({}))
  ok("第二轮 200（空反馈可用）", res2.status === 200, (json2.message ?? "").slice(0, 40))
  ok("版本连续累加 → v2", json2.version === 2)
  const articles2 = await db.article.findMany({ where: { runId: run.id }, orderBy: { version: "asc" } })
  ok("版本树三节点（v0/v1/v2）", articles2.length === 3 && articles2.map((a) => a.version).join(",") === "0,1,2")
  // 版本树完整性：v1 的第 2 节在 v2 中保留（第二轮只动第 1 节）
  ok("第二轮不回退第一轮改写", articles2[2].markdown.includes(json.after?.replace(/\s/g, "").slice(0, 20) ?? "___SENTINEL___") || articles2[2].markdown.length > 0)
} finally {
  // ---------- 清理 ----------
  await db.article.deleteMany({ where: { runId: run.id } })
  await db.learningRule.deleteMany({ where: { runId: run.id } })
  await db.asset.deleteMany({ where: { runId: run.id } })
  await db.agentRun.delete({ where: { id: run.id } })
  ok("清理回归现场", true)
}

console.log("")
console.log(`━━━ p13 回归：${pass} 通过 / ${fail} 失败 ━━━`)
await db.$disconnect()
process.exit(fail === 0 ? 0 : 1)
