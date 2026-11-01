// ============================================================
// eval-step.mjs —— 50 题全量基线分段执行器（v0 · 断点续跑）
// 模式学 sweep-step.mjs（沙箱杀后台进程 → 按 Bash 调用边界切片）：
//   每次调用跑一题：tune-clear（v0 基线）→ 九步管线 → G-Eval 评分
//   → 状态 /tmp/eval50-state.json 推进；队列空自动收尾汇总。
// 持久双保险：评分同时落 DB（eval-score Asset），状态文件丢了
//   也可用 --summary 从 DB 全量重聚合。
// 用法：
//   bash scripts/with-server.sh "node scripts/eval-step.mjs"          # 逐题推进
//   bash scripts/with-server.sh "node scripts/eval-step.mjs --summary" # 仅从 DB 聚合出报告
// 429 → 留队首下轮重试；其他失败 → retryCount<2 留队，≥2 标 failed 消费
// ============================================================
import { PrismaClient } from "@prisma/client"
import { writeFileSync, readFileSync, existsSync, copyFileSync, mkdirSync } from "fs"

const BASE = "http://localhost:3000"
const STATE = "/tmp/eval50-state.json"
const db = new PrismaClient()
const { EVAL_TOPICS } = await import("../src/lib/runtime/eval-topics.ts")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function ok(name, cond, extra = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
}

function initState() {
  return {
    queue: EVAL_TOPICS.map((t) => ({ topicId: t.id, retryCount: 0 })),
    done: [],
    failed: [],
    variant: "v0",
    startedAt: new Date().toISOString(),
  }
}
function loadState() {
  if (!existsSync(STATE)) return initState()
  try {
    return JSON.parse(readFileSync(STATE, "utf8"))
  } catch {
    return initState()
  }
}
export { initState, loadState, STATE }

async function post(path, body) {
  return fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json())
}

// 配额探针：最多等 maxSec 秒，45s 一探（429 探测不消耗计数）
async function quotaProbe(maxSec = 180) {
  try {
    const { default: ZAI } = await import("z-ai-web-dev-sdk")
    const zai = await ZAI.create()
    const t0 = Date.now()
    while (Date.now() - t0 < maxSec * 1000) {
      try {
        const r = await zai.chat.completions.create({ messages: [{ role: "user", content: "回复两个字：正常" }], stream: false, thinking: { type: "disabled" }, temperature: 0 })
        if (r?.choices?.[0]?.message?.content) return true
      } catch { /* still limited */ }
      console.log(`      ⏳ 配额受限，45s 后再探（已等 ${Math.round((Date.now() - t0) / 1000)}s）…`)
      await sleep(45_000)
    }
  } catch { /* 探针自身异常不阻断 */ }
  return false
}

async function waitRunDone(runId, timeoutMs = 330_000) {
  const t0 = Date.now()
  for (;;) {
    if (Date.now() - t0 > timeoutMs) return { status: "timeout", run: null }
    try {
      const run = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json()).then((j) => j.run)
      if (run && (run.status === "done" || run.status === "error")) return { status: run.status, run }
    } catch { /* server 瞬时抖动 */ }
    await sleep(5000)
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
    if (/429|too many|timeout/i.test(String(e.message))) {
      console.log(`      ⏳ 评分撞限流，等 60s 重试…`)
      await sleep(60_000)
      return attempt()
    }
    throw e
  }
}

