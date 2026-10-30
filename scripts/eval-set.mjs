// ============================================================
// eval-set.mjs —— 固定评测集运行器（P0 L5 度量层）
// 用法：bash scripts/with-server.sh "node scripts/eval-set.mjs --count 3"
//   --count N   跑前 N 题全量评测（默认 3；50 为全量）
//   --offset K  从第 K 题开始（默认 0）
//   --ids a,b,c 指定题号（如 m01,o03；优先于 count/offset）
//   --score-only runId1,runId2  只对已有 run 评分（不重跑管线）
// 流程：选题 → 九步流水线（等终态）→ G-Eval 五维评分 →
//   汇总（五维均分/门禁通过率/断言统计/字数）→ 报告落盘。
// 「先建度量，再动刀」：prompt 调优前后各跑一次，对比即回归。
// ============================================================

const BASE = "http://localhost:3000"

function parseArgs() {
  const out = { count: 3, offset: 0, ids: null, scoreOnly: null, pace: 75 }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--count") out.count = Math.max(1, Number(argv[i + 1]) || 3)
    if (argv[i] === "--offset") out.offset = Math.max(0, Number(argv[i + 1]) || 0)
    if (argv[i] === "--ids") out.ids = (argv[i + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean)
    if (argv[i] === "--score-only") out.scoreOnly = (argv[i + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean)
    if (argv[i] === "--pace") out.pace = Math.max(0, Number(argv[i + 1]) || 0)
  }
  return out
}

function ok(name, cond, extra = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
}

const DIM_LABELS = { accuracy: "准确", viewpoint: "观点", usefulness: "有用", voice: "合声", readability: "好读" }

async function waitRunDone(runId, timeoutMs = 12 * 60 * 1000) {
  const t0 = Date.now()
  for (;;) {
    if (Date.now() - t0 > timeoutMs) return { status: "timeout", run: null }
    const run = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json()).then((j) => j.run)
    if (run && (run.status === "done" || run.status === "error")) return { status: run.status, run }
    await new Promise((r) => setTimeout(r, 5000))
  }
}

