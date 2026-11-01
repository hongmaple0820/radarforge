// ============================================================
// automation.ts —— 自动化任务配置与执行（P2 新增）
// 设计约束（沙箱诚实边界）：应用进程不保证常驻，无法跑真·cron。
// 采用「配置 + 到期补跑」模型：
//   · 配置存 SettingKV（automation:config），日志存 automation:log
//   · POST /api/automation {action:"tick"} —— 打开页面/手动触发时
//     检查到期任务并补跑（错过的窗口只补一次，不追赶历史）
//   · POST /api/automation {action:"run", task} —— 立即执行（手动）
// 部署到常驻环境后，也可用外部 cron 打 tick 端点，行为一致。
// ============================================================

import { db } from "@/lib/db"

export type AutomationTaskId = "morningReport" | "rssRefresh" | "ideaRefresh"

export interface AutomationConfig {
  morningReport: {
    enabled: boolean
    time: string // "HH:mm" 每日触发
    direction: string // 方向（空 = AI 自主）
  }
  rssRefresh: {
    enabled: boolean
    intervalHours: number // 每 N 小时
  }
  ideaRefresh: {
    enabled: boolean
    time: string // "HH:mm" 每日触发
    direction: string // 方向（空 = 自主）
  }
}

export interface AutomationLogEntry {
  task: AutomationTaskId | "tick"
  at: string
  ok: boolean
  message: string
  trigger: "manual" | "auto"
}

export const AUTOMATION_CONFIG_KEY = "automation:config"
export const AUTOMATION_LOG_KEY = "automation:log"

export const DEFAULT_AUTOMATION: AutomationConfig = {
  morningReport: { enabled: false, time: "08:30", direction: "" },
  rssRefresh: { enabled: false, intervalHours: 6 },
  ideaRefresh: { enabled: false, time: "09:00", direction: "" },
}

// ---------- 读写 ----------

export async function getAutomationConfig(): Promise<AutomationConfig> {
  try {
    const row = await db.settingKV.findUnique({ where: { key: AUTOMATION_CONFIG_KEY } })
    if (!row) return { ...DEFAULT_AUTOMATION }
    const parsed = JSON.parse(row.value) as Partial<AutomationConfig>
    return {
      morningReport: { ...DEFAULT_AUTOMATION.morningReport, ...parsed.morningReport },
      rssRefresh: { ...DEFAULT_AUTOMATION.rssRefresh, ...parsed.rssRefresh },
      ideaRefresh: { ...DEFAULT_AUTOMATION.ideaRefresh, ...parsed.ideaRefresh },
    }
  } catch {
    return { ...DEFAULT_AUTOMATION }
  }
}

export async function saveAutomationConfig(patch: Partial<AutomationConfig>): Promise<AutomationConfig> {
  const current = await getAutomationConfig()
  const merged: AutomationConfig = {
    morningReport: { ...current.morningReport, ...patch.morningReport },
    rssRefresh: { ...current.rssRefresh, ...patch.rssRefresh },
    ideaRefresh: { ...current.ideaRefresh, ...patch.ideaRefresh },
  }
  // 轻校验：时间格式 / 间隔范围
  for (const key of ["morningReport", "ideaRefresh"] as const) {
    if (!/^\d{1,2}:\d{2}$/.test(merged[key].time)) merged[key].time = DEFAULT_AUTOMATION[key].time
    merged[key].direction = merged[key].direction.slice(0, 120)
  }
  merged.rssRefresh.intervalHours = Math.min(48, Math.max(1, Math.round(merged.rssRefresh.intervalHours) || 6))
  await db.settingKV.upsert({
    where: { key: AUTOMATION_CONFIG_KEY },
    update: { value: JSON.stringify(merged) },
    create: { value: JSON.stringify(merged), key: AUTOMATION_CONFIG_KEY },
  })
  return merged
}

export async function getAutomationLog(): Promise<AutomationLogEntry[]> {
  try {
    const row = await db.settingKV.findUnique({ where: { key: AUTOMATION_LOG_KEY } })
    const parsed = row ? (JSON.parse(row.value) as AutomationLogEntry[]) : []
    return Array.isArray(parsed) ? parsed.slice(0, 30) : []
  } catch {
    return []
  }
}

export async function appendAutomationLog(entry: AutomationLogEntry): Promise<void> {
  const log = await getAutomationLog()
  log.unshift(entry)
  await db.settingKV.upsert({
    where: { key: AUTOMATION_LOG_KEY },
    update: { value: JSON.stringify(log.slice(0, 30)) },
    create: { value: JSON.stringify(log.slice(0, 30)), key: AUTOMATION_LOG_KEY },
  })
}

// ---------- 到期判定 ----------

/** 每 internal state 记录上次成功执行时间（automation:last） */
async function getLastRuns(): Promise<Record<string, string>> {
  try {
    const row = await db.settingKV.findUnique({ where: { key: "automation:last" } })
    return row ? (JSON.parse(row.value) as Record<string, string>) : {}
  } catch {
    return {}
  }
}

async function markRan(task: AutomationTaskId): Promise<void> {
  const last = await getLastRuns()
  last[task] = new Date().toISOString()
  await db.settingKV.upsert({
    where: { key: "automation:last" },
    update: { value: JSON.stringify(last) },
    create: { value: JSON.stringify(last), key: "automation:last" },
  })
}

