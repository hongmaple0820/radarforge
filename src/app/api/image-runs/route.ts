import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createImageRun, executeImageRunInBackground } from "@/lib/runtime/run-manager"
import { IMAGE_STYLES, IMAGE_USAGES } from "@/lib/runtime/skills/radar-image"
import { CARD_FAMILIES, CARD_TEMPLATES } from "@/lib/runtime/card-engine"

// GET /api/image-runs —— 纯图线 run 列表（画廊入口）
export async function GET() {
  try {
    const runs = await db.agentRun.findMany({
      where: { kind: "image" },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: {
        _count: { select: { assets: true } },
      },
    })
    return NextResponse.json({
      runs,
      usages: IMAGE_USAGES.map((u) => ({ id: u.id, label: u.label, size: u.size, desc: u.desc })),
      styles: IMAGE_STYLES.map((s) => ({ id: s.id, label: s.label })),
      families: CARD_FAMILIES.map((f) => ({ id: f.id, label: f.label, desc: f.desc })),
      templates: CARD_TEMPLATES.map((t) => ({ id: t.id, label: t.label, desc: t.desc })),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

// POST /api/image-runs —— 启动纯图线：主题 → 构图方案 → 批量生图
// mode=gen（生成式，默认）｜mode=layout（版式卡：LLM 文案 → 代码排版渲染，零错字 + VLM 读回质检）
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { subject?: string; usage?: string; style?: string; count?: number; mode?: string; family?: string }
    const subject = (body.subject ?? "").trim()
    if (!subject) return NextResponse.json({ error: "subject（主题/画面描述）不能为空" }, { status: 400 })
    const count = Math.min(9, Math.max(1, Math.floor(Number(body.count) || 3)))
    const mode = body.mode === "layout" ? "layout" : "gen"
    const familyOk = CARD_FAMILIES.some((f) => f.id === body.family)
    const id = await createImageRun({
      subject,
      usage: body.usage ?? "general-square",
      style: body.style ?? "modern-flat",
      count,
      mode,
      family: familyOk ? body.family : undefined,
    })
    executeImageRunInBackground(id)
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
