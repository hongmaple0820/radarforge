import { NextRequest, NextResponse } from 'next/server'
import { searchWsa, hasApiKey, WsaApiError } from '@/lib/wsa'

/**
 * 元宝搜索代理接口
 * POST /api/search
 * body: { query, mode?, cnt?, industry?, freshness?, site? }
 *
 * Key 始终留在服务端，前端只与本路由通信，避免泄漏。
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'InvalidParameter', message: '请求体不是合法 JSON' }, { status: 400 })
  }

  const query = typeof body.query === 'string' ? body.query.trim() : ''
  if (!query) {
    return NextResponse.json({ error: 'InvalidParameter', message: 'query 不能为空' }, { status: 400 })
  }
  if (query.length > 500) {
    return NextResponse.json({ error: 'InvalidParameter', message: 'query 过长（上限约 500 个中英文字符）' }, { status: 400 })
  }

  const mode = typeof body.mode === 'number' ? body.mode : 0
  const cnt = typeof body.cnt === 'number' ? body.cnt : 10
  const industry = typeof body.industry === 'string' && body.industry ? body.industry : undefined
  const freshness = typeof body.freshness === 'string' && body.freshness ? body.freshness : undefined

  try {
    const result = await searchWsa({ query, mode, cnt, industry, freshness })
    return NextResponse.json({ ok: true, ...result, apiKeyConfigured: hasApiKey() })
  } catch (e) {
    if (e instanceof WsaApiError) {
      const status = e.code === 'UnauthorizedOperation' ? 401 : e.code === 'ResourceNotFound' ? 403 : 500
      return NextResponse.json({ ok: false, error: e.code, message: e.message }, { status })
    }
    return NextResponse.json(
      { ok: false, error: 'InternalError', message: (e as Error)?.message || '服务内部错误' },
      { status: 500 }
    )
  }
}
