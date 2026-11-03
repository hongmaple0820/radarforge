import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import { loadSkills, parseFrontmatter, stripFrontmatter } from '@/lib/skills/loader'
import { checkSkillCompliance } from '@/lib/skills/compliance'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * GET /api/skills/detail?id=xxx —— 技能详情（P2-1 详情抽屉数据源）
 * 返回：SKILL.md 全文 + 目录结构（含 scripts/references/assets 官方子目录）+ 合规报告
 */

const MAX_TREE_ENTRIES = 200

async function buildTree(dir: string): Promise<{ tree: { path: string; size: number }[]; truncated: boolean }> {
  const tree: { path: string; size: number }[] = []
  let truncated = false
  const walk = async (current: string, prefix: string): Promise<void> => {
    let entries: string[] = []
    try {
      entries = await fs.readdir(current)
    } catch {
      return
    }
    for (const entry of entries.sort()) {
      if (tree.length >= MAX_TREE_ENTRIES) {
        truncated = true
        return
      }
      const full = path.join(current, entry)
      const rel = prefix ? `${prefix}/${entry}` : entry
      const st = await fs.stat(full).catch(() => null)
      if (!st) continue
      if (st.isDirectory()) {
        tree.push({ path: `${rel}/`, size: 0 })
        await walk(full, rel)
      } else {
        tree.push({ path: rel, size: st.size })
      }
    }
  }
  await walk(dir, '')
  return { tree, truncated }
}

export async function GET(req: Request) {
  try {
    const id = (new URL(req.url).searchParams.get('id') ?? '').trim()
    if (!id || !/^[a-z0-9-]+$/.test(id)) {
      return NextResponse.json({ ok: false, message: 'id 不能为空且须为合规技能目录名' }, { status: 400 })
    }
    // 定位技能目录（产品库优先，与 loader 同序）
    const candidates = [path.join(process.cwd(), 'db', 'skills', id), path.join(os.homedir(), '.radarforge', 'skills', id)]
    let dir: string | null = null
    for (const c of candidates) {
      if (await fs.stat(path.join(c, 'SKILL.md')).then(() => true).catch(() => false)) {
        dir = c
        break
      }
    }
    if (!dir) {
      return NextResponse.json({ ok: false, message: `技能 "${id}" 不存在` }, { status: 404 })
    }

    const raw = await fs.readFile(path.join(dir, 'SKILL.md'), 'utf-8')
    const meta = parseFrontmatter(raw)
    const source = dir.includes(path.join('.radarforge', 'skills')) ? 'user' : 'product'
    const { tree, truncated } = await buildTree(dir)
    // 停用态从全量清单里带出（loader 已含）
    const all = await loadSkills()
    const card = all.find((s) => s.id === id)

    return NextResponse.json({
      ok: true,
      skill: {
        id,
        source,
        dir,
        disabled: card?.disabled ?? false,
        compliance: checkSkillCompliance(id, meta),
        frontmatter: meta,
        raw,
        bodyLength: stripFrontmatter(raw).length,
        tree,
        treeTruncated: truncated,
        allowedTools: Array.isArray(meta['allowed-tools']) ? meta['allowed-tools'] : [],
      },
    })
  } catch (e) {
    return NextResponse.json({ ok: false, message: (e as Error)?.message || '详情读取失败' }, { status: 500 })
  }
}
