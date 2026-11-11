// ============================================================
// aihot-context —— AIHOT 热点参考读路径（aihot-access 05 增强票）
// 服务端专用：prisma 查询 + 容错降级（D4：查询失败 → warn 留痕 +
// 空数组返回——增强层缺席不拖垮产线，error 终态语义不变）。
// 数据口径（ADR-0012 D3）：site==="aihot.news" + status==="new" +
// 近 7 天 + publishedAt desc + 5 条；帧组装住 content/aihot-block.ts。
// ============================================================

import { db } from "../db.ts" // .ts 扩展：Node 离线可测规约（学 rss.ts / card-engine）
import type { AihotTopic } from "../content/aihot-block.ts"

export const AIHOT_SITE = "aihot.news"
const WINDOW_DAYS = 7
const DEFAULT_LIMIT = 5

/** 纯查询：近 7 天 AIHOT 精选条目（status=new，publishedAt 倒序，take limit） */
export async function recentAihotTopics(limit = DEFAULT_LIMIT): Promise<AihotTopic[]> {
  const since = new Date(Date.now() - WINDOW_DAYS * 86400_000)
  const rows = await db.feedItem.findMany({
    where: {
      site: AIHOT_SITE,
      status: "new",
      createdAt: { gte: since },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: { title: true, summary: true, url: true },
  })
  return rows.map((r) => ({ title: r.title, summary: r.summary, url: r.url || undefined }))
}

/**
 * 尽力而为的参考上下文（两个调用点共用：run-manager Step1 / topic-interview 路由）。
 * 查询失败 → console.warn 留痕 + 空数组（降级不静默：日志在，产线不断）。
 */
export async function aihotContext(): Promise<AihotTopic[]> {
  try {
    return await recentAihotTopics()
  } catch (e) {
    console.warn(`[aihot-context] 热点参考查询失败，按无数据处理：${(e as Error).message?.slice(0, 120)}`)
    return []
  }
}
