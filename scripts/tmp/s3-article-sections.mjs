// s3-article-sections.mjs —— 量成稿 markdown 的逐节字数（定位超写分布）
// 用法：node scripts/tmp/s3-article-sections.mjs <runPrefix>
import { PrismaClient } from "@prisma/client"
const db = new PrismaClient()
const q = process.argv[2]
const run = (await db.agentRun.findMany({ where: { id: { startsWith: q } } }))[0]
const article = await db.article.findFirst({ where: { runId: run.id }, orderBy: { version: "desc" } })
const md = article.markdown
const parts = md.split(/\n(?=## )/)
console.log(`run ${run.id.slice(0, 8)}｜article v${article.version}｜wordCount 字段=${article.wordCount}｜markdown 总长=${md.length}`)
let sum = 0
for (const p of parts) {
  const head = (p.match(/^##?\s*(.+)/) || [])[1] || "(H1)"
  const clean = p.replace(/^#+\s.*$/m, "").replace(/!\[[^\]]*\]\([^)]*\)/g, "").replace(/\s/g, "")
  sum += clean.length
  console.log(`  ${String(clean.length).padStart(5)} 字｜${head.slice(0, 22)}`)
}
console.log(`  合计（去标题去图链）: ${sum}`)
await db.$disconnect()
