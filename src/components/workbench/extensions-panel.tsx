'use client'

/**
 * 扩展体系面板——学 dsh 的三层可扩展能力落地
 *
 * 1. 模型网关：Provider 注册表 + 并发探活（dsh 的协议族适配器 + GET /models 探活）
 * 2. Agent Skills：扫描 SKILL.md 声明式技能（Agent Skills 开放标准，本地已装 12 个）
 * 3. MCP：JSON-RPC/stdio 客户端，任意 MCP 服务器的工具可挂进平台（配置文件即插件）
 */

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useToast } from '@/hooks/use-toast'
import {
  Boxes,
  Puzzle,
  Cable,
  Activity,
  RefreshCw,
  CircleCheck,
  CircleX,
  Plug,
} from 'lucide-react'

// ---------- 类型 ----------

interface ProviderInfo {
  id: string
  kind: 'llm' | 'search' | 'image' | 'video'
  name: string
  description?: string
  origin: 'builtin' | 'plugin'
  configured: boolean
}

interface HealthReport {
  ok: boolean
  latencyMs: number
  detail?: string
  checkedAt: string
}

interface SkillCard {
  id: string
  name: string
  description: string
  source: 'user' | 'project'
  dir: string
  allowedTools: string[]
}

interface McpServerResult {
  name: string
  description: string
  command: string
  toolCount: number
  tools: { name: string; description: string }[]
  error: string | null
}

// ---------- 常量 ----------

