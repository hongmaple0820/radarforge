import { NextResponse } from "next/server"
import { healthCheckAll } from "@/lib/gateway"

export async function GET() {
  try {
    const providers = await healthCheckAll()
    return NextResponse.json({ providers })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
