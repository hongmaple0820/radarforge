// ============================================================
// tune.ts —— 评测驱动的 prompt 变体调优（P1 p15）
// 学 DSPy/MIPROv2 的精神子集（2310.03714）：把 prompt 当可优化
// 参数，在带指标的固定评测集上搜索指令变体，选优落库。诚实边界：
// 不引入 python dspy 依赖（与 Next.js runtime 割裂），自建轻量
// 「变体 × 评测子集 → G-Eval 评分 → 对比 → 推荐落库」闭环——
// 「先建度量，再动刀」，一切调优可回归、可回滚。
// 调优对象：分节初稿（draft）——管线中杠杆最高的单一指令位。
// ============================================================

import { db } from "../db.ts"

// ---------- 变体注册表 ----------
export interface PromptVariant {
  key: string // v0 | v1 | v2 | v3
  label: string
  instruction: string // 注入【调优指令】块；v0 为空 = 基线（现状）
  hypothesis: string // 调优假设（报告用）
}

export const TUNE_SETTING_KEY = "tune:draft"

export const PROMPT_VARIANTS: PromptVariant[] = [
  {
    key: "v0",
    label: "基线（现状）",
    instruction: "",
    hypothesis: "不注入调优指令，作为对照基线（P0 评测均分 8.2+）",
  },
  {
    key: "v1",
    label: "结构强化",
    instruction: [
      "【调优指令·结构强化】",
      "- 每个自然段只承载一个论点，段首句必须是该段的论点句（读者只读段首句也能拼出全文脉络）。",
      "- 相邻两段之间必须有显式递进或转折词（「更关键的是」「反过来」「落到实操」等），禁止无衔接并列。",
      "- 连续两段不得以相同句式开头。",
    ].join("\n"),
    hypothesis: "组织性是 G-Eval 五维中最容易拉开的维度（STORM 人评组织性 +25%），结构指令直接作用于此",
  },
  {
    key: "v2",
    label: "证据密度",
    instruction: [
      "【调优指令·证据密度】",
      "- 每个自然段至少落一个 [n] 引用锚点；核心数字必须带来源编号，无来源的数字一律删去或改写为定性表述。",
      "- 证据块里 verified=false 的主张只能以「有观点认为」句式出现，且每节最多一次。",
      "- 段落结尾禁止空泛总结句（「由此可见…很重要」类），用具体事实或数字收尾。",
    ].join("\n"),
    hypothesis: "准确与有用两维对证据密度敏感（FActScore 精神：断言必须可溯源），同时压掉 AI 腔的空泛收尾",
  },
  {
    key: "v3",
    label: "口语节奏",
    instruction: [
      "【调优指令·口语节奏】",
      "- 每 300 字内至少一次「你」视角的回勾（「你现在遇到的问题是」「你回过头看」），把读者拉回现场。",
      "- 砍掉学术腔连接词（「综上所述」「值得注意的是」「不难发现」），换成口语衔接。",
      "- 每节允许一处不超过 20 字的短句独立成段，作为节奏重音。",
    ].join("\n"),
    hypothesis: "好读与合声两维跟口语节奏强相关；「写得像 AI」抱怨的一半来自结构平庸、一半来自腔调",
  },
]

export function getVariant(key: string): PromptVariant | undefined {
  return PROMPT_VARIANTS.find((v) => v.key === key)
}

// ---------- SettingKV 读写（独立于 AppSettings，避免缓存耦合） ----------

export interface TuneSetting {
  variant: string // 当前生效变体 key（v0 = 基线）
  instruction: string // 注入的指令文本（v0 为空）
  appliedAt: string
  note?: string // 调优报告来源说明
}

