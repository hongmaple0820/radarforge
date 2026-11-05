// ============================================================
// zai-image —— 首个 ImageProvider（z-ai-web-dev-sdk 生图落盘）
// 失败自动降级（Asset.error 留痕），绝不阻断流水线
// ============================================================

import { mkdir, writeFile } from "fs/promises"
import path from "path"
import { getSettings } from "@/lib/settings"
import type { HealthReport, ImageProvider } from "../types"

const ASSET_DIR = "/home/z/my-project/public/assets"

/** 生图尺寸白名单（cover 1344×768 / 竖版 864×1152 / 方图 1024×1024） */
export const IMAGE_SIZES = ["1344x768", "864x1152", "1024x1024"] as const
export type ImageSize = (typeof IMAGE_SIZES)[number]

function safeSize(size?: string): ImageSize {
  return (IMAGE_SIZES as readonly string[]).includes(size ?? "") ? (size as ImageSize) : "1344x768"
}

export interface GeneratedImage {
  ok: boolean
  filePath: string // /assets/xxx.png（静态可访问）
  absPath: string
  error?: string
  sizeBytes: number
  /** B5：实际出图通道（builtin-sdk / agnes-image / custom），留痕用 */
  via?: string
}

/** 自定义 OpenAI 兼容生图端点（设置中心配置后启用） */
async function generateViaCustom(
  prompt: string,
  fileName: string,
  size: ImageSize,
  baseUrl: string,
  apiKey: string,
  model: string,
): Promise<GeneratedImage> {
  const url = `${baseUrl.replace(/\/+$/, "").replace(/\/images\/generations$/, "")}/images/generations`
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: model || "doubao-seedream-3-0-t2i-250415",
      prompt: prompt.slice(0, 500),
      size,
      response_format: "b64_json",
    }),
    signal: AbortSignal.timeout(90000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`自定义生图 HTTP ${res.status}${text ? `：${text.slice(0, 120)}` : ""}`)
  }
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] }
  const item = json.data?.[0]
  let b64 = item?.b64_json
  if (!b64 && item?.url) {
    // 兼容返回 URL 的端点：下载后转 base64 落盘
    const img = await fetch(item.url, { signal: AbortSignal.timeout(30000) })
    if (!img.ok) throw new Error(`生图结果下载失败 HTTP ${img.status}`)
    b64 = Buffer.from(await img.arrayBuffer()).toString("base64")
  }
  if (!b64) throw new Error("生图返回空数据")
  await mkdir(ASSET_DIR, { recursive: true })
  const absPath = path.join(ASSET_DIR, fileName)
  const buf = Buffer.from(b64, "base64")
  await writeFile(absPath, buf)
  return { ok: true, filePath: `/assets/${fileName}`, absPath, sizeBytes: buf.length }
}

/** 内置 SDK 生图（沙箱网关可能 405 拦截 → 降级留痕不阻断） */
async function generateViaSdk(prompt: string, fileName: string, size: ImageSize): Promise<GeneratedImage> {
  const { default: ZAI } = await import("z-ai-web-dev-sdk")
  const zai = await ZAI.create()
  // 沙箱出口 WAF 偶发拦截生图端点（405 HTML）——间隔重试 2 次提高穿透率
  const MAX_RETRY = 2
  for (let attempt = 0; attempt <= MAX_RETRY; attempt++) {
    try {
      const res = await zai.images.generations.create({
        prompt: prompt.slice(0, 500),
        size,
      })
      const b64 = res?.data?.[0]?.base64
      if (!b64) throw new Error("生图返回空数据")
      await mkdir(ASSET_DIR, { recursive: true })
      const absPath = path.join(ASSET_DIR, fileName)
      const buf = Buffer.from(b64, "base64")
      await writeFile(absPath, buf)
      return { ok: true, filePath: `/assets/${fileName}`, absPath, sizeBytes: buf.length, via: "builtin-sdk" }
    } catch (e) {
      const msg = (e as Error).message || ""
      const waf = msg.includes("405") || msg.includes("空数据")
      if (waf && attempt < MAX_RETRY) {
        await new Promise((r) => setTimeout(r, 2500))
        continue
      }
      throw e
    }
  }
  throw new Error("生图重试后仍失败")
}

