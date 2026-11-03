// ============================================================
// install —— 技能安装 / 卸载（P2-1）
// 来源两种：
//   ① URL：直链 zip（含 codeload / releases attach）或 GitHub
//      tree URL（zip-struct.githubUrlToZip 转换 → codeload + 子路径）
//   ② zip 文件上传（multipart → /api/skills/install）
// 结构解析与防护（zip-slip / 限额 / 候选识别）在 zip-struct.ts（纯函数）。
// 落点：~/.radarforge/skills/<目录名>/；与产品库（db/skills）同 id 冲突
//   → 拒绝安装（产品库优先的去重语义，不静默覆盖）。
// 合规：安装后跑 checkSkillCompliance，不合规照样装但显式报告
//   （「明确标注原因而非静默跳过」——q7 方案 3.3）。
// ============================================================

import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import AdmZip from 'adm-zip'
import { checkSkillCompliance } from './compliance'
import { githubUrlToZip, sanitizeId, findSkillCandidates, type SkillCandidate } from './zip-struct'
import { parseFrontmatter } from './frontmatter'

export { githubUrlToZip, sanitizeId, findSkillCandidates } from './zip-struct'
export { parseFrontmatter } from './frontmatter'

export const USER_SKILLS_DIR = path.join(os.homedir(), '.radarforge', 'skills')
const PRODUCT_SKILLS_DIR = path.join(process.cwd(), 'db', 'skills')

const DOWNLOAD_TIMEOUT = 60_000
const DOWNLOAD_MAX = 30 * 1024 * 1024

export interface InstalledSkill {
  id: string
  compliance: ReturnType<typeof checkSkillCompliance>
  /** 覆盖了用户位已有同名目录（用户位覆盖用户位，允许） */
  overwrote: boolean
}

export interface InstallResult {
  ok: boolean
  installed: InstalledSkill[]
  message: string
}

function isValidId(id: string): boolean {
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(id) && id.length >= 1 && id.length <= 64
}

async function productIds(): Promise<Set<string>> {
  try {
    return new Set((await fs.readdir(PRODUCT_SKILLS_DIR)).filter((d) => /^[a-z0-9-]+$/.test(d)))
  } catch {
    return new Set()
  }
}

// ---------- 下载 ----------

async function downloadZip(url: string): Promise<Buffer> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DOWNLOAD_TIMEOUT)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'RadarForge/2.0 (+skills-installer)' },
    })
    if (!res.ok) {
      throw new Error(`下载失败：HTTP ${res.status}${res.status === 404 ? '（地址不存在——检查分支/路径拼写）' : ''}`)
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) throw new Error('下载内容为空')
    if (buf.length > DOWNLOAD_MAX) throw new Error(`包体过大（${(buf.length / 1048576).toFixed(1)}MB > 上限 30MB）`)
    return buf
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new Error(`下载超时（${DOWNLOAD_TIMEOUT / 1000}s）`)
    if (e instanceof Error && e.message.startsWith('下载')) throw e
    throw new Error(`下载失败：${(e as Error).message}`)
  } finally {
    clearTimeout(timer)
  }
}

// ---------- 落盘 ----------

/** 候选统一落盘：根形态 id 补名（优先 SKILL.md 声明的合法 name——
 *  规范语义 name=目录名；无合法声明时用 rootName 兜底）→ 产品库冲突
 *  剔除 → 逐文件写入 → 合规校验 */
async function installCandidates(candidates: SkillCandidate[], rootName: string): Promise<InstallResult> {
  for (const c of candidates) {
    if (!c.id) {
      // 根形态：SKILL.md 声明的合法 name 优先（与目录名一致性内建成立）
      const md = c.files.find((f) => f.entry === 'SKILL.md')
      let declared = ''
      if (md) {
        try {
          const meta = parseFrontmatter(md.data.toString('utf-8'))
          if (typeof meta['name'] === 'string') declared = meta['name'].trim()
        } catch {
          // 解析失败 → 走 rootName 兜底
        }
      }
      c.id = declared && isValidId(declared) ? declared : sanitizeId(rootName)
    }
  }

  const product = await productIds()
  const conflicts: string[] = []
  const installed: InstalledSkill[] = []
  await fs.mkdir(USER_SKILLS_DIR, { recursive: true })

  for (const c of candidates) {
    if (!isValidId(c.id)) {
      throw new Error(`技能目录名 "${c.id}" 不合规（须为小写字母/数字/连字符，1-64 字符）——与 agentskills.io 规范的 name 约束一致`)
    }
    if (product.has(c.id)) {
      conflicts.push(c.id)
      continue
    }
    const target = path.join(USER_SKILLS_DIR, c.id)
    const overwrote = await fs
      .stat(target)
      .then(() => true)
      .catch(() => false)
    if (overwrote) await fs.rm(target, { recursive: true, force: true })
    await fs.mkdir(target, { recursive: true })
    for (const f of c.files) {
      // entry 已在 zip-struct 内做 zip-slip 防护；落盘前对目标路径再校验一次（belt-and-suspenders）
      const dest = path.join(target, f.entry)
      if (!dest.startsWith(target + path.sep)) throw new Error(`非法条目路径：${f.entry}`)
      await fs.mkdir(path.dirname(dest), { recursive: true })
      await fs.writeFile(dest, f.data)
    }
    // 合规校验（装完就检，报告随结果返回——不合规显式标注，不静默跳过）
    const raw = await fs.readFile(path.join(target, 'SKILL.md'), 'utf-8')
    installed.push({ id: c.id, compliance: checkSkillCompliance(c.id, parseFrontmatter(raw)), overwrote })
  }

  let message: string
  if (installed.length === 0) {
    message = `未安装任何技能：${conflicts.length > 0 ? `产品库已含同名技能 ${conflicts.join('、')}（产品库优先，如需覆盖请在产品库迭代）` : '包内无可用技能'}`
  } else {
    const names = installed.map((s) => s.id).join('、')
    const bad = installed.filter((s) => !s.compliance.ok)
    message = `已安装 ${installed.length} 个技能：${names}${bad.length > 0 ? `；${bad.length} 个存在合规问题（详情见列表标注，仍可用但建议修正）` : '，全部合规'}`
    if (conflicts.length > 0) message += `；跳过与产品库同名的 ${conflicts.join('、')}`
  }
  return { ok: installed.length > 0, installed, message }
}

