import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createArticleRun, executeArticleRunInBackground } from "@/lib/runtime/run-manager"
import { PERSONAS } from "@/lib/runtime/skills/radar-write"
import { themeList, resolveThemeId } from "@/lib/runtime/render"

export async function GET() {
  const runs = await db.agentRun.findMany({
    where: { kind: "article" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      _count: { select: { claims: true, articles: true, assets: true, publishes: true } },
    },
  })
  return NextResponse.json({ runs, personas: PERSONAS.map((p) => ({ id: p.id, label: p.label, desc: p.desc })), themes: themeList() })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { ideaTitle?: string; ideaAngle?: string; persona?: string; theme?: string; exemplarId?: string }
    const ideaTitle = (body.ideaTitle ?? "").trim()
    if (!ideaTitle) return NextResponse.json({ error: "ideaTitle 不能为空" }, { status: 400 })
    const id = await createArticleRun({
      ideaTitle,
      ideaAngle: body.ideaAngle,
      persona: body.persona,
      theme: resolveThemeId(body.theme ?? ""),
      exemplarId: (body.exemplarId ?? "").trim(),
    })
    executeArticleRunInBackground(id)
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
