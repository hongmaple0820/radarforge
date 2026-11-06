// ============================================================
// video-director.ts —— 视频导演规划器（C2，移植 video-director 思想）
// 分镜脚本 → LLM 结构化分镜计划（每镜：首帧提示词中英 + 运动描述
// 中英 + 转场 + 收紧后的时长），驱动 C1「AI 首帧 i2v 主轨」。
// prompt 主体在 db/skills/huashu-video-direct/SKILL.md（A1 纪律：
// SKILL.md 是唯一事实源；两级缺件显式报错不静默）。
// 失败/超时/非 JSON → 规则规划降级（固定运镜轮换）并标注
// planner: "rule-based"（降级不消失）。
// 规划只收紧不放大：镜数 1:1、时长不超原分镜（模型下限除外）。
// ============================================================

import { extractJson } from "./json.ts"
import { renderSkillPrompt } from "./skill-prompt.ts"
import type { ChatMessage } from "../gateway/types.ts"

/** 可注入的对话函数（默认惰性走 gateway；测试注入 mock 零依赖） */
export type DirectorChat = (messages: ChatMessage[], opts: { temperature: number }) => Promise<string>

const defaultChat: DirectorChat = async (messages, opts) => {
  const { chatRetry } = await import("../gateway/index.ts")
  return chatRetry(messages, opts)
}

/** 最小分镜契约（与 radar-rewrite.StoryboardScene 结构兼容，解耦便于离线测试） */
export interface PlanScene {
  id: number
  seconds: number
  visual: string
  narration: string
  subtitle: string
}

export interface VideoShot {
  sceneId: number
  seconds: number
  /** 首帧静态画面描述（喂 B1 生图管线） */
  firstFrameZh: string
  firstFrameEn: string
  /** 运动描述（喂 i2v 模型：运镜/主体动作/动态元素） */
  motionZh: string
  motionEn: string
  /** cut / fade / wipe */
  transition: string
}

export interface ShotPlan {
  planner: "director" | "rule-based"
  shots: VideoShot[]
  note?: string
}

const TRANSITIONS = new Set(["cut", "fade", "wipe"])

function clampStr(v: unknown, max: number): string {
  return String(v ?? "").trim().slice(0, max)
}

/**
 * 解析导演规划 JSON 并校验契约：
 * - shots 与 scenes 一一对应（sceneId 全覆盖、不增不删）；
 * - 时长只收紧不放大（≤ 原分镜秒数；原分镜低于模型下限时取下限）；
 * - transition 白名单；字段长度收敛。
 * 不合格 → null（调用方降级规则规划）。
 */
export function parseShotPlan(raw: unknown, scenes: PlanScene[], secondsRange: { min: number; max: number }): ShotPlan | null {
  const j = typeof raw === "string" ? extractJson<Record<string, unknown>>(raw) : (raw as Record<string, unknown> | null)
  if (!j || !Array.isArray(j.shots) || j.shots.length === 0) return null
  const sceneIds = new Set(scenes.map((s) => s.id))
  const byId = new Map<number, VideoShot>()
  for (const item of j.shots) {
    const s = item as Record<string, unknown>
    const sceneId = Number(s.sceneId)
    if (!Number.isFinite(sceneId) || !sceneIds.has(sceneId) || byId.has(sceneId)) return null
    const scene = scenes.find((x) => x.id === sceneId)!
    const asked = Number(s.seconds) || scene.seconds
    // 收紧不放大：上限取 min(原分镜秒数, 族上限)；下限族下限（原分镜更短时模型下限优先）
    const ceiling = Math.min(scene.seconds, secondsRange.max)
    const seconds = Math.round(Math.min(Math.max(asked, secondsRange.min), Math.max(secondsRange.min, ceiling)))
    const transition = TRANSITIONS.has(String(s.transition)) ? String(s.transition) : "cut"
    const shot: VideoShot = {
      sceneId,
      seconds,
      firstFrameZh: clampStr(s.firstFrameZh ?? s.first_frame_zh, 160),
      firstFrameEn: clampStr(s.firstFrameEn ?? s.first_frame_en, 300),
      motionZh: clampStr(s.motionZh ?? s.motion_zh, 160),
      motionEn: clampStr(s.motionEn ?? s.motion_en, 300),
      transition,
    }
    if (!shot.firstFrameZh && !shot.firstFrameEn) return null // 首帧描述缺位视为不合格
    if (!shot.motionZh && !shot.motionEn) return null
    byId.set(sceneId, shot)
  }
  if (byId.size !== scenes.length) return null
  return { planner: "director", shots: scenes.map((s) => byId.get(s.id)!) }
}

