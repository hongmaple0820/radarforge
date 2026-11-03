import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSettings } from '@/lib/settings'
import { getBinaryReport } from '@/lib/media/binaries'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/health/summary —— 全局健康中心（P2-2 首屏状态条数据源）
 * 四项一览：搜索密钥 / LLM 通道 / 视频依赖 / 信源健康。
 * 只读聚合（不主动探活——探活是设置卡里的显式动作），异常项给人话
 * detail 与跳转目标（设置分区 + 卡片锚点），把「哪里坏了」的答案从
 * 报错文案挪到结构化入口上（q7 方案 7.2）。
 */

interface HealthItem {
  id: 'search' | 'llm' | 'video-deps' | 'feeds'
  label: string
  /** ok=正常 warn=降级可用/未配置 error=不可用 */
  status: 'ok' | 'warn' | 'error'
  detail: string
  /** 跳转目标：设置分区 + 卡片锚点（feeds 特例跳情报中心） */
  jump: { tab: 'settings' | 'intel'; partition?: 'models' | 'runtime' | 'content'; card?: string }
}

export async function GET() {
  try {
    const s = await getSettings()
    const items: HealthItem[] = []

    // ---- 搜索密钥 ----
    const searchKey = Boolean(s.search.apiKey || process.env.WSA_API_KEY)
    items.push({
      id: 'search',
      label: '搜索密钥',
      status: searchKey ? 'ok' : 'warn',
      detail: searchKey
        ? s.search.apiKey
          ? '已配置（真实检索）'
          : '走环境变量密钥（真实检索）'
        : '未配置——联网检索降级为演示数据',
      jump: { tab: 'settings', partition: 'models', card: 'search' },
    })

    // ---- LLM 通道 ----
    const agnesAccounts = s.agnes.accounts.filter((a) => a.enabled && a.apiKey).length
    const agnesOk = s.agnes.enabled && agnesAccounts > 0
    let llmStatus: 'ok' | 'warn' | 'error' = 'ok'
    let llmDetail = ''
    if (s.llm.mode === 'agnes') {
      llmStatus = agnesOk ? 'ok' : 'warn'
      llmDetail = agnesOk ? `Agnes 免费池（${agnesAccounts} 号可用）` : 'Agnes 池未启用账号——自动回退内置引擎'
    } else if (s.llm.mode === 'builtin') {
      llmStatus = 'ok'
      llmDetail = '内置引擎（免配置）'
    } else {
      // custom / pi-ai：看密钥
      llmStatus = s.llm.apiKey ? 'ok' : 'warn'
      llmDetail = s.llm.apiKey ? `自定义通道（${s.llm.model || '默认模型'}）` : '自定义通道未填密钥——回退内置引擎'
    }
    items.push({
      id: 'llm',
      label: 'LLM 通道',
      status: llmStatus,
      detail: llmDetail,
      jump: { tab: 'settings', partition: 'models', card: 'llm' },
    })

    // ---- 视频依赖（ffmpeg / ffprobe 解析链） ----
    const deps = await getBinaryReport()
    const depsOk = deps.every((i) => i.resolved && i.path)
    const ffmpegVersion = deps.find((i) => i.name === 'ffmpeg')?.version?.split(' ')[2] ?? ''
    items.push({
      id: 'video-deps',
      label: '视频依赖',
      status: depsOk ? 'ok' : 'error',
      detail: depsOk
        ? `ffmpeg${ffmpegVersion ? ' ' + ffmpegVersion : ''} / ffprobe 就绪（本地渲染可用）`
        : 'ffmpeg/ffprobe 未解析——本地渲染不可用，点开看修复指引',
      jump: { tab: 'settings', partition: 'runtime', card: 'deps' },
    })

    // ---- 信源健康（RSS 抓取留痕聚合） ----
    const feeds = await db.sourceFeed.findMany({ select: { active: true, lastStatus: true } })
    const active = feeds.filter((f) => f.active)
    const okCount = active.filter((f) => f.lastStatus === 'ok').length
    const partialCount = active.filter((f) => f.lastStatus === 'partial').length
    const errorCount = active.filter((f) => f.lastStatus === 'error').length
    const pendingCount = active.filter((f) => f.lastStatus === 'pending').length
    let feedStatus: 'ok' | 'warn' | 'error' = 'ok'
    let feedDetail = ''
    if (active.length === 0) {
      feedStatus = 'warn'
      feedDetail = '没有启用的信源'
    } else if (errorCount === active.length) {
      feedStatus = 'error'
      feedDetail = `${active.length} 个源全部抓取失败（查代理或源地址）`
    } else if (errorCount > 0) {
      feedStatus = 'warn'
      feedDetail = `${okCount + partialCount} 正常 / ${errorCount} 失败（失败源留痕在信源卡）`
    } else if (okCount + partialCount === 0) {
      feedStatus = 'ok'
      feedDetail = `${active.length} 个源待首次抓取`
    } else {
      feedStatus = 'ok'
      feedDetail = `${okCount + partialCount} 源正常${pendingCount > 0 ? ` / ${pendingCount} 待抓取` : ''}`
    }
    items.push({
      id: 'feeds',
      label: '信源健康',
      status: feedStatus,
      detail: feedDetail,
      jump: { tab: 'intel' },
    })

    const worst = items.some((i) => i.status === 'error')
      ? 'error'
      : items.some((i) => i.status === 'warn')
        ? 'warn'
        : 'ok'
    return NextResponse.json({ ok: true, overall: worst, items, checkedAt: new Date().toISOString() })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '健康汇总失败' }, { status: 500 })
  }
}
