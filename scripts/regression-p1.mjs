// ============================================================
// regression-p1 —— P1 专项回归（聚焦本轮改动，省 LLM 配额）
// ① 版式卡 E2E：POST /api/image-runs mode=layout → 两步 → 断言产物
//    （provider=card-engine / VLM 留痕 / PNG 可访问 / artifacts）
// ② 分镜 render 字段离线单测：parseStoryboard 带标注/缺省/非法值
// ③ 卡片规划宽容解析离线单测：parseCardPlan 边界
// 运行：bash scripts/with-server.sh "node scripts/regression-p1.mjs"
// ============================================================
const BASE = "http://localhost:3000"

let pass = 0
let fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}
async function call(name, method, path, body, timeoutMs = 120000) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = await res.json().catch(() => ({}))
  return { res, json }
}

console.log("━━━ P1 专项回归 ━━━")

// ---------- ② 分镜 render 字段离线单测（零 LLM） ----------
console.log("── ② parseStoryboard render 字段（P1 混合通道协议） ──")
const { parseStoryboard } = await import("../src/lib/runtime/skills/radar-rewrite.ts")
const sbWithRender = parseStoryboard({ title: "t", hook: "h", totalSeconds: 30, scenes: [
  { id: 1, seconds: 5, visual: "数据大屏", narration: "n1", subtitle: "s1", broll: "b", render: "model" },
  { id: 2, seconds: 5, visual: "字排", narration: "n2", subtitle: "s2", broll: "b", render: "code" },
  { id: 3, seconds: 5, visual: "实景", narration: "n3", subtitle: "s3", broll: "b" },
  { id: 4, seconds: 5, visual: "x", narration: "n4", subtitle: "s4", broll: "b", render: "illegal" },
] })
ok("render=model 保留", sbWithRender?.scenes?.[0]?.render === "model", String(sbWithRender?.scenes?.[0]?.render))
ok("render=code 保留", sbWithRender?.scenes?.[1]?.render === "code", String(sbWithRender?.scenes?.[1]?.render))
ok("缺省 render 补 code", sbWithRender?.scenes?.[2]?.render === "code", String(sbWithRender?.scenes?.[2]?.render))
ok("非法值回退 code", sbWithRender?.scenes?.[3]?.render === "code", String(sbWithRender?.scenes?.[3]?.render))

// ---------- ③ parseCardPlan 宽容解析（零 LLM） ----------
console.log("── ③ parseCardPlan 宽容解析 ──")
const { parseCardPlan } = await import("../src/lib/runtime/card-engine.ts")
const plan = parseCardPlan([
  { template: "quote", family: "swiss", quote: "写好标题就赢了一半", attribution: "—— 老编辑", caption: "金句" },
  { template: "bogus", family: "bogus", title: "数据卡标题", metrics: [{ value: "87.4%", label: "采用率" }, { value: "3.2×", label: "降幅" }, { value: "x".repeat(30), label: "y" }] },
  { title: "" }, // 应被过滤
], 5)
ok("金句卡解析（quote 模板）", plan[0]?.template === "quote" && plan[0]?.quote?.includes("写好标题"), `${plan[0]?.template}/${plan[0]?.family}`)
ok("非法模板回退（有 metrics → data）", plan[1]?.template === "data", `${plan[1]?.template}/${plan[1]?.family}`)
ok("非法版系回退 editorial", plan[1]?.family === "editorial", String(plan[1]?.family))
ok("metrics 裁剪至 ≤4 并截断", (plan[1]?.metrics?.length ?? 0) === 3 && (plan[1]?.metrics?.[2]?.value?.length ?? 0) <= 12, JSON.stringify(plan[1]?.metrics?.map((m) => m.value)))
ok("空标题项过滤", plan.length === 2, `${plan.length} 项`)
const clamped = parseCardPlan([{ template: "cover", family: "editorial", title: "超".repeat(80), subtitle: "副".repeat(80) }], 9)
ok("超长文案硬截断", (clamped[0]?.title?.length ?? 0) <= 24 && (clamped[0]?.subtitle?.length ?? 0) <= 36, `title=${clamped[0]?.title?.length} sub=${clamped[0]?.subtitle?.length}`)