/** 每日 HH:mm 任务：今天该时刻已过且今天还没跑过 → 到期 */
function isDailyDue(time: string, lastAt: string | undefined, now = new Date()): boolean {
  const [h, m] = time.split(":").map(Number)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return false
  const due = new Date(now)
  due.setHours(h, m, 0, 0)
  if (now < due) return false // 今天的触发时刻还没到
  if (lastAt) {
    const last = new Date(lastAt)
    // 上次跑在今天的触发时刻之后（含）→ 今天已覆盖
    if (last >= due && last.toDateString() === now.toDateString()) return false
    // 上次跑在今天触发时刻之前（例如凌晨补跑昨天的）→ 今天还没跑
  }
  return true
}

/** 间隔任务：now - last ≥ interval → 到期 */
function isIntervalDue(intervalHours: number, lastAt: string | undefined, now = new Date()): boolean {
  if (!lastAt) return true
  return now.getTime() - new Date(lastAt).getTime() >= intervalHours * 3600_000
}

export function computeDue(cfg: AutomationConfig, last: Record<string, string>): Record<AutomationTaskId, boolean> {
  return {
    morningReport: cfg.morningReport.enabled && isDailyDue(cfg.morningReport.time, last.morningReport),
    rssRefresh: cfg.rssRefresh.enabled && isIntervalDue(cfg.rssRefresh.intervalHours, last.rssRefresh),
    ideaRefresh: cfg.ideaRefresh.enabled && isDailyDue(cfg.ideaRefresh.time, last.ideaRefresh),
  }
}

export async function getAutomationState() {
  const [config, log, last] = await Promise.all([getAutomationConfig(), getAutomationLog(), getLastRuns()])
  const due = computeDue(config, last)
  return { config, log, last, due }
}

// ---------- 任务执行（复用既有 API 逻辑，直接调库函数） ----------

export interface TaskResult {
  ok: boolean
  message: string
}

async function runMorningReport(direction: string): Promise<TaskResult> {
  // 复用 /api/morning-report 的核心链路（方向空 = AI 自主链）
  const { POST } = await import("@/app/api/morning-report/route")
  const body = direction.trim() ? JSON.stringify({ query: direction.trim() }) : JSON.stringify({})
  const res = await POST(new Request("http://local/api/morning-report", { method: "POST", body }))
  const json = (await res.json()) as { error?: string; report?: { title?: string }; autonomous?: boolean; query?: string; evidenceCount?: number }
  if (!res.ok) return { ok: false, message: `早报生成失败：${json.error ?? "未知错误"}` }
  return {
    ok: true,
    message: `早报《${(json.report?.title ?? "").slice(0, 50)}》${json.autonomous ? `（AI 自主，方向：${json.query ?? "-"}）` : ""} · 证据 ${json.evidenceCount ?? 0} 条`,
  }
}

async function runRssRefresh(): Promise<TaskResult> {
  const { refreshFeeds } = await import("@/lib/sources/rss")
  const results = await refreshFeeds({})
  const inserted = results.reduce((s, r) => s + r.inserted, 0)
  const errors = results.filter((r) => r.status === "error").length
  return { ok: true, message: `${results.length} 个源刷新：新增 ${inserted} 条${errors > 0 ? `（${errors} 个失败已留痕）` : ""}` }
}

async function runIdeaRefresh(direction: string): Promise<TaskResult> {
  const { POST } = await import("@/app/api/ideas/refresh/route")
  const res = await POST(new Request("http://local/api/ideas/refresh", { method: "POST", body: JSON.stringify(direction.trim() ? { direction: direction.trim() } : {}) }))
  const json = (await res.json()) as { error?: string; created?: number; message?: string }
  if (!res.ok) return { ok: false, message: `灵感刷新失败：${json.error ?? "未知错误"}` }
  return { ok: true, message: json.message ?? `新增 ${json.created ?? 0} 条选题` }
}

export async function runAutomationTask(task: AutomationTaskId, cfg: AutomationConfig): Promise<TaskResult> {
  let result: TaskResult
  try {
    if (task === "morningReport") result = await runMorningReport(cfg.morningReport.direction)
    else if (task === "rssRefresh") result = await runRssRefresh()
    else result = await runIdeaRefresh(cfg.ideaRefresh.direction)
  } catch (e) {
    result = { ok: false, message: `任务异常：${(e as Error).message.slice(0, 160)}` }
  }
  if (result.ok) await markRan(task)
  await appendAutomationLog({ task, at: new Date().toISOString(), ok: result.ok, message: result.message.slice(0, 200), trigger: "manual" })
  return result
}

/** tick：补跑所有到期任务（页面打开时 fire-and-forget 调用） */
export async function tickAutomation(): Promise<{ ran: AutomationTaskId[]; results: TaskResult[] }> {
  const { config, last, due } = await getAutomationState()
  const tasks = (Object.keys(due) as AutomationTaskId[]).filter((t) => due[t])
  const results: TaskResult[] = []
  for (const t of tasks) {
    let r: TaskResult
    try {
      if (t === "morningReport") r = await runMorningReport(config.morningReport.direction)
      else if (t === "rssRefresh") r = await runRssRefresh()
      else r = await runIdeaRefresh(config.ideaRefresh.direction)
    } catch (e) {
      r = { ok: false, message: `任务异常：${(e as Error).message.slice(0, 160)}` }
    }
    if (r.ok) await markRan(t)
    await appendAutomationLog({ task: t, at: new Date().toISOString(), ok: r.ok, message: r.message.slice(0, 200), trigger: "auto" })
    results.push(r)
  }
  return { ran: tasks, results }
}
