import { NextResponse } from "next/server"
import { db } from "@/lib/db"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const run = await db.agentRun.findUnique({
    where: { id },
    include: {
      claims: { orderBy: { idx: "asc" } },
      articles: { orderBy: { version: "asc" } },
      reviews: { orderBy: { round: "asc" } },
      assets: { orderBy: { createdAt: "asc" } },
      publishes: { orderBy: { createdAt: "desc" } },
    },
  })
  if (!run) return NextResponse.json({ error: "run 不存在" }, { status: 404 })
  return NextResponse.json({ run })
}