// ---------- 规则规划降级（固定运镜轮换） ----------

const CAMERA_ROTATION_ZH = [
  "镜头缓慢推近主体，景深渐浅，细节逐渐清晰",
  "镜头平稳向左横移，揭示画面纵深与背景层次",
  "镜头缓慢拉远，展现主体所处的环境全貌",
  "镜头轻微上摇，光线与氛围随之渐变",
]
const CAMERA_ROTATION_EN = [
  "slow push-in on the subject, depth of field gradually shallowing",
  "smooth pan to the left revealing background layers",
  "slow pull-back revealing the environment around the subject",
  "gentle tilt-up with shifting light and mood",
]

/** 离线规则规划：按固定运镜轮换 + 分镜原秒数（诚实标注 planner=rule-based） */
export function ruleBasedPlan(scenes: PlanScene[], secondsRange: { min: number; max: number }, note?: string): ShotPlan {
  return {
    planner: "rule-based",
    note: note?.slice(0, 160),
    shots: scenes.map((s, i) => ({
      sceneId: s.id,
      seconds: Math.min(Math.max(s.seconds, secondsRange.min), secondsRange.max),
      firstFrameZh: s.visual.slice(0, 160),
      firstFrameEn: "",
      motionZh: CAMERA_ROTATION_ZH[i % CAMERA_ROTATION_ZH.length],
      motionEn: CAMERA_ROTATION_EN[i % CAMERA_ROTATION_EN.length],
      transition: i === 0 ? "fade" : "cut",
    })),
  }
}

// ---------- 导演规划主链路 ----------

export interface PlanShotsInput {
  title: string
  hook: string
  aspect: string
  scenes: PlanScene[]
  secondsRange: { min: number; max: number }
}

function scenesBlock(scenes: PlanScene[]): string {
  return scenes
    .map(
      (s, i) =>
        `- 分镜 ${i + 1}（sceneId=${s.id}，${s.seconds}s）：字幕「${s.subtitle.slice(0, 30)}」｜口播：${s.narration.slice(0, 120)}｜画面描述：${s.visual.slice(0, 120)}`,
    )
    .join("\n")
}

/** LLM 分镜规划（两档温度重试；失败降级规则规划并留痕） */
export async function planShots(input: PlanShotsInput, chat: DirectorChat = defaultChat): Promise<ShotPlan> {
  const fallbackNote = "导演规划不可用（LLM 不可达或两档温度后仍不合格式）→ 已降级规则规划（固定运镜轮换，质量降档但链路完整）"
  try {
    const system = await renderSkillPrompt("huashu-video-direct", "plan", {})
    const user = [
      `片子标题：${input.title.slice(0, 80)}`,
      `钩子：${input.hook.slice(0, 60)}`,
      `画幅：${input.aspect}`,
      `i2v 时长档位：${input.secondsRange.min}~${input.secondsRange.max}s`,
      "",
      "【分镜脚本（shots 必须与之逐镜对应）】",
      scenesBlock(input.scenes),
    ].join("\n")
    for (const temp of [0.5, 0.25]) {
      const raw = await chat(
        [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        { temperature: temp },
      )
      if (!raw) continue
      const plan = parseShotPlan(extractJson(raw) ?? raw, input.scenes, input.secondsRange)
      if (plan) return plan
    }
    return ruleBasedPlan(input.scenes, input.secondsRange, fallbackNote)
  } catch (e) {
    return ruleBasedPlan(input.scenes, input.secondsRange, `${fallbackNote}｜异常：${(e as Error).message.slice(0, 80)}`)
  }
}
