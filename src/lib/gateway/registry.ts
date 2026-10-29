// ============================================================
// Provider 注册表 —— 插件化核心（学 dsh：运行时可插拔注册）
// 内置 provider 在启动时注册；插件/外部代码可随时 register()
// ============================================================

import type { AnyProvider, ProviderDescriptor, ProviderKind } from "./types"
import { GatewayError } from "./types"

type Listener = () => void

class ProviderRegistry {
  private providers = new Map<string, AnyProvider>()
  private listeners = new Set<Listener>()

  /** 注册一个 provider；同名覆盖（支持热替换） */
  register(provider: AnyProvider): void {
    this.providers.set(provider.name, provider)
    this.listeners.forEach((l) => l())
  }

  unregister(name: string): boolean {
    const ok = this.providers.delete(name)
    if (ok) this.listeners.forEach((l) => l())
    return ok
  }

  get(name: string): AnyProvider {
    const p = this.providers.get(name)
    if (!p) {
      // 学 dsh：未识别的 provider 名 → 明确报错，绝不静默回退到错误协议
      throw new GatewayError(
        `未识别的 Provider: "${name}"。已注册: ${[...this.providers.keys()].join(", ")}`,
        "PROVIDER_NOT_FOUND",
      )
    }
    return p
  }

  byKind(kind: ProviderKind): AnyProvider[] {
    return [...this.providers.values()].filter((p) => p.kind === kind)
  }

  list(): ProviderDescriptor[] {
    return [...this.providers.values()].map((p) => ({
      kind: p.kind,
      name: p.name,
      label: p.label,
      notes: p.notes,
      builtin: !p.name.startsWith("plugin-"),
      configured: p.isConfigured(),
    }))
  }

  onChange(l: Listener): () => void {
    this.listeners.add(l)
    return () => this.listeners.delete(l)
  }
}

export const registry = new ProviderRegistry()
