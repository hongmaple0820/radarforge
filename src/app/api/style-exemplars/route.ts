import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatRetry } from "@/lib/gateway"
import { getSettings, saveSetting } from "@/lib/settings"
import { extractJson } from "@/lib/runtime/json"
import { exemplarMessages, parseExemplar, type StyleExemplar } from "@/lib/runtime/skills/radar-learn"

/**
 * 文风学习（学 wewrite exemplar 范文库）
 * GET    /api/style-exemplars           → 档案列表
 * POST   /api/style-exemplars           → { name, source?, content } → LLM 提炼指纹入库
 * DELETE /api/style-exemplars?id=<id>   → 删除档案
 */

export async function GET() {
  const s = await getSettings(true)
  return NextResponse.json({ exemplars: s.exemplars.items })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { name?: string; source?: string; content?: string }
    const name = (body.name ?? "").trim().slice(0, 40)
    const content = (body.content ?? "").trim()
    const source = (body.source ?? "用户粘贴").trim().slice(0, 120) || "用户粘贴"
    if (!name) return NextResponse.json({ error: "档案名不能为空（如：半佛仙人风）" }, { status: 400 })
    if (content.length < 200) return NextResponse.json({ error: `范文太短（${content.length} 字），至少 200 字才能提炼稳定指纹` }, { status: 400 })
    if (content.length > 20000) return NextResponse.json({ error: "范文过长（≤20000 字），请节选最具代表性的部分" }, { status: 400 })

    // 降温重试：指纹提炼偶发非 JSON → 0.15 保守档
    let fp: ReturnType<typeof parseExemplar> = null
    for (const temp of [0.3, 0.15]) {
      const raw = await chatRetry(exemplarMessages(name, content), { temperature: temp })
      fp = parseExemplar(extractJson(raw) ?? raw)
      if (fp) break
    }
    if (!fp) throw new Error("指纹提炼失败（两档温度重试后仍不合格式），请重试")

    const s = await getSettings(true)
    const exemplar: StyleExemplar = {
      id: `ex-${Date.now().toString(36)}`,
      name,
      source,
      createdAt: new Date().toISOString(),
      words: content.length,
      fingerprint: fp,
    }
    const items = [exemplar, ...s.exemplars.items].slice(0, 20)
    await saveSetting("exemplars", { items })
    await db.asset.create({
      data: {
        runId: null,
        kind: "text",
        role: "style-exemplar",
        provider: "zai-llm",
        path: "",
        meta: JSON.stringify({ name, source, words: content.length, fingerprint: fp }),
      },
    }).catch(() => {})
    return NextResponse.json({ exemplar, count: items.length, message: `文风档案「${name}」已入库（${content.length} 字范文 → 6 维指纹）` })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  try {
    const id = new URL(req.url).searchParams.get("id") ?? ""
    if (!id) return NextResponse.json({ error: "id 不能为空" }, { status: 400 })
    const s = await getSettings(true)
    const items = s.exemplars.items.filter((x) => x.id !== id)
    if (items.length === s.exemplars.items.length) {
      return NextResponse.json({ error: "档案不存在" }, { status: 404 })
    }
    await saveSetting("exemplars", { items })
    return NextResponse.json({ count: items.length, message: "文风档案已删除" })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
