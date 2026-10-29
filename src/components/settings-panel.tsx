"use client"

// ============================================================
// 设置中心 —— 供应商中枢（六卡）
// LLM：内置 / Agnes 免费池 / 自定义 OpenAI 兼容
// 搜索：元宝 SearchPro key
// 生图：内置 SDK / 自定义端点 / Agnes 免费生图
// Agnes 账号池：多账号管理（学 dsh-agnes-multimodal 配置页）
// 视频通道：本地双风格 / Agnes AI 模型 / 自动
// 风格定位：注入每篇文章的任务书与初稿
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { Settings2, Bot, Search, ImageIcon, Compass, Loader2, CheckCircle2, XCircle, KeyRound, Users, Video, Plus, Trash2, Zap, Download, Upload } from "lucide-react"

type AgnesSite = "cn" | "intl" | "custom"
interface AgnesAccountForm {
  id: string
  label: string
  site: AgnesSite
  baseUrl: string
  apiKey: string
  enabled: boolean
}

interface SettingsData {
  llm: { mode: "builtin" | "custom" | "agnes" | "pi-ai"; baseUrl: string; apiKey: string; model: string; piProvider: string }
  search: { apiKey: string }
  image: { mode: "builtin" | "custom"; baseUrl: string; apiKey: string; model: string }
  agnes: {
    enabled: boolean
    accounts: { id: string; label: string; site: AgnesSite; baseUrl: string; apiKey: string; enabled: boolean }[]
    chatModel: string
    imageModel: string
    videoModel: string
    strategy: "round-robin" | "least-loaded"
    rpmImage: number
    rpmVideo: number
  }
  video: { channel: "local" | "agnes" | "auto"; secondsPerScene: number }
  style: { positioning: string; audience: string; domains: string; tone: string; taboos: string }
  _meta: Record<string, { hasKey: boolean; envFallback: boolean }>
}

type TestResult = { ok: boolean; detail?: string; error?: string; latencyMs?: number; results?: { id: string; label: string; ok: boolean; latencyMs: number; detail: string }[] } | null

const AGNES_CHAT_MODELS = ["agnes-2.5-flash", "agnes-3.0-flash"]
const AGNES_IMAGE_MODELS = ["agnes-image-2.1-flash", "agnes-image-2.5-flash"]
const AGNES_VIDEO_MODELS = ["agnes-video-2.5-flash"]

