// c3-e2e-full.mjs —— 批次三 E2E 第②段：全片渲染（local + bgm=warm；TTS/ffmpeg/segments/diag/resolution 留痕）
// 前置：c3-e2e-preview.mjs 已产出 scripts/tmp/c3-e2e-state.json（runId + storyboard）
import { createRequire } from "module"
import { readFile } from "fs/promises"
const require = createRequire("/home/z/my-project/")
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db"
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

const BASE = "http://localhost:3000"
let pass = 0
let fail = 0
const ok = (name, extra = "") => {
  pass++
  console.log(`  ✓ ${name}${extra ? `（${extra}）` : ""}`)
}
const bad = (name, extra = "") => {
  fail++
  console.log(`  ✗ ${name}${extra ? ` → ${extra}` : ""}`)
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function metaOf(assetId) {
  const a = await db.asset.findUnique({ where: { id: assetId } })
  if (!a) return null
  try {
    return { meta: JSON.parse(a.meta), provider: a.provider, path: a.path }
  } catch {
    return null
  }
}

async function main() {
  const state = JSON.parse(await readFile("/home/z/my-project/scripts/tmp/c3-e2e-state.json", "utf-8"))
  const runId = state.runId
  const storyboard = state.storyboard
  console.log(`━━ run ${runId.slice(-8)} 全片渲染（local + bgm=warm） ━━`)

  const r = await fetch(`${BASE}/api/runs/${runId}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "render-video", storyboard, voice: "xiaochen", aspect: "9:16", style: "motion", channel: "local", bgm: "warm", preview: false }),
  }).then((x) => x.json())
  if (!r.assetId) {
    bad("全片受理失败", r.error)
    process.exit(1)
  }
  ok("全片受理", String(r.message).slice(0, 70))

  const t0 = Date.now()
  let last = ""
  let fm = null
  while (Date.now() - t0 < 360_000) {
    const cur = await metaOf(r.assetId)
    const stage = cur?.meta?.stage ?? "?"
    if (stage !== last) {
      console.log(`    · stage: ${stage}${cur?.meta?.aiNote ? `｜${String(cur.meta.aiNote).slice(0, 70)}` : ""}`)
      last = stage
    }
    if (stage === "done" || stage === "error") {
      fm = cur
      break
    }
    await sleep(6000)
  }

  if (fm?.meta?.stage === "done") {
    const m = fm.meta
    ok("成片完成", `${m.seconds}s · ${m.width}x${m.height} · ${(m.sizeBytes / 1048576).toFixed(2)}MB · v${m.version}`)
    ok("segments 每镜留痕", `n=${m.segments?.length}｜${(m.segments ?? []).map((s) => `#${s.sceneId}:${s.source}${s.seconds ? ` ${s.seconds}s` : ""}`).join(" ")}`)
    const i2vCount = (m.segments ?? []).filter((s) => s.source === "i2v").length
    ok("Agnes 未配置 → 全 code 诚实降级", `i2v=${i2vCount}/${m.segments?.length ?? 0}`)
    ok("diag 分腿汇总留痕", `entries=${m.diag?.entries} errors=${m.diag?.errors} legs=${Object.keys(m.diag?.legs ?? {}).join("+")}`)
    ok("分辨率留痕", `resolution=${m.resolution}`)
    ok("TTS 口播", `audioMode=${m.audioMode}｜${String(m.ttsNote).slice(0, 40)}`)
    ok("BGM 混音", `bgmNote=${String(m.bgmNote).slice(0, 44)}`)
    const head = await fetch(`${BASE}${fm.path}`).catch(() => null)
    ok("成片 HTTP 可读", head ? `status=${head.status} bytes=${head.headers.get("content-length")}` : "fetch 失败")
    ok("provider 留痕", fm.provider)
    // 分段留存（指着改物料）
    const { stat } = await import("fs/promises")
    try {
      const s0 = await stat(`/home/z/my-project/public/assets/video-segs/${runId}/s0.mp4`)
      ok("分段留存（指着改物料）", `s0=${(s0.size / 1048576).toFixed(2)}MB`)
    } catch {
      bad("分段留存缺失")
    }
  } else {
    bad("全片未完成", `stage=${fm?.meta?.stage} err=${fm?.meta?.error}`)
  }

  console.log(`\n━━ c3-e2e-full：${pass} 通过 / ${fail} 失败 ━━`)
  await db.$disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error("E2E 异常：", e.message)
  process.exit(1)
})
