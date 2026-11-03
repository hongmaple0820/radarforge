// ============================================================
// zip-struct —— 技能包结构解析（纯函数，零依赖，可离线单测）
// 从 install.ts 拆出：GitHub URL 转换 / zip 候选识别 / id 清洗
// 都不触 DB 与文件系统，node --experimental-strip-types 直跑可测。
// ============================================================

export interface ZipEntryLike {
  entryName: string
  getData: () => Buffer
}

export interface SkillCandidate {
  /** zip 内技能目录前缀（'' = 根） */
  prefix: string
  /** 目标安装目录名（技能 id；根形态由调用方命名） */
  id: string
  files: { entry: string; data: Buffer }[]
}

export const MAX_FILE_BYTES = 2 * 1024 * 1024 // 单文件 2MB
export const MAX_TOTAL_BYTES = 20 * 1024 * 1024 // 包总量 20MB
export const MAX_FILES = 200

const JUNK = /(^|\/)(__MACOSX|\.DS_Store|\.git\/|\.github\/)/

/** GitHub tree/blob URL → codeload zip URL + 子路径；非 GitHub 返回 null */
export function githubUrlToZip(url: string): { zipUrl: string; subpath: string } | null {
  // github.com/{owner}/{repo}/tree/{ref}/{path...}
  let m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)(?:\/(.+))?$/.exec(url.trim())
  if (m) {
    const [, owner, repo, ref, sub] = m
    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${ref}`
    return { zipUrl, subpath: (sub ?? '').replace(/\/+$/, '') }
  }
  // blob 形态（单文件预览页）→ 取所在目录装
  m = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)\/[^/]+$/.exec(url.trim())
  if (m) {
    const [, owner, repo, ref, sub] = m
    const zipUrl = `https://codeload.github.com/${owner}/${repo}/zip/refs/heads/${ref}`
    return { zipUrl, subpath: sub }
  }
  return null
}

/** zip 根形态的命名清洗：URL 末段/文件名 → 合规技能 id（小写连字符） */
export function sanitizeId(raw: string): string {
  const id = raw
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
  return id || 'installed-skill'
}

/**
 * 从 zip 条目中识别技能候选：
 *   ① 剥壳：无根 SKILL.md 且全部条目共享同一个顶层目录（GitHub archive
 *      形态的 repo-main/ 包裹层）→ 剥一层重判，最多剥两层；
 *   ② 根形态：相对根存在 SKILL.md → 整包即一个技能（含 references/ 等
 *      官方子目录全部文件）；id 用剥壳时记住的目录名，未剥过则由调用方命名；
 *   ③ 子目录形态：无根 SKILL.md 时按一层子目录分组，含 <目录>/SKILL.md
 *      的子目录各自成候选（装技能仓库），根级散文件不归入任何技能。
 * 防护：zip-slip（.. 与绝对路径条目直接过滤）、__MACOSX/.git 垃圾跳过、
 * 限额（单文件 2MB / 总量 20MB / 200 文件）。
 * subpath：GitHub tree 形态先剥离的子路径（调用方已剥离仓库根时传 ''）。
 */
export function findSkillCandidates(entries: ZipEntryLike[], subpath = ''): SkillCandidate[] {
  const usable = entries.filter((e) => {
    const name = e.entryName.replace(/\/+$/, '')
    if (!name || JUNK.test(name)) return false
    if (name.includes('..') || name.startsWith('/') || /^[a-zA-Z]:/.test(name)) return false
    return true
  })

  // subpath（GitHub tree 形态）下的相对路径；不在子路径内的条目忽略
  const rel = (entry: string): string | null => {
    if (!subpath) return entry
    return entry.startsWith(subpath + '/') ? entry.slice(subpath.length + 1) : null
  }

  // 收集全部文件条目（限额校验）
  let files: { entry: string; data: Buffer }[] = []
  let totalBytes = 0
  for (const e of usable) {
    if (e.entryName.endsWith('/')) continue // 目录条目（数据在文件条目里）
    const r = rel(e.entryName)
    if (r === null) continue
    const data = e.getData()
    if (data.length > MAX_FILE_BYTES) throw new Error(`单文件超过 2MB 上限：${r}`)
    totalBytes += data.length
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('包总量超过 20MB 上限——技能是声明式指令包，不是数据分发通道')
    files.push({ entry: r, data })
    if (files.length > MAX_FILES) throw new Error(`包内文件数超过上限（${MAX_FILES}）`)
  }

  // 剥壳：GitHub archive 的公共顶层目录包裹层（最多两层，防病态嵌套）
  let strippedDir = '' // 最后一次剥掉的目录名（根形态时优先做 id）
  for (let i = 0; i < 2; i++) {
    if (files.some((f) => f.entry === 'SKILL.md')) break
    const tops = new Set(files.map((f) => f.entry.split('/')[0]))
    if (tops.size !== 1) break
    const top = [...tops][0]
    strippedDir = top
    files = files.map((f) => ({ entry: f.entry.slice(top.length + 1), data: f.data }))
  }

  // 根形态：整包一个技能（含全部子目录文件）
  if (files.some((f) => f.entry === 'SKILL.md')) {
    return [{ prefix: '', id: strippedDir, files }]
  }

  // 子目录形态：一层子目录分组，含 SKILL.md 的各自成候选
  const byTop = new Map<string, { entry: string; data: Buffer }[]>()
  for (const f of files) {
    const top = f.entry.includes('/') ? f.entry.split('/')[0] : ''
    if (!top) continue // 根级散文件不属于任何子目录技能
    if (!byTop.has(top)) byTop.set(top, [])
    byTop.get(top)!.push(f)
  }
  const candidates: SkillCandidate[] = []
  for (const [top, group] of byTop) {
    if (!group.some((f) => f.entry === `${top}/SKILL.md`)) continue
    candidates.push({
      prefix: top,
      id: top,
      files: group.map((f) => ({ entry: f.entry.slice(top.length + 1), data: f.data })),
    })
  }
  return candidates
}
