import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureGatewayReady } from '@/lib/gateway/bootstrap'
import { providerRegistry } from '@/lib/gateway/registry'
import type { LLMProvider } from '@/lib/gateway/types'
import { relayoutRun } from '@/lib/runtime/relayout'
import { buildRewriteMessages, REWRITE_TARGETS, type RewriteTarget } from '@/lib/runtime/skills/radar-rewrite'
import { buildLearnMessages, parseLearnResult, summarizeDiff } from '@/lib/runtime/skills/radar-learn'
import { getPersona } from '@/lib/runtime/skills/radar-write'
import { publishToWechat, recordManualPublish, isWechatConfigured } from '@/lib/publish/wechat'

/**
 * Run 动作 API（Phase 2 的「发布与飞轮」入口）
 * POST /api/runs/[id]/actions  { action, ...payload }
 *
 *   edit     { content, autoLearn? }     人工改稿保存 + 重新排版 + 编辑飞轮规则提炼
 *   rewrite  { target: csdn|xiaohongshu } 一稿多发平台改写
 *   publish  { channel: wechat|csdn|xiaohongshu } 发布（微信三级降级链）
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function llm(): LLMProvider {
  ensureGatewayReady()
  const p = providerRegistry.get<LLMProvider>('zai-llm')
  if (!p || !p.isConfigured()) throw new Error('LLM Provider（zai-llm）不可用')
  return p
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const run = await db.run.findUnique({ where: { id } })
    if (!run) {
      return NextResponse.json({ ok: false, message: 'Run 不存在' }, { status: 404 })
    }
    const body = await req.json()
    const action = typeof body.action === 'string' ? body.action : ''

    // ── edit：人工改稿 + 飞轮提炼 ──────────────────────
    if (action === 'edit') {
      const content = typeof body.content === 'string' ? body.content.trim() : ''
      if (content.length < 50) {
        return NextResponse.json({ ok: false, message: '正文过短（至少 50 字）' }, { status: 400 })
      }
      const prev = await db.article.findFirst({
        where: { runId: id, target: 'wechat' },
        orderBy: { createdAt: 'desc' },
      })
      if (!prev) {
        return NextResponse.json({ ok: false, message: '该 Run 尚无文章可编辑' }, { status: 400 })
      }

      const versions = await db.article.count({ where: { runId: id, target: 'wechat' } })
      const article = await db.article.create({
        data: {
          runId: id,
          version: versions + 1,
          target: 'wechat',
          format: 'markdown',
          content,
          note: '人工编辑',
        },
      })

      const relayout = await relayoutRun(id)

      // 编辑飞轮：diff → LLM 提炼规则 → proposed 落库
      let learn: { diffSummary: string; rules: Array<{ id: string; ruleText: string; examples: unknown }> ; skipped?: string } | null = null
      const autoLearn = body.autoLearn !== false
      if (autoLearn && prev.content !== content) {
        try {
          const res = await llm().complete({
            messages: buildLearnMessages({ before: prev.content, after: content }),
            maxTokens: 700,
            temperature: 0.2,
          })
          const parsed = parseLearnResult(res.content)
          const created: Array<{ id: string; ruleText: string; examples: unknown }> = []
          for (const r of parsed.rules) {
            const row = await db.learningRule.create({
              data: {
                runId: id,
                ruleText: r.ruleText,
                examples: r.examples as unknown as object[],
                status: 'proposed',
              },
            })
            created.push({ id: row.id, ruleText: row.ruleText, examples: r.examples })
          }
          learn = {
            diffSummary: summarizeDiff(prev.content, content),
            rules: created,
            ...(parsed.noPattern ? { skipped: '本次修改未发现可沉淀的稳定规则（宁缺毋滥）' } : {}),
          }
        } catch (e) {
          learn = { diffSummary: summarizeDiff(prev.content, content), rules: [], skipped: `规则提炼失败：${(e as Error).message.slice(0, 80)}` }
        }
      } else if (autoLearn) {
        learn = { diffSummary: '文本未变化', rules: [], skipped: '无差异，跳过提炼' }
      }

      return NextResponse.json({
        ok: true,
        article: { id: article.id, version: article.version, note: article.note },
        html: relayout?.html ?? null,
        learn,
      })
    }

    // ── rewrite：一稿多发平台改写 ──────────────────────
    if (action === 'rewrite') {
      const target = REWRITE_TARGETS.find((t) => t.id === body.target)?.id as RewriteTarget | undefined
      if (!target) {
        return NextResponse.json({ ok: false, message: 'target 取值：csdn | xiaohongshu' }, { status: 400 })
      }
      const latest = await db.article.findFirst({
        where: { runId: id, target: 'wechat' },
        orderBy: { createdAt: 'desc' },
      })
      if (!latest) {
        return NextResponse.json({ ok: false, message: '该 Run 尚无公众号成稿，无法改写' }, { status: 400 })
      }
      const persona = getPersona(run.persona)
      // 步骤里记录的 brief 标题兜底
      const steps = (run.steps as Array<{ key: string; detail?: string }>) ?? []
      const briefTitle = /《(.+?)》/.exec(steps.find((s) => s.key === 'brief')?.detail ?? '')?.[1] ?? run.title

      const res = await llm().complete({
        messages: buildRewriteMessages({ title: briefTitle, markdown: latest.content, target, personaName: persona.name }),
        maxTokens: 4200,
        temperature: 0.5,
      })
      const content = res.content.trim()
      if (content.length < 100) {
        return NextResponse.json({ ok: false, message: '改写结果过短，已放弃保存（可重试）' }, { status: 502 })
      }
      // 同目标平台幂等：覆盖旧改写版
      await db.article.deleteMany({ where: { runId: id, target } })
      const article = await db.article.create({
        data: {
          runId: id,
          version: 1,
          target,
          format: 'markdown',
          content,
          note: `${REWRITE_TARGETS.find((t) => t.id === target)?.name} 改写版`,
        },
      })
      return NextResponse.json({ ok: true, article: { id: article.id, target, chars: content.length, content } })
    }

    // ── publish：发布（微信三级降级 / 平台人工复制）────
    if (action === 'publish') {
      const channel = ['wechat', 'csdn', 'xiaohongshu'].includes(body.channel) ? body.channel : null
      if (!channel) {
        return NextResponse.json({ ok: false, message: 'channel 取值：wechat | csdn | xiaohongshu' }, { status: 400 })
      }

      if (channel === 'wechat') {
        const relayout = await relayoutRun(id)
        if (!relayout) {
          return NextResponse.json({ ok: false, message: '该 Run 尚无成稿可发布' }, { status: 400 })
        }
        const outcome = await publishToWechat({
          runId: id,
          articleId: relayout.articleId,
          html: relayout.html,
          title: relayout.title,
        })
        return NextResponse.json({
          ok: true,
          publish: { ...outcome, wechatConfigured: isWechatConfigured() },
        })
      }

      // CSDN / 小红书：取平台改写版（需先 rewrite）
      const platformArticle = await db.article.findFirst({
        where: { runId: id, target: channel },
        orderBy: { createdAt: 'desc' },
      })
      if (!platformArticle) {
        return NextResponse.json(
          { ok: false, message: `请先生成 ${channel === 'csdn' ? 'CSDN' : '小红书'} 改写版（rewrite）` },
          { status: 400 }
        )
      }
      await recordManualPublish({
        runId: id,
        articleId: platformArticle.id,
        platform: channel,
        note: `${platformArticle.note} 已就绪，人工复制发布（平台无公开 API）`,
      })
      if (channel === 'csdn' && run.ideaId) {
        await db.ideaCandidate.update({ where: { id: run.ideaId }, data: { status: 'published' } }).catch(() => {})
      }
      return NextResponse.json({
        ok: true,
        publish: {
          mode: 'local-paste',
          note: '改写版内容已返回，复制到平台编辑器发布（平台无公开 API）',
          markdown: platformArticle.content,
        },
      })
    }

    return NextResponse.json({ ok: false, message: `未知 action: ${action || '(空)'}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '动作执行失败' }, { status: 500 })
  }
}
