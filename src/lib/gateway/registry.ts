/**
 * Provider 运行时注册表
 *
 * 设计要点（借鉴 dsh 账号池 + GET /models 探活）：
 *  - Map 结构支持运行时 register / unregister，为后续插件包动态装载预留
 *  - 同 id 重复注册视为「替换升级」，幂等不报错
 *  - healthAll() 并发探活所有（或指定 kind 的）Provider，
 *    用最小代价拿到可用性快照，驱动 UI 上的红绿灯
 */

import type { AnyProvider, HealthReport, ProviderKind, ProviderSummary } from './types'
import { summarize } from './types'

class ProviderRegistry {
  private providers = new Map<string, AnyProvider>()

  /** 注册（同 id 覆盖，幂等） */
  register(provider: AnyProvider): void {
    this.providers.set(provider.info.id, provider)
  }

  unregister(id: string): boolean {
    return this.providers.delete(id)
  }

  get<T extends AnyProvider>(id: string): T | undefined {
    return this.providers.get(id) as T | undefined
  }

  list(kind?: ProviderKind): ProviderSummary[] {
    const all = [...this.providers.values()]
    const filtered = kind ? all.filter((p) => p.info.kind === kind) : all
    return filtered.map(summarize)
  }

  /**
   * 并发探活。返回 id → 健康报告 的映射。
   * 单个 Provider 探活失败不会影响其它 Provider（Promise.allSettled）。
   */
  async healthAll(kind?: ProviderKind): Promise<Record<string, HealthReport>> {
    const targets = [...this.providers.values()].filter((p) => !kind || p.info.kind === kind)
    const results = await Promise.allSettled(
      targets.map(async (p) => ({ id: p.info.id, report: await p.healthCheck() }))
    )
    const out: Record<string, HealthReport> = {}
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') {
        out[r.value.id] = r.value.report
      } else {
        out[targets[i]?.info.id ?? `unknown-${i}`] = {
          ok: false,
          latencyMs: 0,
          detail: (r.reason as Error)?.message || '探活异常',
          checkedAt: new Date().toISOString(),
        }
      }
    })
    return out
  }
}

/** 全局单例：整个应用共享同一个注册表 */
export const providerRegistry = new ProviderRegistry()
