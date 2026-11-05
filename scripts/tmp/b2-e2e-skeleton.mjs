// b2-e2e-skeleton.mjs —— 批次二聚焦 E2E：显式叙事骨架 + 研究缺口 + 配图职责分离活体验证
// 断言：
//   ① run.skeleton=versus 落库
//   ② 大纲步骤详情含「骨架：对比冲突裁决」（A3 活体）
//   ③ artifacts.research 留痕（A4 降级链：单轮+gap 标注）
//   ④ artifacts.outline.skeleton=versus
//   ⑤ 成稿字数落带 + illustrations 留痕（director/VLM/数据卡 B6）
const BASE = "http://localhost:3000"
const ok = (name, cond, extra = "") => console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)

const created = await fetch(`${BASE}/api/runs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    ideaTitle: "开源模型与闭源模型之争：成本、能力与生态的三线对峙",
    persona: "sharp-editor",
    lengthTier: "medium",
    skeleton: "versus",
  }),
}).then((r) => r.json())
const runId = created.id ?? created.run?.id
ok("run 创建（versus 骨架）", Boolean(runId), runId)

let run = null
const t0 = Date.now()
while (Date.now() - t0 < 420_000) {
  await new Promise((r) => setTimeout(r, 6000))
  const list = await fetch(`${BASE}/api/runs`).then((r) => r.json())
  run = list.runs.find((x) => x.id === runId)
  if (run && ["done", "error", "blocked"].includes(run.status)) break
}
ok("流水线终态", run?.status === "done", `status=${run?.status} err=${run?.error ?? ""} ${((Date.now() - t0) / 1000) | 0}s`)
ok("run.skeleton=versus", run?.skeleton === "versus", `skeleton=${run?.skeleton}`)
ok("run.lengthTier=medium", run?.lengthTier === "medium", `lengthTier=${run?.lengthTier}`)

const detail = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
const artifacts = detail.artifacts ?? detail.run?.artifacts ?? {}
const articles = detail.articles ?? detail.run?.articles ?? []
const v0 = articles.find((a) => a.version === 0) ?? articles[0]
const wc = v0?.wordCount ?? 0
ok("成稿字数落带 2500~4000", wc >= 2500 && wc <= 4000, `wordCount=${wc}`)

console.log("    research:", JSON.stringify(artifacts.research ?? null))
console.log("    outline.skeleton:", artifacts.outline?.skeleton ?? "无")
console.log("    draft:", JSON.stringify(artifacts.draft ?? null))
console.log("    illustrations:", JSON.stringify(artifacts.illustrations ?? null))

ok("A3：artifacts.outline.skeleton=versus", artifacts.outline?.skeleton === "versus", String(artifacts.outline?.skeleton))
ok("A4：research 留痕（rounds/gaps）", Number.isFinite(artifacts.research?.rounds) && artifacts.research?.gaps >= 0, JSON.stringify(artifacts.research ?? {}))
ok("A2：draft.inBand", artifacts.draft?.inBand === true, JSON.stringify(artifacts.draft ?? {}))
const illus = artifacts.illustrations
ok("配图留痕（director/VLM/数据卡统计）", Boolean(illus && (illus.director ?? 0) + (illus.dataCards ?? 0) > 0), JSON.stringify(illus ?? {}))

// 步骤详情：大纲步含骨架标注
const steps = detail.steps ?? detail.run?.steps ?? []
const outlineStep = steps.find((s) => /大纲/.test(String(s.name ?? "")) || s.step === 2)
console.log("    大纲步骤详情:", String(outlineStep?.detail ?? "").slice(0, 200))
ok("大纲步骤详情含骨架标注", String(outlineStep?.detail ?? "").includes("骨架"), (outlineStep?.detail ?? "").slice(0, 60))
