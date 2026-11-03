// ============================================================
// binaries.ts —— 媒体二进制依赖统一解析器（P0-1 依赖治理）
// 根治「ffmpeg 不可用：Executable not found in $PATH」类报错：
// 16 处裸命令名调用把「可执行文件在哪」交给进程 PATH，生产模式
// （bun 运行 standalone 产物）受限 PATH 下必然复现。本模块把决定权
// 收回到代码——解析链四层：
//   1. env    FFMPEG_PATH / FFPROBE_PATH 显式指定（最高优先）
//   2. which  扫描 PATH 与常见安装目录（无子进程的 which 语义）
//   3. known  常见路径表兜底（/usr/bin /usr/local/bin …）
//   4. static ffmpeg-static / ffprobe-static 随 node_modules 分发的
//              二进制兜底（装了就有，使部署自足）
// 解析结果模块级缓存；首次解析打一行启动日志；全部调用点一律使用
// 解析后的绝对路径。找不到时抛「人话」错误——含三条修复路径指引，
// 不透出运行时原始 ENOENT 文案。
// 自检入口 getBinaryReport() 供「本地渲染依赖自检」面板使用。
// ============================================================

import { accessSync, constants as fsConstants, existsSync } from "fs"
import { execFile } from "child_process"
import path from "path"
import { promisify } from "util"

const execFileP = promisify(execFile)

export type BinName = "ffmpeg" | "ffprobe"
export type BinSource = "env" | "which" | "known" | "static"

export interface BinResolve {
  path: string
  source: BinSource
}

/** 依赖自检报告项（GET /api/settings/dependencies 与 scope=dependencies 共用） */
export interface BinaryReportItem {
  name: BinName
  resolved: boolean
  path: string | null
  source: BinSource | null
  version: string | null
  hint: string | null
}

/** 常见安装路径表（Linux/macOS；生产容器 PATH 受限时的主要来路） */
const KNOWN_DIRS = [
  "/usr/bin",
  "/usr/local/bin",
  "/usr/sbin",
  "/opt/homebrew/bin",
  "/snap/bin",
  "/home/linuxbrew/.linuxbrew/bin",
]

const EXE_EXT = process.platform === "win32" ? ".exe" : ""

/** ffmpeg-static / ffprobe-static 包在 node_modules 内的已知落点（装了就有） */
function staticCandidates(name: BinName): string[] {
  const root = process.cwd()
  if (name === "ffmpeg") {
    return [path.join(root, "node_modules", "ffmpeg-static", `ffmpeg${EXE_EXT}`)]
  }
  const plat = process.platform === "win32" ? "win32" : "linux"
  const arch = process.arch === "arm64" ? "arm64" : "x64"
  return [
    path.join(root, "node_modules", "ffprobe-static", "bin", plat, arch, `ffprobe${EXE_EXT}`),
    path.join(root, "node_modules", "ffmpeg-static", `ffprobe${EXE_EXT}`),
  ]
}

