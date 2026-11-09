// s3-run-forensic.mjs —— 对比 before/after 两轮同题 run 的篇幅链取证（v2：读 run.artifacts）
// 用法：node scripts/tmp/s3-run-forensic.mjs <beforeRunPrefix> <afterRunPrefix>
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()

const [bq, aq] = process.argv.slice(2)
for (const [tag, q] of [["BEFORE", bq], ["AFTER", aq]]) {
  const run = (await db.agentRun.findMany({ where: { id: { startsWith: q } } }))[0]
  if (!run) { console.log(tag, q, "NOT FOUND"); continue }
  const arts = await db.article.findMany({ where: { runId: run.id }, orderBy: { version: "asc" }, select: { version: true, wordCount: true } })
  console.log(`\n===== ${tag} ${run.id.slice(0, 10)} =====`)
  console.log(`skeleton: ${run.skeleton || "(空)"} | tier: ${run.lengthTier}`)
  console.log(`article 版本链: ${arts.map((a) => `v${a.version}:${a.wordCount}`).join(" → ")}`)
  // artifacts 是 JSON 字符串：找 outline 键
  try {
    const art = JSON.parse(run.artifacts || "{}")
    const keys = Object.keys(art)
    console.log(`artifacts keys: ${keys.join(", ")}`)
    const o = art.outline || art["outline-json"] || null
    if (o) {
      const arr = o.sections || []
      console.log(`outline: ${arr.length} 节 | words: ${arr.map((s) => s.words).join("+")} = ${arr.reduce((a, s) => a + s.words, 0)}`)
      console.log(`  标题: ${arr.map((s) => s.heading).join(" / ")}`)
    }
    const note = art.inBand || art.wordCountNote || art.aiNote
    if (note) console.log(`inBand/备注: ${JSON.stringify(note).slice(0, 200)}`)
  } catch (e) {
    console.log("artifacts 解析失败:", e.message.slice(0, 80))
  }
}
await db.$disconnect()
