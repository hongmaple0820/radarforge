// aihot-enhance-eval.mjs —— AIHOT 增强票 eval 抽样（aihot-access 05）
// 流程：m01 同题同配置（persona/theme 与评测集一致，无卡——S3 after 口径）
//   + 库内 AIHOT 条目 → brief 注入热点参考 → 全链 → /api/eval 评分。
// 对照：S3 after 基线 8.38（无卡 4 题均分）；验收宽门 ≥7.88（8.38-0.5）。
// 变量隔离：与 S3 口径唯一差异 = system 多了 {{aihot_block}} 热点参考帧（库有数据时注入）。
// 用法：bash scripts/with-server.sh "node scripts/tmp/aihot-enhance-eval.mjs"
const BASE = "http://localhost:3000"

const M01 = {
  title: "旗舰模型与轻量模型的差距正在拉大还是缩小",
  angle: "从推理成本与任务成功率两条曲线看分层定价背后的能力格局",
  persona: "cold-analyst",
  theme: "tech-modern",
}

console.log("━━ AIHOT 增强票 eval 抽样（m01 同题同配置 + 热点参考注入） ━━")
const created = await fetch(`${BASE}/api/runs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ideaTitle: M01.title,
    ideaAngle: M01.angle,
    persona: M01.persona,
    theme: M01.theme,
  }),
}).then((r) => r.json())
if (!created.id) {
  console.error("❌ run 创建失败", created.error ?? "")
  process.exit(1)
}
console.log(`  run=${created.id}`)

let run = null
const t0 = Date.now()
while (Date.now() - t0 < 480_000) {
  await new Promise((r) => setTimeout(r, 6000))
  run = await fetch(`${BASE}/api/runs/${created.id}`).then((r) => r.json()).then((j) => j.run)
  if (run && ["done", "error", "blocked"].includes(run.status)) break
}
if (run?.status !== "done") {
  console.error(`❌ 终态 ${run?.status}：${run?.error ?? ""}`)
  process.exit(1)
}
console.log(`  终态 done（${((Date.now() - t0) / 1000) | 0}s）`)

// 注入留痕（先于评分断言，失败即红——本票核心验收点）
const briefDetail = (JSON.parse(run.steps || "[]").find((s) => s.name === "brief") ?? {}).detail ?? ""
console.log(`  ${briefDetail.includes("AIHOT 热点已注入") ? "✅" : "❌"} brief 步热点注入留痕：${briefDetail.slice(0, 110)}`)
if (!briefDetail.includes("AIHOT 热点已注入")) process.exit(1)

// 成稿字数判据 = 产品自身纪律（draft.inBand：tier 带 × 0.9/1.2 容差）；
// 严格带对大纲裁量有偶发越界（S3 m02 4023 / S4 4756 / 本批 demo 5087 三证同族），
// eval 口径与 s4-card-eval 一致硬门：越界即红如实留痕（复跑定性）。
const arts = JSON.parse(run.artifacts || "{}")
const articles = run.articles ?? []
const v0 = articles.find((a) => a.version === 0) ?? articles[0]
const wc = v0?.wordCount ?? 0
console.log(`  ${arts.draft?.inBand === true ? "✅" : "❌"} 成稿字数落产品容差带（inBand）：wordCount=${wc}｜draft=${arts.draft?.wordCount ?? "?"}`)

const score = async (attempt = 1) => {
  const res = await fetch(`${BASE}/api/eval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "score", runId: created.id }),
  })
  const json = await res.json()
  if (!res.ok) {
    if (/429|too many|timeout/i.test(String(json.error)) && attempt < 3) {
      console.log(`  ⏳ 评分限流，等 90s 重试（第 ${attempt} 次）…`)
      await new Promise((r) => setTimeout(r, 90_000))
      return score(attempt + 1)
    }
    throw new Error(json.error)
  }
  return json.result
}

const s = await score()
const dims = Object.entries(s.scores).map(([k, v]) => `${k}${v}`).join("/")
console.log(`  均分 ${s.average}（${dims}）｜${s.judge.crossFamily ? "跨家族" : "同家族"}裁判${s.assertions ? `｜断言 ${s.assertions.verified}/${s.assertions.total}` : ""}${s.gate.pass ? "｜门禁 PASS" : "｜门禁 FAIL"}`)
if (!s.gate.pass) s.gate.gaps.forEach((g) => console.log(`    ⚠️ ${g}`))

const PASS_LINE = 7.88
console.log(`\n━━━ 结果：均分 ${s.average}（宽门 ≥${PASS_LINE}：${s.average >= PASS_LINE ? "PASS" : "FAIL"}）｜inBand=${arts.draft?.inBand === true} ━━━`)
process.exit(s.average >= PASS_LINE ? 0 : 1)
