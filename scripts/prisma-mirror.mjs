// ============================================================
// prisma-mirror.mjs —— Prisma 引擎下载的本地镜像兜底
// 背景（2026-11-01 实证）：本沙箱 DNS 对 binaries.prisma.sh 解析出
//   两个 A 记录（104.20.43.103 活 / 172.66.156.100 死），curl 恰好走
//   活路而 Node fetch（undici）撞死路 → ETIMEDOUT。prisma generate/
//   db push 的引擎下载走 Node fetch，因此反复失败；同一文件 curl 秒下。
// 对策：curl 把引擎 + 校验文件拉到 /tmp/prisma-mirror，起一个仅绑
//   127.0.0.1 的临时静态服务，用 PRISMA_ENGINES_MIRROR 环境变量把
//   prisma 的下载指过来。全程幂等可重复；进程不跨 Bash 调用存活，
//   因此服务与 prisma 命令必须在同一调用内完成（withEngineMirror）。
// 用法：
//   import { withEngineMirror } from "./prisma-mirror.mjs"
//   await withEngineMirror(async (env) => {
//     execSync("npx prisma generate", { env: { ...process.env, ...env } })
//   })
//   CLI：node scripts/prisma-mirror.mjs --prepare  # 只预热镜像不跑 prisma
// ============================================================
import { createServer } from "http"
import { createReadStream, existsSync, mkdirSync, statSync, chmodSync } from "fs"
import { execSync } from "child_process"
import { join, normalize } from "path"
import { homedir } from "os"

const MIRROR_ROOT = "/tmp/prisma-mirror"
// 远端全部可能被请求的文件（.gz 本体 + 两种校验文件；实测 generate+db push 只需这六件）
const MIRROR_FILES = [
  "schema-engine.gz",
  "schema-engine.gz.sha256",
  "schema-engine.sha256",
  "libquery_engine.so.node.gz",
  "libquery_engine.so.node.gz.sha256",
  "libquery_engine.so.node.sha256",
]

// ---------- 版本信息解析（纯函数，供离线测试） ----------
export function parsePrismaVersionOutput(text) {
  const jsonStart = text.indexOf("{")
  if (jsonStart < 0) throw new Error("prisma version 输出无 JSON")
  const info = JSON.parse(text.slice(jsonStart))
  const hash = info["default-engines-hash"]
  const platform = info["computed-binarytarget"]
  if (!hash || !platform) throw new Error("prisma version --json 缺 engines-hash/platform")
  return { hash, platform, prisma: info.prisma }
}

export function getPrismaEngineInfo() {
  const out = execSync("npx prisma version --json", {
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
  })
  return parsePrismaVersionOutput(out)
}

// ---------- 镜像预热（curl 下载，幂等跳过已有） ----------
export function prepareMirror({ hash, platform }, log = () => {}) {
  const dir = join(MIRROR_ROOT, "all_commits", hash, platform)
  mkdirSync(dir, { recursive: true })
  const base = `https://binaries.prisma.sh/all_commits/${hash}/${platform}`
  for (const f of MIRROR_FILES) {
    const dest = join(dir, f)
    if (existsSync(dest) && statSync(dest).size > 0) continue
    // Node fetch 会撞死路 IP，curl 走活路——必须用 curl（见文件头背景）
    // --fail：HTTP 4xx/5xx 记为失败（否则 404 错误页会被当成引擎写盘）
    execSync(`curl -sSLf -m 180 --retry 3 -o '${dest}' '${base}/${f}'`, { stdio: "pipe" })
    if (!existsSync(dest) || statSync(dest).size === 0) {
      throw new Error(`镜像文件下载失败：${f}`)
    }
    log(`  · 镜像补 ${f}（${(statSync(dest).size / 1048576).toFixed(1)}MB）`)
  }
  return dir
}

// ---------- prisma 引擎缓存预热（belt-and-suspenders） ----------
// 实证成功的组合是「缓存里有解压后二进制 + 镜像能答校验文件」，两者都做。
export function ensureEngineCache({ hash, platform }, mirrorDir) {
  const cacheDir = join(homedir(), ".cache/prisma/master", hash, platform)
  mkdirSync(cacheDir, { recursive: true })
  const pairs = [
    ["schema-engine.gz", "schema-engine", true],
    ["libquery_engine.so.node.gz", `libquery_engine-${platform}.so.node`, false],
  ]
  for (const [gzName, outName, executable] of pairs) {
    const gz = join(mirrorDir, gzName)
    const out = join(cacheDir, outName)
    if (!existsSync(gz)) continue
    if (!existsSync(out) || statSync(out).size === 0) {
      execSync(`gunzip -kf '${gz}' -c > '${out}'`, { stdio: "pipe" })
    }
    if (executable) chmodSync(out, 0o755)
  }
  return cacheDir
}

// ---------- 临时静态服务（仅 127.0.0.1，防路径穿越） ----------
export async function startMirrorServer({ logMisses = true } = {}) {
  const server = createServer((req, res) => {
    const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]))
      .replace(/^([/\\]+|[.:][/\\]+)*/, "")
      .replace(/\.\.(\/|\\|$)/g, "")
    const file = join(MIRROR_ROOT, rel)
    if (rel && existsSync(file) && statSync(file).isFile()) {
      res.setHeader("content-type", "application/octet-stream")
      createReadStream(file).pipe(res)
    } else {
      if (logMisses) console.log(`  · 镜像未命中 ${req.url}（404）`)
      res.statusCode = 404
      res.end("not in mirror")
    }
  })
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve))
  return { server, port: server.address().port, close: () => server.close() }
}

// ---------- 一体化兜底入口 ----------
export async function withEngineMirror(fn, { label = "prisma" } = {}) {
  const info = await getPrismaEngineInfo()
  const mirrorDir = prepareMirror(info)
  ensureEngineCache(info, mirrorDir)
  const srv = await startMirrorServer()
  const env = { PRISMA_ENGINES_MIRROR: `http://127.0.0.1:${srv.port}` }
  try {
    return await fn(env, info)
  } finally {
    srv.close()
    if (!process.env.PRISMA_MIRROR_QUIET) {
      console.log(`  · ${label} 已走本地引擎镜像兜底（prisma ${info.prisma} / ${info.platform}）`)
    }
  }
}

// ---------- CLI：只预热 ----------
if (process.argv[1] && process.argv[1].endsWith("prisma-mirror.mjs") && process.argv.includes("--prepare")) {
  const info = await getPrismaEngineInfo()
  prepareMirror(info, (m) => console.log(m))
  ensureEngineCache(info, join(MIRROR_ROOT, "all_commits", info.hash, info.platform))
  console.log("镜像预热完成（后续 generate/db push 可直接走缓存）")
}
