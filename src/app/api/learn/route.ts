import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { findSimilar } from "@/lib/runtime/skills/radar-learn"

export async function GET() {
  const rules = await db.learningRule.findMany({ orderBy: [{ status: "desc" }, { createdAt: "desc" }], take: 50 })
  return NextResponse.json({ rules })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { action?: "confirm" | "reject"; id?: string }
    if (!body.id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
    if (body.action === "confirm") {
      const rule = await db.learningRule.findUnique({ where: { id: body.id } })
      if (!rule) return NextResponse.json({ error: "规则不存在" }, { status: 404 })
      // 防重复激活：与既有 active 规则高相似（bigram Jaccard ≥ 0.55）→ 拒绝并指认既有规则
      const actives = await db.learningRule.findMany({ where: { status: "active", id: { not: rule.id } } })
      const dup = findSimilar(rule.rule, actives)
      if (dup) {
        return NextResponse.json(
          {
            error: `与已激活规则高度重复，未重复激活（宁缺毋滥）`,
            duplicateOf: dup,
            hint: "同一倾向保留一条即可，重复注入只会稀释指令权重",
          },
          { status: 409 },
        )
      }
      const confirmed = await db.learningRule.update({ where: { id: body.id }, data: { status: "active" } })
      return NextResponse.json({ rule: confirmed })
    }
    if (body.action === "reject") {
      const rule = await db.learningRule.update({ where: { id: body.id }, data: { status: "rejected" } })
      return NextResponse.json({ rule })
    }
    return NextResponse.json({ error: `未知 action: ${body.action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