// ---------- 对外安装入口 ----------

/** 把 zip Buffer 安装到用户位；rootName 用于「zip 根形态」的技能命名（URL 末段 / 上传文件名） */
export async function installFromZipBuffer(buf: Buffer, rootName: string): Promise<InstallResult> {
  let zip: AdmZip
  try {
    zip = new AdmZip(buf)
  } catch {
    throw new Error('无法解析 zip 包（文件损坏或不是 zip 格式）')
  }
  const rawEntries = zip.getEntries().map((e) => ({ entryName: e.entryName, getData: () => e.getData() }))
  const candidates = findSkillCandidates(rawEntries)
  if (candidates.length === 0) {
    throw new Error('包内未找到 SKILL.md（技能目录须包含一个 SKILL.md；GitHub 仓库请粘贴 tree 目录页地址）')
  }
  return installCandidates(candidates, rootName)
}

/** URL 安装：直链 zip 或 GitHub tree URL（tree 页自动转 codeload zip；
 *  GitHub archive 的仓库根包裹层 + 子路径两层前缀显式剥离） */
export async function installFromUrl(url: string): Promise<InstallResult> {
  const trimmed = url.trim()
  if (!/^https?:\/\//.test(trimmed)) throw new Error('URL 须以 http(s):// 开头')
  const gh = githubUrlToZip(trimmed)
  const buf = await downloadZip(gh?.zipUrl ?? trimmed)

  let zip: AdmZip
  try {
    zip = new AdmZip(buf)
  } catch {
    throw new Error('下载的内容不是有效 zip（GitHub 请粘贴 tree 目录页地址，不要粘贴页面 HTML 地址）')
  }
  const fileEntries = zip.getEntries().map((e) => ({ entryName: e.entryName, getData: () => e.getData() }))

  // 直链 zip：整包结构解析（剥壳逻辑自会处理 archive 包裹层）
  if (!gh?.subpath) {
    const candidates = findSkillCandidates(fileEntries)
    if (candidates.length === 0) {
      throw new Error('包内未找到 SKILL.md（技能目录须包含一个 SKILL.md；GitHub 仓库请粘贴 tree 目录页地址）')
    }
    const rootName = decodeURIComponent(trimmed.split('/').filter(Boolean).pop() ?? 'skill').replace(/\.(zip|tar\.gz|tgz)$/i, '')
    return installCandidates(candidates, rootName)
  }

  // GitHub tree 形态：剥离「仓库根 + 子路径」两层前缀后解析
  const subpath = gh.subpath
  // 仓库根探测：全部文件条目共享同一首段目录（codeload archive 必有）
  let repoRoot = ''
  const nonDir = fileEntries.filter((e) => !e.entryName.endsWith('/'))
  if (nonDir.length > 0 && nonDir.every((e) => e.entryName.includes('/'))) {
    const first = nonDir[0].entryName.split('/')[0]
    if (nonDir.every((e) => e.entryName.startsWith(first + '/'))) repoRoot = first
  }
  const prefix = [repoRoot, subpath].filter(Boolean).join('/')
  const stripped = fileEntries
    .filter((e) => !e.entryName.endsWith('/'))
    .map((e) => ({ entryName: e.entryName.slice(prefix.length + 1), getData: e.getData }))
    .filter((e) => e.entryName)

  if (stripped.length === 0) {
    throw new Error(`路径 ${subpath} 在该仓库中不存在（或不含任何文件）——检查 tree 地址拼写`)
  }
  const candidates = findSkillCandidates(stripped)
  if (candidates.length === 0) {
    throw new Error(`在 ${subpath}/ 下未找到技能目录（技能目录须含 SKILL.md）`)
  }
  const rootName = subpath.split('/').filter(Boolean).pop()!
  return installCandidates(candidates, rootName)
}

/** 卸载：仅用户位技能；产品库技能随仓库分发，不可在此删除（可停用） */
export async function uninstallSkill(id: string): Promise<{ ok: boolean; message: string }> {
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('非法技能 id')
  const product = await productIds()
  if (product.has(id)) {
    throw new Error(`"${id}" 是产品库技能（随仓库分发、git 兜底），不支持卸载——可停用`)
  }
  const target = path.join(USER_SKILLS_DIR, id)
  const exists = await fs
    .stat(target)
    .then(() => true)
    .catch(() => false)
  if (!exists) throw new Error(`用户位不存在技能 "${id}"`)
  await fs.rm(target, { recursive: true, force: true })
  return { ok: true, message: `已卸载用户技能 "${id}"（产品库技能不受影响）` }
}
