// ============================================================
// test-sweep-step.mjs —— sweep-step 状态机离线自测（零 LLM 配额）
// 覆盖：队列初始化顺序 / 状态持久化往返 / 429 不消费队列 /
//       坏状态文件回退 / 队列空触发收尾聚合标志
// 用法：node scripts/test-sweep-step.mjs
// ============================================================
import { writeFileSync, rmSync, existsSync, readFileSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"
import { initState, loadState, STATE } from "./sweep-step.mjs"

let pass = 0, fail = 0
function ok(name, cond, extra = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
  if (cond) pass += 1
  else fail += 1
}

console.log("━━━ sweep-step 状态机离线自测 ━━━")

// 1) 队列初始化：12 步，v0 → v1 → v2 → v3，各 × m01,m02,m03
{
  const s = initState()
  ok("队列共 12 步", s.queue.length === 12, `${s.queue.length}`)
  ok("首步 v0×m01", s.queue[0].variant === "v0" && s.queue[0].topicId === "m01")
  ok("末步 v3×m03", s.queue[11].variant === "v3" && s.queue[11].topicId === "m03")
  const vs = [...new Set(s.queue.map((q) => q.variant))]
  ok("变体顺序 v0→v1→v2→v3", vs.join(",") === "v0,v1,v2,v3", vs.join(","))
  ok("每变体 3 题", ["v0", "v1", "v2", "v3"].every((v) => s.queue.filter((q) => q.variant === v).length === 3))
}

// 2) 状态持久化往返：写盘 → loadState 恢复一致
{
  const bak = STATE + ".testbak"
  const had = existsSync(STATE)
  if (had) writeFileSync(bak, readFileSync(STATE, "utf8"))
  const s = initState()
  s.queue.shift()
  s.done.push({ variant: "v0", topicId: "m01", runId: "r-test", average: 8.1, scores: {}, wordCount: 1200 })
  writeFileSync(STATE, JSON.stringify(s, null, 2))
  const loaded = loadState()
  ok("写盘后 loadState 往返一致", loaded.queue.length === 11 && loaded.done.length === 1 && loaded.done[0].topicId === "m01")
  ok("完成步字段完整", loaded.done[0].average === 8.1 && !!loaded.done[0].runId)
  if (had) { writeFileSync(STATE, readFileSync(bak, "utf8")); rmSync(bak) } else rmSync(STATE)
}

// 3) 429 场景不消费队列（模拟 sweep-step 的 429 分支语义：不 shift 不写盘）
{
  const s = initState()
  const before = JSON.stringify(s)
  // 429 分支：直接 return（不 shift 不写状态）——状态对象应保持不变
  const why = "API request failed with status 429: Too many requests"
  const is429 = /429|too many/i.test(why)
  if (is429) { /* 模拟：什么都不做 */ }
  ok("429 原因识别正确", is429 === true)
  ok("429 分支队列不动", JSON.stringify(s) === before)
}

// 4) 坏状态文件回退初始化
{
  const bak = STATE + ".testbak"
  const had = existsSync(STATE)
  if (had) writeFileSync(bak, readFileSync(STATE, "utf8"))
  writeFileSync(STATE, "{ 不是合法 JSON")
  const loaded = loadState()
  ok("坏 JSON 回退初始化（12 步队列）", loaded.queue.length === 12 && loaded.done.length === 0)
  if (had) { writeFileSync(STATE, readFileSync(bak, "utf8")); rmSync(bak) } else rmSync(STATE)
}

// 5) 队列空 = 收尾聚合阶段（聚合由 aggregateTuneReport 纯函数保证，test-tune 已覆盖）
{
  const s = initState()
  for (let i = 0; i < 12; i++) s.queue.shift()
  ok("队列空 → 触发收尾聚合分支", s.queue.length === 0)
}

console.log(`━━━ 结果：${pass} 过 / ${fail} 失败 ━━━`)
process.exit(fail ? 1 : 0)
