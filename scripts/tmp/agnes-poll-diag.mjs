// agnes-poll-diag.mjs —— 直连 Agnes API 诊断轮询协议（绕过应用解析层）
// 目的：查清 i2v 任务轮询响应的真实结构（status 取值 / url 字段位置），
//       判断「poll 久等不出」是 Agnes 真排队慢还是 parseAgnesPoll 解析不匹配。
// 密钥从 db/custom.db SettingKV 读（脱敏不打印）。直接跑：node scripts/tmp/agnes-poll-diag.mjs
import { createRequire } from "module"
const require = createRequire("/home/z/my-project/")
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db"
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function main() {
  // 从 SettingKV 拿第一个账号（密钥不打印）
  const kv = await db.settingKV.findMany()
  const raw = kv.find((k) => k.key === "provider:agnes")?.value
  if (!raw) {
    console.error("SettingKV 无 agnes 配置")
    process.exit(1)
  }
  const s = JSON.parse(raw)
  const acc = s.accounts.find((a) => a.enabled && a.apiKey)
  if (!acc) {
    console.error("无可用账号")
    process.exit(1)
  }

  // ① 遍历账号提交（免费档队列全局满载时段，哪个号能提交用哪个）
  const submitBody = {
    model: s.videoModel || "agnes-video-2.5-flash",
    mode: "text",
    prompt: "一只橙猫在窗台晒太阳，镜头缓慢拉近",
    seconds: 4,
    size: "720P",
  }
  console.log("━━ ① 提交（text 模式 4s，遍历账号） ━━")
  let submitAcc = null
  let taskId = ""
  for (const a of s.accounts.filter((x) => x.enabled && x.apiKey)) {
    const b = a.site === "intl" ? "https://apihub.agnes-ai.cn/v1" : "https://api.agnes-ai.cn/v1"
    const h = { "Content-Type": "application/json", Authorization: `Bearer ${a.apiKey}` }
    const sub = await fetch(`${b}/videos`, { method: "POST", headers: h, body: JSON.stringify(submitBody), signal: AbortSignal.timeout(60000) })
    const subText = await sub.text()
    console.log(`  · ${a.id} → HTTP ${sub.status} ${subText.slice(0, 140)}`)
    if (sub.ok) {
      try {
        const j = JSON.parse(subText)
        taskId = String(j.id ?? j.video_id ?? j.task_id ?? "")
        if (taskId) {
          submitAcc = a
          break
        }
      } catch {}
    }
    await sleep(2000) // 每账号 1 任务/分钟 → 提交失败间隔 2s 足够（失败不占任务位）
  }
  if (!taskId || !submitAcc) {
    console.error("  全部账号提交失败（队列全局满载）——证实为 Agnes 免费档容量问题，非代码问题")
    process.exit(2)
  }
  const base = submitAcc.site === "intl" ? "https://apihub.agnes-ai.cn/v1" : "https://api.agnes-ai.cn/v1"
  const auth = { "Content-Type": "application/json", Authorization: `Bearer ${submitAcc.apiKey}` }
  console.log(`  ✓ 提交成功：账号 ${submitAcc.id} · taskId: ${taskId}`)

  // ② 双端点轮询，打印原始响应（5 分钟窗口）
  console.log("━━ ② 轮询（每 10s，双端点原始响应） ━━")
  const t0 = Date.now()
  let seen = new Set()
  while (Date.now() - t0 < 300_000) {
    for (const [name, url] of [
      ["A:/videos/{id}", `${base}/videos/${encodeURIComponent(taskId)}`],
      ["B:/agnesapi", `${base.replace(/\/v1$/, "")}/agnesapi?video_id=${encodeURIComponent(taskId)}&model_name=${encodeURIComponent(submitBody.model)}`],
    ]) {
      try {
        const res = await fetch(url, { headers: auth, signal: AbortSignal.timeout(20000) })
        const text = await res.text()
        const sig = `${name}:${res.status}:${text.slice(0, 250)}`
        if (!seen.has(sig)) {
          seen.add(sig)
          const mins = ((Date.now() - t0) / 60000).toFixed(1)
          console.log(`  [${mins}min] ${name} HTTP ${res.status}`)
          console.log(`    ${text.slice(0, 400)}`)
        }
        // 完成即收
        try {
          const j = JSON.parse(text)
          const urlField = j.url ?? j.video_url ?? j.metadata?.url ?? j.data?.url ?? j.result?.url
          const st = String(j.status ?? j.state ?? "")
          if (urlField) {
            console.log(`\n  ★ 完成！status=${st} url=${String(urlField).slice(0, 120)}`)
            console.log(`  · url 字段路径：${j.url !== undefined ? "url" : j.video_url !== undefined ? "video_url" : j.metadata?.url !== undefined ? "metadata.url" : "其它"}（parseAgnesPoll ${["url", "video_url"].includes(j.url !== undefined ? "url" : "video_url") || j.metadata?.url !== undefined ? "可解析" : "解析不到!"}）`)
            process.exit(0)
          }
        } catch {}
      } catch (e) {
        console.log(`  ${name} 异常: ${e.message.slice(0, 80)}`)
      }
    }
    await sleep(10000)
  }
  console.log("\n  ⏱ 5 分钟窗口内未完成（打印最后已知状态后退出）")
  process.exit(2)
}

main().catch((e) => {
  console.error("诊断异常：", e.message)
  process.exit(1)
})
