// 冒烟：新端点（评测集 / 视频直出 / 直出分镜）—— 单调用内完成
const BASE = "http://localhost:3000"
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // 1. 评测集题库
  const ev = await fetch(`${BASE}/api/eval`).then((r) => r.json())
  console.log(`[eval] topics=${ev.topics?.length} categories=${ev.meta?.categories?.length} target=${ev.meta?.targetAverage}`)
  if (ev.topics?.length !== 50) throw new Error("题库应为 50 题")

  // 2. 视频直出 run：创建 → blocked（research + directions）
  const created = await fetch(`${BASE}/api/video-runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ topic: "冒烟：AI 编程助手渗透率观察", angle: "从写代码到审代码的职责迁移", platform: "douyin" }),
  }).then((r) => r.json())
  console.log(`[video-run] id=${created.id}`)
  if (!created.id) throw new Error("创建失败: " + (created.error ?? ""))

  let run = null
  for (let i = 0; i < 40; i++) {
    await sleep(3000)
    run = await fetch(`${BASE}/api/runs/${created.id}`).then((r) => r.json()).then((j) => j.run)
    if (["blocked", "error", "done"].includes(run?.status)) break
  }
  console.log(`[video-run] status=${run?.status}`)
  const steps = JSON.parse(run?.steps ?? "[]")
  console.log(`[video-run] steps=${steps.map((s) => `${s.name}:${s.status}`).join(" ")}`)
  const artifacts = JSON.parse(run?.artifacts ?? "{}")
  console.log(`[video-run] research=${artifacts.research?.items?.length}条 mode=${artifacts.research?.mode} directions=${artifacts.directions?.length}`)
  if (run?.status === "error") throw new Error("run error: " + run.error)

  if (run?.status === "blocked") {
    // 3. 直出分镜（带推荐方向）
    const dir = (artifacts.directions ?? []).find((d) => d.recommended) ?? artifacts.directions?.[0] ?? null
    const sb = await fetch(`${BASE}/api/video-runs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "storyboard",
        runId: created.id,
        ...(dir ? { direction: { key: dir.key, kind: dir.kind, name: dir.name, language: dir.language, accent: dir.palette.accent, base: dir.palette.base, feel: dir.feel } } : {}),
      }),
    }).then((r) => r.json())
    console.log(`[storyboard] ok=${Boolean(sb.storyboard)} scenes=${sb.storyboard?.scenes?.length} seconds=${sb.storyboard?.totalSeconds} dir=${sb.storyboard?.direction?.name ?? "无"}`)
    if (!sb.storyboard) throw new Error("分镜失败: " + (sb.error ?? ""))
    const after = await fetch(`${BASE}/api/runs/${created.id}`).then((r) => r.json()).then((j) => j.run)
    console.log(`[video-run-final] status=${after.status} outputLen=${(after.output ?? "").length}`)
    console.log(`[video-run-final] steps=${JSON.parse(after.steps ?? "[]").map((s) => `${s.name}:${s.status}`).join(" ")}`)
  }
  console.log("SMOKE-PASS")
}

main().catch((e) => {
  console.error("SMOKE-FAIL:", e.message)
  process.exit(1)
})
