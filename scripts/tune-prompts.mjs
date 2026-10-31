// ============================================================
// tune-prompts.mjs —— 评测驱动的 prompt 变体调优运行器（P1 p15）
// 学 MIPROv2 精神子集：变体 × 评测子集 → 跑九步管线 → G-Eval 评分
// → 与历史基线聚合对比 → 推荐变体落库（SettingKV tune:draft）→
// 报告落 download/。「先建度量，再动刀」：调优前后各跑一次即回归。
// 用法：bash scripts/with-server.sh "node scripts/tune-prompts.mjs --variants v2 --ids m01"
//   --variants a,b,c  变体清单（默认 v2；v0 基线取历史评分，不重跑）
//   --ids a,b         评测题号（默认 m01；全量见 --variants v1,v2,v3 --ids m01,m02）
//   --pace 75         题间节拍（秒，配额友好）
//   --keep            不自动应用推荐变体（只出报告）
// LLM 消耗：每 变体×题 一次九步管线（~12 chat）+ 一次评分。
// ============================================================
import { PrismaClient } from "@prisma/client"
import { writeFileSync } from "fs"

const BASE = "http://localhost:3000"
const db = new PrismaClient()

const { aggregateTuneReport, PROMPT_VARIANTS } = await import("../src/lib/runtime/tune.ts")
const { EVAL_TOPICS } = await import("../src/lib/runtime/eval-topics.ts")

function parseArgs() {
  const out = { variants: ["v2"], ids: ["m01"], pace: 75, keep: false }
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--variants") out.variants = (argv[i + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean)
    if (argv[i] === "--ids") out.ids = (argv[i + 1] ?? "").split(",").map((x) => x.trim()).filter(Boolean)
    if (argv[i] === "--pace") out.pace = Math.max(0, Number(argv[i + 1]) || 75)
    if (argv[i] === "--keep") out.keep = true
  }
  return out
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
function ok(name, cond, extra = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
}

async function waitRunDone(runId, timeoutMs = 12 * 60 * 1000) {
  const t0 = Date.now()
  for (;;) {
    if (Date.now() - t0 > timeoutMs) return { status: "timeout", run: null }
    const run = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json()).then((j) => j.run)
    if (run && (run.status === "done" || run.status === "error")) return { status: run.status, run }
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
      console.log(`      ⏳ 评分撞限流，等 90s 重试…`)
      await sleep(90_000)
      return attempt()
    }
    throw e
  }
}

