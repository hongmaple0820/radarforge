// ============================================================
// aihot-enhance-demo.mjs —— AIHOT 增强票 E2E（票 05：热点参考注入）
// 三相：
//   A 查询层 live：直读产品模块 aihotContext()（b2 同款 strip-types 直读）
//     → 返回 ≤5 条真实 AIHOT 条目；帧组装含真实标题
//   B 出题管道 live：POST /api/topic-interview（注入路径走产线）→ 200 协议合法
//   C run 全链留痕：POST /api/runs → done → brief 步 detail 含「AIHOT 热点已注入」
//     （产品级确定性留痕：注入发生与否由 detail 字符串钉死，无需拆 system）
// IN1（无数据字节级不变）由 b2 ⑨ 离线钉死，此处不重复。
// 运行：node --experimental-strip-types scripts/tmp/aihot-enhance-demo.mjs
//   （需 dev server：bash scripts/with-server.sh "node --experimental-strip-types scripts/tmp/aihot-enhance-demo.mjs"）
// 上游：.scratch/aihot-access/issues/05-aihot-context-block.md、ADR-0012
// ============================================================

const BASE = "http://127.0.0.1:3000"

let pass = 0
let fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.error(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

async function j(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* 非 JSON */ }
  return { status: res.status, json }
}

console.log("━━━ AIHOT 增强票 E2E（aihot-access 05） ━━━")

// ---------- A. 查询层 live（直读产品模块；只读不写） ----------
console.log("── A：查询层 live ──")
{
  const { aihotContext } = await import("../../src/lib/sources/aihot-context.ts")
  const { aihotBlock } = await import("../../src/lib/content/aihot-block.ts")
  const topics = await aihotContext()
  ok("aihotContext 返回非空（库有 AIHOT 条目）", topics.length > 0, `${topics.length} 条`)
  ok("条数钳 5（D3 口径）", topics.length <= 5, `${topics.length}`)
  ok("每条 title/summary 非空", topics.every((t) => typeof t.title === "string" && t.title.trim() && typeof t.summary === "string"))
  const blk = aihotBlock(topics)
  ok("帧头（近 7 天精选）", blk.includes("【AIHOT 热点参考（近 7 天精选）】"))
  ok("真实热点标题入帧", blk.includes(topics[0]?.title?.slice(0, 40) ?? "@"))
  ok("纪律句在帧内", blk.includes("视野参考"))
  ok("帧不含占位符/undefined", !blk.includes("undefined") && !blk.includes("{{"))
  console.log(`    首条：${topics[0]?.title?.slice(0, 48) ?? ""}`)
}

// ---------- B. 出题管道 live（注入路径走产线） ----------
console.log("── B：出题管道 live ──")
{
  const r = await j("POST", "/api/topic-interview", {
    ideaTitle: "AI 编程助手渗透率观察",
    ideaAngle: "从写代码到审代码的职责迁移",
  })
  ok("出题 200", r.status === 200, `status=${r.status} ${r.json?.error ?? ""}`)
  const qs = r.json?.questions ?? []
  ok("协议合法（5~8 问）", qs.length >= 5 && qs.length <= 8, `${qs.length} 问`)
  const dims = new Set(qs.map((q) => q.dimension))
  ok("三维度全覆盖", dims.has("audience") && dims.has("boundary") && dims.has("evidence"))
  ok("每问带推荐答案", qs.every((q) => (q.recommended ?? "").trim().length > 0))
  ok("出题毫秒留痕（ms）", typeof r.json?.ms === "number", `${r.json?.ms ?? "?"}ms`)
}

// ---------- C. run 全链留痕（最重放最后：串行收尾防 429 自撞，P1 教训） ----------
console.log("── C：run 全链留痕 ──")
{
  const created = await j("POST", "/api/runs", {
    ideaTitle: "大模型推理成本曲线：一年降了多少，谁在受益",
    persona: "cold-analyst",
  })
  const runId = created.json?.id ?? ""
  ok("run 创建", Boolean(runId), runId || JSON.stringify(created.json).slice(0, 120))

  let run = null
  const t0 = Date.now()
  while (Date.now() - t0 < 480_000) {
    await new Promise((r) => setTimeout(r, 6000))
    const list = await j("GET", "/api/runs")
    run = (list.json?.runs ?? []).find((x) => x.id === runId)
    if (run && ["done", "error", "blocked"].includes(run.status)) break
  }
  ok("终态 done", run?.status === "done", `status=${run?.status} err=${run?.error ?? ""} ${((Date.now() - t0) / 1000) | 0}s`)

  const detail = await j("GET", `/api/runs/${runId}`)
  const steps = JSON.parse(detail.json?.run?.steps ?? "[]")
  const briefStep = steps.find((s) => s.name === "brief")
  const d = String(briefStep?.detail ?? "")
  ok("brief 步留痕「AIHOT 热点已注入」（产品级确定性）", d.includes("AIHOT 热点已注入"), d.slice(0, 140))
  const arts = JSON.parse(detail.json?.run?.artifacts ?? "{}")
  ok("成稿落产品容差带（inBand）", arts.draft?.inBand === true, `wordCount=${arts.draft?.wordCount ?? "?"}`)
}

console.log("")
console.log(`━━━ 结果：${pass} 通过 / ${fail} 失败 ━━━`)
process.exit(fail > 0 ? 1 : 0)
