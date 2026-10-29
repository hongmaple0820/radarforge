// ============================================================
// Run Manager —— Agent 运行编排（Phase 2 核心）
// 生命周期：queued → running（五步）→ done | error
// 五步：load-skill → context（检索注入）→ generate → review → finalize
// 后台执行 + 前端轮询，步骤级进度落库
// ============================================================

import { db } from "@/lib/db"
import { chatRetry } from "@/lib/gateway"
import { loadSkillBody } from "./skill-loader"
import { buildReviewMessages, buildRunMessages } from "./context-engine"

export interface RunStep {
  name: string
  status: "pending" | "running" | "done" | "error"
  detail: string
  latencyMs: number
}

export function initialSteps(): RunStep[] {
  return [
    { name: "load-skill", status: "pending", detail: "读取 SKILL.md 指令", latencyMs: 0 },
    { name: "context", status: "pending", detail: "上下文组装 + 检索注入", latencyMs: 0 },
    { name: "generate", status: "pending", detail: "按技能指令生成产出", latencyMs: 0 },
    { name: "review", status: "pending", detail: "五维审稿（编辑飞轮）", latencyMs: 0 },
    { name: "finalize", status: "pending", detail: "落库产出", latencyMs: 0 },
  ]
}

// 防止同一 run 并发重复执行
const inflight = new Set<string>()

export async function createRun(args: { skillId: string; input: string }): Promise<string> {
  const skill = await loadSkillBody(args.skillId)
  if (!skill) throw new Error(`skill "${args.skillId}" 不存在`)
  const run = await db.agentRun.create({
    data: {
      skillId: args.skillId,
      skillName: skill.name,
      input: args.input.slice(0, 2000),
      status: "queued",
      steps: JSON.stringify(initialSteps()),
    },
  })
  return run.id
}

/** 后台执行（fire-and-forget），前端轮询 GET /api/agent/runs/[id] */
export function executeRunInBackground(runId: string): void {
  if (inflight.has(runId)) return
  inflight.add(runId)
  void executeRun(runId)
    .catch(() => {
      // executeRun 内部已处理落库，这里兜底
    })
    .finally(() => inflight.delete(runId))
}

async function executeRun(runId: string): Promise<void> {
  const run = await db.agentRun.findUnique({ where: { id: runId } })
  if (!run || run.status === "running" || run.status === "done") return

  const steps: RunStep[] = initialSteps()
  let mode = "DEMO"
  let output = ""
  let error = ""

  await db.agentRun.update({ where: { id: runId }, data: { status: "running", steps: JSON.stringify(steps) } })

  const step = async (i: number, fn: () => Promise<string>) => {
    steps[i] = { ...steps[i], status: "running" }
    await db.agentRun.update({ where: { id: runId }, data: { steps: JSON.stringify(steps) } })
    const t0 = Date.now()
    try {
      const detail = await fn()
      steps[i] = { ...steps[i], status: "done", detail, latencyMs: Date.now() - t0 }
    } catch (e) {
      steps[i] = { ...steps[i], status: "error", detail: (e as Error).message, latencyMs: Date.now() - t0 }
      throw e
    }
    await db.agentRun.update({ where: { id: runId }, data: { steps: JSON.stringify(steps) } })
  }

  try {
    // 1. load-skill
    await step(0, async () => {
      const skill = await loadSkillBody(run.skillId)
      if (!skill) throw new Error(`skill "${run.skillId}" 读取失败`)
      return `已加载 ${skill.name}（${skill.body.length} 字符指令）`
    })

    // 2. context（检索注入）
    let injection: Awaited<ReturnType<typeof buildRunMessages>>["injection"] | null = null
    await step(1, async () => {
      const built = await buildRunMessages({ skillId: run.skillId, input: run.input })
      injection = built.injection
      mode = built.injection.mode
      return `检索「${built.injection.query}」${built.injection.results.length} 条证据（${built.injection.provider}）`
    })

    // 3. generate
    await step(2, async () => {
      const built = await buildRunMessages({
        skillId: run.skillId,
        input: run.input,
        injection: injection ?? undefined,
      })
      output = await chatRetry(built.messages, { temperature: 0.7 })
      if (!output) throw new Error("LLM 返回空内容")
      return `生成 ${output.length} 字符`
    })

    // 4. review（失败不致命——审稿是增益步骤）
    await step(3, async () => {
      try {
        const review = await chatRetry(buildReviewMessages(output), { temperature: 0.2 })
        const score = review.match(/(\d+(\.\d+)?)\s*\/\s*10/)?.[0] ?? ""
        return `${score ? `审稿得分 ${score}｜` : ""}${review.replace(/\s+/g, " ").slice(0, 160)}`
      } catch (e) {
        return `审稿跳过（${(e as Error).message.slice(0, 60)}）`
      }
    })

    // 5. finalize
    await step(4, async () => `产出已落库，模式 ${mode}`)

    await db.agentRun.update({
      where: { id: runId },
      data: { status: "done", output, mode, steps: JSON.stringify(steps), finishedAt: new Date() },
    })
  } catch (e) {
    error = (e as Error).message
    await db.agentRun.update({
      where: { id: runId },
      data: { status: "error", error, steps: JSON.stringify(steps), finishedAt: new Date() },
    })
  }
}

export async function getRun(id: string) {
  const run = await db.agentRun.findUnique({
    where: { id },
    include: { inboxItems: { orderBy: { createdAt: "desc" } }, ideas: true },
  })
  return run
}