const KIND_META: Record<string, { label: string; chip: string }> = {
  llm: { label: 'LLM', chip: 'border-teal-200 bg-teal-50 text-teal-700' },
  search: { label: '检索', chip: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  image: { label: '图像', chip: 'border-rose-200 bg-rose-50 text-rose-700' },
  video: { label: '视频', chip: 'border-amber-200 bg-amber-50 text-amber-700' },
}

// ---------- 面板 ----------

export function ExtensionsPanel() {
  const { toast } = useToast()

  const [providers, setProviders] = useState<ProviderInfo[]>([])
  const [health, setHealth] = useState<Record<string, HealthReport> | null>(null)
  const [gatewayLoading, setGatewayLoading] = useState(true)
  const [probing, setProbing] = useState(false)

  const [skills, setSkills] = useState<SkillCard[]>([])
  const [skillsLoading, setSkillsLoading] = useState(true)

  const [servers, setServers] = useState<McpServerResult[]>([])
  const [mcpLoading, setMcpLoading] = useState(true)

  const loadGateway = useCallback(async (probe = false) => {
    if (probe) setProbing(true)
    else setGatewayLoading(true)
    try {
      const res = await fetch(`/api/gateway${probe ? '?probe=1' : ''}`)
      const data = await res.json()
      if (data.ok) {
        setProviders(data.providers as ProviderInfo[])
        if (probe) {
          setHealth(data.health as Record<string, HealthReport>)
          toast({ title: '探活完成', description: '所有 Provider 健康报告已刷新' })
        }
      }
    } catch {
      /* ignore */
    } finally {
      setGatewayLoading(false)
      setProbing(false)
    }
  }, [toast])

  const loadSkills = useCallback(async () => {
    setSkillsLoading(true)
    try {
      const res = await fetch('/api/skills')
      const data = await res.json()
      if (data.ok) setSkills(data.skills as SkillCard[])
    } catch {
      /* ignore */
    } finally {
      setSkillsLoading(false)
    }
  }, [])

  const loadMcp = useCallback(async () => {
    setMcpLoading(true)
    try {
      const res = await fetch('/api/mcp')
      const data = await res.json()
      if (data.ok) setServers(data.servers as McpServerResult[])
    } catch {
      /* ignore */
    } finally {
      setMcpLoading(false)
    }
  }, [])

  useEffect(() => {
    loadGateway()
    loadSkills()
    loadMcp()
  }, [loadGateway, loadSkills, loadMcp])

  return (
    <div className="space-y-5">
      {/* 1. 模型网关 */}
      <Card className="border-slate-200 bg-white shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
                <Boxes className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">模型网关</h2>
                <p className="text-[11px] text-slate-500">
                  Provider 统一注册 · 四类能力 · 并发探活（学 dsh 协议族适配器）
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1 border-slate-300 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700"
              onClick={() => loadGateway(true)}
              disabled={probing}
            >
              <Activity className={`h-3 w-3 ${probing ? 'animate-pulse' : ''}`} />
              {probing ? '探活中…' : '并发探活'}
            </Button>
          </div>

          {gatewayLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : (
            <div className="space-y-2">
              {providers.map((p) => {
                const h = health?.[p.id]
                return (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                  >
                    <span
                      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${
                        KIND_META[p.kind]?.chip ?? 'border-slate-200 bg-slate-50 text-slate-600'
                      }`}
                    >
                      {KIND_META[p.kind]?.label ?? p.kind}
                    </span>
                    <span className="text-sm font-semibold text-slate-800">{p.name}</span>
                    <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-500">
                      {p.id}
                    </code>
                    <span className="ml-auto flex items-center gap-2">
                      {p.origin === 'plugin' && (
                        <Badge variant="outline" className="border-violet-200 bg-violet-50 text-[10px] text-violet-700">
                          插件
                        </Badge>
                      )}
                      {p.configured ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                          <CircleCheck className="h-3.5 w-3.5" />
                          已配置
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600">
                          <CircleX className="h-3.5 w-3.5" />
                          未配置
                        </span>
                      )}
                    </span>
                    {p.description && (
                      <p className="w-full text-xs leading-relaxed text-slate-500">{p.description}</p>
                    )}
                    {h && (
                      <p
                        className={`w-full rounded-md px-2 py-1 font-mono text-[11px] ${
                          h.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
                        }`}
                      >
                        {h.ok ? '● 健康' : '○ 异常'} · {h.latencyMs}ms · {h.detail}
                      </p>
                    )}
                  </div>
                )
              })}
              <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
                接口已预留 Image / Video 的「提交 + 轮询」协议族（对应 Agnes / Seedance 等），
                Phase 3 接入首批生成供应商。
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Agent Skills */}
      <Card className="border-slate-200 bg-white shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-white">
                <Puzzle className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Agent Skills</h2>
                <p className="text-[11px] text-slate-500">
                  SKILL.md 声明式技能 · 开放标准 · 用户级 + 项目级双目录
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {!skillsLoading && (
                <span className="text-[11px] text-slate-500">
                  共 {skills.length} 个 · 用户级 {skills.filter((s) => s.source === 'user').length}
                </span>
              )}
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-slate-400 hover:text-teal-700"
                onClick={loadSkills}
                aria-label="刷新技能"
              >
                <RefreshCw className={`h-3 w-3 ${skillsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
          </div>

          {skillsLoading ? (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : skills.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              未发现技能目录（~/.claude/skills 或 项目 /skills）
            </p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {skills.map((s) => (
                  <div
                    key={`${s.source}-${s.id}`}
                    className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 transition-colors hover:border-teal-200"
                  >
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold text-slate-800">{s.name}</span>
                      <span className="ml-auto inline-flex shrink-0 items-center rounded-full border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] text-slate-500">
                        {s.source === 'user' ? '用户级' : '项目级'}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-500">
                      {s.description || '（无描述）'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. MCP */}
      <Card className="border-slate-200 bg-white shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-white">
                <Cable className="h-4 w-4" />
              </span>
              <div>
                <h2 className="text-sm font-bold text-slate-900">MCP 服务器</h2>
                <p className="text-[11px] text-slate-500">
                  Model Context Protocol · JSON-RPC/stdio · config/mcp.json 即插即用
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 w-7 p-0 text-slate-400 hover:text-teal-700"
              onClick={loadMcp}
              aria-label="刷新 MCP"
            >
              <RefreshCw className={`h-3 w-3 ${mcpLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>

          {mcpLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : servers.length === 0 ? (
            <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
              尚未配置 MCP 服务器 —— 在 config/mcp.json 添加即可，无需改代码
            </p>
          ) : (
            <div className="space-y-2">
              {servers.map((s) => (
                <div
                  key={s.name}
                  className="rounded-lg border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Plug className="h-3.5 w-3.5 text-slate-500" />
                    <span className="text-sm font-semibold text-slate-800">{s.name}</span>
                    {s.error ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600">
                        <CircleX className="h-3.5 w-3.5" />
                        连接失败
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
                        <CircleCheck className="h-3.5 w-3.5" />
                        {s.toolCount} 个工具在线
                      </span>
                    )}
                    <code className="ml-auto hidden rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-500 sm:inline">
                      {s.command}
                    </code>
                  </div>
                  {s.description && (
                    <p className="mt-1 text-xs text-slate-500">{s.description}</p>
                  )}
                  {s.error ? (
                    <p className="mt-1 rounded-md bg-red-50 px-2 py-1 font-mono text-[11px] text-red-600">
                      {s.error}
                    </p>
                  ) : (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {s.tools.map((t) => (
                        <span
                          key={t.name}
                          title={t.description}
                          className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2 py-0.5 font-mono text-[11px] text-slate-600"
                        >
                          {t.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <p className="pt-1 text-[11px] leading-relaxed text-slate-400">
                新增 MCP 服务器 = 在 config/mcp.json 加一段配置；其工具即可被 Agent 调用。
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
