/**
 * 内建 ImageProvider：Z.ai 图像生成（z-ai-web-dev-sdk images.generations）
 *
 * Phase 2 的「生图渠道 Provider」落地点：封面 / 内文配图。
 * SDK 同步返回 base64，此处落盘到 public/runs/{runId}/ 并以 GenTaskInfo
 * （status=succeeded）形式返回——对网关而言等价于「提交 + 轮询一次完成」，
 * Phase 3 接入异步协议族（Agnes / Seedance）时接口零改动。
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import ZAI from 'z-ai-web-dev-sdk'
import type { GenTaskInfo, HealthReport, ImageProvider } from '../types'

type ZaiClient = Awaited<ReturnType<typeof ZAI.create>>
let cached: ZaiClient | null = null

async function getClient(): Promise<ZaiClient> {
  if (!cached) cached = await ZAI.create()
  return cached
}

export interface ImageSaveOptions {
  /** 落盘相对路径（相对 public/，如 runs/{runId}/cover.png） */
  relPath: string
  size?: '1024x1024' | '768x1344' | '864x1152' | '1344x768' | '1152x864' | '1440x720' | '720x1440'
}

export interface ImageGenResult extends GenTaskInfo {
  /** 可直接用于 <img src> 的 URL（/runs/...） */
  url?: string
  /** 生图耗时 ms */
  latencyMs: number
}

async function generateImage(
  prompt: string,
  opts?: ImageSaveOptions
): Promise<ImageGenResult> {
  const started = Date.now()
  const zai = await getClient()
  const res = await zai.images.generations.create({
    prompt,
    size: opts?.size ?? '1344x768',
  })
  const b64 = res.data?.[0]?.base64
  if (!b64) throw new Error('图像生成返回为空（可能被内容安全策略拦截）')

  if (!opts?.relPath) {
    // 不落盘：直接返回 data URL
    return {
      taskId: `img-${Date.now()}`,
      status: 'succeeded',
      output: [`data:image/png;base64,${b64}`],
      latencyMs: Date.now() - started,
    }
  }

  const abs = path.join(process.cwd(), 'public', opts.relPath)
  await mkdir(path.dirname(abs), { recursive: true })
  await writeFile(abs, Buffer.from(b64, 'base64'))
  const url = `/${opts.relPath.replace(/\\/g, '/')}`
  return {
    taskId: `img-${Date.now()}`,
    status: 'succeeded',
    output: [url],
    latencyMs: Date.now() - started,
  }
}

export const zaiImageProvider: ImageProvider = {
  info: {
    id: 'zai-image',
    kind: 'image',
    name: 'Z.ai 图像生成（内建）',
    description: '运行环境自带的图像生成能力，Phase 2 承担文章封面产出，同步返回 base64 后落盘',
    origin: 'builtin',
  },
  isConfigured: () => true,
  async healthCheck(): Promise<HealthReport> {
    const started = Date.now()
    const checkedAt = new Date().toISOString()
    // 零成本探活：只验证 SDK 可初始化（不真实生图，避免无谓消耗）
    try {
      await getClient()
      return {
        ok: true,
        latencyMs: Date.now() - started,
        detail: 'SDK 初始化正常（生图按次计费，探活不实际生成；实际出图受运行环境网络策略影响，以真实调用为准）',
        checkedAt,
      }
    } catch (e) {
      return { ok: false, latencyMs: Date.now() - started, detail: (e as Error)?.message || 'SDK 初始化失败', checkedAt }
    }
  },
  async generate(prompt: string, opts?: Record<string, unknown>): Promise<GenTaskInfo> {
    const o = opts as ImageSaveOptions | undefined
    return generateImage(prompt, o)
  },
}

/** 供 run-manager 直接调用的便捷封装（带落盘） */
export async function generateAndSave(
  prompt: string,
  relPath: string,
  size?: ImageSaveOptions['size']
): Promise<ImageGenResult> {
  return generateImage(prompt, { relPath, size })
}
