// ============================================================
// pool.ts —— Agnes 多账号池（移植自 dsh-agnes-multimodal 调度设计）
// 免费 = 每账号限额紧（图片 ~20 RPM / 视频 1 任务每分钟），
// 多账号池化是唯一扩容路径。同账号多 Key 不叠加限额。
// 调度：round-robin / least-loaded + 滑动窗口 RPM +
// 连续 429/401 熔断 30s + 失败换号重试（调用方驱动）。
// ============================================================

import { getSettings, peekSettings, type AgnesAccount, type AgnesSettings } from "@/lib/settings"

export const AGNES_SITE_BASE: Record<"cn" | "intl", string> = {
  cn: "https://api.agnes-ai.cn/v1",
  intl: "https://apihub.agnes-ai.cn/v1",
}

export function accountBaseUrl(a: AgnesAccount): string {
  if (a.site === "custom" && a.baseUrl) return a.baseUrl.replace(/\/$/, "")
  return AGNES_SITE_BASE[a.site === "intl" ? "intl" : "cn"]
}

/** 运行时槽位（内存态，重启重建；不落盘） */
interface PoolSlot {
  account: AgnesAccount
  /** 图片滑动窗口：最近调用时间戳（ms） */
  imageWindow: number[]
  /** 视频占用：下次可提交时间（ms，每账号 1 任务/分钟） */
  videoBusyUntil: number
  /** 连续 429/401 计数（达阈值熔断） */
  consecutive429: number
  /** 熔断截止时间（ms） */
  cooldownUntil: number
  /** 最近一次被选中（least-loaded 用） */
  lastUsedAt: number
}

const slots = new Map<string, PoolSlot>()
let poolInitializedFor = ""
let rrCursor = 0

function ensurePool(): PoolSlot[] {
  const s = peekSettings()?.agnes
  if (!s) return []
  // 设置变更（账号数/启停变化）→ 重建池（保留同 id 槽位的运行态）
  const signature = `${s.enabled}|${s.accounts.map((a) => `${a.id}:${a.enabled}`).join(",")}`
  if (signature !== poolInitializedFor) {
    const next = new Map<string, PoolSlot>()
    for (const a of s.accounts) {
      if (!a.enabled || !a.apiKey) continue
      const prev = slots.get(a.id)
      next.set(a.id, {
        account: a,
        imageWindow: prev?.imageWindow ?? [],
        videoBusyUntil: prev?.videoBusyUntil ?? 0,
        consecutive429: prev?.consecutive429 ?? 0,
        cooldownUntil: prev?.cooldownUntil ?? 0,
        lastUsedAt: prev?.lastUsedAt ?? 0,
      })
    }
    slots.clear()
    next.forEach((v, k) => slots.set(k, v))
    poolInitializedFor = signature
  }
  return [...slots.values()]
}

export function agnesPoolStatus() {
  const s = peekSettings()?.agnes
  const active = ensurePool()
  const now = Date.now()
  return {
    configured: Boolean(s?.enabled && active.length > 0),
    accounts: active.length,
    strategy: s?.strategy ?? "round-robin",
    /** 图片并发能力 = 账号数 × RPM */
    imageCapacity: active.length * (s?.rpmImage ?? 20),
    /** 当前分钟可提交视频的账号数 */
    videoReady: active.filter((x) => x.videoBusyUntil <= now && x.cooldownUntil <= now).length,
    cooldown: active.filter((x) => x.cooldownUntil > now).length,
  }
}

/** 池化设置快照（provider isConfigured 用） */
export function agnesConfigured(): boolean {
  const s = peekSettings()?.agnes
  return Boolean(s?.enabled && s.accounts.some((a) => a.enabled && a.apiKey))
}

async function refreshSettings(): Promise<void> {
  await getSettings() // TTL 缓存刷新（5s 粒度足够）
}

/**
 * 取一个可用账号（图片场景：滑动窗口 RPM 限制）
 * - 轮询策略：rrCursor 循环
 * - 全忙（窗口满）→ 返回最快滑出的槽（忙等由调用方决定：拒绝或等待）
 * - 熔断槽跳过；全部熔断 → 返回冷却最早的槽并带提示
 */
