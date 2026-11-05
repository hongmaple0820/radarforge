// ============================================================
// narrative-skeletons —— 五种叙事骨架（A3：治「所有文章一套结构」）
// 图文线大纲步注入骨架指令：同一选题重跑会换骨架（runId 哈希轮换），
// 也可在创作台显式指定（AgentRun.skeleton，空 = 自动）。
// 五骨架覆盖科技资讯常用叙事形态；结构指令进 wewrite-outline
// SKILL.md 的 {{skeleton_block}} 占位符（A1 事实源协议）。
// ============================================================

export interface NarrativeSkeleton {
  id: string
  label: string
  desc: string
  /** 注入大纲 prompt 的结构指令（小节编排规则） */
  structureRule: string
}

export const NARRATIVE_SKELETONS: NarrativeSkeleton[] = [
  {
    id: "pyramid",
    label: "金字塔结论先行",
    desc: "结论前置分层展开，适合判断明确的政策/发布解读",
    structureRule: [
      "叙事骨架：金字塔（结论先行）——",
      "第 1 节直接亮出全文核心判断与结论（不铺垫）；随后各节按「支撑该结论的独立论据」分层展开，每节一个论据，论据间重要性递减；倒数第 2 节给反方最强质疑与回应；末节收束到可执行含义。",
    ].join("\n"),
  },
  {
    id: "timeline",
    label: "时间线演进",
    desc: "按时间/版本演进推进，适合技术迭代与行业史",
    structureRule: [
      "叙事骨架：时间线演进——",
      "按时间或版本演进组织小节：起点（问题或初代形态）→ 关键转折（标志性事件/发布）→ 当前态 → 趋势外推。每节锚定一个时间/阶段，节内讲「该阶段发生了什么 + 为什么重要」；禁止把所有时间点堆进一节。",
    ].join("\n"),
  },
  {
    id: "problem-solution",
    label: "问题-方案-边界",
    desc: "痛点→解法→适用边界，适合工具评测与方法论",
    structureRule: [
      "叙事骨架：问题-方案-边界——",
      "第 1~2 节把读者的真实痛点铺开（场景化，不抽象）；中间各节逐个给出解法（每节一个解法：机制→实证→代价）；倒数第 2 节明确「什么情况下不该用」的边界；末节给选型/行动建议。",
    ].join("\n"),
  },
  {
    id: "versus",
    label: "对比冲突裁决",
    desc: "两方对峙→证据裁决，适合路线之争与竞品对比",
    structureRule: [
      "叙事骨架：对比冲突裁决——",
      "开篇立起对立双方（A 阵营 vs B 阵营的路线/产品/主张）；随后交替推进：甲方论据节 → 乙方论据节 → 甲方再回应（保持张力，每节都有新证据而非复读）；倒数第 2 节按证据强度裁决（允许「各胜一场」的结论）；末节写裁决对读者的实际影响。",
    ].join("\n"),
  },
  {
    id: "scene-narrative",
    label: "场景故事带入",
    desc: "场景开场→信息藏进故事→回扣收束，适合人物/深度特写",
    structureRule: [
      "叙事骨架：场景故事带入——",
      "第 1 节用一个具体场景开场（时间、地点、人物、动作，三句内画面成立）；中段各节把关键信息点藏进故事推进（每节一个叙事单元：情节推进 + 该情节揭示的信息），避免大段说明文；倒数第 2 节跳出故事给硬信息盘点；末节回到开场场景完成情感闭环。",
    ].join("\n"),
  },
]

const AUTO_IDS = NARRATIVE_SKELETONS.map((s) => s.id)

/** 解析骨架（非法/缺失 → null = 自动轮换；显式传入才覆盖） */
export function resolveSkeleton(id: string | null | undefined): NarrativeSkeleton | null {
  if (!id) return null
  return NARRATIVE_SKELETONS.find((s) => s.id === id) ?? null
}

/**
 * 自动选骨架：runId 哈希轮换（同一选题重跑会换骨架；同一次 run 内稳定）。
 * FNV-1a 32 位 → 五骨架均匀分布。
 */
export function pickSkeleton(seed: string): NarrativeSkeleton {
  let h = 0x811c9dc5
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return NARRATIVE_SKELETONS[h % NARRATIVE_SKELETONS.length]!
}

/** 骨架指令块（空骨架安全：返回空串不注入） */
export function skeletonBlock(s: NarrativeSkeleton | null): string {
  return s ? `\n${s.structureRule}\n` : ""
}

/** 骨架清单（API 下发给 UI） */
export function skeletonList(): { id: string; label: string; desc: string }[] {
  return NARRATIVE_SKELETONS.map((s) => ({ id: s.id, label: s.label, desc: s.desc }))
}

/** 全部合法 id（入口校验用） */
export const SKELETON_IDS: readonly string[] = AUTO_IDS
