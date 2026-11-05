// b1-e2e-tier.mjs —— 批次一聚焦 E2E：默认 medium 档单篇成稿字数落带验证
// POST /api/runs（不传 lengthTier → 走设置默认 medium）→ 轮询终态 → 断言：
//   ① run.lengthTier === "medium"
//   ② 成稿 wordCount 落 2500~4000（A2 合计归一化后）
//   ③ artifacts.draft.inBand === true
//   ④ 插图步骤留痕 director/VLM（B1/B3）
const BASE = "http://localhost:3000"
const ok = (name, cond, extra = "") => console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)

const created = await fetch(`${BASE}/api/runs`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ ideaTitle: "大模型成本曲线拐点：推理价格一年降了多少，谁在受益", persona: "cold-analyst" }),
}).then((r) => r.json())
const runId = created.id ?? created.run?.id
ok("run 创建", Boolean(runId), runId)

let run = null
const t0 = Date.now()
while (Date.now() - t0 < 420_000) {
  await new Promise((r) => setTimeout(r, 6000))
  const list = await fetch(`${BASE}/api/runs`).then((r) => r.json())
  run = list.runs.find((x) => x.id === runId)
  if (run && ["done", "error", "blocked"].includes(run.status)) break
}
ok("流水线终态", run?.status === "done", `status=${run?.status} err=${run?.error ?? ""} ${(Date.now() - t0) / 1000 | 0}s`)

ok("默认档位 medium", run?.lengthTier === "medium", `lengthTier=${run?.lengthTier}`)

const detail = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
const articles = detail.articles ?? detail.run?.articles ?? []
const v0 = articles.find((a) => a.version === 0) ?? articles[0]
const wc = v0?.wordCount ?? 0
ok("成稿字数落带 2500~4000", wc >= 2500 && wc <= 4000, `wordCount=${wc}`)

const steps = detail.steps ?? detail.run?.steps ?? []
const draftStep = steps.find((s) => s.step === 4 || /初稿|draft/i.test(String(s.name ?? "")))
console.log("    draft step 详情:", String(draftStep?.detail ?? "").slice(0, 160))

const artifacts = detail.artifacts ?? detail.run?.artifacts ?? {}
console.log("    artifacts.draft:", JSON.stringify(artifacts.draft ?? null))
console.log("    artifacts.illustrations:", JSON.stringify(artifacts.illustrations ?? null))

const inBand = artifacts.draft?.inBand
ok("artifacts.draft.inBand", inBand === true, `inBand=${inBand}`)

const illus = artifacts.illustrations
ok("配图导演+VLM 留痕", Boolean(illus && (illus.director ?? 0) > 0 && (illus.vlmPass ?? 0) + (illus.vlmFail ?? 0) > 0), JSON.stringify(illus ?? {}))
