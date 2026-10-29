import { NextResponse } from "next/server"
import { getSettings, saveSetting, redactSettings, type AppSettings, type AgnesAccount, type AgnesSettings, type VideoSettings } from "@/lib/settings"

type Scope = keyof AppSettings

const SCOPES: Scope[] = ["llm", "search", "image", "agnes", "video", "style"]

export async function GET() {
  const s = await getSettings(true)
  return NextResponse.json({ settings: redactSettings(s) })
}

export async function PUT(req: Request) {
  try {
    const body = (await req.json()) as {
      scope?: Scope
      value?: Record<string, unknown>
      clearApiKey?: boolean
    }
    const scope = body.scope
    if (!scope || !SCOPES.includes(scope)) {
      return NextResponse.json({ error: `scope 必须是 ${SCOPES.join(" / ")}` }, { status: 400 })
    }

    // ---------- Agnes 账号池（对象/数组结构，专用合并） ----------
    if (scope === "agnes") {
      const v = (body.value ?? {}) as Partial<AgnesSettings> & { accounts?: AgnesAccount[] }
      const patch: Partial<AgnesSettings> = {}
      if (typeof v.enabled === "boolean") patch.enabled = v.enabled
      if (typeof v.chatModel === "string") patch.chatModel = v.chatModel.slice(0, 100)
      if (typeof v.imageModel === "string") patch.imageModel = v.imageModel.slice(0, 100)
      if (typeof v.videoModel === "string") patch.videoModel = v.videoModel.slice(0, 100)
      if (v.strategy === "round-robin" || v.strategy === "least-loaded") patch.strategy = v.strategy
      if (typeof v.rpmImage === "number") patch.rpmImage = Math.min(60, Math.max(1, Math.round(v.rpmImage)))
      if (typeof v.rpmVideo === "number") patch.rpmVideo = Math.min(10, Math.max(1, Math.round(v.rpmVideo)))
      if (Array.isArray(v.accounts)) {
        patch.accounts = v.accounts.slice(0, 20).map((a, i) => ({
          id: String(a.id ?? `acc-${Date.now()}-${i}`).slice(0, 60),
          label: String(a.label ?? `账号 ${i + 1}`).slice(0, 60),
          site: a.site === "intl" || a.site === "custom" || a.site === "cn" ? a.site : "cn",
          baseUrl: String(a.baseUrl ?? "").slice(0, 300),
          // 空密钥/掩码占位不覆盖（saveSetting 按兜底再对齐一次）
          apiKey: typeof a.apiKey === "string" && a.apiKey && !a.apiKey.includes("****") && !a.apiKey.includes("…") ? a.apiKey.slice(0, 300) : "",
          enabled: a.enabled !== false,
        }))
      }
      await saveSetting("agnes", patch)
      const fresh = await getSettings(true)
      return NextResponse.json({
        settings: redactSettings(fresh),
        message: patch.accounts
          ? `账号池已保存（${patch.accounts.length} 个账号）`
          : patch.enabled !== undefined
            ? patch.enabled
              ? "Agnes 已启用（LLM/生图/视频三通道可用）"
              : "Agnes 已停用"
            : "Agnes 配置已保存",
      })
    }

    // ---------- 视频通道 ----------
    if (scope === "video") {
      const v = (body.value ?? {}) as Partial<VideoSettings>
      const patch: Partial<VideoSettings> = {}
      if (v.channel === "local" || v.channel === "agnes" || v.channel === "auto") patch.channel = v.channel
      if (typeof v.secondsPerScene === "number") patch.secondsPerScene = Math.min(12, Math.max(4, Math.round(v.secondsPerScene)))
      await saveSetting("video", patch)
      const fresh = await getSettings(true)
      return NextResponse.json({
        settings: redactSettings(fresh),
        message:
          patch.channel === "agnes"
            ? "视频通道已切到 Agnes AI 模型（需账号池启用；本地渲染仍可手动选择）"
            : patch.channel === "auto"
              ? "视频通道：优先 Agnes AI 模型，失败自动回退本地渲染"
              : patch.channel === "local"
                ? "视频通道：本地双风格渲染（motion 商业片 / art 艺术动画）"
                : "视频配置已保存",
      })
    }

    // ---------- 简单域（llm / search / image / style：字符串字段） ----------
    const value = body.value ?? {}
    const patch: Record<string, string> = {}
    for (const [k, v] of Object.entries(value)) {
      if (k === "apiKey" && !v) continue
      if (k === "mode") {
        const mode = String(v)
        if (scope === "llm" && ["builtin", "custom", "agnes", "pi-ai"].includes(mode)) patch.mode = mode
        continue
      }
      if (k === "piProvider") {
        patch.piProvider = String(v ?? "").slice(0, 60)
        continue
      }
      patch[k] = String(v ?? "").slice(0, 500)
    }
    if (body.clearApiKey && (scope === "llm" || scope === "search" || scope === "image")) patch.apiKey = ""
    await saveSetting(scope, patch as never)
    const fresh = await getSettings(true)
    const fallbackNote =
      scope === "search"
        ? fresh.search.apiKey
          ? "已保存，下一次搜索即走新 key"
          : "已清除，AI 搜索回退环境变量密钥（未配置则演示模式）"
        : scope === "llm"
          ? fresh.llm.mode === "agnes"
            ? "已切换到 Agnes 免费文本模型（多账号池；失败自动回退内置引擎）"
            : fresh.llm.mode === "pi-ai"
              ? "已切换到 pi-ai 统一引擎（30+ 供应商；失败自动回退内置引擎）"
              : fresh.llm.apiKey
                ? "已保存，下一次调用即走新配置"
                : "已清除，文本引擎回退内置 zai-llm（免密钥）"
          : scope === "image"
            ? fresh.image.apiKey
              ? "已保存，下一次生图即走新端点"
              : "已清除，生图回退内置 SDK（沙箱内可能 405 降级）"
            : "风格定位已保存，注入下一篇文章"
    return NextResponse.json({ settings: redactSettings(fresh), message: fallbackNote })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
