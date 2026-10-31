// ============================================================
// seed-p13-run.mjs —— p13 浏览器验证用的合成 run 注入（零 LLM）
// 直接 Prisma 插入：done 状态 + 九步留痕 + brief/outline 产物 +
// 两版成稿（v0/v1，含 ## 分节）+ 审稿记录。跑完输出 runId。
// 用法：node scripts/seed-p13-run.mjs
// ============================================================
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()

const MARKDOWN_V0 = [
  "# 评测集是 prompt 调优的地基",
  "",
  "先建度量，再动刀——这句行话背后是一整套可回归的固定题库。",
  "",
  "## 为什么需要固定评测集",
  "",
  "同一题每次跑同一配置，分数才可比。随机换题的评测等于用游标卡尺量不同的东西 [1]。把 50 篇选题、人格与主题全部钉死，任何 prompt 改动的前后对比才有归因可言。",
  "",
  "## 五维量表怎么定锚",
  "",
  "G-Eval 的核心不是量表本身，而是评分锚点：9 分长什么样、6 分长什么样，裁判心里有谱才不聚在 7 分 [2]。再配反偏差指令——不奖励长度、不偏爱结构套话。",
  "",
  "## 门禁是度量的最后一公里",
  "",
  "评分不拦截发布就只是 vanity metric。把审稿均分与断言无据率写进发布门禁，度量才真正进入生产链路 [1]。",
  "",
].join("\n")

const MARKDOWN_V1 = MARKDOWN_V0.replace(
  "G-Eval 的核心不是量表本身，而是评分锚点：9 分长什么样、6 分长什么样，裁判心里有谱才不聚在 7 分 [2]。再配反偏差指令——不奖励长度、不偏爱结构套话。",
  "G-Eval 的核心是评分锚点：9 分与 6 分各长什么样，先给裁判看样例 [2]。锚定之后再加反偏差条款：长度不加分、套话不加分。",
)

const STEPS = [
  { name: "brief", status: "done", detail: "读者：内容创业者｜判断：先建度量再动刀", latencyMs: 4200 },
  { name: "claims", status: "done", detail: "DEMO 检索 2 条（演示数据）", latencyMs: 3600 },
  { name: "outline", status: "done", detail: "3 节大纲｜预算 900 字", latencyMs: 5100 },
  { name: "draft", status: "done", detail: "分节 3/3｜900 字", latencyMs: 21000 },
  { name: "review", status: "done", detail: "R1:8.2 一轮通过（同家族回退如实标注）", latencyMs: 15000 },
  { name: "verify", status: "done", detail: "DEMO 搜索诚实跳过（断言统计留痕）", latencyMs: 2200 },
  { name: "illustrate", status: "done", detail: "配图 1 张降级留痕", latencyMs: 8000 },
  { name: "cover", status: "done", detail: "生图降级（端点 405）留痕不阻断", latencyMs: 3000 },
  { name: "layout", status: "done", detail: "6995 字符", latencyMs: 1800 },
]

const ARTIFACTS = JSON.stringify({
  brief: {
    targetReader: "想提升内容质量的 AI 自媒体创作者",
    realProblem: "主观感觉文章质量不稳定，但无法定位差异来自哪里",
    coreJudgment: "质量是管线结构问题，不是模型大小问题；先建度量再动刀",
    counterView: "换更强的模型也能提升质量",
    boundary: "仅覆盖 API 模型可完成的写作管线",
  },
  outline: {
    title: "评测集是 prompt 调优的地基",
    sections: [
      { heading: "为什么需要固定评测集", point: "同题同配置才可比可归因", evidence: [1], illustration: "", words: 300 },
      { heading: "五维量表怎么定锚", point: "评分锚点 + 反偏差指令", evidence: [2], illustration: "数据卡", words: 300 },
      { heading: "门禁是度量的最后一公里", point: "评分不拦截发布就是 vanity metric", evidence: [1], illustration: "", words: 300 },
    ],
  },
  assertions: {
    total: 3,
    verified: 2,
    unsupported: 1,
    unsupportedRate: 0.33,
    threshold: 0.3,
    gateBlocked: true,
    items: [
      { text: "评测集固定 50 篇选题", verified: true, sourceUrl: "https://example.com/eval", sourceSite: "example.com" },
      { text: "G-Eval 使用多维量表", verified: true, sourceUrl: "https://arxiv.org/abs/2303.16634", sourceSite: "arxiv" },
      { text: "门禁拦截率为 33%", verified: false, sourceUrl: "", sourceSite: "" },
    ],
  },
})

const run = await db.agentRun.create({
  data: {
    kind: "article",
    ideaTitle: "评测集是 prompt 调优的地基",
    ideaAngle: "从度量先行看内容工程的质量闭环",
    persona: "cold-analyst",
    theme: "professional-clean",
    input: "p13 UI 验证",
    status: "done",
    mode: "DEMO",
    steps: JSON.stringify(STEPS),
    artifacts: ARTIFACTS,
    output: MARKDOWN_V0,
    finishedAt: new Date(),
  },
})

const wc = (s) => s.replace(/\s/g, "").length
await db.article.create({
  data: { runId: run.id, version: 0, title: "评测集是 prompt 调优的地基", markdown: MARKDOWN_V0, wordCount: wc(MARKDOWN_V0), formatted: `<h1>${"评测集是 prompt 调优的地基"}</h1>` },
})
await db.article.create({
  data: { runId: run.id, version: 1, title: "评测集是 prompt 调优的地基", markdown: MARKDOWN_V1, wordCount: wc(MARKDOWN_V1), formatted: `<h1>${"评测集是 prompt 调优的地基"}</h1>` },
})
await db.reviewRecord.create({
  data: {
    runId: run.id,
    round: 1,
    scoresJson: JSON.stringify({ accuracy: 8, viewpoint: 8, usefulness: 8, voice: 8, readability: 8 }),
    commentsJson: JSON.stringify([
      { dim: "准确", comment: "断言均有据或如实标注" },
      { dim: "观点", comment: "判断清晰不含糊" },
    ]),
    average: 8,
    revised: false,
  },
})
await db.claim.create({
  data: {
    runId: run.id,
    idx: 1,
    claimType: "事实",
    text: "固定评测集包含 50 篇选题",
    verified: true,
    sourceTitle: "评测集设计",
    sourceUrl: "https://example.com/eval",
    sourceSite: "example.com",
    sourceDate: new Date().toISOString(),
  },
})
await db.claim.create({
  data: {
    runId: run.id,
    idx: 2,
    claimType: "事实",
    text: "G-Eval 论文发表于 2023 年",
    verified: true,
    sourceTitle: "G-Eval",
    sourceUrl: "https://arxiv.org/abs/2303.16634",
    sourceSite: "arxiv",
    sourceDate: new Date().toISOString(),
  },
})

console.log(run.id)
await db.$disconnect()
