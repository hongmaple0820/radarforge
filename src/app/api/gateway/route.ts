import { NextRequest, NextResponse } from 'next/server'
import { ensureBuiltinProviders, registry, healthCheckAll } from '@/lib/gateway'
import type { ProviderKind } from '@/lib/gateway/types'

/**
 * 模型网关接口
 * GET /api/gateway?probe=1&kind=LLM
 *
 * 默认返回 Provider 清单（kind/name/label/configured），
 * probe=1 时并发探活并把健康报告/调用统计落 ProviderRecord
 * （对应 dsh GET /models 探活思想）。
 */

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const KINDS: ProviderKind[] = ['LLM', 'SEARCH', 'IMAGE', 'VIDEO']

export async function GET(req: NextRequest) {
  ensureBuiltinProviders()
  const kindParam = req.nextUrl.searchParams.get('kind')
  const kind = KINDS.includes(kindParam as ProviderKind) ? (kindParam as ProviderKind) : undefined
  const probe = req.nextUrl.searchParams.get('probe') === '1'

  let providers = registry.list()
  if (kind) providers = providers.filter((p) => p.kind === kind)

  if (!probe) {
    return NextResponse.json({
      ok: true,
      providers,
      health: null,
      hint: '附加 ?probe=1 可对所有 Provider 并发探活（含调用统计）',
    })
  }

  const health = await healthCheckAll()
  return NextResponse.json({ ok: true, providers, health })
}
