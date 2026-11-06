// probe-db-c3.mjs —— 批次三 E2E 前置勘察：agnes 池/视频设置/既有分镜
process.env.DATABASE_URL = "file:/home/z/my-project/db/custom.db"
import { createRequire } from "module"
const require = createRequire("/home/z/my-project/")
const { PrismaClient } = require("@prisma/client")
const db = new PrismaClient()

async function main() {
  const kv = await db.settingKV.findMany()
  for (const r of kv) {
    if (r.key === "provider:agnes") {
      const v = JSON.parse(r.value)
      console.log("agnes.enabled=", v.enabled, "accounts=", (v.accounts || []).map((a) => ({ label: a.label, enabled: a.enabled, hasKey: Boolean(a.apiKey), site: a.site })))
    }
    if (r.key === "video:channel") console.log("video=", r.value)
  }
  const videoRuns = await db.agentRun.findMany({ where: { kind: "video" }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, ideaTitle: true, status: true, artifacts: true } })
  console.log("video runs:", videoRuns.map((r) => ({ id: r.id.slice(-6), title: r.ideaTitle.slice(0, 20), status: r.status })))
  for (const r of videoRuns) {
    try {
      const a = JSON.parse(r.artifacts || "{}")
      if (a.storyboard) console.log("  ↳ run", r.id.slice(-6), "有 storyboard：", a.storyboard.scenes?.length, "镜，title:", a.storyboard.title?.slice(0, 24))
    } catch { /* ignore */ }
  }
  // 图文线 run（有成稿可出分镜）
  const artRuns = await db.agentRun.findMany({ where: { kind: "article" }, orderBy: { createdAt: "desc" }, take: 3, select: { id: true, ideaTitle: true, status: true } })
  console.log("article runs:", artRuns.map((r) => ({ id: r.id.slice(-6), title: r.ideaTitle.slice(0, 20), status: r.status })))
  await db.$disconnect()
}

main().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