export async function acquireImageSlot(settings: AgnesSettings): Promise<{ slot?: PoolSlot; waitMs: number; reason?: string }> {
  await refreshSettings()
  const active = ensurePool().filter((s) => s.cooldownUntil <= Date.now())
  if (active.length === 0) {
    const all = ensurePool()
    if (all.length === 0) return { waitMs: 0, reason: "Agnes 账号池为空或未启用" }
    const earliest = all.reduce((a, b) => (a.cooldownUntil < b.cooldownUntil ? a : b))
    return { waitMs: earliest.cooldownUntil - Date.now(), reason: "全部账号熔断中" }
  }
  const now = Date.now()
  const windowMs = 60_000
  // 依次尝试，找窗口未满且未熔断的槽
  for (let i = 0; i < active.length; i++) {
    const idx =
      settings.strategy === "least-loaded"
        ? active.findIndex((s) => s.imageWindow.length === Math.min(...active.map((x) => x.imageWindow.length)))
        : (rrCursor + i) % active.length
    const s = active[idx]
    s.imageWindow = s.imageWindow.filter((t) => now - t < windowMs)
    if (s.imageWindow.length < settings.rpmImage) {
      s.imageWindow.push(now)
      s.lastUsedAt = now
      if (settings.strategy === "round-robin") rrCursor = (idx + 1) % active.length
      return { slot: s, waitMs: 0 }
    }
  }
  // 全部窗口满 → 返回最快滑出的
  const soonest = active.reduce((a, b) => {
    const aFree = a.imageWindow.length ? a.imageWindow[0] + windowMs : 0
    const bFree = b.imageWindow.length ? b.imageWindow[0] + windowMs : 0
    return aFree < bFree ? a : b
  })
  return { waitMs: Math.max(0, (soonest.imageWindow[0] ?? now) + windowMs - now), reason: "RPM 窗口满" }
}

/** 取视频账号（每账号 1 任务/分钟；全忙返回 waitMs） */
export async function acquireVideoSlot(settings: AgnesSettings): Promise<{ slot?: PoolSlot; waitMs: number; reason?: string }> {
  await refreshSettings()
  const now = Date.now()
  const active = ensurePool().filter((s) => s.cooldownUntil <= now && s.videoBusyUntil <= now)
  if (active.length === 0) {
    const all = ensurePool()
    if (all.length === 0) return { waitMs: 0, reason: "Agnes 账号池为空或未启用" }
    const busy = all.filter((s) => s.videoBusyUntil > now)
    const cooling = all.filter((s) => s.cooldownUntil > now)
    if (busy.length > 0) {
      const earliest = busy.reduce((a, b) => (a.videoBusyUntil < b.videoBusyUntil ? a : b))
      return { waitMs: earliest.videoBusyUntil - now, reason: "全部账号视频占用中（1 任务/分/账号）" }
    }
    const earliest = cooling.reduce((a, b) => (a.cooldownUntil < b.cooldownUntil ? a : b))
    return { waitMs: earliest.cooldownUntil - now, reason: "全部账号熔断中" }
  }
  const s = active.reduce((a, b) => (a.lastUsedAt < b.lastUsedAt ? a : b))
  s.videoBusyUntil = now + 60_000
  s.lastUsedAt = now
  return { slot: s, waitMs: 0 }
}

/** 上报失败（429/401 连续 3 次熔断 30s；普通错误衰减计数） */
export function reportFailure(slotAccount: AgnesAccount, kind: "rate-limit" | "auth" | "error"): void {
  const s = slots.get(slotAccount.id)
  if (!s) return
  if (kind === "rate-limit" || kind === "auth") {
    s.consecutive429++
    if (s.consecutive429 >= 3) {
      s.cooldownUntil = Date.now() + 30_000
      s.consecutive429 = 0
    }
  } else {
    s.consecutive429 = Math.max(0, s.consecutive429 - 1)
  }
}

export function reportSuccess(slotAccount: AgnesAccount): void {
  const s = slots.get(slotAccount.id)
  if (s) s.consecutive429 = 0
}

/** 零成本探活：GET /models */
export async function probeAccount(a: AgnesAccount): Promise<{ ok: boolean; latencyMs: number; detail: string }> {
  const t0 = Date.now()
  try {
    const res = await fetch(`${accountBaseUrl(a)}/models`, {
      headers: { Authorization: `Bearer ${a.apiKey}` },
      signal: AbortSignal.timeout(8000),
    })
    const latency = Date.now() - t0
    if (res.ok) return { ok: true, latencyMs: latency, detail: "密钥有效" }
    if (res.status === 401) return { ok: false, latencyMs: latency, detail: "密钥无效（401）" }
    if (res.status === 429) return { ok: true, latencyMs: latency, detail: "端点可达（429 限频中，稍后可用）" }
    return { ok: false, latencyMs: latency, detail: `HTTP ${res.status}` }
  } catch (e) {
    return { ok: false, latencyMs: Date.now() - t0, detail: (e as Error).message.slice(0, 120) }
  }
}

/** 内部导出（同包 provider 用） */
export type { PoolSlot }
export function findSlot(a: AgnesAccount): PoolSlot | undefined {
  return slots.get(a.id)
}
