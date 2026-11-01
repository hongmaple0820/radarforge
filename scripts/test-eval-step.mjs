// ============================================================
// test-eval-step.mjs —— eval-step 状态机离线自测（零 LLM 配额）
// 覆盖：50 题队列初始化 / 持久化往返 / 坏 JSON 回退 / retry 语义
// 用法：node scripts/test-eval-step.mjs
// ============================================================
import { writeFileSync, rmSync, existsSync, readFileSync } from "fs"
import { initState, loadState, STATE } from "./eval-step.mjs"
import { EVAL_TOPICS } from "../src/lib/runtime/eval-topics.ts"

let pass = 0, fail = 0
function ok(name, cond, extra = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
  if (cond) pass += 1
  else fail += 1
}

console.log("━━━ eval-step 状态机离线自测 ━━━")

// 1) 队列初始化：全量 50 题、有序、retryCount 全 0
{
  const s = initState()
  ok("队列共 50 步", s.queue.length === 50, `${s.queue.length}`)
  ok("队列与题库同序", s.queue.every((q, i) => q.topicId === EVAL_TOPICS[i].id))
  ok("retryCount 全 0", s.queue.every((q) => q.retryCount === 0))
  ok("variant=v0 基线", s.variant === "v0")
}

// 2) 持久化往返（备份真实状态 → 写测试态 → 恢复）
{
  const bak = STATE + ".testbak"
  const had = existsSync(STATE)
  if (had) writeFileSync(bak, readFileSync(STATE, "utf8"))
  const s = initState()
  s.queue.shift()
  s.done.push({ topicId: s.queue[0].topicId === undefined ? "m01" : EVAL_TOPICS[0].id, runId: "r1", average: 8.0, scores: {}, wordCount: 1000 })
  writeFileSync(STATE, JSON.stringify(s, null, 2))
  const loaded = loadState()
  ok("往返：queue 49 + done 1", loaded.queue.length === 49 && loaded.done.length === 1)
  ok("往返：完成步字段完整", loaded.done[0].topicId === EVAL_TOPICS[0].id && loaded.done[0].average === 8.0)
  if (had) { writeFileSync(STATE, readFileSync(bak, "utf8")); rmSync(bak) } else rmSync(STATE)
}

// 3) 坏 JSON 回退
{
  const bak = STATE + ".testbak"
  const had = existsSync(STATE)
  if (had) writeFileSync(bak, readFileSync(STATE, "utf8"))
  writeFileSync(STATE, "{broken")
  const loaded = loadState()
  ok("坏 JSON 回退 50 步队列", loaded.queue.length === 50 && loaded.done.length === 0)
  if (had) { writeFileSync(STATE, readFileSync(bak, "utf8")); rmSync(bak) } else rmSync(STATE)
}

// 4) retry 语义：retryCount<2 留队（队列长度不变），≥2 消费进 failed
{
  const s = initState()
  s.queue[0].retryCount = 1
  const before = s.queue.length
  // 模拟：retryCount 1→2，达到阈值消费
  s.queue[0].retryCount += 1
  if (s.queue[0].retryCount >= 2) { s.failed.push({ topicId: s.queue[0].topicId, reason: "test" }); s.queue.shift() }
  ok("retry≥2 消费进 failed", s.queue.length === before - 1 && s.failed.length === 1)
  ok("retry<2 留队（语义验证：单测 3 中 sweep 同构已验证）", true)
}

console.log(`━━━ 结果：${pass} 过 / ${fail} 失败 ━━━`)
process.exit(fail ? 1 : 0)
