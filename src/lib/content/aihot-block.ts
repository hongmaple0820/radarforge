// ============================================================
// aihot-block —— AIHOT 热点参考注入帧（aihot-access 05 增强票）
// 纯函数零依赖（不 import db/settings/fs，先例：idea-card.ts），
// b2 直读可达；查询路径住 src/lib/sources/aihot-context.ts（服务端）。
// 沿 ADR-0009 {{idea_card_block}} 先例：ts 组装脚手架帧、SKILL.md 持
// {{aihot_block}} 占位符——无数据渲染空串，路径字节级不变（IN1）。
// 决策与不变量记录于 ADR-0012。
// ============================================================

/** 单条热点（feedItem 投影：title/summary/url） */
export interface AihotTopic {
  title: string
  summary: string
  url?: string
}

const TITLE_MAX = 80
const SUMMARY_MAX = 120

function clip(s: string, max: number): string {
  const t = s.trim()
  return t.length <= max ? t : t.slice(0, max)
}

/**
 * 热点参考帧（空数组 → ""，零字节贡献）。
 * 纪律句钉在帧内：热点仅开阔视野，事实仍须走证据链核证
 * （AIHOT 免费范围「保留机器来源信息」由帧头署名满足）。
 */
export function aihotBlock(items: AihotTopic[]): string {
  const rows = items
    .filter((x) => typeof x?.title === "string" && x.title.trim())
    .slice(0, 5)
    .map((x) => `- ${clip(x.title, TITLE_MAX)}：${clip(x.summary ?? "", SUMMARY_MAX)}`)
  if (rows.length === 0) return ""
  return [
    "\n【AIHOT 热点参考（近 7 天精选）】",
    ...rows,
    "以上热点仅作视野参考（组织 claims / 出题时可用其角度，不作为事实依据——正文事实仍须逐条走证据链核证）。",
    "",
  ].join("\n")
}
