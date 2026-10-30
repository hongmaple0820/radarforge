// ============================================================
// video-runs.ts —— 视频线选题直出（P0：解耦图文线）
// 选题 + 角度 → 检索摘要（事实下限）→ 导演三方向 → 用户选向
// （run 进入 blocked 态）→ 分镜脚本 → 复用既有三通道渲染。
// 从文章出视频仍是推荐路径（信息密度更高）；本线解决
// 「只想快速出一条视频」的场景，不必先等一篇 4 分钟文章。
// ============================================================

import { db } from "@/lib/db"
import { chatRetry, searchWithFallback } from "@/lib/gateway"
import { extractJson } from "./json"
import {
  directionsDirectMessages,
  storyboardDirectMessages,
  parseDirections,
  parseStoryboard,
  type DirectionBrief,
  type ResearchDigest,
  type Storyboard,
} from "./skills/radar-rewrite"

const VIDEO_STEP_DEFS: { name: string; label: string }[] = [
  { name: "research", label: "情报检索" },
  { name: "directions", label: "导演三方向" },
  { name: "storyboard", label: "分镜脚本" },
]

export function initialVideoSteps() {
  return VIDEO_STEP_DEFS.map((s) => ({ name: s.name, status: "pending", detail: s.label, latencyMs: 0 }))
}

const inflightVideo = new Set<string>()

export interface CreateVideoRunArgs {
  topic: string
  angle?: string
  platform?: string // douyin | shipinhao | bilibili
}

export function normalizePlatform(p?: string): "douyin" | "shipinhao" | "bilibili" {
  return p === "shipinhao" || p === "bilibili" ? p : "douyin"
}

export async function createVideoRun(args: CreateVideoRunArgs): Promise<string> {
  const run = await db.agentRun.create({
    data: {
      kind: "video",
      ideaTitle: args.topic.slice(0, 200),
      ideaAngle: (args.angle ?? "").slice(0, 500),
      // platform 存 theme 字段（run 无专用列；theme 对视频 run 无排版语义）
      theme: normalizePlatform(args.platform),
      input: args.topic,
      status: "queued",
      steps: JSON.stringify(initialVideoSteps()),
    },
  })
  return run.id
}

export function executeVideoRunInBackground(runId: string): void {
  if (inflightVideo.has(runId)) return
  inflightVideo.add(runId)
  void executeVideoRun(runId).finally(() => inflightVideo.delete(runId))
}

async function executeVideoRun(runId: string): Promise<void> {
  const run = await db.agentRun.findUnique({ where: { id: runId } })
  if (!run || run.kind !== "video" || run.status === "running" || run.status === "done") return

  const steps = initialVideoSteps()
  const artifacts: Record<string, unknown> = {}
  const platform = normalizePlatform(run.theme)
  let mode: "REAL" | "DEMO" = "DEMO"

  await db.agentRun.update({ where: { id: runId }, data: { status: "running", steps: JSON.stringify(steps) } })
  const save = () => db.agentRun.update({ where: { id: runId }, data: { steps: JSON.stringify(steps) } }).catch(() => {})

  const step = async (i: number, fn: () => Promise<string>, opts?: { optional?: boolean }) => {
    steps[i] = { ...steps[i], status: "running" }
    await save()
    const t0 = Date.now()
    try {
      const detail = await fn()
      steps[i] = { ...steps[i], status: "done", detail, latencyMs: Date.now() - t0 }
    } catch (e) {
      steps[i] = { ...steps[i], status: opts?.optional ? "skipped" : "error", detail: (e as Error).message.slice(0, 200), latencyMs: Date.now() - t0 }
      if (!opts?.optional) throw e
    }
    await save()
  }

  try {
    // ========== Step 1: 情报检索（选题直出的事实下限） ==========
    let digest: ResearchDigest = { mode: "DEMO", items: [] }
    await step(0, async () => {
      const resp = await searchWithFallback({ query: run.ideaTitle.slice(0, 40), count: 8, industry: "news", freshness: "d30" })
      mode = resp.mode
      digest = {
        mode: resp.mode,
        items: resp.results.slice(0, 8).map((r) => ({
          title: r.title.slice(0, 120),
          site: r.site,
          date: r.date,
          url: r.url,
          snippet: (r.passage ?? "").slice(0, 160),
        })),
      }
      artifacts.research = digest
      return `${digest.items.length} 条检索摘要｜${resp.mode === "REAL" ? "真实联网" : "演示数据（分镜将不带具体数字）"}｜${platform}`
    })

    // ========== Step 2: 导演三方向（blocked 态等用户选择） ==========
    await step(
      1,
      async () => {
        let directions: ReturnType<typeof parseDirections> = []
        for (const temp of [0.7, 0.35]) {
          const raw = await chatRetry(
            directionsDirectMessages({ topic: run.ideaTitle, angle: run.ideaAngle, digest, platform }),
            { temperature: temp },
          )
          directions = parseDirections(extractJson(raw) ?? raw)
          if (directions.length >= 3) break
        }
        if (directions.length < 3) return "三方向提案失败（可跳过方向直接分镜）"
        artifacts.directions = directions
        const rec = directions.find((d) => d.recommended)
        return `3 个方向已提案${rec ? `｜导演推荐「${rec.name}」` : ""}｜等待选择`
      },
      { optional: true },
    )

    // blocked：等用户选方向（或跳过）→ POST action=storyboard 完成 run
    await db.agentRun.update({
      where: { id: runId },
      data: {
        status: "blocked",
        mode,
        steps: JSON.stringify(steps),
        artifacts: JSON.stringify(artifacts),
      },
    })
  } catch (e) {
    await db.agentRun
      .update({
        where: { id: runId },
        data: { status: "error", error: (e as Error).message.slice(0, 500), steps: JSON.stringify(steps), finishedAt: new Date() },
      })
      .catch(() => {})
  }
}

