/**
 * 网关启动装配：注册所有内建 Provider
 *
 * ensureGatewayReady() 幂等，所有网关相关 API 路由入口处调用。
 * 未来插件包的动态注册也走同一 providerRegistry.register()。
 */

import { providerRegistry } from './registry'
import { wsaSearchProvider } from './providers/wsa-search'
import { zaiLlmProvider } from './providers/zai-llm'

let ready = false

export function ensureGatewayReady(): void {
  if (ready) return
  providerRegistry.register(wsaSearchProvider)
  providerRegistry.register(zaiLlmProvider)
  ready = true
}
