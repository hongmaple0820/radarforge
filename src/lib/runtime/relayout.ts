/**
 * 重排版工具：对已有 Run 的最新 wechat 文章重新渲染微信兼容 HTML
 * （人工编辑保存 / 主题切换后复用，与流水线 Step 6 同一渲染逻辑）
 */

import { db } from '@/lib/db'
import { renderWechatArticle, type RenderSource } from './render'

export async function relayoutRun(runId: string): Promise<{ articleId: string; html: string; title: string } | null> {
  const run = await db.run.findUnique({ where: { id: runId } })
  if (!run) return null

  const latest = await db.article.findFirst({
    where: { runId, target: 'wechat' },
    orderBy: { createdAt: 'desc' },
  })
  if (!latest) return null

  // 文章大标题：取 brief 步骤产物里记录的标题（fallback 用 Run 标题）
  const steps = (run.steps as Array<{ key: string; detail?: string }>) ?? []
  const briefDetail = steps.find((s) => s.key === 'brief')?.detail ?? ''
  const m = /《(.+?)》/.exec(briefDetail)
  const title = m?.[1] ?? run.title

  const claims = await db.claim.findMany({ where: { runId }, orderBy: { createdAt: 'asc' } })
  const sources: RenderSource[] = claims.map((c) => {
    const s = ((c.sourceJson as Array<{ title?: string; url?: string; site?: string; date?: string }>) ?? [])[0]
    return s?.url
      ? { title: c.text.slice(0, 50), url: s.url, site: s.site ?? '', date: s.date }
      : { title: `${c.text.slice(0, 50)}（未检索到直接来源）`, url: '', site: '—' }
  })

  const coverAsset = await db.asset.findFirst({ where: { runId, kind: 'image' }, orderBy: { createdAt: 'desc' } })

  const html = renderWechatArticle({
    title,
    markdown: latest.content,
    themeId: run.theme,
    sources,
    ...(coverAsset ? { coverUrl: coverAsset.path } : {}),
  })
  await db.article.update({ where: { id: latest.id }, data: { html } })
  return { articleId: latest.id, html, title }
}