/** B5：Agnes 免费池生图（URL/dataURI → 下载落盘；账号池与限频由 agnes pool 管） */
async function generateViaAgnes(prompt: string, fileName: string, size: ImageSize): Promise<GeneratedImage> {
  const { agnesImage } = await import("./agnes/agnes-image")
  const generate = agnesImage.generate?.bind(agnesImage)
  if (!generate) throw new Error("Agnes 生图通道不可用")
  const res = await generate({ prompt: prompt.slice(0, 500), size })
  const src = res.images[0]
  if (!src) throw new Error("Agnes 生图返回空")
  let buf: Buffer
  if (src.startsWith("data:")) {
    buf = Buffer.from(src.split(",")[1] ?? "", "base64")
  } else {
    const img = await fetch(src, { signal: AbortSignal.timeout(60_000) })
    if (!img.ok) throw new Error(`Agnes 生图结果下载失败 HTTP ${img.status}`)
    buf = Buffer.from(await img.arrayBuffer())
  }
  if (buf.length === 0) throw new Error("Agnes 生图返回空")
  await mkdir(ASSET_DIR, { recursive: true })
  const absPath = path.join(ASSET_DIR, fileName)
  await writeFile(absPath, buf)
  return { ok: true, filePath: `/assets/${fileName}`, absPath, sizeBytes: buf.length, via: "agnes-image" }
}

/**
 * 通用生图（slug 区分文件名，避免同 run 多图互相覆盖；size 走白名单）。
 * B5 三通道回退链：主通道（设置 mode：custom 端点 / builtin SDK）→ Agnes 免费池
 * （若启用且有可用账号）→ SDK 兜底（去重不重试主通道）。每级失败进链路字符串
 * （降级不消失），全部失败才 ok=false 留痕，绝不阻断流水线。
 */
export async function generateImage(prompt: string, runId: string, slug: string, size?: string): Promise<GeneratedImage> {
  const safeSlug = (slug || "img").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24) || "img"
  const fileName = `${safeSlug}-${runId}.png`
  const finalSize = safeSize(size)
  try {
    const s = await getSettings()
    const agnesReady = s.agnes.enabled && s.agnes.accounts.some((a) => a.enabled && a.apiKey)
    const customReady = s.image.mode === "custom" && Boolean(s.image.baseUrl && s.image.apiKey)
    // 链路：主通道 → agnes → sdk（若主通道已是 sdk 则不重复；custom 配了但 mode=builtin 时也作为末级备用）
    const chain: { name: string; run: () => Promise<GeneratedImage> }[] = []
    if (customReady) chain.push({ name: "custom", run: () => generateViaCustom(prompt, fileName, finalSize, s.image.baseUrl, s.image.apiKey, s.image.model).then((r) => ({ ...r, via: "custom" })) })
    else chain.push({ name: "builtin-sdk", run: () => generateViaSdk(prompt, fileName, finalSize) })
    if (agnesReady) chain.push({ name: "agnes-image", run: () => generateViaAgnes(prompt, fileName, finalSize) })
    if (!chain.some((c) => c.name === "builtin-sdk")) chain.push({ name: "builtin-sdk", run: () => generateViaSdk(prompt, fileName, finalSize) })

    const tried: string[] = []
    for (const c of chain) {
      try {
        const img = await c.run()
        return img
      } catch (e) {
        tried.push(`${c.name}✗ ${(e as Error).message.slice(0, 80)}`)
      }
    }
    return { ok: false, filePath: "", absPath: "", sizeBytes: 0, error: `三通道均失败（${tried.join(" → ")}）` }
  } catch (e) {
    // 设置读取等意外失败 —— 降级留痕，不阻断
    return { ok: false, filePath: "", absPath: "", error: (e as Error).message, sizeBytes: 0 }
  }
}

/** 兼容旧签名：封面生成（等价 generateImage(prompt, runId, "cover")） */
export async function generateCoverImage(prompt: string, runId: string): Promise<GeneratedImage> {
  return generateImage(prompt, runId, "cover", "1344x768")
}

export const zaiImage: ImageProvider = {
  kind: "IMAGE",
  name: "zai-image",
  label: "Z.ai 生图（SDK）",
  notes: "B5 三通道回退链：主通道（自定义端点/内置 SDK）→ Agnes 免费池（启用时）→ SDK 兜底；每级失败进链路留痕（降级不消失），全失败才降级无图不阻断",
  isConfigured: () => true,
  async health(): Promise<HealthReport> {
    const t0 = Date.now()
    const s = await getSettings()
    if (s.image.mode === "custom") {
      return {
        status: s.image.baseUrl && s.image.apiKey ? "healthy" : "down",
        latencyMs: Date.now() - t0,
        detail: s.image.baseUrl && s.image.apiKey ? `自定义端点：${s.image.baseUrl.slice(0, 40)}（连通性以实际调用为准）` : "已选自定义但未填 baseUrl/apiKey",
      }
    }
    // 零成本探活：只验证 SDK 可加载，不发真实生图请求
    try {
      await import("z-ai-web-dev-sdk")
      return { status: "healthy", latencyMs: Date.now() - t0, detail: "SDK 可加载（生图端点连通性以实际调用为准）" }
    } catch (e) {
      return { status: "down", latencyMs: Date.now() - t0, error: (e as Error).message }
    }
  },
}
