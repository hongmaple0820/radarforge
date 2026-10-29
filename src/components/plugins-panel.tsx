"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { Puzzle, Wrench, Cable, RefreshCw, Play, Plus, Trash2, Loader2, ServerCog, Activity } from "lucide-react"

interface ProviderInfo {
  kind: string
  name: string
  label: string
  notes: string
  builtin: boolean
  configured: boolean
  status: string
  lastLatency: number
  lastError: string
  calls: number
  fails: number
  lastCheckedAt: string | null
}
interface ToolInfo { name: string; description: string; builtin: boolean; params: Record<string, string> }
interface McpInfo { id: string; name: string; transport: string; url: string; command: string; enabled: boolean; status: string; discoveredTools: string; lastError: string }

const STATUS_COLOR: Record<string, string> = {
  healthy: "bg-emerald-600",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  unknown: "bg-gray-400",
  connected: "bg-emerald-600",
  error: "bg-red-500",
}

export function PluginsPanel() {
  const { toast } = useToast()
  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [checking, setChecking] = useState(false)
  const [tools, setTools] = useState<ToolInfo[]>([])
  const [toolInput, setToolInput] = useState<{ name: string; json: string }>({ name: "web_search", json: '{\n  "query": "AI Agent 最新进展",\n  "count": 5\n}' })
  const [toolResult, setToolResult] = useState<string>("")
  const [running, setRunning] = useState(false)
  const [servers, setServers] = useState<McpInfo[]>([])
  const [newServer, setNewServer] = useState({ name: "", url: "", transport: "http" })
  const [testing, setTesting] = useState<string | null>(null)

  const refreshProviders = useCallback(async () => {
    setChecking(true)
    try {
      const json = await fetch("/api/gateway/providers").then((x) => x.json())
      setProviders(json.providers ?? [])
    } finally {
      setChecking(false)
    }
  }, [])

  const refreshTools = useCallback(async () => {
    const json = await fetch("/api/agent/tools").then((x) => x.json())
    setTools(json.tools ?? [])
  }, [])

  const refreshServers = useCallback(async () => {
    const json = await fetch("/api/agent/mcp").then((x) => x.json())
    setServers(json.servers ?? [])
  }, [])

  useEffect(() => {
    void refreshProviders()
    void refreshTools()
    void refreshServers()
  }, [refreshProviders, refreshTools, refreshServers])

  const runTool = async () => {
    setRunning(true)
    setToolResult("")
    try {
      const input = JSON.parse(toolInput.json || "{}")
      const res = await fetch("/api/agent/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: toolInput.name, input }) })
      const json = await res.json()
      setToolResult(JSON.stringify(json.result ?? json, null, 2).slice(0, 4000))
      if (!res.ok) toast({ title: "工具执行失败", description: json.error, variant: "destructive" })
    } catch (e) {
      setToolResult(`解析失败: ${(e as Error).message}`)
    } finally {
      setRunning(false)
    }
  }

  const addServer = async () => {
    if (!newServer.name.trim() || !newServer.url.trim()) {
      toast({ title: "请填写名称和 URL" })
      return
    }
    await fetch("/api/agent/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", ...newServer }) })
    setNewServer({ name: "", url: "", transport: "http" })
    void refreshServers()
    toast({ title: "MCP server 已添加" })
  }

  const testServer = async (id: string) => {
    setTesting(id)
    try {
      const res = await fetch("/api/agent/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", id }) })
      const json = await res.json()
      void refreshServers()
      const r = json.result
      if (r?.ok) {
        toast({ title: `✓ ${r.serverName} 握手成功`, description: `${r.detail} · 发现 ${r.tools.length} 个工具 · ${r.latencyMs}ms` })
      } else {
        toast({ title: `✗ ${r.serverName} 连接失败`, description: r.error, variant: "destructive" })
      }
    } finally {
      setTesting(null)
    }
  }

  const deleteServer = async (id: string) => {
    await fetch("/api/agent/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "delete", id }) })
    void refreshServers()
  }

  return (
    <div className="space-y-4">
      {/* Provider 注册表 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2"><Puzzle className="h-4 w-4 text-amber-500" />模型网关 · Provider 插件注册表</span>
            <Button variant="outline" size="sm" onClick={() => void refreshProviders()} disabled={checking}>
              {checking ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Activity className="h-3.5 w-3.5 mr-1" />}
              巡检探活
            </Button>
          </CardTitle>
          <p className="text-[11px] text-muted-foreground">四类能力插槽（LLM / SEARCH / IMAGE / VIDEO）· registry.register() 运行时可插拔 · 调用统计与降级链自动落库</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {providers.map((p) => (
              <motion.div key={p.name} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{p.kind}</Badge>
                    <span className="text-sm font-semibold truncate">{p.label}</span>
                  </div>
                  <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_COLOR[p.status] ?? "bg-gray-400"} ${p.status === "healthy" ? "animate-pulse" : ""}`} />
                </div>
                <p className="text-[11px] text-muted-foreground line-clamp-2">{p.notes}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                  <span className="flex items-center gap-0.5"><Activity className="h-2.5 w-2.5" />{p.calls} 调用</span>
                  {p.fails > 0 && <span className="text-red-500">{p.fails} 失败</span>}
                  {p.lastLatency > 0 && <span>{p.lastLatency}ms</span>}
                  <Badge variant={p.configured ? "secondary" : "outline"} className="text-[9px] px-1 py-0">{p.configured ? "已配置" : "未配置"}</Badge>
                  {!p.builtin && <Badge className="bg-violet-600 text-[9px] px-1 py-0">插件</Badge>}
                </div>
                {p.lastError && <div className="text-[10px] text-red-500 truncate" title={p.lastError}>{p.lastError}</div>}
              </motion.div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 min-w-0">
        {/* 工具注册表 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Wrench className="h-4 w-4 text-amber-500" />工具注册表</CardTitle>
            <p className="text-[11px] text-muted-foreground break-words">Agent 可调用工具 · toolRegistry.register() 开放注册 · 未识别工具明确报错</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              {tools.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    const sample: Record<string, string> = {}
                    for (const k of Object.keys(t.params)) sample[k] = k === "count" ? "5" : k === "score" ? "8" : k.includes("id") ? "" : "示例输入"
                    setToolInput({ name: t.name, json: JSON.stringify(sample, null, 2) })
                  }}
                  className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${toolInput.name === t.name ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : "hover:border-amber-200"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold font-mono">{t.name}</span>
                    {t.builtin && <Badge variant="secondary" className="text-[9px] px-1 py-0">内置</Badge>}
                  </div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
            <div className="rounded-md border p-2 space-y-2">
              <div className="text-[10px] text-muted-foreground">调用参数（JSON）</div>
              <textarea
                className="w-full max-w-full h-28 text-[11px] font-mono rounded bg-muted/50 p-2 outline-none focus:ring-1 focus:ring-amber-400 resize-none break-all"
                value={toolInput.json}
                onChange={(e) => setToolInput({ ...toolInput, json: e.target.value })}
              />
              <Button size="sm" onClick={runTool} disabled={running} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : <Play className="h-3.5 w-3.5 mr-1" />}
                执行 {toolInput.name}
              </Button>
              {toolResult && (
                <ScrollArea className="h-40 rounded bg-muted/50 p-2">
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-all">{toolResult}</pre>
                </ScrollArea>
              )}
            </div>
          </CardContent>
        </Card>

        {/* MCP 客户端 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base"><Cable className="h-4 w-4 text-amber-500" />MCP 客户端接入</CardTitle>
            <p className="text-[11px] text-muted-foreground break-words">JSON-RPC 2.0 · initialize → tools/list 握手 · 工具自动发现</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input placeholder="名称，如：我的 MCP 服务" value={newServer.name} onChange={(e) => setNewServer({ ...newServer, name: e.target.value })} className="h-8 text-xs" />
              <Input placeholder="https://…/mcp" value={newServer.url} onChange={(e) => setNewServer({ ...newServer, url: e.target.value })} className="h-8 text-xs" />
              <Button size="sm" onClick={addServer} className="bg-amber-500 hover:bg-amber-600 text-white shrink-0"><Plus className="h-3.5 w-3.5" /></Button>
            </div>
            <div className="space-y-1.5">
              {servers.map((s) => {
                let tools: { name: string }[] = []
                try {
                  tools = JSON.parse(s.discoveredTools)
                } catch {
                  tools = []
                }
                return (
                  <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="rounded-md border px-2.5 py-2 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ServerCog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold truncate">{s.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{s.transport}</Badge>
                        {s.status !== "unknown" && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[s.status] ?? "bg-gray-400"}`} />}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => testServer(s.id)} disabled={testing === s.id}>
                          {testing === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Cable className="h-3 w-3" />}
                          测试连接
                        </Button>
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteServer(s.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono">{s.url || s.command}</div>
                    {s.lastError && <div className="text-[10px] text-red-500 line-clamp-2">{s.lastError}</div>}
                    {tools.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {tools.slice(0, 8).map((t) => (
                          <Badge key={t.name} variant="secondary" className="text-[9px] px-1 py-0 font-mono">{t.name}</Badge>
                        ))}
                        {tools.length > 8 && <span className="text-[9px] text-muted-foreground self-center">+{tools.length - 8}</span>}
                      </div>
                    )}
                  </motion.div>
                )
              })}
            </div>
            <div className="text-[10px] text-muted-foreground rounded bg-muted/40 px-2 py-1.5 flex items-start gap-1.5">
              <RefreshCw className="h-3 w-3 mt-0.5 shrink-0" />
              <span>添加任意 MCP server（如 mcp.z.ai/mcp、本地工具服务等）即可将外部工具纳入同一注册表体系。stdio 传输需本地运行时。</span>
            </div>
          </CardContent>
        </Card>

        {/* dsh 插件形态（Phase 6：一套供应商配置，两种运行形态 —— Web 主 / dsh 辅） */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-1.5"><Puzzle className="h-3.5 w-3.5 text-violet-500" />dsh 插件形态 · 对话式出稿</CardTitle>
            <p className="text-[11px] text-muted-foreground break-words">把平台能力装进 DeepSeek Harness 对话框：说「写一篇公众号文章」即跑六步流水线（学 dsh-agnes-multimodal 插件协议）</p>
          </CardHeader>
          <CardContent className="pt-0 space-y-2.5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div className="rounded-lg border p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className="bg-violet-500 text-[9px] px-1.5 text-white">模型工具</Badge>
                  <span className="text-xs font-bold font-mono">radar_article</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">一句话出公众号成稿：brief → claims 联网取证 → 人格初稿 → 五维审稿 → 封面 → 18 主题排版；返回 Markdown 全文 + 平台链接，可携带文风校准档案</p>
              </div>
              <div className="rounded-lg border p-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge className="bg-violet-500 text-[9px] px-1.5 text-white">模型工具</Badge>
                  <span className="text-xs font-bold font-mono">radar_video</span>
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">成稿 → 导演三方向 → 分镜 → 本地 MP4 成片；MP4 在会话卡片播放/下载，不回传模型（纯文本约定）</p>
              </div>
            </div>
            <div className="rounded-lg bg-muted/40 border px-2.5 py-2 space-y-1.5">
              <p className="text-[10px] font-semibold">安装（宿主装有 dsh 时）：</p>
              <code className="text-[10px] font-mono block bg-background border rounded px-2 py-1 break-all">dsh plugin --profile web add ./dsh-plugin-radar.tgz</code>
              <p className="text-[10px] text-muted-foreground leading-snug">
                插件包已产出：<span className="font-mono">download/dsh-plugin-radar/</span>（package.json + cordis.patch.yml + lib 双半 + README，形态学自 dsh-agnes-multimodal MIT）。
                平台地址用宿主环境变量 <span className="font-mono">RADAR_BASE</span> 配置；供应商密钥全部留在本平台设置中心，插件侧零密钥。
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                <span className="text-amber-600">已知边界（诚实）：</span>骨架代码完整且 API 契约已对平台端到端实测（工具注册 / 出稿 / 分镜 / 渲染全 200）；沙箱内无 dsh 宿主，宿主内联调待装有 dsh 的环境补做。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
