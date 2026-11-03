"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { Puzzle, Wrench, Cable, RefreshCw, Play, Plus, Trash2, Loader2, ServerCog, Activity, Power, Terminal, Download, Upload, Zap, Stethoscope } from "lucide-react"

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
interface McpInfo { id: string; name: string; transport: string; url: string; command: string; enabled: boolean; status: string; discoveredTools: string; lastError: string; source?: "db" | "file" }

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
  const [newServer, setNewServer] = useState({ name: "", url: "", command: "", transport: "http" as "http" | "stdio" })
  const [testing, setTesting] = useState<string | null>(null)
  // P1-4：已接入注册表的 MCP 工具（生态页显示接入数；测试台可调）
  const [registeredMcpTools, setRegisteredMcpTools] = useState<{ name: string; serverId: string }[]>([])
  const [syncing, setSyncing] = useState(false)
  const [importText, setImportText] = useState("")
  const [showImport, setShowImport] = useState(false)
  const [importing, setImporting] = useState(false)

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
    setRegisteredMcpTools(json.registeredMcpTools ?? [])
  }, [])

  useEffect(() => {
    void refreshProviders()
    void refreshTools()
    void refreshServers()
  }, [refreshProviders, refreshTools, refreshServers])

  const runTool = async () => {
    setRunning(true)
    setToolResult("")
    const t0 = Date.now()
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
    if (!newServer.name.trim()) {
      toast({ title: "请填写名称" })
      return
    }
    if (newServer.transport === "http" && !newServer.url.trim()) {
      toast({ title: "http 传输需要 URL" })
      return
    }
    if (newServer.transport === "stdio" && !newServer.command.trim()) {
      toast({ title: "stdio 传输需要 command" })
      return
    }
    const res = await fetch("/api/agent/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", ...newServer }) })
    const json = await res.json()
    if (!res.ok) {
      toast({ title: "添加失败", description: json.error, variant: "destructive" })
      return
    }
    setNewServer({ name: "", url: "", command: "", transport: newServer.transport })
    void refreshServers()
    toast({ title: "MCP server 已添加", description: newServer.transport === "stdio" ? "点「测试连接」做 stdio 握手验证" : "点「测试连接」验证握手与工具发现" })
  }

  const toggleServer = async (id: string) => {
    const res = await fetch("/api/agent/mcp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "toggle", id }) })
    const json = await res.json()
    if (!res.ok) toast({ title: "启停失败", description: json.error, variant: "destructive" })
    void refreshServers()
    void refreshTools() // 启停会同步注册表（停用即摘除工具）
  }

  // ---------- P1-4：mcpServers 导入 / 导出 / 同步注册表 ----------
  const doImport = async () => {
    setImporting(true)
    try {
      const res = await fetch("/api/agent/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", json: importText }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "导入完成", description: json.message })
      setImportText("")
      setShowImport(false)
      void refreshServers()
    } catch (e) {
      toast({ title: "导入失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setImporting(false)
    }
  }

  const doExport = async () => {
    try {
      const res = await fetch("/api/agent/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "export" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      try {
        await navigator.clipboard.writeText(json.json)
        toast({ title: "已导出并复制到剪贴板", description: "标准 mcpServers JSON——可直接粘贴进 Cursor（.cursor/mcp.json）或 Claude Desktop 配置" })
      } catch {
        toast({ title: "已导出（剪贴板不可用）", description: "JSON 已在文本框展示，可手动复制" })
      }
      setShowImport(true)
      setImportText(json.json)
    } catch (e) {
      toast({ title: "导出失败", description: (e as Error).message, variant: "destructive" })
    }
  }

  const doSyncTools = async () => {
    setSyncing(true)
    try {
      const res = await fetch("/api/agent/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sync-tools" }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: "注册表同步", description: json.message })
      void refreshServers()
      void refreshTools()
    } catch (e) {
      toast({ title: "同步失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setSyncing(false)
    }
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
        {/* 工具测试台（P1-6 重定位：原「工具注册表」——价值在调试与联调，不是产品能力本身） */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><Stethoscope className="h-4 w-4 text-amber-500" />工具测试台</span>
              <Badge variant="outline" className="text-[9px] px-1.5 shrink-0">诊断用途</Badge>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground break-words">改工具参数 schema 后立即冒烟 · 验证降级链真实行为 · MCP 外部工具联调（发现即接入，选中即测）</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-1.5 flex-wrap text-[10px] text-muted-foreground">
              <span>已注册 {tools.length} 个</span>
              <Badge variant="secondary" className="text-[9px] px-1 py-0">内置 {tools.filter((t) => t.builtin).length}</Badge>
              {registeredMcpTools.length > 0 && (
                <Badge className="bg-violet-600 text-[9px] px-1 py-0 text-white">MCP 接入 {registeredMcpTools.length}</Badge>
              )}
            </div>
            <div className="space-y-1">
              {tools.map((t) => (
                <button
                  key={t.name}
                  onClick={() => {
                    const sample: Record<string, string> = {}
                    for (const k of Object.keys(t.params)) sample[k] = k === "count" ? "5" : k === "score" ? "8" : k.includes("id") ? "" : k.includes("text") ? "你好，链路验证" : "示例输入"
                    setToolInput({ name: t.name, json: JSON.stringify(sample, null, 2) })
                  }}
                  className={`w-full text-left rounded-md border px-2.5 py-2 transition-colors ${toolInput.name === t.name ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30" : t.name.startsWith("mcp__") ? "border-violet-200 hover:border-violet-400" : "hover:border-amber-200"}`}
                >
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold font-mono truncate">{t.name}</span>
                    {t.builtin ? <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">内置</Badge> : <Badge className="bg-violet-600 text-[9px] px-1 py-0 shrink-0 text-white">MCP</Badge>}
                  </div>
                  <div className="text-[10px] text-muted-foreground line-clamp-1 mt-0.5">{t.description}</div>
                </button>
              ))}
            </div>
            <div className="rounded-md border p-2 space-y-2">
              <div className="text-[10px] text-muted-foreground">调用参数（JSON）——改参数后点执行即验证契约</div>
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

        {/* MCP 客户端（P0-4 入口统一 + P1-4 标准化） */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2"><Cable className="h-4 w-4 text-amber-500" />MCP 客户端接入</span>
              <span className="flex items-center gap-1.5 shrink-0">
                {registeredMcpTools.length > 0 && (
                  <Badge className="bg-violet-600 text-[9px] px-1.5 py-0 text-white" title={registeredMcpTools.map((t) => t.name).join("\n")}>
                    <Zap className="h-2.5 w-2.5 mr-0.5" />已接入 {registeredMcpTools.length} 工具
                  </Badge>
                )}
              </span>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground break-words">JSON-RPC 2.0 双传输 · 会话管理 · 工具发现即接入注册表（mcp__服务器__工具，Agent 可调）</p>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* P1-4：导入导出 + 同步 */}
            <div className="flex gap-1.5 flex-wrap">
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => setShowImport((v) => !v)}>
                <Upload className="h-3 w-3 mr-1" />导入 mcpServers JSON
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void doExport()}>
                <Download className="h-3 w-3 mr-1" />导出（Cursor 可用）
              </Button>
              <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => void doSyncTools()} disabled={syncing}>
                {syncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Zap className="h-3 w-3 mr-1" />}同步到注册表
              </Button>
            </div>
            {showImport && (
              <div className="rounded-md border border-violet-200 bg-violet-50/50 dark:bg-violet-950/20 p-2 space-y-1.5">
                <div className="text-[10px] text-muted-foreground">粘贴标准 mcpServers JSON（Cursor / Claude Desktop / VS Code 同构格式；有 url 判远程、有 command 判 stdio）</div>
                <textarea
                  className="w-full max-w-full h-24 text-[10px] font-mono rounded bg-muted/50 p-2 outline-none focus:ring-1 focus:ring-violet-400 resize-none break-all"
                  placeholder='{ "mcpServers": { "deepwiki": { "url": "https://mcp.deepwiki.com/mcp" }, "github": { "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github"] } } }'
                  value={importText}
                  onChange={(e) => setImportText(e.target.value)}
                />
                <div className="flex gap-1.5">
                  <Button size="sm" className="h-7 text-[10px] bg-violet-600 hover:bg-violet-700 text-white" onClick={() => void doImport()} disabled={importing || !importText.trim()}>
                    {importing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}导入
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[10px]" onClick={() => { setShowImport(false); setImportText("") }}>收起</Button>
                </div>
              </div>
            )}
            {/* 新增表单：双传输（P0-4）——http 填 URL / stdio 填命令行 */}
            <div className="flex gap-1.5 flex-wrap">
              {(["http", "stdio"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setNewServer((s) => ({ ...s, transport: t }))}
                  className={`rounded-md border px-2 py-1 text-[10px] transition-colors ${newServer.transport === t ? "border-amber-400 bg-amber-50 dark:bg-amber-950/30 font-semibold" : "hover:border-amber-200 text-muted-foreground"}`}
                >
                  {t === "http" ? "远程 HTTP（Streamable）" : "本地 stdio（子进程）"}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Input placeholder="名称，如：我的 MCP 服务" value={newServer.name} onChange={(e) => setNewServer((s) => ({ ...s, name: e.target.value }))} className="h-8 text-xs w-36 shrink-0" />
              {newServer.transport === "http" ? (
                <Input placeholder="https://…/mcp（JSON-RPC endpoint）" value={newServer.url} onChange={(e) => setNewServer((s) => ({ ...s, url: e.target.value }))} className="h-8 text-xs font-mono" />
              ) : (
                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                  <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <Input placeholder="完整命令行，如 npx -y @modelcontextprotocol/server-github" value={newServer.command} onChange={(e) => setNewServer((s) => ({ ...s, command: e.target.value }))} className="h-8 text-xs font-mono" />
                </div>
              )}
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
                  <motion.div key={s.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className={`rounded-md border px-2.5 py-2 space-y-1.5 ${s.enabled === false ? "opacity-60" : ""}`}>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <ServerCog className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-xs font-semibold truncate">{s.name}</span>
                        <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0">{s.transport}</Badge>
                        {s.source === "file" && <Badge variant="secondary" className="text-[9px] px-1 py-0 shrink-0">config 文件</Badge>}
                        {s.status !== "unknown" && <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_COLOR[s.status] ?? "bg-gray-400"}`} />}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {s.source !== "file" && (
                          <Button variant="ghost" size="icon" className={`h-6 w-6 ${s.enabled ? "text-emerald-600" : "text-muted-foreground"}`} onClick={() => void toggleServer(s.id)} title={s.enabled ? "停用（保留配置）" : "启用"}>
                            <Power className="h-3 w-3" />
                          </Button>
                        )}
                        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => testServer(s.id)} disabled={testing === s.id}>
                          {testing === s.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Cable className="h-3 w-3" />}
                          测试连接
                        </Button>
                        {s.source !== "file" && (
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => deleteServer(s.id)}><Trash2 className="h-3 w-3" /></Button>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-muted-foreground truncate font-mono">{s.url || s.command}</div>
                    {s.enabled === false && <div className="text-[10px] text-amber-600">已停用（测试与后续工具接入会跳过）</div>}
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
              <span>双传输统一入口（P0-4）：远程 HTTP（Streamable，含会话管理）与本地 stdio（子进程 JSON-RPC）均在此添加与测试；config/mcp.json 的条目自动并入清单（标「config 文件」）。P1 将把发现的工具以 mcp__服务器__工具 注册进工具注册表供 Agent 调用。</span>
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
              <code className="text-[10px] font-mono block bg-background border rounded px-2 py-1 break-all">dsh plugin --profile web add https://github.com/hongmaple0820/radarforge/releases/download/v0.2.0-dsh-plugin/dsh-plugin-radar.tgz</code>
              <p className="text-[10px] text-muted-foreground leading-snug">
                插件包在仓库 <span className="font-mono">plugins/dsh-radar/</span>（v0.2.0 规范对齐版：defineTool 参数 schema + Schemastery Config + name 导出 + engines.dsh + 协作取消）。
                平台地址用 dsh 设置层 <span className="font-mono">radarBase</span> 或环境变量 <span className="font-mono">RADAR_BASE</span> 配置；供应商密钥全部留在本平台设置中心，插件侧零密钥。
              </p>
              <p className="text-[10px] text-muted-foreground leading-snug">
                <span className="text-emerald-600">实测通过于 dsh 0.2.1-rc.5：</span>真实宿主全链路（pnpm 安装 → dump-config 插件树 → 挂载 → radar_article 实调六步流水线 249s 全绿 → 纯文本回传 → 协作取消契约）；回归证据 <span className="font-mono">scripts/test-dsh-plugin.mjs</span>（33 断言）。已知边界：LLM 驱动的模型自主调工具需宿主侧 DeepSeek 凭证（沙箱内未验，协议链路已全验）。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
