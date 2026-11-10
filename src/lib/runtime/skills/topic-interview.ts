// ============================================================
// topic-interview —— 选题采访器消息组装（S4，服务端）
// 采访器人格与问题协议的唯一事实源在
// db/skills/topic-interviewer/SKILL.md（ADR-0007）；
// 本模块只负责加载渲染与消息拼装（镜像 briefMessages 形态）。
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"
import { renderSkillPrompt } from "../skill-prompt.ts"

/** 采访消息：system=SKILL.md 渲染；user=选题标题与切入角度 */
export async function interviewerMessages(ideaTitle: string, ideaAngle: string): Promise<ChatMessage[]> {
  const system = await renderSkillPrompt("topic-interviewer", undefined, {})
  return [
    { role: "system", content: system },
    { role: "user", content: `选题：${ideaTitle}\n切入角度：${ideaAngle || "（无，自行判断最佳角度）"}` },
  ]
}
