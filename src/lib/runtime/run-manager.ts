/**
 * Agent 运行时 v1 —— Run 状态机 + 图文流水线编排
 *
 * 六步流水线（wewrite 图文线八步的 Phase 2 裁剪版）：
 *   brief 任务书 → research 元宝搜索取证 → draft 初稿
 *   → review 五维审稿（不过关自动修订一轮）→ cover 封面（可选）
 *   → layout 微信兼容排版 → done
 *
 * 每步产物落 Prisma（Run.steps 流水账 / Claim / Article / ReviewRecord / Asset），
 * POST /api/runs 创建后 fire-and-forget 后台执行，前端轮询 GET /api/runs/[id]。
 */

import { db } from '@/lib/db'
import { ensureGatewayReady } from '@/lib/gateway/bootstrap'
import { providerRegistry } from '@/lib/gateway/registry'
import type { LLMProvider, SearchProvider } from '@/lib/gateway/types'
import { generateAndSave } from '@/lib/gateway/providers/zai-image'
import { extractJson } from './json'
import {
  buildBriefMessages,
  buildDraftMessages,
  buildReviseMessages,
  getPersona,
  type Brief,
} from './skills/radar-write'
import { buildReviewMessages, normalizeReview } from './skills/radar-review'
import { renderWechatArticle, type RenderSource } from './render'

/** 步骤定义（UI 时间线复用同一份） */
export const STEP_DEFS = [
  { key: 'brief', label: '任务书' },
  { key: 'research', label: '主张取证' },
  { key: 'draft', label: '初稿' },
  { key: 'review', label: '五维审稿' },
  { key: 'cover', label: '封面生成' },
  { key: 'layout', label: '微信排版' },
] as const

export type StepKey = (typeof STEP_DEFS)[number]['key']
export type StepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed'

export interface StepRecord {
  key: StepKey
  label: string
  status: StepStatus
  detail?: string
  latencyMs?: number
}

function initialSteps(withCover: boolean): StepRecord[] {
  return STEP_DEFS.map((s) => ({
    key: s.key,
    label: s.label,
    status: 'pending' as StepStatus,
    ...(s.key === 'cover' && !withCover ? { status: 'skipped' as StepStatus, detail: '未开启封面生成' } : {}),
  }))
}

function llm(): LLMProvider {
  ensureGatewayReady()
  const p = providerRegistry.get<LLMProvider>('zai-llm')
  if (!p || !p.isConfigured()) throw new Error('LLM Provider（zai-llm）不可用')
  return p
}

function search(): SearchProvider {
  ensureGatewayReady()
  const p = providerRegistry.get<SearchProvider>('wsa-search')
  if (!p) throw new Error('Search Provider（wsa-search）不可用')
  return p
}

async function completeJson<T>(messages: Parameters<LLMProvider['complete']>[0]['messages'], maxTokens: number): Promise<T> {
  const res = await llm().complete({ messages, maxTokens, temperature: 0.4 })
  return extractJson<T>(res.content)
}

async function setSteps(runId: string, mut: (steps: StepRecord[]) => void) {
  const run = await db.run.findUnique({ where: { id: runId } })
  const steps = (run?.steps as StepRecord[] | null) ?? initialSteps(run?.withCover ?? false)
  mut(steps)
  await db.run.update({ where: { id: runId }, data: { steps } })
}

async function markStep(runId: string, key: StepKey, status: StepStatus, detail?: string, latencyMs?: number) {
  await setSteps(runId, (steps) => {
    const s = steps.find((x) => x.key === key)
    if (s) {
      s.status = status
      if (detail !== undefined) s.detail = detail.slice(0, 300)
      if (latencyMs !== undefined) s.latencyMs = latencyMs
    }
  })
}

export interface CreateRunOptions {
  ideaId?: string
  title: string
  angle?: string
  persona?: string
  theme?: string
  withCover?: boolean
}