/** 读当前生效的调优指令（无记录/坏记录 → 基线空指令，管线零改动） */
export async function resolveTuneInstruction(): Promise<TuneSetting> {
  try {
    const row = await db.settingKV.findUnique({ where: { key: TUNE_SETTING_KEY } })
    if (!row) return baseline()
    const parsed = JSON.parse(row.value) as Partial<TuneSetting>
    const variant = getVariant(parsed.variant ?? "")
    if (!variant) return baseline()
    return { variant: variant.key, instruction: variant.instruction, appliedAt: String(parsed.appliedAt ?? ""), note: parsed.note }
  } catch {
    return baseline()
  }
}

function baseline(): TuneSetting {
  return { variant: "v0", instruction: "", appliedAt: "" }
}

/** 应用变体（落 SettingKV，立即对后续 run 生效；v0 = 回滚到基线） */
export async function applyVariant(key: string, note?: string): Promise<TuneSetting> {
  const variant = getVariant(key)
  if (!variant) throw new Error(`未知变体：${key}（可选：${PROMPT_VARIANTS.map((v) => v.key).join("/")}）`)
  const setting: TuneSetting = { variant: variant.key, instruction: variant.instruction, appliedAt: new Date().toISOString(), note }
  await db.settingKV.upsert({
    where: { key: TUNE_SETTING_KEY },
    update: { value: JSON.stringify(setting), updatedAt: new Date() },
    create: { key: TUNE_SETTING_KEY, value: JSON.stringify(setting) },
  })
  return setting
}

/** 清除调优（回滚到基线） */
export async function clearTune(): Promise<void> {
  await db.settingKV.deleteMany({ where: { key: TUNE_SETTING_KEY } })
}

// ---------- 调优报告（变体 × 评测子集 → 评分聚合） ----------

export interface VariantScore {
  variant: string
  runs: { runId: string; topicId: string; average: number; scores: Record<string, number>; wordCount: number }[]
  mean: number // 五维均分的均值
  gatePassRate: number
}

export interface TuneReport {
  at: string
  topics: string[]
  baselineMean: number | null // v0 均分（历史基线或当轮实测）
  variants: VariantScore[]
  recommended: string | null // 推荐变体（相对基线提升最大且 >0）
  note: string
}

/** 聚合纯函数：从逐 run 评分算变体均分/门禁率/推荐（离线可测） */
export function aggregateTuneReport(input: {
  topics: string[]
  scores: { variant: string; runId: string; topicId: string; average: number; scores: Record<string, number>; wordCount: number }[]
}): TuneReport {
  const byVariant = new Map<string, VariantScore>()
  for (const s of input.scores) {
    const v = byVariant.get(s.variant) ?? { variant: s.variant, runs: [], mean: 0, gatePassRate: 0 }
    v.runs.push({ runId: s.runId, topicId: s.topicId, average: s.average, scores: s.scores, wordCount: s.wordCount })
    byVariant.set(s.variant, v)
  }
  for (const v of byVariant.values()) {
    v.mean = v.runs.reduce((s, r) => s + r.average, 0) / Math.max(1, v.runs.length)
    v.gatePassRate = v.runs.filter((r) => r.average >= 8.0).length / Math.max(1, v.runs.length)
  }
  const baselineMean = byVariant.get("v0")?.mean ?? null
  let recommended: string | null = null
  let bestDelta = 0
  for (const v of byVariant.values()) {
    if (v.variant === "v0" || baselineMean === null) continue
    const delta = v.mean - baselineMean
    if (delta > bestDelta) {
      bestDelta = delta
      recommended = v.variant
    }
  }
  return {
    at: new Date().toISOString(),
    topics: input.topics,
    baselineMean,
    variants: [...byVariant.values()].sort((a, b) => b.mean - a.mean),
    recommended,
    note: recommended
      ? `推荐 ${recommended}（相对基线 +${bestDelta.toFixed(2)} 分）；样本量小（${input.topics.length} 题/变体），确认提升需扩到 10+ 题`
      : "无变体显著优于基线（或无基线数据），保持 v0 或扩大评测子集",
  }
}
