// ============================================================
// aihot-video-retry.mjs —— full-regression 视频直出段复跑（配额冷却后收口）
// 背景：aihot-access 批次全量回归时 zai 共享配额 429（POST /api/video-runs
// 研究腿 71s 重试后 500，三个级联断言红——外部约束非本批代码，见 spec-axis 已知妥协 1）。
// 本脚本复刻 full-regression §6b 的视频线选题直出流，独立窗口重试。
// 运行：bash scripts/with-server.sh "node scripts/tmp/aihot-video-retry.mjs"
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

console.log("━━━ full-regression 视频直出段复跑（429 冷却后） ━━━")

const created = await j("POST", "/api/video-runs", {
  topic: "P0 回归：开源模型追赶商业模型还差什么",
  angle: "对齐、安全与长链条推理的差距拆解",
  platform: "douyin",
})
const vRunId = created.json?.id
ok("创建直出 video run（POST 不再 429/500）", created.status === 200 && Boolean(vRunId), `status=${created.status}｜${String(created.json?.error ?? "").slice(0, 60)}`)

if (vRunId) {
  let vRun = null
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 3000))
    const rj = await fetch(`${BASE}/api/runs/${vRunId}`).then((r) => r.json())
    vRun = rj.run
    if (["blocked", "error"].includes(vRun?.status)) break
  }
  ok("直出前两步终态 blocked（等选方向）", vRun?.status === "blocked", `status=${vRun?.status}｜${String(vRun?.error ?? "").slice(0, 60)}`)
  let vArtifacts = {}
  try { vArtifacts = JSON.parse(vRun?.artifacts || "{}") } catch { /* ignore */ }
  ok("检索摘要落库（research）", (vArtifacts.research?.items?.length ?? 0) >= 1, `${vArtifacts.research?.items?.length ?? 0} 条｜${vArtifacts.research?.mode}`)
  ok("导演三方向落库（directions）", (vArtifacts.directions?.length ?? 0) === 3, `${vArtifacts.directions?.length ?? 0} 个方向`)
  const vDir = (vArtifacts.directions ?? []).find((d) => d.recommended) ?? vArtifacts.directions?.[0] ?? null
  const vSb = await j("POST", "/api/video-runs", {
    action: "storyboard",
    runId: vRunId,
    ...(vDir ? { direction: { key: vDir.key, kind: vDir.kind, name: vDir.name, language: vDir.language, accent: vDir.palette.accent, base: vDir.palette.base, feel: vDir.feel } } : {}),
  })
  const vSbData = vSb.json?.storyboard
  ok("直出分镜生成（≥3 镜）", vSb.status === 200 && (vSbData?.scenes?.length ?? 0) >= 3, `${vSbData?.scenes?.length ?? 0} 分镜 ${vSbData?.totalSeconds ?? 0}s${vSb.json?.error ? "｜" + String(vSb.json.error).slice(0, 50) : ""}`)
  const vRunAfter = await fetch(`${BASE}/api/runs/${vRunId}`).then((r) => r.json())
  ok("直出 run 终态 done（三步全终）", vRunAfter.run?.status === "done", JSON.parse(vRunAfter.run?.steps || "[]").map((s) => `${s.name}:${s.status}`).join(" "))
  ok("分镜脚本 markdown 落 output", (vRunAfter.run?.output ?? "").includes("## 分镜"), `${(vRunAfter.run?.output ?? "").length} 字符`)
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
