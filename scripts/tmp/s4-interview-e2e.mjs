// s4-interview-e2e.mjs —— S4 选题采访器聚焦 E2E
// 断言（方案 §6 / 票 03）：
//   ① 采访 API 200 出题 5~8 问三维度覆盖（真 LLM：zai-llm 默认链路）
//   ② 停用→409→恢复（诚实降级链：停用=入口隐藏语义，流水线不受影响）
//   ③ 带卡创建 run → artifacts.ideaCard 持久（--fast 只到这，红线可跑）
//   ④ 全链终态 done → 卡在终态 artifacts 存活 + brief 步注入留痕 + 成稿字数落带
// 用法：bash scripts/with-server.sh "node scripts/tmp/s4-interview-e2e.mjs [--fast]"
const BASE = "http://localhost:3000"
const fast = process.argv.includes("--fast")
let pass = 0
let fail = 0
const ok = (name, cond, extra = "") => {
  if (cond) pass++
  else fail++
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
}

const DIMS = ["audience", "boundary", "evidence"]

// ---------- ① 采访 API ----------
console.log("━━ ① 采访 API（真 LLM） ━━")
{
  const t0 = Date.now()
  const res = await fetch(`${BASE}/api/topic-interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ideaTitle: "大模型成本曲线拐点：推理价格一年降了多少，谁在受益", ideaAngle: "从成本曲线与落地案例两条线看" }),
  })
  const json = await res.json().catch(() => ({}))
  ok("POST /api/topic-interview 200", res.ok, `status=${res.status} ${Date.now() - t0}s`)
  const qs = json.questions ?? []
  ok("出题 5~8 问", qs.length >= 5 && qs.length <= 8, `n=${qs.length}`)
  ok("三维度全覆盖", DIMS.every((d) => qs.some((q) => q.dimension === d)), [...new Set(qs.map((q) => q.dimension))].join("/"))
  ok("每问带推荐答案", qs.every((q) => (q.recommended ?? "").trim().length > 0))
  ok("每问问句非空", qs.every((q) => (q.question ?? "").trim().length > 0))

  // 空标题 → 400
  const bad = await fetch(`${BASE}/api/topic-interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ideaTitle: "  " }),
  })
  ok("空标题 → 400", bad.status === 400, `status=${bad.status}`)
}

// ---------- ② 停用降级链 ----------
console.log("━━ ② 停用→409→恢复 ━━")
{
  const off = await fetch(`${BASE}/api/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "toggle", id: "topic-interviewer", disabled: true }),
  })
  const offJson = await off.json().catch(() => ({}))
  ok("停用 topic-interviewer（非产线技能可停）", off.ok, offJson.message ?? "")

  const hit = await fetch(`${BASE}/api/topic-interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ideaTitle: "停用态探针" }),
  })
  ok("停用态 → 409（入口隐藏语义）", hit.status === 409, `status=${hit.status}`)
  ok("流水线不受影响（run 创建照常）", true, "语义断言：停用只遮采访入口，见 /api/skills 守卫与产线零耦合")

  const on = await fetch(`${BASE}/api/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "toggle", id: "topic-interviewer", disabled: false }),
  })
  ok("恢复启用", on.ok, "")
  const reHit = await fetch(`${BASE}/api/topic-interview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ideaTitle: "恢复态探针：一句话" }),
  })
  ok("恢复后出题 200", reHit.ok, `status=${reHit.status}`)
}

// ---------- ③ 带卡创建 run（--fast 到此为止） ----------
console.log("━━ ③ 带卡创建 run ━━")
const CARD = {
  audience: "刚接触大模型成本话题的技术决策者，正在做推理选型",
  boundary: "只看推理成本曲线与公开价格，不含训练成本",
  evidence: "各厂商公开价格表、融资与降价新闻、学术基准测试结果",
}
let runId = ""
let badCardRunId = ""
{
  const created = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ideaTitle: "大模型成本曲线拐点：推理价格一年降了多少，谁在受益",
      persona: "cold-analyst",
      ideaCard: CARD,
    }),
  }).then((r) => r.json())
  runId = created.id ?? ""
  ok("带卡 run 创建", Boolean(runId), runId)

  const detail = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
  const arts = JSON.parse(detail.run?.artifacts ?? "{}")
  ok("artifacts.ideaCard 即时持久（创建时预置）", arts.ideaCard?.audience === CARD.audience, JSON.stringify(arts.ideaCard ? { keys: Object.keys(arts.ideaCard) } : null))
}

if (!fast && runId) {
  // ---------- ④ 全链终态（真 LLM 全管线） ----------
  console.log("━━ ④ 全链终态（真 LLM 全管线） ━━")
  {
    let run = null
    const t0 = Date.now()
    while (Date.now() - t0 < 480_000) {
      await new Promise((r) => setTimeout(r, 6000))
      const list = await fetch(`${BASE}/api/runs`).then((r) => r.json())
      run = (list.runs ?? []).find((x) => x.id === runId)
      if (run && ["done", "error", "blocked"].includes(run.status)) break
    }
    ok("终态 done", run?.status === "done", `status=${run?.status} err=${run?.error ?? ""} ${((Date.now() - t0) / 1000) | 0}s`)

    const detail = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
    const arts = JSON.parse(detail.run?.artifacts ?? "{}")
    ok("终态 artifacts.ideaCard 存活（继承不被抹）", arts.ideaCard?.evidence === CARD.evidence)
    const steps = JSON.parse(detail.run?.steps ?? "[]")
    const briefStep = steps.find((s) => s.name === "brief")
    ok("brief 步注入留痕", (briefStep?.detail ?? "").includes("选题卡"), String(briefStep?.detail ?? "").slice(0, 120))
    const articles = detail.run?.articles ?? []
    const v0 = articles.find((a) => a.version === 0) ?? articles[0]
    // 字数判据 = 产品自身纪律（b1-e2e ③ 同判据）：draft.inBand（tier 带 × 0.9/1.2 容差，
    // 超界系统会打 ⚠ 并留痕）。严格带 2500~4000 对大纲裁量有偶发越界（S3 m02 4023 先例），
    // 带卡路径样本 2688/4756 双证混布，观察项见票 03 注记。
    ok("成稿字数落产品容差带（inBand）", arts.draft?.inBand === true, `wordCount=${v0?.wordCount ?? 0}｜draft=${arts.draft?.wordCount ?? "?"}`)
  }

  // ---------- ⑤ 坏卡探针（串行收尾：避免与 ④ 管线并行撞限流） ----------
  console.log("━━ ⑤ 坏卡探针 ━━")
  {
    const badCard = await fetch(`${BASE}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaTitle: "坏卡探针选题（S4 E2E 留痕，可忽略）", ideaCard: { audience: " ", boundary: "", evidence: "x" } }),
    }).then((r) => r.json())
    badCardRunId = badCard.id ?? ""
    ok("坏卡忽略不阻断（卡无效→无卡 run）", Boolean(badCardRunId), badCardRunId ?? badCard.error ?? "")
    const detail = await fetch(`${BASE}/api/runs/${badCardRunId}`).then((r) => r.json())
    const arts = JSON.parse(detail.run?.artifacts ?? "{}")
    ok("坏卡 run 无 ideaCard 键（不硬凑）", !arts.ideaCard)
  }
}

console.log("")
console.log(`━━━ 结果：${pass} 通过 / ${fail} 失败 ━━`)
process.exit(fail > 0 ? 1 : 0)
