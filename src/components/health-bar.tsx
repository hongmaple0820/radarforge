"use client"

// ============================================================
// health-bar —— 全局健康中心（P2-2 首屏状态条）
// 四项一览：搜索密钥 / LLM 通道 / 视频依赖 / 信源健康。
// 任何一项异常可直接跳转对应设置卡（分区 + 锚点）或情报中心——
// 把「哪里坏了」的答案从报错文案挪到结构化入口上（q7 方案 7.2）。
// 只读聚合，不主动探活（探活是设置卡里的显式动作）；60s 自动刷新。
// ============================================================

import { useCallback, useEffect, useState } from "react"
import { Activity, RefreshCw } from "lucide-react"

interface HealthItem {
  id: string
  label: string
  status: "ok" | "warn" | "error"
  detail: string
  jump: { tab: "settings" | "intel"; partition?: string; card?: string }
}

interface HealthSummary {
  ok: boolean
  overall: "ok" | "warn" | "error"
  items: HealthItem[]
  checkedAt: string
}

const STATUS_DOT: Record<string, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
}

const STATUS_TEXT: Record<string, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-red-600 dark:text-red-400",
}

export function HealthBar({ onJump }: { onJump: (jump: HealthItem["jump"]) => void }) {
  const [summary, setSummary] = useState<HealthSummary | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/health/summary")
      const json = await res.json()
      if (json.ok) setSummary(json as HealthSummary)
    } catch {
      /* 健康条自身失败不打扰主流程 */
    } finally {
      setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void load()
    const t = setInterval(() => void load(), 60_000)
    return () => clearInterval(t)
  }, [load])

  if (!summary) return null

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border bg-card px-3 py-2">
      <span className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground shrink-0">
        <Activity className="h-3.5 w-3.5" />
        健康中心
      </span>
      {summary.items.map((item) => (
        <button
          key={item.id}
          onClick={() => onJump(item.jump)}
          className="group flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[11px] transition-colors hover:bg-muted"
          title={`${item.label}：${item.detail}（点击跳转）`}
        >
          <span className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[item.status]} ${item.status === "error" ? "animate-pulse" : ""}`} />
          <span className={`font-medium ${STATUS_TEXT[item.status]}`}>{item.label}</span>
          <span className="text-muted-foreground hidden md:inline max-w-[280px] truncate">{item.detail}</span>
        </button>
      ))}
      <button
        onClick={() => void load()}
        className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
        title="刷新健康状态"
        aria-label="刷新健康状态"
      >
        <RefreshCw className={`h-3 w-3 ${refreshing ? "animate-spin" : ""}`} />
      </button>
    </div>
  )
}
