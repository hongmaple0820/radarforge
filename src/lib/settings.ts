// ============================================================
// settings.ts —— 用户配置中心
// DB（SettingKV）优先，环境变量兜底；5s 内存缓存 + 失效即刷新
// 覆盖：LLM（内置/自定义 OpenAI 兼容）、搜索 key、生图、创作风格定位
// ============================================================

import { db } from "@/lib/db"

export interface LlmSettings {
  mode: "builtin" | "custom" | "agnes" | "pi-ai" // builtin = zai-llm（SDK 免密钥）/ agnes = 免费多账号池 / pi-ai = 统一多供应商引擎
  baseUrl: string // OpenAI 兼容，如 https://api.xxx.com/v1（pi-ai 模式下可覆盖注册表端点）
  apiKey: string
  model: string // 如 gpt-4o / deepseek-chat / claude-3-5-sonnet
  piProvider: string // pi-ai 供应商 id：openai / anthropic / google / deepseek / groq / openrouter / xai / zai…
}

export interface SearchSettings {
  apiKey: string // 元宝 SearchPro 的 Bearer key（空则回退 env.WSA_API_KEY）
}

export interface ImageSettings {
  mode: "builtin" | "custom"
  baseUrl: string // OpenAI 兼容 images 端点根地址
  apiKey: string
  model: string
}

export interface StyleProfile {
  positioning: string // 账号定位：一句话说清「你为谁写什么」
  audience: string // 目标读者画像
  domains: string // 内容领域与边界
  tone: string // 语气与文风偏好
  taboos: string // 禁忌清单（绝不出现的内容/表达）
}

// ---------- Agnes 免费多模态模型（多账号池，学 dsh-agnes-multimodal） ----------

export interface AgnesAccount {
  id: string
  label: string
  /** 站点：cn=国内 api.agnes-ai.cn / intl=国际 apihub.agnes-ai.cn / custom=自定义 baseUrl */
  site: "cn" | "intl" | "custom"
  baseUrl: string // site=custom 时使用；否则由 site 决定
  apiKey: string
  enabled: boolean
}

export interface AgnesSettings {
  enabled: boolean
  accounts: AgnesAccount[]
  chatModel: string // agnes-2.5-flash / agnes-3.0-flash
  imageModel: string // agnes-image-2.1-flash / agnes-image-2.5-flash
  videoModel: string // agnes-video-2.5-flash
  /** 取号策略：round-robin 轮询 / least-loaded 最少使用 */
  strategy: "round-robin" | "least-loaded"
  /** 每账号每分钟限额（免费档默认：图片 20 / 视频 1） */
  rpmImage: number
  rpmVideo: number
}

export interface VideoSettings {
  /** 视频通道：local=本地渲染（motion/art 双风格）/ agnes=AI 视频模型 / auto=优先 agnes 回退 local */
  channel: "local" | "agnes" | "auto"
  /** Agnes 视频生成时每镜秒数（4-12s） */
  secondsPerScene: number
}

export interface AppSettings {
  llm: LlmSettings
  search: SearchSettings
  image: ImageSettings
  agnes: AgnesSettings
  video: VideoSettings
  style: StyleProfile
}

const DEFAULTS: AppSettings = {
  llm: { mode: "builtin", baseUrl: "", apiKey: "", model: "", piProvider: "openai" },
  search: { apiKey: "" },
  image: { mode: "builtin", baseUrl: "", apiKey: "", model: "" },
  agnes: {
    enabled: false,
    accounts: [],
    chatModel: "agnes-2.5-flash",
    imageModel: "agnes-image-2.1-flash",
    videoModel: "agnes-video-2.5-flash",
    strategy: "round-robin",
    rpmImage: 20,
    rpmVideo: 1,
  },
  video: { channel: "local", secondsPerScene: 8 },
  style: { positioning: "", audience: "", domains: "", tone: "", taboos: "" },
}

const KEYS: Record<keyof AppSettings, string> = {
  llm: "provider:llm",
  search: "provider:search",
  image: "provider:image",
  agnes: "provider:agnes",
  video: "video:channel",
  style: "style:profile",
}

let cache: AppSettings | null = null
let loadedAt = 0

