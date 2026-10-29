import { NextResponse } from "next/server"
import { healthCheckAll } from "@/lib/gateway"

export async function GET() {
  const providers = await healthCheckAll()
  return NextResponse.json({ providers })
}
