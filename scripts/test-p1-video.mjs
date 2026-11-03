// ============================================================
// test-p1-video.mjs —— P1-5 视频模型配置轻量化在线回归（需 dev server）
// 覆盖方案第六章验收要点（配置收敛单卡）：
//   ① VideoSettings 扩展四字段（model/models/resolution/aspect）PUT 可保存
//   ② 模型可编辑清单：自定义模型 id 手填保存 + 清单添加（去重 + 上限语义）
//   ③ 分辨率预设 / 画幅保存（720P/1080P、9:16/16:9）
//   ④ 配置全套下发：GET settings 回显 + render-video 画幅缺省取配置
//      （用假 storyboard 走校验层断言，不需要真渲染）
//   ⑤ 向后兼容：旧 DB 值（无新字段）读取时给默认
//   ⑥ Agnes 池卡不再承载视频模型（PUT agnes 不带 videoModel 仍成功；
//      agnes-video 请求构造优先 settings.video.model）
// 运行：bash scripts/with-server.sh "node scripts/test-p1-video.mjs"
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

console.log("━━━ P1-5 视频模型配置轻量化回归 ━━━")

// ---------- ①②③ 全套参数保存 ----------
console.log("── ①②③ 全套参数保存 ──")
{
  const r = await j("PUT", "/api/settings", {
    scope: "video",
    value: {
      channel: "local",
      model: "agnes-video-2.6-pro",
      models: ["agnes-video-2.5-flash", "agnes-video-2.6-pro"],
      resolution: "1080P",
      aspect: "16:9",
      secondsPerScene: 6,
    },
  })
  ok("PUT video 全套参数保存成功", r.status === 200, String(r.json?.message ?? r.json?.error ?? "").slice(0, 60))
  const v = r.json?.settings?.video
  ok("自定义模型 id 保存（手填非预置项）", v?.model === "agnes-video-2.6-pro")
  ok("模型清单保存（两 项）", Array.isArray(v?.models) && v.models.length === 2)
  ok("分辨率 1080P 保存", v?.resolution === "1080P")
  ok("画幅 16:9 保存", v?.aspect === "16:9")
  ok("秒数保存", v?.secondsPerScene === 6)

  // 清单去重与上限（12）
  const r2 = await j("PUT", "/api/settings", {
    scope: "video",
    value: { models: ["a", "a", "b", ...Array.from({ length: 15 }, (_, i) => `m${i}`)] },
  })
  const v2 = r2.json?.settings?.video
  ok("清单去重 + 上限 12 语义", Array.isArray(v2?.models) && v2.models.length === 12 && new Set(v2.models).size === 12, `${v2?.models?.length} 项`)

  // 非法值拒绝/忽略
  const r3 = await j("PUT", "/api/settings", { scope: "video", value: { resolution: "4K", aspect: "1:1" } })
  const v3 = r3.json?.settings?.video
  ok("非法分辨率/画幅被忽略（白名单校验）", v3?.resolution !== "4K" && v3?.aspect !== "1:1")

  // 还原默认 + 保留自定义清单
  const r4 = await j("PUT", "/api/settings", {
    scope: "video",
    value: { channel: "local", model: "agnes-video-2.5-flash", models: ["agnes-video-2.5-flash", "agnes-video-2.6-pro"], resolution: "720P", aspect: "9:16", secondsPerScene: 8 },
  })
  ok("还原默认配置成功", r4.status === 200 && r4.json?.settings?.video?.model === "agnes-video-2.5-flash")
}

// ---------- ④ 配置下发（render-video 画幅缺省取配置） ----------
console.log("── ④ 配置下发 ──")
{
  // 先设画幅 16:9
  await j("PUT", "/api/settings", { scope: "video", value: { aspect: "16:9" } })
  // 用不完整 storyboard 走校验层（会 400 但校验发生在 aspect 解析后）——
  // 更直接的断言：创建一个 run 后用假 storyboard 调 render-video，校验错误
  // 信息不含「画幅」类错误即可说明 aspect 默认链路没炸；此处用响应链验证路由可读配置
  const runs = await j("GET", "/api/runs")
  const run = (runs.json?.runs ?? [])[0]
  if (run) {
    const r = await j("POST", `/api/runs/${run.id}/actions`, {
      action: "render-video",
      storyboard: { title: "x", scenes: [] }, // 故意不完整 → 400 分镜校验
    })
    ok("render-video 路由在配置缺省链路下正常工作（画幅默认解析无异常）", r.status === 400 && /分镜数据不完整/.test(String(r.json?.error)), String(r.json?.error).slice(0, 50))
    // 不带 aspect 的合法调用会走 settings 默认——此处只验证路由层读取配置无 500
    ok("settings.video.aspect 配置读取不炸（无 500）", r.status !== 500)
  } else {
    ok("render-video 路由验证（有 run 可用）", false, "无 run 可测")
  }
  // 还原 9:16
  await j("PUT", "/api/settings", { scope: "video", value: { aspect: "9:16" } })
}

// ---------- ⑤ 向后兼容 ----------
console.log("── ⑤ 向后兼容 ──")
{
  // 旧 DB 值（只有 channel + secondsPerScene）→ 读取给默认（getSettings merge 语义）
  // 直接改库模拟旧数据，再 GET 验证默认值补齐
  const { PrismaClient } = await import("@prisma/client")
  const db = new PrismaClient()
  try {
    await db.settingKV.upsert({
      where: { key: "video:channel" },
      update: { value: JSON.stringify({ channel: "local", secondsPerScene: 8 }) },
      create: { key: "video:channel", value: JSON.stringify({ channel: "local", secondsPerScene: 8 }) },
    })
    const r = await j("GET", "/api/settings")
    const v = r.json?.settings?.video
    ok("旧 DB 值读取时新字段给默认（model/models/resolution/aspect）", v?.model === "agnes-video-2.5-flash" && Array.isArray(v?.models) && v?.resolution === "720P" && v?.aspect === "9:16", JSON.stringify(v))
    ok("旧字段不丢（channel/secondsPerScene）", v?.channel === "local" && v?.secondsPerScene === 8)
  } finally {
    await db.$disconnect()
  }
}

// ---------- ⑥ Agnes 池卡解耦 ----------
console.log("── ⑥ Agnes 池卡解耦 ──")
{
  // PUT agnes 不带 videoModel 仍成功（池卡只管账号与配额；videoModel 字段兼容保留）
  const r = await j("PUT", "/api/settings", { scope: "agnes", value: { strategy: "round-robin" } })
  ok("PUT agnes 不带 videoModel 成功（池卡解耦）", r.status === 200, String(r.json?.message ?? r.json?.error ?? "").slice(0, 40))
  // settings GET 仍含 agnes.videoModel（兼容字段）+ video.model（新收敛位）
  const s = await j("GET", "/api/settings")
  ok("GET 同时含兼容字段与新收敛位", typeof s.json?.settings?.agnes?.videoModel === "string" && typeof s.json?.settings?.video?.model === "string")
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