/** 读取全部设置（带 TTL 缓存；force=true 立即穿透） */
export async function getSettings(force = false): Promise<AppSettings> {
  if (!force && cache && Date.now() - loadedAt < 5000) return cache
  const out: AppSettings = {
    llm: { ...DEFAULTS.llm },
    search: { ...DEFAULTS.search },
    image: { ...DEFAULTS.image },
    agnes: { ...DEFAULTS.agnes, accounts: [] },
    video: { ...DEFAULTS.video },
    style: { ...DEFAULTS.style },
  }
  try {
    const rows = await db.settingKV.findMany()
    for (const r of rows) {
      const key = Object.keys(KEYS).find((k) => KEYS[k as keyof AppSettings] === r.key) as
        | keyof AppSettings
        | undefined
      if (!key) continue
      try {
        Object.assign(out[key] as unknown as Record<string, unknown>, JSON.parse(r.value) as Record<string, unknown>)
      } catch {
        /* 坏 JSON 跳过 */
      }
    }
  } catch {
    /* DB 未就绪 → 用默认值 + env 兜底 */
  }
  cache = out
  loadedAt = Date.now()
  return out
}

/** 同步窥视（供 provider 的同步 isConfigured 用；首次调用前为 null） */
export function peekSettings(): AppSettings | null {
  return cache
}

/** 保存后失效缓存（下一次 getSettings 穿透） */
export function invalidateSettings(): void {
  cache = null
}

/** 保存某域设置（merge 语义：undefined 字段保留原值） */
export async function saveSetting<K extends keyof AppSettings>(
  scope: K,
  patch: Partial<AppSettings[K]>,
): Promise<AppSettings> {
  const current = await getSettings(true)
  let merged: AppSettings[K]
  if (scope === "agnes") {
    // 账号数组专用合并：按 id 对齐；空密钥/掩码占位不覆盖已存密钥
    const patchAgnes = patch as Partial<AgnesSettings>
    const incoming = patchAgnes.accounts ?? current.agnes.accounts
    const accounts = incoming.map((a) => {
      const stored = current.agnes.accounts.find((x) => x.id === a.id)
      const keyLooksEmptyOrMasked = !a.apiKey || a.apiKey.includes("****") || a.apiKey.includes("…")
      return { ...a, apiKey: keyLooksEmptyOrMasked ? (stored?.apiKey ?? "") : a.apiKey }
    })
    merged = { ...current.agnes, ...patchAgnes, accounts } as AppSettings[K]
  } else {
    merged = { ...current[scope], ...patch } as AppSettings[K]
  }
  await db.settingKV.upsert({
    where: { key: KEYS[scope] },
    update: { value: JSON.stringify(merged) },
    create: { key: KEYS[scope], value: JSON.stringify(merged) },
  })
  invalidateSettings()
  return getSettings(true)
}

// ---------- 风格定位 → prompt 注入 ----------

/** 风格定位转 prompt 块（空定位返回空串，不注入） */
export function styleProfilePrompt(s: StyleProfile): string {
  const parts = [
    s.positioning && `账号定位：${s.positioning}`,
    s.audience && `目标读者：${s.audience}`,
    s.domains && `内容领域：${s.domains}`,
    s.tone && `语气与文风：${s.tone}`,
    s.taboos && `禁忌（绝不出现）：${s.taboos}`,
  ].filter((x): x is string => Boolean(x && x.trim()))
  return parts.length > 0 ? parts.join("\n") : ""
}

// ---------- 脱敏（GET 返回给前端） ----------

export function maskKey(key: string): string {
  if (!key) return ""
  if (key.length <= 10) return `${key.slice(0, 2)}****`
  return `${key.slice(0, 6)}…${key.slice(-4)}`
}

export function redactSettings(s: AppSettings): AppSettings & { _meta: Record<string, { hasKey: boolean; envFallback: boolean }> } {
  return {
    ...s,
    llm: { ...s.llm, apiKey: maskKey(s.llm.apiKey) },
    search: { ...s.search, apiKey: maskKey(s.search.apiKey) },
    image: { ...s.image, apiKey: maskKey(s.image.apiKey) },
    agnes: {
      ...s.agnes,
      accounts: s.agnes.accounts.map((a) => ({ ...a, apiKey: maskKey(a.apiKey) })),
    },
    video: { ...s.video },
    style: { ...s.style },
    _meta: {
      llm: { hasKey: Boolean(s.llm.apiKey), envFallback: false },
      search: { hasKey: Boolean(s.search.apiKey || process.env.WSA_API_KEY), envFallback: !s.search.apiKey && Boolean(process.env.WSA_API_KEY) },
      image: { hasKey: Boolean(s.image.apiKey), envFallback: false },
      agnes: { hasKey: s.agnes.accounts.some((a) => a.apiKey), envFallback: false },
      video: { hasKey: false, envFallback: false },
    },
  }
}
