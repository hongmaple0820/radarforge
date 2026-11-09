// s3-eval-metrics.mjs —— S3 批次 eval 专属度量抽取（锚点密度/骨架/字数落带）
// 用法：node scripts/tmp/s3-eval-metrics.mjs <tag>
// 从 DB 按 runId 拉 Article 正文与 run 元数据，输出 /tmp/s3-metrics-<tag>.json
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const tag = process.argv[2] || "tmp"
const RUNS = process.argv[3] ? process.argv[3].split(",") : []

// 优先命令行给 runId 列表（支持 8 位前缀自动补齐：与当日 done 文章 run 匹配）；否则取最新 4 个
let runs
if (RUNS.length) {
  const all = await db.agentRun.findMany({ where: { kind: "article", status: "done" }, orderBy: { createdAt: "desc" }, take: 30 })
  runs = RUNS.map((q) => all.find((r) => r.id.startsWith(q))).filter(Boolean).reverse()
} else {
  runs = await db.agentRun.findMany({ where: { kind: "article", status: "done" }, orderBy: { createdAt: "desc" }, take: 4 })
  runs = runs.reverse()
}

const out = []
for (const r of runs) {
  const article = await db.article.findFirst({ where: { runId: r.id } })
  if (!article) continue
  const body = article.markdown || ""
  const anchors = (body.match(/\[\d+\]/g) || []).length
  const chars = article.wordCount || body.replace(/\s/g, "").length
  const inBand = chars >= 2500 && chars <= 4000
  const meta = typeof r.meta === "string" ? JSON.parse(r.meta || "{}") : (r.meta || {})
  const aiNote = r.aiNote || ""
  const steps = typeof r.steps === "string" ? JSON.parse(r.steps || "[]") : (r.steps || [])
  // 骨架：outline 产物 artifact 或 meta 里的 skeleton 留痕
  const artifacts = await db.asset.findMany({ where: { runId: r.id }, select: { kind: true, meta: true } })
  const outlineArt = artifacts.find((a) => /outline/i.test(a.kind || ""))
  const skelMatch = JSON.stringify(meta) + aiNote + JSON.stringify(outlineArt?.meta || {})
  const skeleton = (skelMatch.match(/"(?:skeleton|narrativeSkeleton)"\s*:\s*"([a-z-]+)"/) || [])[1] || "pyramid(默认)"
  out.push({
    runId: r.id.slice(0, 8), title: r.ideaTitle.slice(0, 18), tier: r.lengthTier,
    chars, inBand, anchors, anchorPer1k: +(anchors / (chars / 1000)).toFixed(2),
    skeleton, stepCount: steps.length,
  })
}
console.log(JSON.stringify(out, null, 2))
import { writeFileSync } from "fs"
writeFileSync(`/tmp/s3-metrics-${tag}.json`, JSON.stringify(out, null, 2))
console.log(`→ /tmp/s3-metrics-${tag}.json（${out.length} runs）`)
await db.$disconnect()
