import { NextResponse } from "next/server"
import { getSettings, saveSetting, redactSettings, type AppSettings } from "@/lib/settings"
import { accountBaseUrl } from "@/lib/gateway/providers/agnes/pool"

/**
 * models.json 协议互通（pi-ai / dsh 插件生态）
 *
 * GET  /api/settings/models-json —— 导出当前供应商配置为 models.json（pi-ai 风格）
 * POST /api/settings/models-json —— 导入 models.json：agnes 账号池 / OpenAI 兼容自定义 LLM
 *
 * 协议字段对齐 pi-ai models.json（providers.{name}.baseUrl/api/apiKey/models）
 * + dsh-agnes-multimodal 扩展字段（accounts 多账号、capabilities）。
 */

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

interface ImportedModel {
  id?: string
  name?: string
  kind?: string
  price?: string
  contextWindow?: number
}

interface ImportedProvider {
  baseUrl?: string
  api?: string
  apiKey?: string
  /** dsh 扩展：多账号轮询 */
  accounts?: string[]
  capabilities?: string[]
  models?: ImportedModel[]
}

export async function GET() {
  const s = await getSettings(true)
  const providers: Record<string, ImportedProvider> = {}

  // Agnes（账号池 → pi-ai/dsh 双协议形态）
  const agnesAccounts = s.agnes.accounts.filter((a) => a.enabled && a.apiKey)
  if (agnesAccounts.length > 0 || s.agnes.enabled) {
    providers.agnes = {
      baseUrl: accountBaseUrl(agnesAccounts[0] ?? ({ site: "cn", baseUrl: "" } as never)),
      api: "openai-completions",
      accounts: agnesAccounts.map((a) => a.apiKey),
      capabilities: ["text", "image", "video"],
      models: [
        { id: s.agnes.chatModel, kind: "text", price: "free" },
        { id: s.agnes.imageModel, kind: "image", price: "free" },
        { id: s.agnes.videoModel, kind: "video", price: "free" },
      ],
    }
  }

  // 自定义 OpenAI 兼容 LLM
  if (s.llm.mode === "custom" && s.llm.baseUrl && s.llm.apiKey) {
    providers["custom-llm"] = {
      baseUrl: s.llm.baseUrl,
      api: "openai-completions",
      apiKey: s.llm.apiKey,
      models: [{ id: s.llm.model || "default" }],
    }
  }

  // 元宝搜索（本平台专属，供 dsh 插件侧复用情报底座）
  if (s.search.apiKey) {
    providers["yuanbao-search"] = {
      baseUrl: "https://api.wsa.cloud.tencent.com/SearchPro",
      api: "tencent-searchpro",
      apiKey: s.search.apiKey,
      capabilities: ["search"],
    }
  }

  return NextResponse.json({
    ok: true,
    modelsJson: { providers },
    message: `已导出 ${Object.keys(providers).length} 个供应商（pi-ai models.json 协议；含密钥，请妥善保管）`,
  })
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { providers?: Record<string, ImportedProvider> }
    const providers = body.providers ?? {}
    const applied: string[] = []
    const skipped: string[] = []

    // Agnes（含 dsh 扩展字段 accounts）
    const agnes = providers.agnes ?? providers["agnes-ai"]
    if (agnes) {
      const keys = (agnes.accounts?.length ? agnes.accounts : agnes.apiKey ? [agnes.apiKey] : []).filter(Boolean)
      if (keys.length > 0) {
        const baseUrl = agnes.baseUrl ?? ""
        const site = baseUrl.includes("apihub") ? "intl" : baseUrl.includes("agnes") ? "custom" : "cn"
        await saveSetting("agnes", {
          enabled: true,
          accounts: keys.slice(0, 20).map((k, i) => ({
            id: `acc-import-${Date.now()}-${i}`,
            label: `导入账号 ${i + 1}`,
            site,
            baseUrl,
            apiKey: k,
            enabled: true,
          })),
          ...(agnes.models?.find((m) => m.kind === "text")?.id ? { chatModel: String(agnes.models.find((m) => m.kind === "text")?.id).slice(0, 100) } : {}),
          ...(agnes.models?.find((m) => m.kind === "image")?.id ? { imageModel: String(agnes.models.find((m) => m.kind === "image")?.id).slice(0, 100) } : {}),
          ...(agnes.models?.find((m) => m.kind === "video")?.id ? { videoModel: String(agnes.models.find((m) => m.kind === "video")?.id).slice(0, 100) } : {}),
        })
        applied.push(`agnes（${keys.length} 账号，站点 ${site}）`)
      } else {
        skipped.push("agnes（无 accounts/apiKey）")
      }
    }

    // OpenAI 兼容自定义 LLM（custom-llm / deepseek / kimi / 任意 baseUrl+apiKey 的 provider）
    for (const [name, p] of Object.entries(providers)) {
      if (name === "agnes" || name === "agnes-ai" || name === "yuanbao-search") continue
      if (!p.baseUrl || !(p.apiKey || p.accounts?.length)) {
        skipped.push(`${name}（缺 baseUrl 或密钥）`)
        continue
      }
      const modelId = p.models?.[0]?.id ?? p.models?.[0]?.name ?? ""
      await saveSetting("llm", {
        mode: "custom",
        baseUrl: p.baseUrl.slice(0, 300),
        apiKey: (p.apiKey ?? p.accounts?.[0] ?? "").slice(0, 300),
        ...(modelId ? { model: String(modelId).slice(0, 200) } : {}),
      })
      applied.push(`${name} → 自定义 LLM（${p.baseUrl.slice(0, 40)}）`)
      break // 自定义 LLM 槽位只有一个，取第一个可用的
    }

    const fresh: AppSettings = await getSettings(true)
    return NextResponse.json({
      ok: true,
      applied,
      skipped,
      settings: redactSettings(fresh),
      message: applied.length > 0 ? `已导入：${applied.join("；")}` : "没有可导入的供应商（需要 agnes.accounts 或 provider.baseUrl+apiKey）",
    })
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 })
  }
}