export function SettingsPanel() {
  const { toast } = useToast()
  const [data, setData] = useState<SettingsData | null>(null)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState<string | null>(null)
  const [tests, setTests] = useState<Record<string, TestResult>>({})

  // 编辑态（apiKey 留空 = 不修改）
  const [llmForm, setLlmForm] = useState({ mode: "builtin" as "builtin" | "custom" | "agnes" | "pi-ai", baseUrl: "", apiKey: "", model: "", piProvider: "openai" })
  const [searchForm, setSearchForm] = useState({ apiKey: "" })
  const [imageForm, setImageForm] = useState({ mode: "builtin" as "builtin" | "custom", baseUrl: "", apiKey: "", model: "" })
  const [styleForm, setStyleForm] = useState({ positioning: "", audience: "", domains: "", tone: "", taboos: "" })
  // Agnes 表单（账号密钥留空 = 不修改已存）
  const [agnesForm, setAgnesForm] = useState<{
    enabled: boolean
    accounts: AgnesAccountForm[]
    chatModel: string
    imageModel: string
    videoModel: string
    strategy: "round-robin" | "least-loaded"
    rpmImage: number
    rpmVideo: number
  }>({ enabled: false, accounts: [], chatModel: "agnes-2.5-flash", imageModel: "agnes-image-2.1-flash", videoModel: "agnes-video-2.5-flash", strategy: "round-robin", rpmImage: 20, rpmVideo: 1 })
  const [agnesKeyDrafts, setAgnesKeyDrafts] = useState<Record<string, string>>({})
  const [videoForm, setVideoForm] = useState<{ channel: "local" | "agnes" | "auto"; secondsPerScene: number }>({ channel: "local", secondsPerScene: 8 })

  const load = useCallback(async () => {
    const json = await fetch("/api/settings").then((x) => x.json())
    const s = json.settings as SettingsData
    setData(s)
    setLlmForm({ mode: s.llm.mode, baseUrl: s.llm.baseUrl, apiKey: "", model: s.llm.model, piProvider: s.llm.piProvider || "openai" })
    setSearchForm({ apiKey: "" })
    setImageForm({ mode: s.image.mode, baseUrl: s.image.baseUrl, apiKey: "", model: s.image.model })
    setStyleForm({ ...s.style })
    setAgnesForm({
      enabled: s.agnes.enabled,
      accounts: s.agnes.accounts.map((a) => ({ ...a, apiKey: "" })),
      chatModel: s.agnes.chatModel,
      imageModel: s.agnes.imageModel,
      videoModel: s.agnes.videoModel,
      strategy: s.agnes.strategy,
      rpmImage: s.agnes.rpmImage,
      rpmVideo: s.agnes.rpmVideo,
    })
    setAgnesKeyDrafts({})
    setVideoForm({ ...s.video })
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void load(), 0)
    return () => clearTimeout(t)
  }, [load])

  const save = async (scope: "llm" | "search" | "image" | "style", clearKey = false) => {
    setSaving(scope)
    try {
      const value = scope === "llm" ? llmForm : scope === "search" ? searchForm : scope === "image" ? imageForm : styleForm
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, value, clearApiKey: clearKey }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: clearKey ? "密钥已清除" : "已保存", description: json.message })
      if (clearKey) {
        if (scope === "llm") setLlmForm((f) => ({ ...f, apiKey: "" }))
        if (scope === "search") setSearchForm({ apiKey: "" })
        if (scope === "image") setImageForm((f) => ({ ...f, apiKey: "" }))
      }
      await load()
    } catch (e) {
      toast({ title: clearKey ? "清除失败" : "保存失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  // ---------- Agnes 保存 ----------
  const saveAgnes = async (patch?: Record<string, unknown>) => {
    setSaving("agnes")
    try {
      const accounts = agnesForm.accounts.map((a) => ({
        ...a,
        // 表单密钥列留空 → 传空（后端按 id 对齐保留已存密钥）；草稿优先
        apiKey: agnesKeyDrafts[a.id] ?? a.apiKey ?? "",
      }))
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "agnes", value: { ...agnesForm, accounts, ...patch } }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "Agnes 配置已保存", description: json.message })
      await load()
    } catch (e) {
      toast({ title: "保存失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  const saveVideo = async () => {
    setSaving("video")
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "video", value: videoForm }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "视频通道已保存", description: json.message })
      await load()
    } catch (e) {
      toast({ title: "保存失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setSaving(null)
    }
  }

  // ---------- models.json 协议互通（导出当前配置 / 导入 pi-ai、dsh 生态配置） ----------
  const exportModelsJson = async () => {
    setTesting("models-export")
    try {
      const res = await fetch("/api/settings/models-json")
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? "导出失败")
      const blob = new Blob([JSON.stringify(json.modelsJson, null, 2)], { type: "application/json" })
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = "models.json"
      a.click()
      URL.revokeObjectURL(url)
      toast({ title: "models.json 已导出", description: json.message })
    } catch (e) {
      toast({ title: "导出失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setTesting(null)
    }
  }

  const importModelsJson = async (file: File) => {
    setTesting("models-import")
    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as { providers?: Record<string, unknown> }
      const providers = parsed.providers ?? parsed
      const res = await fetch("/api/settings/models-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providers }),
      })
      const json = await res.json()
      if (!res.ok || !json.ok) throw new Error(json.error ?? "导入失败")
      toast({ title: "models.json 已导入", description: json.message })
      await load()
    } catch (e) {
      toast({ title: "导入失败", description: `${(e as Error).message.slice(0, 90)}（合法格式：{ providers: { agnes: { accounts: [...] } } }）`, variant: "destructive" })
    } finally {
      setTesting(null)
    }
  }

  const test = async (scope: "llm" | "search" | "image" | "agnes" | "video", accountId?: string) => {
    const key = accountId ? `agnes:${accountId}` : scope
    setTesting(key)
    setTests((t) => ({ ...t, [key]: null }))
    try {
      const res = await fetch("/api/settings/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope, accountId }),
      })
      // 防御：路由缺失/网关返回 HTML 时给出可读错误，而非「Unexpected token '<'」
      if (!res.ok && res.status !== 200) throw new Error(`HTTP ${res.status}（${res.headers.get("content-type")?.includes("html") ? "返回了 HTML 页面" : "接口异常"}）`)
      const json = await res.json().catch(() => {
        throw new Error(`非 JSON 响应（HTTP ${res.status}），请检查服务状态`)
      })
      setTests((t) => ({ ...t, [key]: json }))
      const nameMap: Record<string, string> = { llm: "LLM", search: "AI 搜索", image: "生图", agnes: "Agnes 账号", video: "视频模型" }
      if (json.ok) toast({ title: `${nameMap[scope] ?? scope} 连通正常`, description: json.detail?.slice(0, 60) })
      else toast({ title: "连通失败", description: json.error ?? json.detail ?? "未知错误", variant: "destructive" })
    } catch (e) {
      setTests((t) => ({ ...t, [key]: { ok: false, error: (e as Error).message } }))
    } finally {
      setTesting(null)
    }
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center py-24 text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin mr-2" />
        <span className="text-sm">加载配置…</span>
      </div>
    )
  }

  const TestBadge = ({ scope }: { scope: "llm" | "search" | "image" | "agnes" | "video" }) => {
    const r = tests[scope]
    if (testing === scope) return <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500" />
    if (!r) return null
    return r.ok ? (
      <span className="flex items-center gap-1 text-[10px] text-emerald-600"><CheckCircle2 className="h-3 w-3" />{r.latencyMs ? `${(r.latencyMs / 1000).toFixed(1)}s ` : ""}{r.detail ? r.detail.slice(0, 30) : ""}</span>
    ) : (
      <span className="flex items-center gap-1 text-[10px] text-red-500"><XCircle className="h-3 w-3" />{r.error?.slice(0, 40) ?? "失败"}</span>
    )
  }

  const agnesAccountCount = data.agnes.accounts.filter((a) => a.enabled && a.apiKey).length
  const agnesEnabled = data.agnes.enabled && agnesAccountCount > 0

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* 总览 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Settings2 className="h-4 w-4 text-amber-500" />设置中心 · 供应商中枢</CardTitle>
          <p className="text-[11px] text-muted-foreground">模型密钥与创作风格集中配置；保存即生效，不需要重启。密钥仅存本机数据库，页面回显已脱敏。</p>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
            <Badge variant={data.llm.mode === "agnes" && agnesEnabled ? "default" : data.llm.mode !== "builtin" && data._meta.llm.hasKey ? "default" : "secondary"} className={data.llm.mode !== "builtin" ? "bg-emerald-600" : ""}>
              <Bot className="h-3 w-3 mr-0.5" />LLM：{data.llm.mode === "agnes" ? "Agnes 免费池" : data.llm.mode === "pi-ai" ? `pi-ai · ${data.llm.piProvider || "openai"}` : data.llm.mode === "custom" ? `自定义 ${data.llm.model || "默认模型"}` : "内置引擎"}
            </Badge>
            <Badge variant={data._meta.search.hasKey ? "default" : "secondary"} className={data._meta.search.hasKey ? "bg-emerald-600" : ""}>
              <Search className="h-3 w-3 mr-0.5" />搜索：{data._meta.search.hasKey ? (data._meta.search.envFallback ? "环境变量密钥" : "已配置") : "未配置"}
            </Badge>
            <Badge variant={data.image.mode === "custom" ? "default" : "secondary"} className={data.image.mode === "custom" ? "bg-emerald-600" : ""}>
              <ImageIcon className="h-3 w-3 mr-0.5" />生图：{data.image.mode === "custom" ? "自定义端点" : "内置 SDK"}
            </Badge>
            <Badge variant={agnesEnabled ? "default" : "secondary"} className={agnesEnabled ? "bg-emerald-600" : ""}>
              <Users className="h-3 w-3 mr-0.5" />Agnes 池：{agnesEnabled ? `${agnesAccountCount} 号可用` : "未启用"}
            </Badge>
            <Badge variant={data.video.channel === "local" ? "secondary" : "default"} className={data.video.channel !== "local" ? "bg-emerald-600" : ""}>
              <Video className="h-3 w-3 mr-0.5" />视频：{data.video.channel === "local" ? "本地双风格" : data.video.channel === "agnes" ? "Agnes AI 模型" : "自动（优先 AI）"}
            </Badge>
            <Badge variant={(data.style.positioning || data.style.tone) ? "default" : "secondary"} className={(data.style.positioning || data.style.tone) ? "bg-amber-500" : ""}>
              <Compass className="h-3 w-3 mr-0.5" />风格定位：{(data.style.positioning || data.style.tone) ? "已配置" : "未配置"}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* LLM */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5"><Bot className="h-4 w-4 text-emerald-600" />AI 大模型</span>
            <TestBadge scope="llm" />
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">驱动任务书 / 初稿 / 审稿 / 改写 / 飞轮提炼的文本引擎</p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {(["builtin", "agnes", "pi-ai", "custom"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setLlmForm((f) => ({ ...f, mode: m }))}
                className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${llmForm.mode === m ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 font-semibold" : "hover:border-amber-200"}`}
              >
                {m === "builtin" ? "内置引擎" : m === "agnes" ? "Agnes 免费池" : m === "pi-ai" ? "pi-ai 统一引擎" : "自定义兼容"}
              </button>
            ))}
          </div>
          {llmForm.mode === "agnes" && (
            <p className="text-[10px] text-muted-foreground rounded bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 px-2 py-1.5">
              <Zap className="h-3 w-3 inline mr-1 text-emerald-600" />
              走下方「Agnes 账号池」多账号轮询（agnes-2.5/3.0-flash 免费）；失败自动回退内置引擎，不炸流水线。需先在账号池启用至少一个账号。
            </p>
          )}
          {llmForm.mode === "pi-ai" && (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">供应商（30+）</span>
                  <select
                    className="h-8 w-full text-xs border rounded-md bg-background px-2"
                    value={llmForm.piProvider}
                    onChange={(e) => setLlmForm((f) => ({ ...f, piProvider: e.target.value }))}
                  >
                    {["openai", "anthropic", "google", "deepseek", "groq", "mistral", "moonshotai", "minimax", "openrouter", "xai", "kimi-coding", "zai", "huggingface", "cerebras"].map((pv) => (
                      <option key={pv} value={pv}>{pv}</option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1">
                  <span className="text-[10px] text-muted-foreground">模型 id（如 gpt-4o / claude-3-5-sonnet）</span>
                  <Input className="h-8" placeholder="模型 id" value={llmForm.model} onChange={(e) => setLlmForm((f) => ({ ...f, model: e.target.value }))} />
                </label>
              </div>
              <Input placeholder={`API Key（${llmForm.piProvider} 的密钥；留空不修改）`} type="password" value={llmForm.apiKey} onChange={(e) => setLlmForm((f) => ({ ...f, apiKey: e.target.value }))} />
              <Input placeholder="Base URL 覆盖（可选，OpenAI 兼容自定义端点）" value={llmForm.baseUrl} onChange={(e) => setLlmForm((f) => ({ ...f, baseUrl: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">@mariozechner/pi-ai 统一多供应商 LLM API：模型目录自带端点与成本表；失败自动回退内置引擎，不炸流水线。</p>
            </div>
          )}
          {llmForm.mode === "custom" && (
            <div className="space-y-2">
              <Input placeholder="Base URL，如 https://api.deepseek.com/v1" value={llmForm.baseUrl} onChange={(e) => setLlmForm((f) => ({ ...f, baseUrl: e.target.value }))} />
              <Input placeholder={`API Key${data.llm.apiKey ? `（已存 ${data.llm.apiKey}，留空不修改）` : ""}`} type="password" value={llmForm.apiKey} onChange={(e) => setLlmForm((f) => ({ ...f, apiKey: e.target.value }))} />
              <Input placeholder="模型名，如 deepseek-chat / gpt-4o / qwen-max" value={llmForm.model} onChange={(e) => setLlmForm((f) => ({ ...f, model: e.target.value }))} />
              <p className="text-[10px] text-muted-foreground">兼容 DeepSeek、Moonshot、通义（DashScope 兼容模式）、OpenAI、本地 Ollama 等。自定义失败时自动回退内置引擎。</p>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => save("llm")} disabled={saving === "llm"} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving === "llm" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存
            </Button>
            <Button size="sm" variant="outline" onClick={() => test("llm")} disabled={testing === "llm"}>
              {testing === "llm" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}测试连通
            </Button>
            {data.llm.apiKey && (
              <Button size="sm" variant="ghost" onClick={() => save("llm", true)} disabled={saving === "llm"} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                <XCircle className="h-3.5 w-3.5 mr-1" />清除密钥
              </Button>
            )}
          </div>
          {/* models.json 协议互通（pi-ai / dsh 插件生态） */}
          <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-dashed pt-2.5">
            <span className="text-[10px] text-muted-foreground shrink-0">生态互通：</span>
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={exportModelsJson} disabled={testing === "models-export"}>
              {testing === "models-export" ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Download className="h-3 w-3 mr-1" />}导出 models.json
            </Button>
            <label className="inline-flex items-center gap-1 text-[11px] border rounded-md px-2 h-7 cursor-pointer hover:bg-muted/50 transition-colors">
              <Upload className="h-3 w-3" />导入 models.json
              <input
                type="file"
                accept=".json,application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0]
                  if (f) void importModelsJson(f)
                  e.target.value = ""
                }}
              />
            </label>
            <span className="text-[10px] text-muted-foreground">pi-ai 协议 · dsh 插件侧可复用同一套配置</span>
          </div>
        </CardContent>
      </Card>

      {/* 搜索 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5"><Search className="h-4 w-4 text-sky-600" />AI 搜索（元宝 SearchPro）</span>
            <TestBadge scope="search" />
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">驱动雷达早报 / claims 逐条取证 / 情报中心即时搜索的联网引擎</p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex items-center gap-2">
            <KeyRound className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <Input
              placeholder={`Bearer 密钥（sk-…）${data._meta.search.envFallback ? "当前走环境变量，填写后覆盖" : data.search.apiKey ? `（已存 ${data.search.apiKey}，留空不修改）` : ""}`}
              type="password"
              value={searchForm.apiKey}
              onChange={(e) => setSearchForm({ apiKey: e.target.value })}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">密钥解析优先级：此处保存的 &gt; 环境变量 WSA_API_KEY。更换后早报 / 取证 / 搜索立即走新 key。</p>
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => save("search")} disabled={saving === "search"} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving === "search" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存
            </Button>
            <Button size="sm" variant="outline" onClick={() => test("search")} disabled={testing === "search"}>
              {testing === "search" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}真实查询一条
            </Button>
            {data.search.apiKey && (
              <Button size="sm" variant="ghost" onClick={() => save("search", true)} disabled={saving === "search"} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                <XCircle className="h-3.5 w-3.5 mr-1" />清除（回退环境变量）
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 生图 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5"><ImageIcon className="h-4 w-4 text-violet-600" />生图模型</span>
            <TestBadge scope="image" />
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">驱动文章封面；失败自动降级为无封面出稿（Asset 留痕，不阻断）。Agnes 免费生图走账号池，无需在此配置。</p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="flex gap-1.5">
            {(["builtin", "custom"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setImageForm((f) => ({ ...f, mode: m }))}
                className={`flex-1 rounded-md border px-3 py-1.5 text-xs transition-colors ${imageForm.mode === m ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 font-semibold" : "hover:border-amber-200"}`}
              >
                {m === "builtin" ? "内置 SDK" : "自定义端点（OpenAI 兼容）"}
              </button>
            ))}
          </div>
          {imageForm.mode === "custom" && (
            <div className="space-y-2">
              <Input placeholder="Base URL，如 https://ark.cn-beijing.volces.com/api/v3" value={imageForm.baseUrl} onChange={(e) => setImageForm((f) => ({ ...f, baseUrl: e.target.value }))} />
              <Input placeholder={`API Key${data.image.apiKey ? `（已存 ${data.image.apiKey}，留空不修改）` : ""}`} type="password" value={imageForm.apiKey} onChange={(e) => setImageForm((f) => ({ ...f, apiKey: e.target.value }))} />
              <Input placeholder="模型名，如 doubao-seedream-3-0-t2i-250415" value={imageForm.model} onChange={(e) => setImageForm((f) => ({ ...f, model: e.target.value }))} />
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => save("image")} disabled={saving === "image"} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving === "image" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存
            </Button>
            <Button size="sm" variant="outline" onClick={() => test("image")} disabled={testing === "image"}>
              {testing === "image" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}检查配置
            </Button>
            {data.image.apiKey && (
              <Button size="sm" variant="ghost" onClick={() => save("image", true)} disabled={saving === "image"} className="text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">
                <XCircle className="h-3.5 w-3.5 mr-1" />清除密钥
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Agnes 账号池 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5"><Users className="h-4 w-4 text-emerald-600" />Agnes 账号池（免费多模态）</span>
            <TestBadge scope="agnes" />
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            一个池驱动三通道：文本（agnes-flash）· 生图（agnes-image）· 视频（agnes-video 720P）。免费档每账号限额紧——多账号 = 真扩容（图片轮询 / 视频 1 条每分钟每账号），429 自动熔断换号。
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* 状态卡 */}
          <div className="rounded-lg border bg-muted/30 px-3 py-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div>
              <div className={`text-sm font-bold ${agnesAccountCount > 0 ? "text-emerald-600" : "text-muted-foreground"}`}>{agnesAccountCount}</div>
              <div className="text-[9px] text-muted-foreground">可用账号</div>
            </div>
            <div>
              <div className="text-sm font-bold">{agnesAccountCount * data.agnes.rpmImage}</div>
              <div className="text-[9px] text-muted-foreground">图片并发上限/分</div>
            </div>
            <div>
              <div className="text-sm font-bold">{agnesAccountCount * data.agnes.rpmVideo}</div>
              <div className="text-[9px] text-muted-foreground">视频速率/分</div>
            </div>
            <div>
              <div className={`text-sm font-bold ${data.agnes.enabled ? "text-emerald-600" : "text-muted-foreground"}`}>{data.agnes.enabled ? "已启用" : "未启用"}</div>
              <div className="text-[9px] text-muted-foreground">池状态</div>
            </div>
          </div>

          {/* 启用开关 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => void saveAgnes({ enabled: !data.agnes.enabled })}
              disabled={saving === "agnes"}
              className={`text-xs border rounded-full px-3 py-1 transition-colors ${data.agnes.enabled ? "border-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 font-semibold" : "hover:border-emerald-300"}`}
            >
              {data.agnes.enabled ? "✓ 已启用（点击停用）" : "启用 Agnes 池"}
            </button>
            <span className="text-[10px] text-muted-foreground">启用后 LLM/生图/视频均可选择 Agnes 通道</span>
          </div>

          {/* 账号行 */}
          <div className="space-y-2">
            {agnesForm.accounts.map((a, i) => {
              const stored = data.agnes.accounts.find((x) => x.id === a.id)
              const keyTest = tests[`agnes:${a.id}`]
              return (
                <div key={a.id} className="rounded-lg border p-2.5 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Input
                      className="h-7 text-xs flex-1 min-w-[100px]"
                      placeholder={`账号 ${i + 1} 备注`}
                      value={a.label}
                      onChange={(e) => setAgnesForm((f) => ({ ...f, accounts: f.accounts.map((x) => (x.id === a.id ? { ...x, label: e.target.value } : x)) }))}
                    />
                    <select
                      className="h-7 text-xs border rounded-md bg-background px-1.5"
                      value={a.site}
                      onChange={(e) => setAgnesForm((f) => ({ ...f, accounts: f.accounts.map((x) => (x.id === a.id ? { ...x, site: e.target.value as AgnesSite } : x)) }))}
                      aria-label="站点"
                    >
                      <option value="cn">国内站</option>
                      <option value="intl">国际站</option>
                      <option value="custom">自定义</option>
                    </select>
                    <button
                      onClick={() => setAgnesForm((f) => ({ ...f, accounts: f.accounts.map((x) => (x.id === a.id ? { ...x, enabled: !x.enabled } : x)) }))}
                      className={`text-[10px] border rounded-full px-2 py-0.5 ${a.enabled ? "border-emerald-400 text-emerald-600" : "text-muted-foreground"}`}
                    >
                      {a.enabled ? "启用" : "停用"}
                    </button>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setAgnesForm((f) => ({ ...f, accounts: f.accounts.filter((x) => x.id !== a.id) }))}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                  {a.site === "custom" && (
                    <Input
                      className="h-7 text-xs"
                      placeholder="自定义 Base URL，如 https://your-proxy.com/v1"
                      value={a.baseUrl}
                      onChange={(e) => setAgnesForm((f) => ({ ...f, accounts: f.accounts.map((x) => (x.id === a.id ? { ...x, baseUrl: e.target.value } : x)) }))}
                    />
                  )}
                  <div className="flex items-center gap-2">
                    <Input
                      className="h-7 text-xs flex-1"
                      type="password"
                      placeholder={`API Key${stored?.apiKey ? `（已存 ${stored.apiKey}，留空不修改）` : ""}`}
                      value={agnesKeyDrafts[a.id] ?? ""}
                      onChange={(e) => setAgnesKeyDrafts((d) => ({ ...d, [a.id]: e.target.value }))}
                    />
                    <Button size="sm" variant="outline" className="h-7 text-[10px] shrink-0" onClick={() => void test("agnes", a.id)} disabled={testing === `agnes:${a.id}`}>
                      {testing === `agnes:${a.id}` ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}测试
                    </Button>
                  </div>
                  {keyTest && (
                    <p className={`text-[10px] ${keyTest.ok ? "text-emerald-600" : "text-red-500"}`}>
                      {keyTest.ok ? "✓ " : "✗ "}{keyTest.results?.[0]?.detail ?? keyTest.error ?? ""}
                    </p>
                  )}
                </div>
              )
            })}
            {agnesForm.accounts.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-3 border rounded-lg border-dashed">还没有账号——添加第一个 Agnes 免费账号（注册即用，文本/图片/视频全免费）</p>
            )}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              onClick={() =>
                setAgnesForm((f) => ({
                  ...f,
                  accounts: [...f.accounts, { id: `acc-${Date.now()}`, label: `账号 ${f.accounts.length + 1}`, site: "cn", baseUrl: "", apiKey: "", enabled: true }],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5 mr-1" />添加账号
            </Button>
          </div>

          {/* 模型与策略 */}
          <div className="grid sm:grid-cols-3 gap-2">
            {([
              ["chatModel", "文本模型", AGNES_CHAT_MODELS],
              ["imageModel", "生图模型", AGNES_IMAGE_MODELS],
              ["videoModel", "视频模型", AGNES_VIDEO_MODELS],
            ] as const).map(([key, label, list]) => (
              <label key={key} className="space-y-1">
                <span className="text-[10px] text-muted-foreground">{label}</span>
                <select
                  className="h-8 w-full text-xs border rounded-md bg-background px-2"
                  value={agnesForm[key]}
                  onChange={(e) => setAgnesForm((f) => ({ ...f, [key]: e.target.value }))}
                >
                  {list.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-muted-foreground">取号策略：</span>
            {(["round-robin", "least-loaded"] as const).map((st) => (
              <button
                key={st}
                onClick={() => setAgnesForm((f) => ({ ...f, strategy: st }))}
                className={`text-[10px] border rounded-full px-2 py-0.5 ${agnesForm.strategy === st ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 text-amber-600 font-semibold" : "hover:border-amber-300"}`}
              >
                {st === "round-robin" ? "轮询" : "最少使用"}
              </button>
            ))}
            <span className="text-[10px] text-muted-foreground ml-2">RPM：图片 {agnesForm.rpmImage} / 视频 {agnesForm.rpmVideo}（每账号）</span>
          </div>

          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => void saveAgnes()} disabled={saving === "agnes"} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {saving === "agnes" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存账号池
            </Button>
            <Button size="sm" variant="outline" onClick={() => void test("agnes")} disabled={testing === "agnes"}>
              {testing === "agnes" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}全池探活
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 视频通道 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5"><Video className="h-4 w-4 text-rose-500" />视频通道</span>
            <TestBadge scope="video" />
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">
            三通道：本地双风格渲染（motion 商业片 / art 艺术动画，Playwright+ffmpeg 出片）/ Agnes AI 视频模型（720P · 4-12s）/ 自动（优先 AI，失败回退本地）
          </p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          <div className="grid grid-cols-3 gap-1.5">
            {(["local", "agnes", "auto"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setVideoForm((f) => ({ ...f, channel: c }))}
                className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${videoForm.channel === c ? "border-rose-400 bg-rose-50 dark:bg-rose-950/30 font-semibold" : "hover:border-rose-200"}`}
              >
                {c === "local" ? "本地双风格" : c === "agnes" ? "Agnes AI 模型" : "自动（优先 AI）"}
              </button>
            ))}
          </div>
          {(videoForm.channel === "agnes" || videoForm.channel === "auto") && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground shrink-0">每镜秒数（4-12s）</span>
                <input
                  type="range"
                  min={4}
                  max={12}
                  step={1}
                  value={videoForm.secondsPerScene}
                  onChange={(e) => setVideoForm((f) => ({ ...f, secondsPerScene: Number(e.target.value) }))}
                  className="flex-1"
                />
                <span className="text-xs font-semibold w-6 text-right">{videoForm.secondsPerScene}s</span>
              </div>
              {!agnesEnabled && (
                <p className="text-[10px] text-amber-600 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 px-2 py-1.5">
                  Agnes 池未启用——auto 模式会自动回退本地渲染；要用 AI 模型请先在上方账号池启用账号
                </p>
              )}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={() => void saveVideo()} disabled={saving === "video"} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving === "video" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存
            </Button>
            <Button size="sm" variant="outline" onClick={() => void test("video")} disabled={testing === "video"}>
              {testing === "video" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}检查视频模型
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 风格定位 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-1.5 text-sm"><Compass className="h-4 w-4 text-amber-500" />创作方向 · 风格定位</CardTitle>
          <p className="text-[11px] text-muted-foreground">填写后注入每一篇文章的任务书与初稿（与七人格叠加生效），也用于 AI 刷新灵感的选题方向</p>
        </CardHeader>
        <CardContent className="space-y-2.5">
          {([
            ["positioning", "账号定位（一句话：你为谁写什么，如「写给一线程序员的 AI 落地观察」）"],
            ["audience", "目标读者（画像与处境，如「3~8 年经验、正在评估 AI 工具落地的工程师」）"],
            ["domains", "内容领域与边界（写什么、明确不写什么）"],
            ["tone", "语气与文风（如「冷静克制、结论前置、拒绝空话」）"],
            ["taboos", "禁忌清单（绝不出现的内容/表达，如「不卖课、不用感叹号、不编个人经历」）"],
          ] as const).map(([key, ph]) => (
            <div key={key} className="flex gap-2">
              <Input placeholder={ph} value={styleForm[key]} onChange={(e) => setStyleForm((f) => ({ ...f, [key]: e.target.value }))} />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <Button size="sm" onClick={() => save("style")} disabled={saving === "style"} className="bg-amber-500 hover:bg-amber-600 text-white">
              {saving === "style" ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}保存并注入流水线
            </Button>
            {(data.style.positioning || data.style.tone) && <Badge variant="outline" className="text-[10px] border-amber-400 text-amber-600">当前 Run 已生效</Badge>}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