/** 选定方向（或跳过）后生成分镜，完成 run（同步调用，与文章线 storyboard 动作同 UX） */
export async function generateDirectStoryboard(
  runId: string,
  direction?: DirectionBrief,
): Promise<Storyboard> {
  const run = await db.agentRun.findUnique({ where: { id: runId } })
  if (!run || run.kind !== "video") throw new Error("run 不存在或不是视频直出 run")
  if (run.status === "running") throw new Error("检索进行中，请稍候")

  let artifacts: Record<string, unknown> = {}
  try {
    artifacts = JSON.parse(run.artifacts || "{}") as Record<string, unknown>
  } catch {
    /* ignore */
  }
  const digest = (artifacts.research ?? { mode: "DEMO", items: [] }) as ResearchDigest
  const platform = normalizePlatform(run.theme)
  const steps = [...JSON.parse(run.steps || "[]")] as { name: string; status: string; detail: string; latencyMs: number }[]
  while (steps.length < 3) steps.push({ name: VIDEO_STEP_DEFS[steps.length].name, status: "pending", detail: VIDEO_STEP_DEFS[steps.length].label, latencyMs: 0 })

  const t0 = Date.now()
  steps[2] = { ...steps[2], status: "running", detail: "分镜生成中", latencyMs: 0 }
  await db.agentRun.update({ where: { id: runId }, data: { status: "running", steps: JSON.stringify(steps) } }).catch(() => {})

  let storyboard: Storyboard | null = null
  for (const temp of [0.6, 0.3]) {
    const raw = await chatRetry(
      storyboardDirectMessages({ topic: run.ideaTitle, angle: run.ideaAngle, digest, platform, direction }),
      { temperature: temp },
    )
    storyboard = parseStoryboard(extractJson(raw))
    if (storyboard) break
  }
  if (!storyboard) {
    const msg = "分镜解析失败（两档温度重试后仍不合格式），请重试"
    steps[2] = { ...steps[2], status: "error", detail: msg, latencyMs: Date.now() - t0 }
    await db.agentRun.update({ where: { id: runId }, data: { status: "blocked", steps: JSON.stringify(steps), error: msg } }).catch(() => {})
    throw new Error(msg)
  }
  if (direction) storyboard = { ...storyboard, direction }

  steps[2] = {
    ...steps[2],
    status: "done",
    detail: `${storyboard.scenes.length} 分镜｜${storyboard.totalSeconds}s${direction ? `｜方向「${direction.name}」` : ""}`,
    latencyMs: Date.now() - t0,
  }
  artifacts.storyboard = storyboard

  // run.output：分镜脚本 markdown（可复制/可溯源）
  const md = [
    `# ${storyboard.title}`,
    "",
    `> 视频线 · 选题直出 · ${platform}｜钩子：${storyboard.hook}｜${storyboard.totalSeconds}s · ${storyboard.scenes.length} 分镜`,
    "",
    ...storyboard.scenes.map(
      (s) => `## 分镜 ${s.id}（${s.seconds}s）\n\n- 字幕：${s.subtitle}\n- 口播：${s.narration}\n- 画面：${s.visual}\n- 素材：${s.broll}\n`,
    ),
    `## BGM\n\n${storyboard.bgm}`,
    `## 发布文案\n\n${storyboard.caption}`,
  ].join("\n")

  await db.agentRun.update({
    where: { id: runId },
    data: {
      status: "done",
      steps: JSON.stringify(steps),
      artifacts: JSON.stringify(artifacts),
      output: md,
      finishedAt: new Date(),
    },
  })

  // 留痕（与文章线 storyboard 动作同粒度）
  await db.asset
    .create({
      data: {
        runId,
        kind: "video",
        role: `storyboard-${platform}`,
        provider: "zai-llm",
        path: "",
        meta: JSON.stringify({
          title: storyboard.title,
          scenes: storyboard.scenes.length,
          totalSeconds: storyboard.totalSeconds,
          direct: true,
          ...(direction ? { direction } : {}),
        }),
      },
    })
    .catch(() => {})

  return storyboard
}
