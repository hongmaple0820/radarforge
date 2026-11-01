// ============================================================
// eval50-reseed.mjs —— 沙箱回收后的 50 题基线断点回种（免 LLM 配额）
// 背景：/tmp/eval50-state.json 与 DB（eval-score Asset）都会被沙箱
//   回收清掉，但 reports/ 的报告进了 git 幸存——双落盘策略的兑现点。
// 本脚本把幸存报告重放成可续跑的状态文件：
//   · done ← 基线报告 rows（m01-m03 五维取 sweep 报告 v0 段，m04 自带）
//   · queue ← 50 题全集减去 done（缺五维的 m05 留队重跑，不凑合）
//   · 不落任何假 run/Asset——DB 保持干净，恢复的分数只活在状态文件
// 用法：node scripts/eval50-reseed.mjs [--force 覆盖已有状态]
// 之后：bash scripts/with-server.sh "node scripts/eval-step.mjs" 逐题续跑
// ============================================================
import { writeFileSync, readFileSync, existsSync } from "fs"

const STATE = "/tmp/eval50-state.json"
const FORCE = process.argv.includes("--force")
const BASELINE_REPORT = "reports/eval-baseline-50-2026-11-01.json"
const SWEEP_REPORT = "reports/tune-report-2026-11-01.json"

if (existsSync(STATE) && !FORCE) {
  console.log(`状态文件已存在（${STATE}）——不覆盖；如需重建加 --force`)
  process.exit(0)
}
if (!existsSync(BASELINE_REPORT)) {
  console.log(`未找到基线报告 ${BASELINE_REPORT}，无法回种`)
  process.exit(1)
}

const { EVAL_TOPICS } = await import("../src/lib/runtime/eval-topics.ts")
const report = JSON.parse(readFileSync(BASELINE_REPORT, "utf8"))

// m01-m03 的五维分数来自 sweep 报告的 v0 实跑段（同一题同一配置，合法复用）
const sweepScores = new Map()
if (existsSync(SWEEP_REPORT)) {
  const sweep = JSON.parse(readFileSync(SWEEP_REPORT, "utf8"))
  for (const run of sweep.variants?.find((v) => v.variant === "v0")?.runs ?? []) {
    if (run.scores) sweepScores.set(run.topicId, run.scores)
  }
}

const done = []
for (const row of report.rows ?? []) {
  if (!row.scores) continue // 缺五维的（如 m05）留队重跑，保证终版报告维度数据干净
  done.push({
    topicId: row.topicId,
    runId: "recovered",
    average: row.average,
    scores: row.scores,
    wordCount: row.wordCount ?? null,
  })
}
// m01-m03 从 sweep 补五维（报告行里没带 scores 的前提是 sweep 有）
for (const [topicId, scores] of sweepScores) {
  const row = report.rows?.find((r) => r.topicId === topicId)
  const already = done.find((d) => d.topicId === topicId)
  if (row && !already) {
    done.push({ topicId, runId: "recovered", average: row.average, scores, wordCount: row.wordCount ?? null })
  }
}
done.sort((a, b) => EVAL_TOPICS.findIndex((t) => t.id === a.topicId) - EVAL_TOPICS.findIndex((t) => t.id === b.topicId))

const doneIds = new Set(done.map((d) => d.topicId))
const queue = EVAL_TOPICS.filter((t) => !doneIds.has(t.id)).map((t) => ({ topicId: t.id, retryCount: 0 }))

const state = {
  queue,
  done,
  failed: [],
  variant: "v0",
  startedAt: report.startedAt ?? new Date().toISOString(),
  recoveredFrom: `${BASELINE_REPORT}（沙箱回收清了 /tmp 状态与 DB eval-score，报告进 git 幸存 → 本脚本回种；runId=recovered 标记历史来源）`,
}
writeFileSync(STATE, JSON.stringify(state, null, 2))

console.log(`━━━ eval50 回种完成 ━━━`)
console.log(`  已恢复 ${done.length} 题：${done.map((d) => `${d.topicId}(${d.average})`).join(" ")}`)
console.log(`  待续跑 ${queue.length} 题：${queue.map((q) => q.topicId).join(",")}`)
console.log(`  下一题：${queue[0]?.topicId ?? "（全空）"}｜续跑命令：bash scripts/with-server.sh "node scripts/eval-step.mjs"`)
if (done.length + queue.length !== 50) console.log(`  ⚠️ done+queue=${done.length + queue.length} ≠ 50，请核查报告 rows 与题库`)
process.exit(done.length + queue.length === 50 ? 0 : 1)
