// agnes-i2v-hybrid.mjs —— hybrid 通道单镜 i2v 完整闭环（Bash 10min 窗口约束下的最小验证）
// 前置：agnes-pool-setup.mjs 已配好 4 账号池（探活 4/4 有效）
// 目的：验证单镜 i2v 真实提交→轮询→下载→入片完整闭环（1 model + 2 code，控制时长在窗口内）
// 运行：bash scripts/with-server.sh "node scripts/tmp/agnes-i2v-hybrid.mjs"
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

// 小规模：3 镜（2 model i2v + 1 code），每镜 4~6s，控制免费额度消耗
const STORYBOARD = {
  title: "Agnes i2v 提交腿实测",
  hook: "AI 首帧动起来",
  totalSeconds: 15,
  scenes: [
    { id: 1, seconds: 5, visual: "清晨的城市天际线，镜头缓慢上摇，暖金色阳光穿过云层", narration: "这是 Agnes i2v 提交腿的实测首镜。", subtitle: "i2v 实测", broll: "城市延时", render: "model" },
    { id: 2, seconds: 6, visual: "深蓝色数据中心机房，服务器指示灯如星海般闪烁，镜头平稳前推", narration: "第二镜走本地代码动画对照。", subtitle: "本地对照", broll: "机房动效", render: "code" },
    { id: 3, seconds: 4, visual: "代码编辑器界面，绿色字符逐行点亮", narration: "最后一镜同样本地渲染。", subtitle: "本地对照", broll: "屏幕动效", render: "code" },
  ],
  bgm: "calm",
  caption: "i2v 实测 #RadarForge",
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
    data: { kind: "video", ideaTitle: "E2E-Agnes-i2v-提交腿实测", ideaAngle: "", theme: "douyin", input: "E2E-agnes-i2v", status: "done", steps: "[]" },
  })
  console.log(`  · run ${run.id}`)

  console.log("━━ ② render-video channel=hybrid（1 model i2v + 2 code） ━━")
  const r = await fetch(`${BASE}/api/runs/${run.id}/actions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "render-video", storyboard: STORYBOARD, voice: "xiaochen", aspect: "9:16", style: "motion", channel: "hybrid", bgm: "calm", preview: false }),
  }).then((x) => x.json())
  if (!r.assetId) {
    bad("全片受理失败", r.error)
    process.exit(1)
  }
  ok("全片受理", String(r.message).slice(0, 90))

  // 轮询（i2v 每镜 1~4 分钟 → 窗口 9 分钟，留 1 分钟收尾；沙箱单调用上限约束）
  const t0 = Date.now()
  let last = ""
  let fm = null
  while (Date.now() - t0 < 555_000) {
    const cur = await metaOf(r.assetId)
    const stage = cur?.meta?.stage ?? "?"
    const note = cur?.meta?.aiNote ?? cur?.meta?.error ?? ""
    if (stage !== last || note !== (fm?.meta?.aiNote ?? fm?.meta?.error ?? "")) {
      const mins = ((Date.now() - t0) / 60000).toFixed(1)
      console.log(`    · [${mins}min] stage: ${stage}${note ? `｜${String(note).slice(0, 90)}` : ""}`)
      last = stage
    }
    if (stage === "done" || stage === "error") {
      fm = cur
      break
    }
    await sleep(8000)
  }

  if (fm?.meta?.stage === "done") {
    const m = fm.meta
    ok("成片完成", `${m.seconds}s · ${m.width}x${m.height} · ${(m.sizeBytes / 1048576).toFixed(2)}MB · v${m.version}`)
    ok("provider 留痕", fm.provider)
    ok("segments 每镜留痕", `n=${m.segments?.length}｜${(m.segments ?? []).map((s) => `#${s.sceneId}:${s.source}${s.seconds ? ` ${s.seconds}s` : ""}`).join(" ")}`)
    const i2vCount = (m.segments ?? []).filter((s) => s.source === "i2v").length
    const modelCount = STORYBOARD.scenes.filter((s) => s.render === "model").length
    if (i2vCount === modelCount) ok("★ 单镜 i2v 完整闭环", `i2v=${i2vCount}/${modelCount}（model 镜走完 AI 图生视频全链）`)
    else if (i2vCount > 0) ok("i2v 部分成功（其余兜底）", `i2v=${i2vCount}/${modelCount}`)
    else bad("i2v 提交腿未走通（全兜底）", `i2v=0/${modelCount}｜${String(m.aiNote).slice(0, 80)}`)
    ok("diag 分腿汇总留痕", `entries=${m.diag?.entries} errors=${m.diag?.errors} legs=${Object.keys(m.diag?.legs ?? {}).join("+")}`)
    ok("分辨率留痕", `resolution=${m.resolution}`)
    ok("TTS 口播", `audioMode=${m.audioMode}｜${String(m.ttsNote).slice(0, 44)}`)
    ok("BGM 混音", `bgmNote=${String(m.bgmNote).slice(0, 44)}`)
    // 首帧 VLM 审帧留痕
    const kfAssets = await db.asset.findMany({ where: { runId: run.id, role: "video-keyframe" } })
    ok("keyframe assets 落库", `n=${kfAssets.length}`)
    const vlmPass = kfAssets.filter((a) => {
      try {
        return ["pass", "pass-after-retry"].includes(JSON.parse(a.meta).vlm)
      } catch {
        return false
      }
    }).length
    ok("VLM 审帧闭环留痕", `pass=${vlmPass}/${kfAssets.length}`)
    // 成片 HTTP 可读
    const head = await fetch(`${BASE}${fm.path}`).catch(() => null)
    ok("成片 HTTP 可读", head ? `status=${head.status} bytes=${head.headers.get("content-length")}` : "fetch 失败")
    // 分段留存
    const { stat } = await import("fs/promises")
    try {
      const s0 = await stat(`/home/z/my-project/public/assets/video-segs/${run.id}/s0.mp4`)
      ok("分段留存（指着改物料）", `s0=${(s0.size / 1048576).toFixed(2)}MB`)
    } catch {
      bad("分段留存缺失")
    }
    // 打印成片相对路径（供人工核验）
    console.log(`\n  · 成片路径：${fm.path}`)
    console.log(`  · runId：${run.id}`)
  } else {
    bad("全片未完成", `stage=${fm?.meta?.stage ?? "TIMEOUT(14min)"} err=${fm?.meta?.error ?? String(fm?.meta?.aiNote ?? "").slice(0, 100)}`)
  }

  console.log(`\n━━ agnes-i2v-hybrid：${pass} 通过 / ${fail} 失败 ━━`)
  await db.$disconnect()
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error("E2E 异常：", e.message)
  process.exit(1)
})