function isExecutable(absPath: string): boolean {
  try {
    accessSync(absPath, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

/** 无子进程的 which：仅遍历 PATH 各目录找可执行文件 */
function whichScan(name: BinName): string | null {
  const fileName = `${name}${EXE_EXT}`
  const pathDirs = (process.env.PATH ?? "").split(path.delimiter).filter(Boolean)
  for (const dir of pathDirs) {
    const candidate = path.join(dir, fileName)
    if (existsSync(candidate) && isExecutable(candidate)) return candidate
  }
  return null
}

// ---------- 模块级缓存 + 启动日志（首次解析打一行） ----------

const cache = new Map<BinName, BinResolve | null>()
const logged = new Set<BinName>()

function logOnce(name: BinName, r: BinResolve | null): void {
  if (logged.has(name)) return
  logged.add(name)
  if (r) {
    console.log(`[binaries] ${name} 解析成功 → ${r.path}（来源：${r.source}）`)
  } else {
    console.log(`[binaries] ${name} 未解析到可执行文件——可设 FFMPEG_PATH/FFPROBE_PATH、安装 ffmpeg-static 或系统安装 ffmpeg`)
  }
}

/** 依赖缺失修复指引（三条路径，供错误文案与自检 hint 使用） */
export const STATIC_HINT =
  "修复路径三选一：① 设置环境变量 FFMPEG_PATH / FFPROBE_PATH 指向二进制；② 安装 ffmpeg-static（npm i ffmpeg-static，随 node_modules 分发免系统安装）；③ 系统安装（Debian/Ubuntu: apt install -y ffmpeg；macOS: brew install ffmpeg）"

function resolveBin(name: BinName): BinResolve | null {
  if (cache.has(name)) return cache.get(name) ?? null

  // 1. env 显式指定
  const envKey = name === "ffmpeg" ? "FFMPEG_PATH" : "FFPROBE_PATH"
  const envVal = process.env[envKey]
  if (envVal && existsSync(envVal) && isExecutable(envVal)) {
    const r: BinResolve = { path: envVal, source: "env" }
    cache.set(name, r)
    logOnce(name, r)
    return r
  }

  // 2. PATH 扫描（which 语义，无子进程）
  const whichHit = whichScan(name)
  if (whichHit) {
    const r: BinResolve = { path: whichHit, source: "which" }
    cache.set(name, r)
    logOnce(name, r)
    return r
  }

  // 3. 常见安装路径表（PATH 受限时的主要来路：生产 standalone 场景）
  for (const dir of KNOWN_DIRS) {
    const candidate = path.join(dir, `${name}${EXE_EXT}`)
    if (existsSync(candidate) && isExecutable(candidate)) {
      const r: BinResolve = { path: candidate, source: "known" }
      cache.set(name, r)
      logOnce(name, r)
      return r
    }
  }

  // 4. ffmpeg-static / ffprobe-static node_modules 兜底
  for (const candidate of staticCandidates(name)) {
    if (existsSync(candidate) && isExecutable(candidate)) {
      const r: BinResolve = { path: candidate, source: "static" }
      cache.set(name, r)
      logOnce(name, r)
      return r
    }
  }

  cache.set(name, null)
  logOnce(name, null)
  return null
}

export function resolveFFmpeg(): BinResolve | null {
  return resolveBin("ffmpeg")
}

export function resolveFFprobe(): BinResolve | null {
  return resolveBin("ffprobe")
}

/**
 * 取绝对路径，找不到时抛「人话」错误（含三条修复路径）。
 * 全部调用点（视频合成 / 分段 / 探时长 / BGM / 缩略图 / 帧管道）一律经此取路径。
 */
export function mustResolve(name: BinName): string {
  const r = resolveBin(name)
  if (!r) {
    throw new Error(`${name} 未安装或不可执行。${STATIC_HINT}`)
  }
  return r.path
}

/** 清空缓存（供测试注入伪造环境后重解析） */
export function resetBinaryCache(): void {
  cache.clear()
  logged.clear()
}

/** 依赖自检：逐项报告解析路径与版本，缺失项给修复指引而非原始报错 */
export async function getBinaryReport(): Promise<BinaryReportItem[]> {
  const items: BinaryReportItem[] = []
  for (const name of ["ffmpeg", "ffprobe"] as const) {
    const r = resolveBin(name)
    let version: string | null = null
    if (r) {
      try {
        const { stdout } = await execFileP(r.path, ["-version"], { timeout: 10_000 })
        version = stdout.split("\n")[0]?.slice(0, 80) ?? null
      } catch {
        version = null // 解析到但执行失败（权限/架构不符），如实报 null
      }
    }
    items.push({
      name,
      resolved: Boolean(r),
      path: r?.path ?? null,
      source: r?.source ?? null,
      version,
      hint: r && version ? null : r ? `${name} 已解析但执行失败（权限或架构不符）：${r.path}` : STATIC_HINT,
    })
  }
  return items
}
