import { NextRequest, NextResponse } from 'next/server'
import { ensureGatewayReady } from '@/lib/gateway/bootstrap'
import { providerRegistry } from '@/lib/gateway/registry'
import type { ProviderKind } from '@/lib/gateway/types'

/**
 * 模型网关接口
 * GET /api/gateway?probe=1
 *
 * 默认返回 Provider 清单（id / kind / name / origin / configured），
 * probe=1 时并发探活并附加健康报告（对应 dsh GET /models 探活思想）。
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: ProviderKind[] = ['llm', 'search', 'image', 'video']

export async function GET(req: NextRequest) {
  ensureGatewayReady()
  const kindParam = req.nextUrl.searchParams.get('kind')
  const kind = KINDS.includes(kindParam as ProviderKind) ? (kindParam as ProviderKind) : undefined
  const probe = req.nextUrl.searchParams.get('probe') === '1'

  const providers = providerRegistry.list(kind)

  if (!probe) {
    return NextResponse.json({
      ok: true,
      providers,
      health: null,
      hint: '附加 ?probe=1 可对所有 Provider 并发探活',
    })
  }

  const health = await providerRegistry.healthAll(kind)
  return NextResponse.json({ ok: true, providers, health })
}
