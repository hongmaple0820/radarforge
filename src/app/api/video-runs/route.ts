import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createVideoRun, executeVideoRunInBackground, generateDirectStoryboard } from "@/lib/runtime/video-runs"
import type { DirectionBrief } from "@/lib/runtime/skills/radar-rewrite"

// GET /api/video-runs —— 视频直出 run 列表（选题直出线入口）
export async function GET() {
  try {
    const runs = await db.agentRun.findMany({
      where: { kind: "video" },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { _count: { select: { assets: true } } },
    })
    return NextResponse.json({ runs })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/video-runs —— 两条动作：
//   { topic, angle?, platform? }            → 创建直出 run（检索 + 三方向，后台）
//   { action: "storyboard", runId, direction? } → 选定/跳过方向后生成分镜（同步）
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      topic?: string
      angle?: string
      platform?: string
      action?: string
      runId?: string
      direction?: unknown
    }

    if (body.action === "storyboard") {
      const runId = (body.runId ?? "").trim()
      if (!runId) return NextResponse.json({ error: "runId 不能为空" }, { status: 400 })
      // 方向轻量校验（hex 色板与 kind 白名单；与文章线 storyboard 动作同规则）
      const d = (body.direction ?? null) as Record<string, unknown> | null
      const HEX = /^#[0-9a-fA-F]{6}$/
      const direction: DirectionBrief | undefined =
        d && typeof d === "object" && d.name
          ? {
              key: String(d.key ?? "A").slice(0, 1),
              kind: ["fit", "amplify", "unexpected"].includes(String(d.kind)) ? String(d.kind) : "fit",
              name: String(d.name).slice(0, 24),
              language: String(d.language ?? "").slice(0, 160),
              accent: HEX.test(String(d.accent)) ? String(d.accent) : "#f59e0b",
              base: HEX.test(String(d.base)) ? String(d.base) : "#0b1220",
              feel: String(d.feel ?? "").slice(0, 160),
            }
          : undefined
      const storyboard = await generateDirectStoryboard(runId, direction)
      return NextResponse.json({ storyboard, runId })
    }

    const topic = (body.topic ?? "").trim()
    if (!topic) return NextResponse.json({ error: "topic（选题）不能为空" }, { status: 400 })
    const id = await createVideoRun({ topic, angle: body.angle, platform: body.platform })
    executeVideoRunInBackground(id)
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
