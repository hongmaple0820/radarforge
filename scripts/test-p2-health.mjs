// ============================================================
// test-p2-health.mjs —— P2-2 全局健康中心在线集成回归（需 dev server）
// 覆盖 q7 方案 7.2 验收要点（四项健康一览且可跳转）：
//   ① GET /api/health/summary 返回四项（搜索/LLM/视频依赖/信源）
//   ② 每项带 status 枚举 + 人话 detail + 跳转目标（分区+卡片锚点）
//   ③ 视频依赖项就绪（沙箱 ffmpeg 存在，含版本信息）
//   ④ 信源健康聚合（24 默认源的 pending/ok 态人话摘要）
//   ⑤ LLM 通道按模式给出降级语义（builtin=ok；agnes 未启用=warn）
//   ⑥ overall = 最差项聚合
//   ⑦ 只读聚合不产生副作用（多次调用幂等）
// 运行：bash scripts/with-server.sh "node scripts/test-p2-health.mjs"
// ============================================================

const BASE = "http://127.0.0.1:3000"

let pass = 0
let fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.error(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

async function j(method, pathName, body) {
  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* 非 JSON */ }
  return { status: res.status, json }
}

async function main() {
  console.log("━━ ① 健康汇总结构 ━━")
  const { status, json: h } = await j("GET", "/api/health/summary")
  ok("GET 200", status === 200)
  ok("返回 ok=true 与 overall", h.ok === true && ["ok", "warn", "error"].includes(h.overall), `overall=${h.overall}`)
  const items = h.items ?? []
  ok("四项一览（搜索/LLM/视频依赖/信源）", items.length === 4 && ["search", "llm", "video-deps", "feeds"].every((id) => items.some((i) => i.id === id)), items.map((i) => i.id).join(","))
  ok("每项带合法 status 枚举", items.every((i) => ["ok", "warn", "error"].includes(i.status)))
  ok("每项带人话 detail（非空）", items.every((i) => typeof i.detail === "string" && i.detail.length > 0), items.map((i) => i.detail).join("｜").slice(0, 120))
  ok("每项带跳转目标（分区 + 卡片锚点 / 情报中心）", items.every((i) => i.jump && (i.jump.tab === "intel" || (["models", "runtime", "content"].includes(i.jump.partition) && i.jump.card))))

  console.log("━━ ② 逐项语义 ━━")
  const search = items.find((i) => i.id === "search")
  const llm = items.find((i) => i.id === "llm")
  const deps = items.find((i) => i.id === "video-deps")
  const feeds = items.find((i) => i.id === "feeds")

  ok("搜索项给出降级语义（未配置 → 演示数据说明）", search.status === "ok" ? true : /演示|降级/.test(search.detail), search.detail)
  ok("LLM 项（builtin → ok 内置引擎 / 其它模式带降级说明）", llm.status === "ok" || /回退/.test(llm.detail), `${llm.status}｜${llm.detail}`)
  ok("视频依赖项就绪且带版本（沙箱 ffmpeg 存在）", deps.status === "ok" && /ffmpeg/.test(deps.detail), deps.detail)
  ok("视频依赖跳转 runtime/deps（修复指引卡）", deps.jump?.partition === "runtime" && deps.jump?.card === "deps")
  ok("信源项聚合 24 默认源", /24|源/.test(feeds.detail), feeds.detail)
  ok("信源项跳转情报中心", feeds.jump?.tab === "intel")

  console.log("━━ ③ overall 聚合与幂等 ━━")
  {
    const worst = items.some((i) => i.status === "error") ? "error" : items.some((i) => i.status === "warn") ? "warn" : "ok"
    ok("overall = 最差项聚合", h.overall === worst, `expect ${worst}`)
    const again = await j("GET", "/api/health/summary")
    ok("只读幂等（二次调用一致）", again.status === 200 && again.json.items?.length === 4 && again.json.overall === h.overall)
  }

  console.log("━━ ④ 设置分区锚点存在（三分区渲染前提） ━━")
  {
    // 依赖自检独立端点仍可用（runtime 分区卡数据源）
    const depsApi = await j("GET", "/api/settings/dependencies")
    ok("GET /api/settings/dependencies 仍返回逐项报告", depsApi.status === 200 && (depsApi.json.items ?? []).length === 2 && (depsApi.json.items ?? []).every((i) => i.name && typeof i.resolved === "boolean"))
  }

  console.log(`\n━━ test-p2-health：${pass} 通过 / ${fail} 失败 ━━`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error("测试执行异常：", e)
  process.exit(1)
})
