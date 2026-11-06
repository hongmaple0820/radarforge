// ============================================================
// video-diagnostics.ts —— 视频合成诊断环形缓冲（C6）
// 学 dsh-imagegen-video「三腿分相可定位」：submit/poll/download
// 等各腿分相记录耗时与错误，run 详情页显示每镜头来源与失败段
// 定位——终结「没提交 vs 没轮询到」的黑盒。
// 环形缓冲 100 条/run（内存态，重启即清，与池同生命周期）；
// 汇总（分腿 n/errors/avgMs）写入 Asset.meta.diagSummary 留痕。
// ============================================================

export type DiagLeg =
  | "plan" // 导演规划
  | "keyframe" // AI 首帧生成
  | "vlm" // 首帧质检
  | "tts" // 口播合成
  | "submit" // 模型任务提交
  | "poll" // 任务轮询
  | "download" // 成片下载
  | "ffmpeg" // 分段编码/混流
  | "concat" // 时间线拼接
  | "bgm" // BGM 混音

export interface DiagEntry {
  at: string
  leg: DiagLeg
  sceneId?: number
  ok: boolean
  ms: number
  error?: string
  detail?: string
}

export interface DiagLegStat {
  n: number
  errors: number
  avgMs: number
  lastError?: string
}

export interface DiagSummary {
  entries: number
  errors: number
  legs: Partial<Record<DiagLeg, DiagLegStat>>
}

const MAX_ENTRIES = 100
const buffers = new Map<string, DiagEntry[]>()

function bufferFor(runId: string): DiagEntry[] {
  let buf = buffers.get(runId)
  if (!buf) {
    buf = []
    buffers.set(runId, buf)
  }
  return buf
}

/** 记一条诊断（环形：超 100 丢最旧） */
export function diagRecord(
  runId: string,
  leg: DiagLeg,
  ok: boolean,
  ms: number,
  extra?: { sceneId?: number; error?: string; detail?: string },
): void {
  const buf = bufferFor(runId)
  buf.push({
    at: new Date().toISOString(),
    leg,
    ok,
    ms: Math.round(ms),
    ...(extra?.sceneId !== undefined ? { sceneId: extra.sceneId } : {}),
    ...(extra?.error ? { error: extra.error.slice(0, 120) } : {}),
    ...(extra?.detail ? { detail: extra.detail.slice(0, 120) } : {}),
  })
  if (buf.length > MAX_ENTRIES) buf.splice(0, buf.length - MAX_ENTRIES)
}

/** 包裹式记录：执行 fn 自动计时，异常记失败并原样抛出（不吞错） */
export async function diagRun<T>(
  runId: string,
  leg: DiagLeg,
  fn: () => Promise<T>,
  extra?: { sceneId?: number; detail?: string },
): Promise<T> {
  const t0 = Date.now()
  try {
    const out = await fn()
    diagRecord(runId, leg, true, Date.now() - t0, extra)
    return out
  } catch (e) {
    diagRecord(runId, leg, false, Date.now() - t0, { ...extra, error: (e as Error).message })
    throw e
  }
}

/** 分腿汇总（写入 progress meta；值全部来自缓冲事实） */
export function diagSummary(runId: string): DiagSummary {
  const buf = bufferFor(runId)
  const legs: Partial<Record<DiagLeg, DiagLegStat>> = {}
  let errors = 0
  for (const e of buf) {
    if (!e.ok) errors++
    const stat = (legs[e.leg] ??= { n: 0, errors: 0, avgMs: 0 })
    stat.n++
    if (!e.ok) {
      stat.errors++
      if (e.error) stat.lastError = e.error
    }
    stat.avgMs = Math.round((stat.avgMs * (stat.n - 1) + e.ms) / stat.n)
  }
  return { entries: buf.length, errors, legs }
}

/** 全量缓冲（诊断 API 透出用） */
export function diagDump(runId: string): DiagEntry[] {
  return [...bufferFor(runId)]
}

/** 主动清理（整片渲染完成后可清，防 run 累积；不清也只占内存 100 条） */
export function diagClear(runId: string): void {
  buffers.delete(runId)
}
