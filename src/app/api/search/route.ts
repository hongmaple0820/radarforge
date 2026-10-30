import { NextResponse } from "next/server"
import { searchWithFallback } from "@/lib/gateway"

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { query?: string; count?: number }
    // 钳制长度：超长 query 会被真实供应商拒绝且无意义（演示模式不受影响）
    const query = (body.query ?? "").trim().slice(0, 200)
    if (!query) return NextResponse.json({ error: "query 不能为空" }, { status: 400 })
    const out = await searchWithFallback({ query, count: body.count ?? 8 })
    return NextResponse.json(out)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 })
  }
}