// ---------- 收尾：从状态 + DB 双源聚合 ----------
async function summarize(state) {
  // DB 源：今日基线跑批的 eval-score Asset（抗状态文件丢失）
  const assets = await db.asset.findMany({ where: { role: "eval-score" }, orderBy: { createdAt: "asc" } })
  const byTitle = new Map()
  for (const a of assets) {
    const run = await db.agentRun.findUnique({ where: { id: a.runId }, select: { ideaTitle: true, createdAt: true } })
    if (!run) continue
    const topic = EVAL_TOPICS.find((t) => t.title === run.ideaTitle)
    if (!topic) continue
    // 每题取最新一条（基线/调优多轮后以最新为准）
    byTitle.set(topic.id, { topic, meta: JSON.parse(a.meta || "{}"), runId: a.runId, at: a.createdAt })
  }
  const stateById = new Map(state.done.map((d) => [d.topicId, d]))
  const rows = []
  for (const t of EVAL_TOPICS) {
    const s = stateById.get(t.id)
    const dbRow = byTitle.get(t.id)
    if (s) rows.push({ topicId: t.id, category: t.category, average: s.average, scores: s.scores, wordCount: s.wordCount, source: "state" })
    else if (dbRow) rows.push({ topicId: t.id, category: t.category, average: dbRow.meta.average, scores: dbRow.meta.scores, wordCount: dbRow.meta.wordCount, source: "db" })
  }

  const n = rows.length
  console.log(`\n━━━ 50 题全量基线汇总（v0 · 完成度 ${n}/50）━━━`)
  if (n === 0) {
    console.log("  （无数据——先逐题推进）")
    return
  }
  const dimAgg = {}
  for (const r of rows) for (const [k, v] of Object.entries(r.scores ?? {})) (dimAgg[k] = dimAgg[k] || []).push(v)
  const mean = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length
  const overall = mean(rows.map((r) => r.average))
  const gatePass = rows.filter((r) => r.average >= 8).length

  console.log(`  总均分 ${overall.toFixed(2)}｜≥8.0 门禁 ${gatePass}/${n}（${Math.round((gatePass / n) * 100)}%）｜字数中位 ${Math.round(rows.map((r) => r.wordCount).sort((a, b) => a - b)[Math.floor(n / 2)])}`)
  console.log(`  五维：${Object.entries(dimAgg).map(([k, arr]) => `${k} ${mean(arr).toFixed(2)}`).join("｜")}`)
  // 分类分组
  const cats = {}
  for (const r of rows) (cats[r.category] = cats[r.category] || []).push(r.average)
  console.log(`  分类均分：`)
  for (const [c, arr] of Object.entries(cats)) console.log(`    ${c}：${mean(arr).toFixed(2)}（${arr.length} 题）`)
  // 状态源 vs DB 源
  console.log(`  数据源：state ${rows.filter((r) => r.source === "state").length} / db ${rows.filter((r) => r.source === "db").length}｜失败 ${state.failed.length}：${state.failed.map((f) => f.topicId).join(" ") || "无"}`)

  const payload = JSON.stringify({
    variant: "v0", completed: n, total: 50, overallMean: +overall.toFixed(3), gatePass, gateRate: +(gatePass / n).toFixed(3),
    dimensions: Object.fromEntries(Object.entries(dimAgg).map(([k, arr]) => [k, +mean(arr).toFixed(3)])),
    categories: Object.fromEntries(Object.entries(cats).map(([c, arr]) => [c, +mean(arr).toFixed(3)])),
    rows, failed: state.failed, startedAt: state.startedAt, generatedAt: new Date().toISOString(),
  }, null, 2)
  const path = `download/eval-baseline-50-${new Date().toISOString().slice(0, 10)}.json`
  writeFileSync(path, payload)
  // 双落盘：reports/ 进 git（抗沙箱回滚），download/ 给用户
  try { mkdirSync("reports", { recursive: true }); writeFileSync(`reports/eval-baseline-50-${new Date().toISOString().slice(0, 10)}.json`, payload) } catch {}
  console.log(`  📄 报告：${path}（副本 reports/，git 跟踪）`)
}

// ---------- 单步 ----------
async function step(state) {
  const task = state.queue[0]
  const topic = EVAL_TOPICS.find((t) => t.id === task.topicId)
  console.log(`\n━━━ eval50 单步：${task.topicId}「${topic.title.slice(0, 22)}」（retry ${task.retryCount}）━━━`)

  // 1) 保证 v0 基线（清注入）
  await post("/api/eval", { action: "tune-clear" })
  ok("已确保 v0 基线（无注入）", true)

  // 2) 配额探针
  const ready = await quotaProbe(180)
  if (!ready) console.log(`  ⚠️ 探针超时仍受限——继续尝试`)

  // 3) 起 run
  const create = await post("/api/runs", { ideaTitle: topic.title, ideaAngle: topic.angle, persona: topic.persona, theme: topic.theme })
  if (!create.id) {
    ok("启动失败", false, create.error)
    task.retryCount += 1
    if (task.retryCount >= 2) { state.failed.push({ topicId: task.topicId, reason: "start-failed" }); state.queue.shift() }
    writeFileSync(STATE, JSON.stringify(state, null, 2))
    return
  }
  const { status, run } = await waitRunDone(create.id)
  if (status !== "done") {
    const why = (run?.error ?? "").slice(0, 90)
    ok(`管线终态 ${status}`, false, why)
    if (/429|too many/i.test(why)) {
      console.log(`  ↩️ 429 限流——留队首下轮重试`)
      process.exit(2)
    }
    task.retryCount += 1
    if (task.retryCount >= 2) { state.failed.push({ topicId: task.topicId, reason: why || status }); state.queue.shift() } else console.log(`  ↩️ 偶发失败——留队重试 1 次`)
    writeFileSync(STATE, JSON.stringify(state, null, 2))
    return
  }
  const steps = JSON.parse(run.steps ?? "[]")
  ok("九步 done", steps.length === 9, `${steps.length} 步`)

  // 4) 评分（落 DB eval-score Asset）
  const result = await scoreRun(create.id)
  ok(`G-Eval ${result.average}`, result.average > 0, `gate=${result.gate?.pass ? "PASS" : "BLOCK"}｜${result.wordCount} 字｜run ${create.id.slice(0, 8)}`)

  // 5) 推进
  try { if (existsSync(STATE)) copyFileSync(STATE, STATE + ".bak") } catch {}
  state.done.push({ topicId: task.topicId, runId: create.id, average: result.average, scores: result.scores, wordCount: result.wordCount })
  state.queue.shift()
  writeFileSync(STATE, JSON.stringify(state, null, 2))
  const total = state.done.length + state.failed.length
  console.log(`  📊 进度：${total}/50（成功 ${state.done.length}｜失败 ${state.failed.length}）`)
}

const __isMain = import.meta.filename && process.argv[1] && (await import("path")).resolve(process.argv[1]) === import.meta.filename
if (__isMain) {
  const summaryOnly = process.argv.includes("--summary")
  const state = loadState()
  if (summaryOnly || state.queue.length === 0) {
    await summarize(state)
  } else {
    await step(state)
  }
  await db.$disconnect()
}