async function main() {
  const args = parseArgs()
  console.log(`\n━━━ Prompt 变体调优（MIPROv2 精神子集 · G-Eval 度量闭环）━━━`)
  console.log(`变体：${args.variants.join(",")}｜题：${args.ids.join(",")}｜节拍 ${args.pace}s`)

  // ---------- 0) 题库与历史基线 ----------
  const topics = EVAL_TOPICS.filter((t) => args.ids.includes(t.id))
  if (topics.length === 0) {
    console.error("❌ 题号不在评测集内（如 m01,o03）")
    process.exit(1)
  }
  const titles = new Set(topics.map((t) => t.title))

  // 历史基线：eval-score Asset × run.ideaTitle 匹配（P0 试跑已有 m01/m02/m03/m05）
  const histAssets = await db.asset.findMany({ where: { role: "eval-score" }, orderBy: { createdAt: "desc" } })
  const histScores = []
  for (const a of histAssets) {
    const run = await db.agentRun.findUnique({ where: { id: a.runId }, select: { ideaTitle: true } })
    if (!run || !titles.has(run.ideaTitle)) continue
    const meta = JSON.parse(a.meta || "{}")
    const topic = topics.find((t) => t.title === run.ideaTitle)
    if (!topic) continue
    if (histScores.some((s) => s.topicId === topic.id)) continue // 同题取最近一次
    histScores.push({ variant: "v0", runId: a.runId, topicId: topic.id, average: meta.average, scores: meta.scores, wordCount: meta.wordCount })
  }
  console.log(`历史基线（v0）：${histScores.length} 条${histScores.length ? `｜${histScores.map((s) => `${s.topicId}=${s.average}`).join(" ")}` : "（无 → 本轮 v0 无对照，仅报告变体绝对分）"}`)

  const liveScores = []

  // ---------- 1) 逐变体 × 逐题：apply → run → score ----------
  for (const vk of args.variants) {
    const variant = PROMPT_VARIANTS.find((v) => v.key === vk)
    if (!variant || vk === "v0") {
      console.log(`跳过 ${vk}（v0 走历史基线，不重跑）`)
      continue
    }
    console.log(`\n── 变体 ${vk}「${variant.label}」──`)
    console.log(`  假设：${variant.hypothesis}`)
    const applyRes = await fetch(`${BASE}/api/eval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "tune-apply", variantKey: vk, note: `tune-prompts.mjs ${new Date().toISOString()}` }),
    }).then((r) => r.json())
    ok(`变体已应用（SettingKV tune:draft）`, !!applyRes.tune?.instruction, `注入 ${applyRes.tune?.instruction?.length ?? 0} 字符`)

    for (const topic of topics) {
      console.log(`  ⏳ 题 ${topic.id}「${topic.title.slice(0, 24)}」九步管线启动…`)
      const create = await fetch(`${BASE}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ideaTitle: topic.title, ideaAngle: topic.angle, persona: topic.persona, theme: topic.theme }),
      }).then((r) => r.json())
      if (!create.id) {
        ok(`题 ${topic.id} 启动失败`, false, create.error)
        continue
      }
      const { status, run } = await waitRunDone(create.id)
      if (status !== "done") {
        ok(`题 ${topic.id} 管线终态 ${status}`, false, (run?.error ?? "").slice(0, 80))
        continue
      }
      // draft 步留痕应含调优标记
      const steps = JSON.parse(run.steps ?? "[]")
      const draftDetail = steps.find((s) => s.name === "draft")?.detail ?? ""
      ok(`draft 步留痕含「调优 ${vk}」`, draftDetail.includes(`调优 ${vk}`), draftDetail.slice(-50))
      const result = await scoreRun(create.id)
      liveScores.push({ variant: vk, runId: create.id, topicId: topic.id, average: result.average, scores: result.scores, wordCount: result.wordCount })
      ok(`题 ${topic.id} 评分 ${result.average}`, result.average >= 0, `gate=${result.gate?.pass ? "PASS" : "BLOCK"}｜${result.wordCount} 字`)
      if (topic !== topics[topics.length - 1] || args.variants.indexOf(vk) !== args.variants.length - 1) {
        console.log(`  💤 题间节拍 ${args.pace}s（配额友好）…`)
        await sleep(args.pace * 1000)
      }
    }
  }

  // ---------- 2) 聚合 + 推荐 ----------
  const report = aggregateTuneReport({
    topics: topics.map((t) => t.id),
    scores: [...histScores, ...liveScores],
  })
  console.log(`\n━━━ 聚合结果 ━━━`)
  for (const v of report.variants) {
    console.log(`  ${v.variant}${v.variant === "v0" ? "（基线）" : ""}：均分 ${v.mean.toFixed(2)}｜门禁率 ${Math.round(v.gatePassRate * 100)}%｜runs ${v.runs.length}`)
  }
  console.log(`  推荐变体：${report.recommended ?? "无（保持 v0）"}`)
  console.log(`  ${report.note}`)

  // ---------- 3) 应用推荐（或回基线） ----------
  if (!args.keep) {
    if (report.recommended) {
      await fetch(`${BASE}/api/eval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tune-apply", variantKey: report.recommended, note: `tune-prompts 推荐（基线 ${report.baselineMean?.toFixed(2)} → ${report.variants.find((v) => v.variant === report.recommended)?.mean.toFixed(2)}）` }),
      })
      console.log(`  ✅ 推荐 ${report.recommended} 已落库（后续 run 生效）`)
    } else {
      await fetch(`${BASE}/api/eval`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "tune-clear" }) })
      console.log(`  ↩️ 已回 v0 基线（无变体显著优于基线）`)
    }
  } else {
    console.log(`  --keep：不自动应用`)
  }

  // ---------- 4) 报告落盘 ----------
  const path = `download/tune-report-${new Date().toISOString().slice(0, 10)}.json`
  writeFileSync(path, JSON.stringify({ ...report, liveRuns: liveScores, historicalBaseline: histScores }, null, 2))
  console.log(`  📄 报告：${path}`)

  await db.$disconnect()
  process.exit(0)
}

main().catch(async (e) => {
  console.error("❌", e.message)
  await db.$disconnect()
  process.exit(1)
})
