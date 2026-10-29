// ============================================================
// relayout.ts —— 改稿后自动重排版
// 用户保存改稿 → 按 run 主题 + claims 账本重渲染微信 HTML
// 与流水线第 6 步共用同一渲染引擎，保证预览/发布一致
// ============================================================

import { db } from "@/lib/db"
import { renderWechatHtml, resolveThemeId, type RenderClaim, type ThemeId } from "./render"

export interface RelayoutResult {
  title: string
  wordCount: number
  formatted: string
  theme: ThemeId
  refs: number
}

/** 校验主题 id（防脏数据；18 主题注册表 + 旧三主题兼容映射） */
function normalizeTheme(theme: string): ThemeId {
  return resolveThemeId(theme)
}

/** 从 markdown 提取标题（首个 H1），缺省回退 */
function extractTitle(markdown: string, fallback: string): string {
  return (markdown.match(/^#\s+(.+)$/m)?.[1] ?? fallback).slice(0, 120)
}

/** 取某 run 已核实的 claims，映射为渲染脚注 */
async function loadRenderClaims(runId: string): Promise<RenderClaim[]> {
  const claims = await db.claim.findMany({
    where: { runId, idx: { gt: 0 }, verified: true },
    orderBy: { idx: "asc" },
  })
  return claims.map((c) => ({
    idx: c.idx,
    sourceSite: c.sourceSite,
    sourceTitle: c.sourceTitle,
    sourceDate: c.sourceDate,
    sourceUrl: c.sourceUrl,
  }))
}

/** 流水线第 6 步 / 改稿重排版的统一入口 */
export async function relayoutForRun(runId: string, markdown: string, titleFallback: string): Promise<RelayoutResult> {
  const run = await db.agentRun.findUnique({ where: { id: runId } })
  const theme = normalizeTheme(run?.theme ?? "radar")
  const claims = await loadRenderClaims(runId)
  const title = extractTitle(markdown, titleFallback)
  const wordCount = markdown.replace(/\s/g, "").length
  const formatted = renderWechatHtml(markdown, claims, { theme, title, wordCount })
  return { title, wordCount, formatted, theme, refs: claims.length }
}
