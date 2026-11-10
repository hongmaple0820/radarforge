import { NextResponse } from "next/server"
import { chatRetry } from "@/lib/gateway"
import { extractJson } from "@/lib/runtime/json"
import { getDisabledSkills } from "@/lib/skills/state"
import { parseInterviewQuestions } from "@/lib/content/idea-card"
import { interviewerMessages } from "@/lib/runtime/skills/topic-interview"

// ============================================================
// /api/topic-interview —— S4 选题采访器（frontier 轮次产品化）
// 入口：文章向导第 1 步「AI 补全选题卡」。
// 出题 5~8 问（受众/边界/证据可得性三维度，每问带推荐答案），
// 用户作答蒸馏成选题卡随 POST /api/runs 透传（卡落
// AgentRun.artifacts.ideaCard，brief 步按卡写作）。
// 停用降级链（诚实降级）：本技能非产线必需（PIPELINE 之外），
// 技能中心停用 → 本路由 409 → 前端收起采访入口，流水线照跑。
// 提示词事实源：db/skills/topic-interviewer/SKILL.md（ADR-0007）。
// ============================================================

/** 429 → 人话（对齐 ideas/refresh 语义） */
function friendlyError(e: unknown): { message: string; status: number } {
  const msg = (e as Error).message ?? ""
  if (/429|Too many requests/i.test(msg)) {
    return { message: "LLM 配额受限（429）：稍后重试即可——采访入口与创作链路均正常，仅出题这步在等配额", status: 503 }
  }
  return { message: msg, status: 500 }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { ideaTitle?: string; ideaAngle?: string }
    const ideaTitle = (body.ideaTitle ?? "").trim().slice(0, 200)
    const ideaAngle = (body.ideaAngle ?? "").trim().slice(0, 500)
    if (!ideaTitle) return NextResponse.json({ error: "ideaTitle 不能为空（选题标题是采访的唯一燃料）" }, { status: 400 })

    // 停用降级链：技能中心停用 topic-interviewer → 409（入口隐藏语义，非断线）
    if ((await getDisabledSkills()).has("topic-interviewer")) {
      return NextResponse.json(
        { error: "选题采访器已停用（技能中心可重新启用）；跳过补全直接创作不受影响" },
        { status: 409 },
      )
    }

    const t0 = Date.now()
    // 出题重试：0.4 偶发非 JSON / 越界数量 → 0.2 保守档（brief 步同模式两档）
    for (const temp of [0.4, 0.2]) {
      const raw = await chatRetry(await interviewerMessages(ideaTitle, ideaAngle), { temperature: temp })
      if (!raw || raw.replace(/\s/g, "").length < 20) continue // 空返回按失败重试
      const questions = parseInterviewQuestions(extractJson(raw))
      if (questions) {
        return NextResponse.json({ questions, ms: Date.now() - t0 })
      }
    }
    return NextResponse.json(
      { error: "采访问题生成失败（两档温度重试后仍不合协议）——可稍后重试，或跳过补全直接创作" },
      { status: 503 },
    )
  } catch (e) {
    const { message, status } = friendlyError(e)
    return NextResponse.json({ error: message }, { status })
  }
}
