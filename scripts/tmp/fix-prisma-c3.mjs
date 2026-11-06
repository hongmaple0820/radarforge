// fix-prisma-c3.mjs —— 批次三环境自愈：绕过 `prisma version` 的 Node fetch 死路
// 直接用已知 engines hash（来自报错 URL）curl 预热镜像 + 引擎缓存，
// 同一调用内起镜像服务跑 generate + db push。
import { execSync } from "child_process"
import { mkdirSync, existsSync, statSync, chmodSync } from "fs"
import { createServer } from "http"
import { createReadStream } from "fs"
import { join, normalize } from "path"
import { homedir } from "os"

const HASH = "c2990dca591cba766e3b7ef5d9e8a84796e47ab7"
const PLATFORM = "debian-openssl-3.0.x"
const ROOT = "/tmp/prisma-mirror"
const FILES = [
  "schema-engine.gz",
  "schema-engine.gz.sha256",
  "schema-engine.sha256",
  "libquery_engine.so.node.gz",
  "libquery_engine.so.node.gz.sha256",
  "libquery_engine.so.node.sha256",
]

const mirrorDir = join(ROOT, "all_commits", HASH, PLATFORM)
mkdirSync(mirrorDir, { recursive: true })
for (const f of FILES) {
  const dest = join(mirrorDir, f)
  if (existsSync(dest) && statSync(dest).size > 0) {
    console.log(`  · 已有 ${f}`)
    continue
  }
  execSync(`curl -sSLf -m 180 --retry 3 -o '${dest}' 'https://binaries.prisma.sh/all_commits/${HASH}/${PLATFORM}/${f}'`, { stdio: "pipe" })
  console.log(`  · 补 ${f}（${(statSync(dest).size / 1048576).toFixed(1)}MB）`)
}

// 引擎缓存（解压后的二进制）
const cacheDir = join(homedir(), ".cache/prisma/master", HASH, PLATFORM)
mkdirSync(cacheDir, { recursive: true })
for (const [gzName, outName, exec_] of [
  ["schema-engine.gz", "schema-engine", true],
  ["libquery_engine.so.node.gz", `libquery_engine-${PLATFORM}.so.node`, false],
]) {
  const out = join(cacheDir, outName)
  if (!existsSync(out) || statSync(out).size === 0) {
    execSync(`gunzip -kf '${join(mirrorDir, gzName)}' -c > '${out}'`, { stdio: "pipe" })
  }
  if (exec_) chmodSync(out, 0o755)
  console.log(`  · 缓存 ${outName}（${(statSync(out).size / 1048576).toFixed(1)}MB）`)
}

// 镜像服务 + generate/db push（同调用内存活）
const server = createServer((req, res) => {
  const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0])).replace(/^([/\\]+|[.:][/\\]+)*/, "").replace(/\.\.(\/|\\|$)/g, "")
  const file = join(ROOT, rel)
  if (rel && existsSync(file) && statSync(file).isFile()) {
    res.setHeader("content-type", "application/octet-stream")
    createReadStream(file).pipe(res)
  } else {
    console.log(`  · 镜像未命中 ${req.url}`)
    res.statusCode = 404
    res.end("not in mirror")
  }
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const port = server.address().port
const env = { ...process.env, PRISMA_ENGINES_MIRROR: `http://127.0.0.1:${port}`, DATABASE_URL: "file:/home/z/my-project/db/custom.db" }
try {
  console.log("  · prisma generate …")
  execSync("npx prisma generate", { env, stdio: "inherit", cwd: "/home/z/my-project" })
  console.log("  · prisma db push --skip-generate …")
  execSync("npx prisma db push --skip-generate", { env, stdio: "inherit", cwd: "/home/z/my-project" })
  console.log("OK: prisma client + schema 就绪")
} finally {
  server.close()
}
