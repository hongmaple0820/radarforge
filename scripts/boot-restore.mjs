// ============================================================
// boot-restore.mjs —— 沙箱回收后的一键环境自愈（幂等，可重复执行）
// 痛点：沙箱回收会清 DB 文件/重置 SQLite 内容/杀 server——每次会话
//       手工重复 prisma generate → db push → 密钥重落 → tune 重应用。
// 本脚本把全流程固化，并接进 with-server.sh 与 npm run dev：
//       任何启动路径都自动自愈，预览冷启动不再 502/空态。
// 行为（每步幂等、有则跳过、缺则补齐）：
//   1) Prisma client 缺失 → npx prisma generate（3 次重试抗出网抖动）
//   2) schema 未同步 → npx prisma db push --skip-generate（SQLite 毫秒级）
//   3) provider:search 缺失 → 从环境变量/.env 的 SEARCH_KEY 重落（不打印明文）
//   4) tune:draft 缺失 → 从 db/tune-state.json（git 跟踪的推荐态）重应用
//   5) RSS 默认源 → ensureDefaultFeeds()
// 用法：node scripts/boot-restore.mjs [--check 只读状态] [--quiet 精简输出]
// ============================================================
import { existsSync, readFileSync } from "fs"
import { execSync } from "child_process"

const CHECK_ONLY = process.argv.includes("--check")
const QUIET = process.argv.includes("--quiet")
let fixed = 0, broken = 0
function ok(name, cond, extra = "") {
  if (cond) fixed += 1
  else broken += 1
  if (!QUIET) console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
  return cond
}

function readEnvKey() {
  if (process.env.SEARCH_KEY?.trim()) return process.env.SEARCH_KEY.trim()
  try {
    const env = readFileSync(".env", "utf8")
    const m = env.match(/^SEARCH_KEY=(.+)$/m)
    if (m?.[1]?.trim()) return m[1].trim()
  } catch { /* .env 不存在 */ }
  return null
}

console.log("━━━ boot-restore：环境自愈 ━━━")

// ---------- ① Prisma client ----------
const clientOK = existsSync("node_modules/.prisma/client/schema.prisma")
if (!clientOK && !CHECK_ONLY) {
  for (let i = 1; i <= 3; i++) {
    try {
      execSync("npx prisma generate", { stdio: QUIET ? "pipe" : "inherit" })
      break
    } catch (e) {
      if (i === 3) console.log(`  ⚠️ prisma generate 三次失败（出网抖动）：${String(e.message).slice(0, 60)}`)
      else await new Promise((r) => setTimeout(r, 5000))
    }
  }
}
ok("Prisma client", existsSync("node_modules/.prisma/client/schema.prisma"))

// ---------- ② schema 同步 ----------
if (!CHECK_ONLY) {
  try {
    execSync("npx prisma db push --skip-generate", { stdio: QUIET ? "pipe" : "inherit" })
  } catch (e) {
    console.log(`  ⚠️ db push 失败：${String(e.message).slice(0, 80)}`)
  }
}

// ---------- ③④⑤ DB 状态自愈 ----------
let dbOk = true
try {
  const { PrismaClient } = await import("@prisma/client")
  const db = new PrismaClient()

  // 密钥
  const hasKey = await db.settingKV.findUnique({ where: { key: "provider:search" } })
  if (!hasKey && !CHECK_ONLY) {
    const key = readEnvKey()
    if (key) {
      await db.settingKV.upsert({
        where: { key: "provider:search" },
        update: { value: JSON.stringify({ apiKey: key }) },
        create: { key: "provider:search", value: JSON.stringify({ apiKey: key }) },
      })
    }
  }
  const keyNow = await db.settingKV.findUnique({ where: { key: "provider:search" } })
  ok("搜索密钥 provider:search", !!keyNow, keyNow ? "已配置" : "缺失（.env/环境变量无 SEARCH_KEY）")

  // 调优推荐态
  const tuneNow = await db.settingKV.findUnique({ where: { key: "tune:draft" } })
  let tuneVariant = "v0"
  if (tuneNow) tuneVariant = JSON.parse(tuneNow.value).variant ?? "v0"
  else if (!CHECK_ONLY) {
    try {
      const state = JSON.parse(readFileSync("db/tune-state.json", "utf8"))
      if (state.variant && state.variant !== "v0") {
        const { applyVariant } = await import("../src/lib/runtime/tune.ts")
        await applyVariant(state.variant, `boot-restore 重应用（${state.note ?? ""}）`)
        tuneVariant = state.variant
      }
    } catch { /* 无 tune-state.json → 保持 v0 */ }
  }
  ok("调优推荐 tune:draft", true, `当前 ${tuneVariant}`)

  // RSS 默认源
  let feedCount = await db.sourceFeed.count()
  if (feedCount === 0 && !CHECK_ONLY) {
    const { ensureDefaultFeeds } = await import("../src/lib/sources/rss.ts")
    feedCount = await ensureDefaultFeeds()
  }
  ok("RSS 默认源", feedCount > 0, `${feedCount} 个${feedCount === 0 && CHECK_ONLY ? "（--check 只读未播种）" : ""}`)

  // 概览统计（顺便验证核心表可读）
  const [runs, ideas, assets] = [await db.agentRun.count(), await db.idea.count(), await db.asset.count()]
  if (!QUIET) console.log(`  · 数据概览：runs=${runs} ideas=${ideas} assets=${assets}`)
  await db.$disconnect()
} catch (e) {
  dbOk = false
  ok("DB 读写", false, String(e.message).slice(0, 70))
}

if (!QUIET) console.log(`━━━ ${CHECK_ONLY ? "状态检查" : "自愈"}完成：${fixed} 项健康 / ${broken} 项异常 ━━━`)
process.exit(broken > 0 ? 1 : 0)
