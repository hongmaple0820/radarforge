import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { createRun, executeRunInBackground } from "@/lib/agent/run-manager"
import { getDisabledSkills } from "@/lib/skills/state"

export async function GET() {
  const runs = await db.agentRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { _count: { select: { inboxItems: true, ideas: true } } },
  })
  return NextResponse.json({ runs })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { skillId?: string; input?: string }
    const skillId = (body.skillId ?? "").trim()
    const input = (body.input ?? "").trim()
    if (!skillId || !input) {
      return NextResponse.json({ error: "skillId 和 input 不能为空" }, { status: 400 })
    }
    // P2-1：停用技能不进候选池（纵深防御——UI 已过滤，API 层再拦一次）
    if ((await getDisabledSkills()).has(skillId)) {
      return NextResponse.json({ error: `技能 "${skillId}" 已停用，请在技能目录重新启用后再启动 Run` }, { status: 400 })
    }
    const id = await createRun({ skillId, input })
    executeRunInBackground(id)
    return NextResponse.json({ id })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
