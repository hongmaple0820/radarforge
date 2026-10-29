import { NextResponse } from "next/server"
import { loadSkills } from "@/lib/agent/skill-loader"

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const force = searchParams.get("force") === "1"
  const q = (searchParams.get("q") ?? "").toLowerCase()
  let skills = await loadSkills([], force)
  if (q) {
    skills = skills.filter(
      (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
    )
  }
  return NextResponse.json({ skills, total: skills.length })
}
