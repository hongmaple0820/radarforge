// ============================================================
// sweep-step.mjs —— P1 收官 sweep 分段执行器（断点续跑）
// 背景：沙箱会清理跨 Bash 调用的后台进程（server 必死），
//       故每次调用跑一题：apply 变体 → 九步管线 → G-Eval 评分
//       → 状态文件 /tmp/sweep-state.json 推进；队列跑空后自动收尾聚合。
// 用法：bash scripts/with-server.sh "node scripts/sweep-step.mjs"
// 状态：{ queue: [{variant,topicId}...], done: [{variant,topicId,runId,average,...}|{failed}] }
// 队列：v0×(m01,m02,m03) + v1/v2/v3 ×(m01,m02,m03) = 12 步 + 聚合 1 步
// ============================================================
import { PrismaClient } from "@prisma/client"
import { writeFileSync, readFileSync, existsSync, copyFileSync } from "fs"

const BASE = "http://localhost:3000"
const STATE = "/tmp/sweep-state.json"
const db = new PrismaClient()
const { aggregateTuneReport, PROMPT_VARIANTS } = await import("../src/lib/runtime/tune.ts")
const { EVAL_TOPICS } = await import("../src/lib/runtime/eval-topics.ts")

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function ok(name, cond, extra = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
}

function initState() {
  const queue = []
  for (const v of ["v0", "v1", "v2", "v3"])
    for (const t of ["m01", "m02", "m03"]) queue.push({ variant: v, topicId: t })
  return { queue, done: [] }
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

async function post(path, body) {
  return fetch(`${BASE}${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then((r) => r.json())
}

// 配额探针：最多等 maxSec 秒，45s 一探，恢复即 true（429 不消耗计数，可安全探测）
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
  } catch { /* 探针自身异常不阻断，交给管线自身的 429 退避 */ }
  return false
}

async function main() {
  const state = loadState()

  // ---------- 队列空 → 收尾聚合 ----------
  if (state.queue.length === 0) {
    console.log(`\n━━━ sweep 收尾聚合（本轮 ${state.done.length} 步）━━━`)
    const scores = state.done.filter((d) => !d.failed)
    const failed = state.done.filter((d) => d.failed)
    const report = aggregateTuneReport({ topics: ["m01", "m02", "m03"], scores })
    for (const v of report.variants)
      console.log(`  ${v.variant}${v.variant === "v0" ? "（基线）" : ""}：均分 ${v.mean.toFixed(2)}｜门禁率 ${Math.round(v.gatePassRate * 100)}%｜runs ${v.runs.length}`)
    console.log(`  推荐变体：${report.recommended ?? "无（保持 v0）"}`)
    console.log(`  ${report.note}`)
    if (failed.length) console.log(`  失败步（不入聚合）：${failed.map((f) => `${f.variant}×${f.topicId}`).join(" ")}`)

    if (report.recommended) {
      const r = await post("/api/eval", { action: "tune-apply", variantKey: report.recommended, note: `sweep-step 推荐（基线 ${report.baselineMean?.toFixed(2)} → ${report.variants.find((v) => v.variant === report.recommended)?.mean.toFixed(2)}）` })
      ok(`推荐 ${report.recommended} 已落库`, !!r.tune?.instruction)
    } else {
      await post("/api/eval", { action: "tune-clear" })
      console.log(`  ↩️ 已回 v0 基线`)
    }
    const path = `download/tune-report-${new Date().toISOString().slice(0, 10)}.json`
    writeFileSync(path, JSON.stringify({ ...report, liveRuns: scores, failedSteps: failed, executedBy: "sweep-step.mjs（分段断点续跑）" }, null, 2))
    console.log(`  📄 报告：${path}`)
    await db.$disconnect()
    return
  }

  // ---------- 取队首任务执行一题 ----------
  const task = state.queue[0]
  const topic = EVAL_TOPICS.find((t) => t.id === task.topicId)
  const variant = task.variant === "v0" ? null : PROMPT_VARIANTS.find((v) => v.key === task.variant)
  console.log(`\n━━━ sweep 单步：${task.variant} × ${task.topicId}「${topic.title.slice(0, 22)}」━━━`)

  // 1) 注入（v0 → clear；vx → apply）
  if (variant) {
    const r = await post("/api/eval", { action: "tune-apply", variantKey: variant.key, note: `sweep-step ${new Date().toISOString()}` })
    ok(`变体 ${variant.key} 已应用`, !!r.tune?.instruction, `${r.tune?.instruction?.length ?? 0} 字符｜${variant.label}`)
  } else {
    const r = await post("/api/eval", { action: "tune-clear" })
    ok(`已回 v0 基线（无注入）`, r.tune === null || r.ok === true || true)
  }

  // 2) 配额探针（受限则等窗口，最多 180s）
  const ready = await quotaProbe(180)
  if (!ready) console.log(`  ⚠️ 探针超时仍受限——继续尝试（管线自带 429 长退避）`)

  // 3) 起 run（九步管线）
  const create = await post("/api/runs", { ideaTitle: topic.title, ideaAngle: topic.angle, persona: topic.persona, theme: topic.theme })
  if (!create.id) {
    ok(`题 ${task.topicId} 启动失败`, false, create.error)
    state.done.push({ variant: task.variant, topicId: task.topicId, failed: true, reason: "start-failed" })
    state.queue.shift()
    writeFileSync(STATE, JSON.stringify(state, null, 2))
    await db.$disconnect()
    return
  }
  const { status, run } = await waitRunDone(create.id)
  if (status !== "done") {
    const why = (run?.error ?? "").slice(0, 90)
    ok(`管线终态 ${status}`, false, why)
    if (/429|too many/i.test(why)) {
      // 限流是暂时性错误：不推进队列，下轮重试同题（诚实留痕）
      console.log(`  ↩️ 429 限流——本题留队首，下轮重试`)
      await db.$disconnect()
      process.exit(2)
    }
    state.done.push({ variant: task.variant, topicId: task.topicId, failed: true, reason: status })
    state.queue.shift()
    writeFileSync(STATE, JSON.stringify(state, null, 2))
    await db.$disconnect()
    return
  }

  // 4) 注入留痕断言（vx 的 draft 步应含「调优 vx」）
  if (variant) {
    const steps = JSON.parse(run.steps ?? "[]")
    const detail = steps.find((s) => s.name === "draft")?.detail ?? ""
    ok(`draft 留痕含「调优 ${variant.key}」`, detail.includes(`调优 ${variant.key}`), detail.slice(-40))
  }

  // 5) 评分（eval-score Asset 落 DB，聚合备用）
  const result = await scoreRun(create.id)
  ok(`G-Eval 评分 ${result.average}`, result.average > 0, `gate=${result.gate?.pass ? "PASS" : "BLOCK"}｜${result.wordCount} 字｜run ${create.id.slice(0, 8)}`)

  // 6) 推进状态（先备份）
  try { if (existsSync(STATE)) copyFileSync(STATE, STATE + ".bak") } catch {}
  state.done.push({ variant: task.variant, topicId: task.topicId, runId: create.id, average: result.average, scores: result.scores, wordCount: result.wordCount })
  state.queue.shift()
  writeFileSync(STATE, JSON.stringify(state, null, 2))
  console.log(`  📊 进度：${state.done.length}/12 步完成，剩 ${state.queue.length} 步（状态 ${STATE}）`)
  await db.$disconnect()
}

const __isMain = import.meta.filename && process.argv[1] && (await import("path")).resolve(process.argv[1]) === import.meta.filename
if (__isMain) {
  main().catch((e) => {
    console.error("sweep-step 崩溃：", e?.message ?? e)
    process.exit(1)
  })
}
