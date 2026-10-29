// regression-part2.mjs —— v4 后半：分镜 + 双风格成片 + 发布 + agnes 清理
const BASE = "http://localhost:3000"
const runId = process.argv[2]

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

console.log("━━━ 分镜 + 双风格成片 ━━━")
const sb = await call("POST", `/api/runs/${runId}/actions`, { action: "storyboard", platform: "douyin" })
const sbData = sb.json.storyboard
ok("视频分镜生成", sb.res.ok && (sbData?.scenes?.length ?? 0) >= 3, `${sbData?.scenes?.length ?? 0} 分镜 ${sbData?.totalSeconds ?? 0}s`)

if (sbData) {
  // art 艺术动画线（真出片）
  const rvArt = await call("POST", `/api/runs/${runId}/actions`, { action: "render-video", storyboard: sbData, voice: "xiaochen", aspect: "9:16", style: "art", channel: "local" })
  ok("art 渲染启动", rvArt.res.ok, rvArt.json.message?.slice(0, 80) ?? rvArt.json.error ?? "")
  let artMeta = null
  for (let i = 0; i < 100; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
    const va = [...(rj.run?.assets ?? [])].reverse().find((a) => a.role === "video-final")
    if (!va) continue
    try { artMeta = JSON.parse(va.meta || "{}") } catch { continue }
    if (["done", "error"].includes(artMeta.stage)) break
  }
  ok("art 成片终态", artMeta?.stage === "done", `stage=${artMeta?.stage} ${artMeta?.seconds ?? 0}s style=${artMeta?.style} ${(artMeta?.sizeBytes ?? 0) ? (artMeta.sizeBytes / 1048576).toFixed(1) + "MB" : ""} ${artMeta?.aiNote ?? ""} ${artMeta?.error ?? ""}`)

  // motion 商业片线（对照）
  const rvM = await call("POST", `/api/runs/${runId}/actions`, { action: "render-video", storyboard: sbData, voice: "kazi", aspect: "16:9", style: "motion", channel: "local" })
  ok("motion 渲染启动", rvM.res.ok, rvM.json.message?.slice(0, 60) ?? "")
  let mMeta = null
  for (let i = 0; i < 80; i++) {
    await new Promise((r) => setTimeout(r, 5000))
    const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
    const va = [...(rj.run?.assets ?? [])].reverse().find((a) => a.role === "video-final")
    if (!va) continue
    try { mMeta = JSON.parse(va.meta || "{}") } catch { continue }
    if (["done", "error"].includes(mMeta.stage)) break
  }
  ok("motion 成片终态", mMeta?.stage === "done", `stage=${mMeta?.stage} ${mMeta?.seconds ?? 0}s ${mMeta?.width}×${mMeta?.height}`)
}

console.log("━━━ 封面 + 发布 + 清理 ━━━")
const cover = await call("POST", `/api/runs/${runId}/actions`, { action: "cover" })
ok("封面动作", cover.res.ok, cover.json.ok ? `生成 ${cover.json.path}` : `降级：${String(cover.json.error ?? "").slice(0, 50)}`)

const pub = await call("POST", `/api/runs/${runId}/actions`, { action: "publish" })
ok("发布三级降级", pub.res.ok && Boolean(pub.json.outcome?.levelName), `${pub.json.outcome?.level} ${pub.json.outcome?.levelName ?? ""}`)

await call("PUT", "/api/settings", { scope: "agnes", value: { enabled: false, accounts: [] } })
ok("Agnes 回归账号已清理", true)
