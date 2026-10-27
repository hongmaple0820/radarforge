import { NextRequest, NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import type { WsaPage } from '@/lib/wsa'

/**
 * AI 早报生成接口
 * POST /api/briefing
 * body: { topic: string, pages: WsaPage[] }
 *
 * 将元宝搜索返回的资讯卡片交给大模型做汇总提炼，
 * 生成带 [n] 信源编号的早报，实现「搜索 → 汇总 → 可溯源」闭环。
 */
export async function POST(req: NextRequest) {
  try {
    const { topic, pages } = await req.json()

    if (typeof topic !== 'string' || !topic.trim()) {
      return NextResponse.json({ ok: false, message: '缺少话题' }, { status: 400 })
    }
    if (!Array.isArray(pages) || pages.length === 0) {
      return NextResponse.json({ ok: false, message: '没有可汇总的资讯，请先搜索' }, { status: 400 })
    }

    // 组装信源材料: 标题 + 摘要 + 站点 + 时间
    const materials = (pages as WsaPage[])
      .slice(0, 20)
      .map(
        (p, i) =>
          `[${i + 1}] 《${p.title}》｜${p.site}｜${p.date}\n摘要: ${p.passage?.slice(0, 300) ?? ''}`
      )
      .join('\n\n')

    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'assistant',
          content:
            '你是一名专业的科技资讯编辑，负责把搜索引擎返回的多条资讯整理成一份「AI 早报」。要求：' +
            '1. 用 Markdown 输出；2. 开头用一句话概括本期风向；' +
            '3. 主体分为 2-4 个小节（用 ### 标题），每节围绕一条主线归纳多条资讯；' +
            '4. 每条信息点末尾必须标注信源编号，如 [1][3]，不得编造信源里没有的内容；' +
            '5. 结尾给出一段 50 字以内的「编辑观察」；6. 全文中文、总长控制在 400 字以内，克制、信息密度高。',
        },
        {
          role: 'user',
          content: `话题: ${topic}\n\n以下是元宝搜索返回的资讯列表（含信源编号）:\n\n${materials}\n\n请生成本期「AI 早报」。`,
        },
      ],
      thinking: { type: 'disabled' },
    })

    const briefing = completion.choices[0]?.message?.content
    if (!briefing || !briefing.trim()) {
      return NextResponse.json({ ok: false, message: '早报生成结果为空，请重试' }, { status: 502 })
    }

    return NextResponse.json({ ok: true, briefing })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '早报生成失败' }, { status: 500 })
  }
}