/** 创建 Run（pending），调用方随后 fire-and-forget executeRun */
export async function createRun(opts: CreateRunOptions) {
  const persona = getPersona(opts.persona ?? 'midnight-friend')
  const run = await db.run.create({
    data: {
      ideaId: opts.ideaId ?? null,
      title: opts.title.slice(0, 120),
      kind: 'article',
      persona: persona.id,
      theme: ['classic', 'ink', 'warm'].includes(opts.theme ?? '') ? (opts.theme as string) : 'classic',
      withCover: Boolean(opts.withCover),
      status: 'pending',
      steps: initialSteps(Boolean(opts.withCover)) as unknown as object[],
    },
  })
  if (opts.ideaId) {
    await db.ideaCandidate.update({ where: { id: opts.ideaId }, data: { status: 'writing' } }).catch(() => {})
  }
  return run
}

/** 后台执行完整流水线（不抛错：所有失败落 Run.error） */
export async function executeRun(runId: string): Promise<void> {
  try {
    await db.run.update({ where: { id: runId }, data: { status: 'running' } })
    const run = await db.run.findUnique({ where: { id: runId } })
    if (!run) return

    const ctx = { ideaTitle: run.title, ideaAngle: undefined as string | undefined, personaId: run.persona }
    if (run.ideaId) {
      const idea = await db.ideaCandidate.findUnique({ where: { id: run.ideaId } })
      if (idea) {
        ctx.ideaAngle = idea.angle ?? undefined
        if (idea.title && idea.title !== run.title) {
          await db.run.update({ where: { id: runId }, data: { title: idea.title } })
          ctx.ideaTitle = idea.title
        }
      }
    }

    // ── Step 1: brief 任务书 ──────────────────────────────
    await markStep(runId, 'brief', 'running')
    let brief: Brief
    try {
      const started = Date.now()
      brief = await completeJson<Brief>(buildBriefMessages(ctx), 1200)
      if (!brief.title || !brief.targetReader || !Array.isArray(brief.claims)) {
        throw new Error('brief 字段不完整')
      }
      brief.claims = brief.claims.slice(0, 5)
      await markStep(runId, 'brief', 'done', `《${brief.title}》· ${brief.claims.length} 条待核主张`, Date.now() - started)
    } catch (e) {
      await failRun(runId, 'brief', e)
      return
    }

    // ── Step 2: research 元宝搜索取证 ─────────────────────
    await markStep(runId, 'research', 'running')
    const factClaims = brief.claims.filter((c) => c.claimType === 'fact' && c.query)
    const claimRows: Array<{ no: number; claimType: string; text: string; sources: RenderSource[] }> = []
    try {
      const started = Date.now()
      let searched = 0
      let mockMode = false
      const failures: string[] = []
      // 全部 claims 都落账本；fact 类逐条取证，其余类型标注免核
      for (let i = 0; i < brief.claims.length; i++) {
        const c = brief.claims[i]
        let sources: RenderSource[] = []
        let verified: boolean | null = null
        if (c.claimType === 'fact' && c.query && searched < 5) {
          searched++
          try {
            const res = await search().search({
              query: c.query.slice(0, 60),
              // SearchPro 合法取值：10/20/30/40/50
              cnt: 10,
              freshness: 'd30',
              industry: 'news',
            })
            mockMode = mockMode || res.mock
            sources = res.hits.slice(0, 2).map((h) => ({ title: h.title, url: h.url, site: h.site, date: h.date }))
            verified = res.mock ? null : sources.length > 0
          } catch (e) {
            // 不静默降级：失败原因逐条留痕
            verified = null
            failures.push(`「${(c.query ?? '').slice(0, 16)}」取证失败：${(e as Error).message.slice(0, 60)}`)
          }
        }
        await db.claim.create({
          data: {
            runId,
            claimType: c.claimType,
            text: c.text,
            query: c.query ?? null,
            sourceJson: sources as unknown as object[],
            verified,
          },
        })
        claimRows.push({ no: claimRows.length + 1, claimType: c.claimType, text: c.text, sources })
      }
      const verifiedCount = claimRows.filter((c) => c.sources.length > 0).length
      let detail =
        claimRows.length === 0
          ? '纯观点文，无外部事实主张'
          : `${searched} 次检索 · ${verifiedCount}/${claimRows.length} 条主张找到来源${mockMode ? '（演示模式）' : ''}`
      if (failures.length > 0) detail += `；${failures.length} 条取证失败已留痕`
      await markStep(runId, 'research', 'done', detail, Date.now() - started)
    } catch (e) {
      await failRun(runId, 'research', e)
      return
    }

    // ── Step 3: draft 初稿 ────────────────────────────────
    await markStep(runId, 'draft', 'running')
    let draftMd: string
    try {
      const started = Date.now()
      const learnRules = await db.learningRule.findMany({
        where: { status: 'active' },
        select: { ruleText: true },
        take: 12,
      })
      const res = await llm().complete({
        messages: buildDraftMessages({
          ctx,
          brief,
          claims: claimRows,
          learnRules: learnRules.map((r) => r.ruleText),
        }),
        maxTokens: 4200,
        temperature: 0.6,
      })
      draftMd = res.content.trim()
      if (draftMd.length < 300) throw new Error('初稿过短（<300 字）')
      const article = await db.article.create({
        data: { runId, version: 1, target: 'wechat', format: 'markdown', content: draftMd, note: '初稿' },
      })
      await markStep(runId, 'draft', 'done', `${draftMd.length} 字 · ${res.latencyMs}ms（含 ${learnRules.length} 条飞轮规则）`, Date.now() - started)
      void article
    } catch (e) {
      await failRun(runId, 'draft', e)
      return
    }

    // ── Step 4: review 五维审稿（不过关自动修订一轮）──────
    await markStep(runId, 'review', 'running')
    let finalMd = draftMd
    let finalArticleId: string | null = null
    try {
      const started = Date.now()
      const persona = getPersona(run.persona)
      const claimsDigest = claimRows
        .map((c) => `[${c.no}] ${c.claimType}：${c.text} → ${c.sources.map((s) => s.site).join('/') || '无来源'}`)
        .join('\n')

      const reviewRaw = await completeJson<Record<string, unknown>>(
        buildReviewMessages({
          title: brief.title,
          personaName: persona.name,
          personaRules: persona.rules,
          markdown: draftMd,
          claimsDigest,
        }),
        900
      )
      const review = normalizeReview(reviewRaw)

      const firstArticle = await db.article.findFirst({ where: { runId, version: 1 }, orderBy: { createdAt: 'asc' } })
      await db.reviewRecord.create({
        data: {
          runId,
          articleId: firstArticle?.id ?? '',
          scores: review.scores as unknown as object,
          summary: review.summary,
          suggestions: review.suggestions as unknown as object[],
          verdict: review.verdict,
        },
      })

      if (review.verdict === 'revise' && review.suggestions.length > 0) {
        // 自动修订一轮（wewrite「不过关就地改稿」机制）
        const reviseRes = await llm().complete({
          messages: buildReviseMessages({ ctx, draft: draftMd, suggestions: review.suggestions, summary: review.summary }),
          maxTokens: 4200,
          temperature: 0.5,
        })
        finalMd = reviseRes.content.trim().length >= 300 ? reviseRes.content.trim() : draftMd
        const revised = await db.article.create({
          data: {
            runId,
            version: 2,
            target: 'wechat',
            format: 'markdown',
            content: finalMd,
            note: `审稿修订（${review.suggestions.length} 条意见）`,
          },
        })
        finalArticleId = revised.id
        await markStep(
          runId,
          'review',
          'done',
          `五维均分 ${(Object.values(review.scores).reduce((a, b) => a + b, 0) / 5).toFixed(1)} · ${review.verdict === 'revise' ? '自动修订一轮' : '直接通过'}`,
          Date.now() - started
        )
      } else {
        finalArticleId = firstArticle?.id ?? null
        await markStep(
          runId,
          'review',
          'done',
          `五维均分 ${(Object.values(review.scores).reduce((a, b) => a + b, 0) / 5).toFixed(1)} · 直接通过`,
          Date.now() - started
        )
      }
      void finalArticleId
    } catch (e) {
      await failRun(runId, 'review', e)
      return
    }

    // ── Step 5: cover 封面生成（可选）────────────────────
    if (run.withCover) {
      await markStep(runId, 'cover', 'running')
      try {
        const started = Date.now()
        const relPath = `runs/${runId}/cover.png`
        const img = await generateAndSave(
          `为文章《${brief.title}》生成一张微信公众号封面配图。主题：${ctx.ideaTitle}。现代扁平插画风，干净构图，柔和蓝灰主色调，留白呼吸感，无文字。`,
          relPath,
          '1344x768'
        )
        await db.asset.create({
          data: {
            runId,
            kind: 'image',
            provider: 'zai-image',
            path: img.output?.[0] ?? `/${relPath}`,
            prompt: `封面：${brief.title}`,
            meta: { latencyMs: img.latencyMs } as unknown as object,
          },
        })
        await markStep(runId, 'cover', 'done', `已生成封面（${img.latencyMs}ms）`, Date.now() - started)
      } catch (e) {
        // 封面失败不阻断主流程（降级为无封面）
        await markStep(runId, 'cover', 'failed', `封面生成失败（${(e as Error).message.slice(0, 120)}），已降级为无封面`)
      }
    }

    // ── Step 6: layout 微信兼容排版 ──────────────────────
    try {
      await markStep(runId, 'layout', 'running')
      const started = Date.now()
      const coverAsset = await db.asset.findFirst({ where: { runId, kind: 'image' }, orderBy: { createdAt: 'desc' } })
      // 参考来源：编号与正文 [n] 对应（全部 claims 依序入列，无来源的如实标注）
      const sources: RenderSource[] = claimRows.map((c) => {
        const s = c.sources[0]
        return s
          ? { title: c.text.slice(0, 50), url: s.url, site: s.site, date: s.date }
          : { title: `${c.text.slice(0, 50)}（未检索到直接来源）`, url: '', site: '—', date: undefined }
      })
      const html = renderWechatArticle({
        title: brief.title,
        markdown: finalMd,
        themeId: run.theme,
        sources: sources.filter((s) => s.site !== '—' || true),
        ...(coverAsset ? { coverUrl: coverAsset.path } : {}),
      })
      const latest = await db.article.findFirst({ where: { runId, target: 'wechat' }, orderBy: { createdAt: 'desc' } })
      if (latest) {
        await db.article.update({ where: { id: latest.id }, data: { html } })
      } else {
        await db.article.create({ data: { runId, target: 'wechat', format: 'html', content: finalMd, html, note: '成稿' } })
      }
      await markStep(runId, 'layout', 'done', `主题 ${run.theme} · ${html.length} 字符加固 HTML`, Date.now() - started)
      await db.run.update({ where: { id: runId }, data: { status: 'done', error: null } })
    } catch (e) {
      await failRun(runId, 'layout', e)
    }
  } catch (e) {
    await failRun(runId, 'pipeline', e)
  }
}

async function failRun(runId: string, step: string, e: unknown) {
  const msg = `${step}: ${(e as Error)?.message || String(e)}`
  await markStep(runId, step as StepKey, 'failed', msg).catch(() => {})
  await db.run
    .update({ where: { id: runId }, data: { status: 'failed', error: msg.slice(0, 500) } })
    .catch(() => {})
}

/** 组合入口：创建 + 后台执行（fire-and-forget） */
export function startRun(opts: CreateRunOptions): Promise<{ id: string }> {
  return createRun(opts).then((run) => {
    void executeRun(run.id).catch(() => {})
    return { id: run.id }
  })
}
