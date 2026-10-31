// regression-video-only.mjs —— 视频段独立回归（省时版）
// 用 scripts/last-storyboard.json 的现成分镜直出成片，验证 render-video 链路
// 背景：part2 依赖前一段创建的 runId；跨调用 DB 落盘时机问题导致复用失败，
// 此版本自建 run 行（不等待文章），直接渲染 art 风格成片。
// 注意：直接用 Prisma 建 run 行（不走 POST /api/runs）——后者会触发九步图文管线
// 后台连跑，与视频渲染抢 LLM 配额（分节生成 14+ 次调用会撞用户级限流窗口）。
const BASE = "http://localhost:3000"
const fs = await import("fs")

function ok(name, cond, extra = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
}

async function call(method, path, body, timeoutMs = 300000) {
  const res = await fetch(BASE + path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(timeoutMs),
  })
  const json = await res.json().catch(() => ({}))
  return { res, json }
}

console.log("━━━ 视频段独立回归（last-storyboard → art/motion 成片） ━━━")

// 1. 直接建 run 行（不启动图文管线，视频渲染只需要 run 存在）
const { PrismaClient } = await import("@prisma/client")
const db = new PrismaClient()
const runRow = await db.agentRun.create({
  data: {
    kind: "article",
    ideaTitle: "视频段回归：引擎直出（无管线）",
    ideaAngle: "回归脚本",
    persona: "cold-analyst",
    theme: "tech-modern",
    input: "视频段回归",
    status: "done",
    steps: JSON.stringify([]),
  },
})
const runId = runRow.id
await db.$disconnect()
ok("创建 run 行（直插 DB，无管线）", Boolean(runId), runId)

// 2. 现成分镜
const storyboard = JSON.parse(fs.readFileSync("scripts/last-storyboard.json", "utf-8"))
ok("分镜加载", Array.isArray(storyboard?.scenes) && storyboard.scenes.length >= 3, `${storyboard?.scenes?.length} 分镜 ${storyboard?.totalSeconds}s`)

// 3. art 渲染
const rv = await call("POST", `/api/runs/${runId}/actions`, {
  action: "render-video", storyboard, voice: "xiaochen", aspect: "9:16", style: "art", channel: "local",
})
ok("art 渲染启动", rv.res.ok, rv.json.message?.slice(0, 60) ?? rv.json.error ?? "")

let meta = null
for (let i = 0; i < 100; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
  const va = [...(rj.run?.assets ?? [])].reverse().find((a) => a.role === "video-final")
  if (!va) continue
  try { meta = JSON.parse(va.meta || "{}") } catch { continue }
  if (i % 6 === 0) console.log(`  … stage=${meta.stage} ${meta.percent ?? 0}% (${meta.sceneDone ?? 0}/${meta.sceneTotal ?? 0})`)
  if (["done", "error"].includes(meta.stage)) break
}
ok("art 成片终态", meta?.stage === "done", `stage=${meta?.stage} ${meta?.seconds ?? 0}s ${(meta?.sizeBytes ?? 0) ? (meta.sizeBytes / 1048576).toFixed(1) + "MB" : ""} ${meta?.aiNote ?? ""} ${meta?.error ?? ""}`)

if (meta?.stage === "done") {
  const head = await fetch(`${BASE}/assets/video-${runId}.mp4`, { method: "HEAD" })
  ok("成片静态可访问", head.ok, `${head.headers.get("content-type")} ${(Number(head.headers.get("content-length") ?? 0) / 1048576).toFixed(1)}MB`)
}

// 4. motion 对照（快出片，值得跑）
const rvM = await call("POST", `/api/runs/${runId}/actions`, {
  action: "render-video", storyboard, voice: "kazi", aspect: "16:9", style: "motion", channel: "local",
})
ok("motion 渲染启动", rvM.res.ok, rvM.json.message?.slice(0, 60) ?? "")
let mMeta = null
for (let i = 0; i < 60; i++) {
  await new Promise((r) => setTimeout(r, 5000))
  const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
  const vas = [...(rj.run?.assets ?? [])].filter((a) => a.role === "video-final")
  const va = [...vas].reverse().find((a) => {
    try { return JSON.parse(a.meta || "{}").style === "motion" } catch { return false }
  })
  if (!va) continue
  try { mMeta = JSON.parse(va.meta || "{}") } catch { continue }
  if (["done", "error"].includes(mMeta.stage)) break
}
ok("motion 成片终态", mMeta?.stage === "done", `stage=${mMeta?.stage} ${mMeta?.seconds ?? 0}s ${mMeta?.width}×${mMeta?.height}`)

// 5. 混合通道（P1：render 标注分发；Agnes 未配置 → 全代码动画诚实留痕）
if (storyboard?.scenes?.length) {
  // 兼容旧分镜（无 render 字段时补默认 code）
  const sbHybrid = { ...storyboard, scenes: storyboard.scenes.map((s) => ({ ...s, render: s.render === "model" ? "model" : "code" })) }
  const rvH = await call("POST", `/api/runs/${runId}/actions`, {
    action: "render-video", storyboard: sbHybrid, voice: "xiaochen", aspect: "9:16", style: "motion", channel: "hybrid",
  })
  ok("hybrid 渲染启动", rvH.res.ok, rvH.json.message?.slice(0, 70) ?? rvH.json.error ?? "")
  let hMeta = null
  let hVa = null
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
    const vas = [...(rj.run?.assets ?? [])].filter((a) => a.role === "video-final")
    const va = [...vas].reverse().find((a) => {
      try { return JSON.parse(a.meta || "{}").channel === "hybrid" } catch { return false }
    })
    if (!va) continue
    hVa = va
    try { hMeta = JSON.parse(va.meta || "{}") } catch { continue }
    if (["done", "error"].includes(hMeta.stage)) break
  }
  const hTotal = (hMeta?.codeScenes ?? 0) + (hMeta?.modelScenes ?? 0)
  ok("hybrid 成片终态 + 通道统计", hMeta?.stage === "done" && hTotal === sbHybrid.scenes.length, `stage=${hMeta?.stage} code=${hMeta?.codeScenes ?? "?"} model=${hMeta?.modelScenes ?? "?"} ${(hVa?.provider ?? "").slice(0, 48)} ${hMeta?.aiNote ?? ""}`)
}

console.log("━━━ 完成 ━━━")