// ---------- ① 版式卡 E2E（LLM：1 plan + N×VLM） ----------
console.log("── ① 版式卡端到端（mode=layout · family 锁定 swiss） ──")
const created = await call("layout-create", "POST", "/api/image-runs", {
  subject: "P1 专项回归：本周 AI 融资观察——三条主线与关键数据",
  usage: "xiaohongshu",
  count: 3,
  mode: "layout",
  family: "swiss",
})
const cardRunId = created.json.id
ok("创建版式卡 run（family=swiss 锁定）", created.res.ok && Boolean(cardRunId), cardRunId ?? JSON.stringify(created.json).slice(0, 80))
if (cardRunId) {
  let run = null
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    const rj = await fetch(`${BASE}/api/runs/${cardRunId}`).then((r) => r.json())
    run = rj.run
    if (run?.status === "done" || run?.status === "error") break
  }
  const steps = run ? JSON.parse(run.steps || "[]") : []
  ok("版式卡终态 done", run?.status === "done", `status=${run?.status} err=${(run?.error ?? "").slice(0, 90)}`)
  ok("两步流水线（plan → gen）", steps.length === 2 && steps[0]?.name === "plan" && steps[1]?.name === "gen", steps.map((s) => `${s.name}:${s.status}`).join(" "))
  if (run?.status === "done") {
    const assets = (run?.assets ?? []).filter((a) => a.path)
    ok("版式卡产出 ≥2 张", assets.length >= 2, `${assets.length} 张`)
    ok("provider=card-engine（代码排版而非生图端点）", assets.every((a) => (a.provider ?? "").startsWith("card-engine")), assets[0]?.provider ?? "")
    const metas = assets.map((a) => JSON.parse(a.meta || "{}"))
    ok("family 锁定生效（全 swiss）", metas.every((m) => m.family === "swiss"), metas.map((m) => m.family).join(","))
    ok("VLM 质检留痕（meta.vlm）", metas.every((m) => typeof m.vlm === "string" && m.vlm.length > 0), metas.map((m) => m.vlm).join("｜").slice(0, 110))
    const art = JSON.parse(run?.artifacts || "{}")
    ok("文案规划落 artifacts.cards", Array.isArray(art.cards) && art.cards.length >= 2, `${art.cards?.length ?? 0} 张｜模板 ${(art.cards ?? []).map((c) => c.template).join(",")}`)
    ok("VLM 统计落 artifacts.vlm", Boolean(art.vlm) && typeof art.vlm.pass === "number", JSON.stringify(art.vlm ?? {}))
    ok("画廊 markdown 输出", (run.output ?? "").includes("](/assets/"), `${(run.output ?? "").length} 字符`)
    const head = await fetch(BASE + assets[0].path, { method: "HEAD" })
    ok("版式卡静态可访问（PNG）", head.ok && head.headers.get("content-type") === "image/png", `${assets[0].path} ${Number(head.headers.get("content-length") ?? 0) / 1024 | 0}KB`)
    // 模板多样性：3 张卡应至少出现 2 种模板（封面/金句/数据递进）
    const tplSet = new Set((art.cards ?? []).map((c) => c.template))
    ok("模板多样性（≥2 种）", tplSet.size >= 2, [...tplSet].join(","))
  }
}

// ---------- ④ mode=gen 对照（确认旧路径不回归） ----------
console.log("── ④ 生成式模式对照（mode=gen 不回归） ──")
const genCreated = await call("gen-create", "POST", "/api/image-runs", {
  subject: "P1 对照：概念图一张",
  usage: "general-square",
  style: "modern-flat",
  count: 1,
})
const genRunId = genCreated.json.id
ok("创建 gen 模式 run", genCreated.res.ok && Boolean(genRunId), genRunId ?? "")
if (genRunId) {
  let grun = null
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    const rj = await fetch(`${BASE}/api/runs/${genRunId}`).then((r) => r.json())
    grun = rj.run
    if (grun?.status === "done" || grun?.status === "error") break
  }
  ok("gen 模式终态（done 或诚实降级 error）", ["done", "error"].includes(grun?.status), `status=${grun?.status} ${(grun?.error ?? "").slice(0, 60)}`)
  const genAssets = (grun?.assets ?? []).filter((a) => a.path)
  if (grun?.status === "done" && genAssets.length > 0) {
    ok("gen 模式 provider=zai-image + VLM 留痕", genAssets.every((a) => (a.provider ?? "").includes("zai-image")), genAssets.map((a) => `${a.provider}:${(JSON.parse(a.meta || "{}").vlm ?? "?")}`).join("｜").slice(0, 100))
  } else {
    ok("生图端点降级时诚实留痕", (grun?.error ?? "").includes("降级") || (grun?.assets ?? []).length > 0, "沙箱生图端点状态（非代码问题）")
  }
}

console.log(`\nP1 专项回归：${pass} 过 / ${fail} 挂`)
process.exit(fail > 0 ? 1 : 0)
