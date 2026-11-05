import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createArticleRun, executeArticleRunInBackground } from "@/lib/runtime/run-manager"
import { PERSONAS } from "@/lib/runtime/skills/radar-write"
import { LENGTH_TIERS } from "@/lib/runtime/length-tier"
import { SKELETON_IDS, skeletonList } from "@/lib/runtime/narrative-skeletons"
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
  return NextResponse.json({
    runs,
    personas: PERSONAS.map((p) => ({ id: p.id, label: p.label, desc: p.desc })),
    themes: themeList(),
    tiers: LENGTH_TIERS.map((t) => ({ id: t.id, label: t.label, desc: t.desc })),
    skeletons: [{ id: "", label: "自动轮换", desc: "同一选题重跑会换骨架（哈希轮换五骨架）" }, ...skeletonList()],
  })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { ideaTitle?: string; ideaAngle?: string; persona?: string; theme?: string; exemplarId?: string; ideaId?: string; lengthTier?: string; skeleton?: string }
    const ideaTitle = (body.ideaTitle ?? "").trim()
    if (!ideaTitle) return NextResponse.json({ error: "ideaTitle 不能为空" }, { status: 400 })
    if (body.lengthTier && !LENGTH_TIERS.some((t) => t.id === body.lengthTier)) {
      return NextResponse.json({ error: `lengthTier 须是 ${LENGTH_TIERS.map((t) => t.id).join(" / ")}` }, { status: 400 })
    }
    if (body.skeleton && !SKELETON_IDS.includes(body.skeleton)) {
      return NextResponse.json({ error: `skeleton 须是 ${SKELETON_IDS.join(" / ")}（或不传=自动轮换）` }, { status: 400 })
    }
    const id = await createArticleRun({
      ideaTitle,
      ideaAngle: body.ideaAngle,
      persona: body.persona,
      theme: resolveThemeId(body.theme ?? ""),
      exemplarId: (body.exemplarId ?? "").trim(),
      ideaId: (body.ideaId ?? "").trim() || undefined,
      lengthTier: body.lengthTier,
      skeleton: body.skeleton,
    })
    executeArticleRunInBackground(id)
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
