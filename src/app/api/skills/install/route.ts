import { NextResponse } from 'next/server'
import { installFromZipBuffer } from '@/lib/skills/install'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * POST /api/skills/install —— zip 文件上传安装（P2-1）
 * multipart/form-data，字段 file = .zip 技能包（SKILL.md 在 zip 根或一层子目录）
 * 返回安装结果（含合规报告；不合规显式标注，不静默跳过）
 */
export async function POST(req: Request) {
  try {
    const form = await req.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, message: '缺少 file 字段（zip 文件）' }, { status: 400 })
    }
    if (file.size > 30 * 1024 * 1024) {
      return NextResponse.json({ ok: false, message: `文件过大（${(file.size / 1048576).toFixed(1)}MB > 上限 30MB）` }, { status: 400 })
    }
    const buf = Buffer.from(await file.arrayBuffer())
    const rootName = file.name.replace(/\.zip$/i, '') || 'uploaded-skill'
    const result = await installFromZipBuffer(buf, rootName)
    return NextResponse.json(result, { status: result.ok ? 200 : 409 })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '安装失败' }, { status: 400 })
  }
}