async function scoreRun(runId) {
  const attempt = async () => {
    const res = await fetch(`${BASE}/api/eval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "score", runId }),
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error)
    return json.result
  }
  try {
    return await attempt()
  } catch (e) {
    // 429/瞬时限流：等一个窗口再试一次（评分单调用，代价小）
    if (/429|too many|timeout/i.test(String(e.message))) {
      console.log(`      ⏳ 评分撞限流，等 90s 重试…`)
      await new Promise((r) => setTimeout(r, 90_000))
      return attempt()
    }
    throw e
  }
}

async function main() {
  const args = parseArgs()
  console.log(`\n━━━ 固定评测集运行器（G-Eval 五维 · 目标均分 8.0）━━━`)

  const evalRes = await fetch(`${BASE}/api/eval`).then((r) => r.json())
  if (!evalRes.topics) {
    console.error("❌ 无法读取评测集题库（/api/eval）")
    process.exit(1)
  }
  const topics = evalRes.topics
  const meta = evalRes.meta
  ok(`题库 ${meta.total} 题 · ${meta.categories.length} 类`, meta.total === 50, meta.categories.map((c) => `${c.name}×${c.count}`).join(" "))

  const picked = args.scoreOnly ? [] : args.ids ? topics.filter((t) => args.ids.includes(t.id)) : topics.slice(args.offset, args.offset + args.count)
  if (!args.scoreOnly && picked.length === 0) {
    console.error("❌ 选题为空（检查 --ids / --offset / --count）")
    process.exit(1)
  }

  const results = []
  const failures = []
  const failedTopics = []

  const runTopic = async (topic) => {
    console.log(`\n▶ [${topic.id}] ${topic.title}（${topic.category} · ${topic.persona} · ${topic.theme}）`)
    const created = await fetch(`${BASE}/api/runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ideaTitle: topic.title, ideaAngle: topic.angle, persona: topic.persona, theme: topic.theme }),
    }).then((r) => r.json())
    if (!created.id) {
      failures.push({ topic: topic.id, stage: "create", error: created.error })
      ok(`创建 run`, false, String(created.error ?? "").slice(0, 60))
      return null
    }
    const { status, run } = await waitRunDone(created.id)
    if (status !== "done") {
      failures.push({ topic: topic.id, stage: "pipeline", error: run?.error ?? status })
      ok(`九步流水线终态`, false, `status=${status} err=${(run?.error ?? "").slice(0, 80)}`)
      return null
    }
    const steps = JSON.parse(run.steps || "[]")
    const stepSummary = steps.map((s) => `${s.name}:${s.status}`).join(" ")
    ok(`九步流水线 done（${steps.length} 步）`, steps.length === 9, stepSummary)
    return { topic, runId: created.id, run }
  }

  // ---------- 1. 跑流水线 ----------
  if (!args.scoreOnly) {
    for (let ti = 0; ti < picked.length; ti++) {
      const topic = picked[ti]
      // 节拍：管线连跑会撞用户级 10 分钟 30 次限流（每条管线≈14 次 LLM 调用），
      // 题间默认停 75s 摊开窗口（--pace 0 可关）
      if (ti > 0 && args.pace > 0) {
        console.log(`  ⏸ 节拍等待 ${args.pace}s（避开用户级限流窗口）…`)
        await new Promise((r) => setTimeout(r, args.pace * 1000))
      }
      const r = await runTopic(topic)
      if (r) results.push(r)
      else failedTopics.push(topic)
    }
    // 失败题二次重试（瞬时 429/解析抖动；等一个限流窗口）
    if (failedTopics.length > 0) {
      console.log(`\n⏸ ${failedTopics.length} 题失败，等 100s 后二次重试…`)
      await new Promise((r) => setTimeout(r, 100_000))
      const retry = []
      for (const topic of failedTopics) {
        const r = await runTopic(topic)
        if (r) results.push(r)
        else retry.push(topic)
      }
      if (retry.length > 0) console.log(`  ⚠️ 二次重试仍失败：${retry.map((t) => t.id).join("、")}（多为限流窗口，可稍后单独重跑）`)
    }
  } else {
    // score-only：直接挂既有 run
    for (const runId of args.scoreOnly) {
      const run = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json()).then((j) => j.run)
      if (!run || run.status !== "done") {
        failures.push({ topic: runId, stage: "score-only", error: `run 不可用（status=${run?.status ?? "null"}）` })
        continue
      }
      results.push({ topic: { id: "run", title: run.ideaTitle, category: "-", persona: run.persona, theme: run.theme }, runId, run })
    }
  }

  // ---------- 2. G-Eval 评分 ----------
  console.log(`\n━━━ G-Eval 五维评分（裁判跨家族优先）━━━`)
  const scored = []
  for (const r of results) {
    try {
      const s = await scoreRun(r.runId)
      scored.push({ ...r, score: s })
      const dims = Object.entries(s.scores).map(([k, v]) => `${DIM_LABELS[k] ?? k}${v}`).join("/")
      console.log(`  ▶ [${r.topic.id ?? r.runId.slice(0, 8)}] 均分 ${s.average}（${dims}）｜${s.judge.crossFamily ? "跨家族" : "同家族"}裁判${s.assertions ? `｜断言 ${s.assertions.verified}/${s.assertions.total}` : ""}${s.gate.pass ? "｜门禁 PASS" : "｜门禁 FAIL"}`)
      if (!s.gate.pass) s.gate.gaps.forEach((g) => console.log(`      ⚠️ ${g}`))
    } catch (e) {
      failures.push({ topic: r.topic.id, stage: "score", error: e.message })
      ok(`评分 [${r.topic.id ?? r.runId.slice(0, 8)}]`, false, e.message.slice(0, 80))
    }
  }

  // ---------- 3. 汇总与门禁 ----------
  console.log(`\n━━━ 汇总（${scored.length} 篇有效样本）━━━`)
  if (scored.length === 0) {
    console.log("  ❌ 无有效评分样本")
    process.exit(1)
  }
  const dimAvg = {}
  for (const d of Object.keys(scored[0].score.scores)) {
    dimAvg[d] = Math.round((scored.reduce((s, x) => s + x.score.scores[d], 0) / scored.length) * 10) / 10
  }
  const overall = Math.round((scored.reduce((s, x) => s + x.score.average, 0) / scored.length) * 10) / 10
  const gatePassRate = Math.round((scored.filter((x) => x.score.gate.pass).length / scored.length) * 100)
  const withAssertions = scored.filter((x) => x.score.assertions)
  const assertAvgRate = withAssertions.length
    ? Math.round((withAssertions.reduce((s, x) => s + (x.score.assertions.unsupportedRate ?? 0), 0) / withAssertions.length) * 1000) / 10
    : null
  const illusAvg = scored.filter((x) => x.score.illustrations)
  const illusRate = illusAvg.length ? Math.round((illusAvg.reduce((s, x) => s + (x.score.illustrations.inserted > 0 ? 1 : 0), 0) / illusAvg.length) * 100) : null
  const wordAvg = Math.round(scored.reduce((s, x) => s + x.score.wordCount, 0) / scored.length)
  const modeReal = scored.filter((x) => x.score.mode === "REAL").length

  ok(`五维均分 ${overall}（目标 ≥8.0）`, overall >= 8.0)
  for (const [d, v] of Object.entries(dimAvg)) {
    ok(`${DIM_LABELS[d] ?? d} ${v}（最低维 ≥7）`, v >= 7)
  }
  ok(`门禁通过率 ${gatePassRate}%`, gatePassRate >= 80)
  if (assertAvgRate !== null) ok(`断言无据率均值 ${assertAvgRate}%（≤30%）`, assertAvgRate <= 30)
  else console.log(`  · 断言核验：全样本跳过（搜索 DEMO 模式——配置密钥后启用）`)
  if (illusRate !== null) ok(`配图产出率 ${illusRate}%`, illusRate >= 90)
  console.log(`  · 样本：${scored.length} 篇｜平均 ${wordAvg} 字｜REAL 搜索 ${modeReal}/${scored.length}`)
  if (failures.length > 0) {
    console.log(`  · 失败 ${failures.length} 项：`)
    failures.forEach((f) => console.log(`      - ${f.topic} @${f.stage}: ${String(f.error).slice(0, 90)}`))
  }

  // ---------- 4. 报告落盘 ----------
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)
  const report = {
    at: new Date().toISOString(),
    sample: scored.length,
    target: 8.0,
    overall,
    dimAvg,
    gatePassRate,
    assertionUnsupportedRateAvg: assertAvgRate,
    illustrationRate: illusRate,
    wordAvg,
    modeReal,
    failures,
    items: scored.map((x) => ({
      topicId: x.topic.id,
      title: x.topic.title,
      category: x.topic.category,
      persona: x.topic.persona,
      runId: x.runId,
      mode: x.score.mode,
      wordCount: x.score.wordCount,
      version: x.score.version,
      average: x.score.average,
      scores: x.score.scores,
      comments: x.score.comments,
      judge: x.score.judge,
      assertions: x.score.assertions,
      illustrations: x.score.illustrations,
      reviewAverage: x.score.reviewAverage,
      gate: x.score.gate,
    })),
  }
  const fs = await import("fs")
  const path = `/home/z/my-project/download/eval-report-${ts}.json`
  fs.writeFileSync(path, JSON.stringify(report, null, 2))
  console.log(`\n报告已落盘：${path}`)
  console.log(`下一步：调优 prompt / 管线后重跑同题对比（同题同配置，评分可比）`)

  const hardFail = overall < 6.5 || failures.length > picked.length / 2
  process.exit(hardFail ? 1 : 0)
}

main().catch((e) => {
  console.error("运行器异常：", e)
  process.exit(1)
})
