// seed-export-test.mjs —— 造一个带成稿 + claims 的测试 run（专测多平台导出链路，不走 LLM）
import { PrismaClient } from "@prisma/client"
import { randomUUID } from "crypto"

const db = new PrismaClient()

const md = `# 三分钟看懂本周 AI 圈的三件大事

本周 AI 圈信息量爆炸，我把最值得关注的 **三件事** 拆给你看[1]。

## 一、新模型跑分刷新纪录

旗舰模型在推理基准上大幅超越上代[2]，具体来说：

- 数学推理提升 **23%**
- 代码生成通过率首次过半
- 长上下文召回稳定在 99%

> 跑分不等于体验，但趋势值得跟踪。

## 二、开源生态追上来了

社区微调方案在特定任务上逼近闭源旗舰[1]，成本只有十分之一。

## 三、智能体进入生产环境

多家企业把智能体从 demo 推进了真实业务流程，错误率控制成为关键指标[2]。

| 维度 | 上季度 | 本季度 |
| --- | --- | --- |
| 部署量 | 1200 | 5400 |
| 失败率 | 8.2% | 2.1% |

## 写在最后

三件事共同指向一个判断：**落地能力**取代参数规模，成为新的竞争主线[1]。`

const runId = randomUUID()
await db.agentRun.create({ data: { id: runId, kind: "article", ideaTitle: "三分钟看懂本周 AI 圈的三件大事", ideaAngle: "周报视角", persona: "tech-radar", theme: "professional-clean", status: "done", mode: "REAL", steps: "[]", artifacts: "{}", error: "" } })
await db.claim.createMany({ data: [
  { runId, idx: 1, claimType: "事实", text: "开源方案成本十分之一", verified: true, sourceTitle: "开源模型成本报告", sourceUrl: "https://example.com/open-source-cost", sourceSite: "示例研究院", sourceDate: "2026-10-28" },
  { runId, idx: 2, claimType: "数据", text: "数学推理提升 23%", verified: true, sourceTitle: "新模型基准测试", sourceUrl: "https://example.com/benchmark", sourceSite: "示例评测站", sourceDate: "2026-10-29" },
]})
await db.article.create({ data: { runId, version: 1, title: "三分钟看懂本周 AI 圈的三件大事", markdown: md, wordCount: md.replace(/\s/g, "").length, formatted: "<p>seed</p>" } })

console.log(`seed run: ${runId}`)
await db.$disconnect()
