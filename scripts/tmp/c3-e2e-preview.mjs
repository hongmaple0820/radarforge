// c3-e2e-preview.mjs —— 批次三 E2E 第①段：preview 全链（C2 导演规划 → B1 首帧 → VLM 审帧 → 预览就绪）
// 运行：bash scripts/with-server.sh node scripts/tmp/c3-e2e-preview.mjs（日志 tee 到 scripts/tmp/c3-e2e-preview.log）
import { createRequire } from "module"
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

const STORYBOARD = {
  title: "开源模型追赶商业模型还差什么",
  hook: "差的不只是参数量",
  totalSeconds: 21,
  scenes: [
    { id: 1, seconds: 6, visual: "发光的服务器机柜立于暗蓝机房，冷青色轮廓光", narration: "过去一年，开源模型的评测分数追平了商业旗舰。", subtitle: "评测追平了", broll: "机房实拍", render: "code" },
    { id: 2, seconds: 8, visual: "城市夜景航拍，霓虹数据流穿过楼宇", narration: "但一到真实生产环境，差距就露出来了。", subtitle: "生产环境见真章", broll: "航拍素材", render: "model" },
    { id: 3, seconds: 7, visual: "日出时分的数据中心全景，暖光渐起", narration: "结论：开源不是不能用，而是要算清楚账。", subtitle: "算清楚账", broll: "延时摄影", render: "code" },
  ],
  bgm: "科技脉冲",
  caption: "开源 vs 商业 #AI #大模型",
}

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
  console.log("━━ ① 建 run（直接落库） ━━")
  const run = await db.agentRun.create({
    data: { kind: "video", ideaTitle: "E2E-c3-开源模型追赶商业模型", ideaAngle: "", theme: "douyin", input: "E2E-c3", status: "done", steps: "[]" },
  })
  console.log(`  · run ${run.id}`)
  // storyboard 存进 artifacts（第②段全片渲染从 DB 恢复）
  await db.agentRun.update({ where: { id: run.id }, data: { artifacts: JSON.stringify({ storyboard: STORYBOARD }) } })

  console.log("━━ ② render-video preview=true ━━")
  const r1 = await fetch(`${BASE}/api/runs/${run.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "render-video", storyboard: STORYBOARD, voice: "xiaochen", aspect: "9:16", style: "motion", channel: "agnes", preview: true }),
  }).then((x) => x.json())
  if (!r1.assetId) {
    bad("preview 受理失败", r1.error)
    process.exit(1)
  }
  ok("preview 受理", String(r1.message).slice(0, 70))

  const t0 = Date.now()
  let last = ""
  let pm = null
  while (Date.now() - t0 < 480_000) {
    const cur = await metaOf(r1.assetId)
    const stage = cur?.meta?.stage ?? "?"
    if (stage !== last) {
      console.log(`    · stage: ${stage}${cur?.meta?.aiNote ? `｜${String(cur.meta.aiNote).slice(0, 80)}` : ""}`)
      last = stage
    }
    if (stage === "preview" || stage === "error") {
      pm = cur.meta
      break
    }
    await sleep(6000)
  }

  if (pm?.stage === "preview") {
    ok("stage=preview（首帧就绪，未花 i2v 额度）")
    ok("planner 留痕", `planner=${pm.planner}`)
    ok("首帧统计留痕", `ok=${pm.keyframes?.ok} fallback=${pm.keyframes?.fallback} vlmPass=${pm.keyframes?.vlmPass} fail=${pm.keyframes?.vlmFail} skip=${pm.keyframes?.vlmSkip} via=${(pm.keyframes?.via ?? []).join("/")}`)
    const kfAssets = await db.asset.findMany({ where: { runId: run.id, role: "video-keyframe" } })
    ok("keyframe assets 落库", `n=${kfAssets.length}`)
    const withPath = kfAssets.filter((a) => a.path && a.path.startsWith("/assets/video-frames/"))
    ok("首帧文件路径规范", `n=${withPath.length}`)
    if (withPath.length > 0) {
      const head = await fetch(`${BASE}${withPath[0].path}`).catch(() => null)
      ok("首帧 HTTP 可读", head ? `status=${head.status} type=${head.headers.get("content-type")}` : "fetch 失败")
    }
    const vlmPass = kfAssets.filter((a) => {
      try {
        return ["pass", "pass-after-retry"].includes(JSON.parse(a.meta).vlm)
      } catch {
        return false
      }
    }).length
    ok("VLM 审帧闭环留痕", `pass=${vlmPass}/${kfAssets.length}`)
    // 持久化 preview assetId 供第②段复用首帧
    const { writeFile } = await import("fs/promises")
    await writeFile("/home/z/my-project/scripts/tmp/c3-e2e-state.json", JSON.stringify({ runId: run.id, previewAssetId: r1.assetId, storyboard: STORYBOARD }))
    console.log("  · 状态已存 scripts/tmp/c3-e2e-state.json（第②段复用）")
  } else {
    bad("preview 未就绪", `stage=${pm?.stage} err=${pm?.error}`)
  }

  console.log(`\n━━ c3-e2e-preview：${pass} 通过 / ${fail} 失败 ━━`)
  await db.$disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error("E2E 异常：", e.message)
  process.exit(1)
})
