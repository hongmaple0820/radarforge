// gen-prisma-inline.mjs —— 同调用内起镜像服务跑 prisma generate（引擎缓存已预热）
import { createServer } from "http"
import { existsSync, statSync, createReadStream } from "fs"
import { join, normalize } from "path"
import { execSync } from "child_process"

const ROOT = "/tmp/prisma-mirror"
const server = createServer((req, res) => {
  const rel = normalize(decodeURIComponent((req.url ?? "/").split("?")[0]))
    .replace(/^([/\\]+|[.:][/\\]+)*/, "")
    .replace(/\.\.(\/|\\|$)/g, "")
  const file = join(ROOT, rel)
  if (rel && existsSync(file) && statSync(file).isFile()) {
    createReadStream(file).pipe(res)
  } else {
    console.log(`  · 镜像未命中 ${req.url}`)
    res.statusCode = 404
    res.end("miss")
  }
})
await new Promise((r) => server.listen(18765, "127.0.0.1", r))
// 异步 spawn：不冻结事件循环，镜像服务可应答 prisma 的引擎校验请求
const { spawn } = await import("child_process")
const code = await new Promise((resolve) => {
  const child = spawn("npx", ["prisma", "generate"], {
    env: { ...process.env, PRISMA_ENGINES_MIRROR: "http://127.0.0.1:18765", DATABASE_URL: "file:/home/z/my-project/db/custom.db" },
    stdio: "inherit",
    cwd: "/home/z/my-project",
  })
  const killer = setTimeout(() => {
    console.log("GENERATE_TIMEOUT 240s")
    child.kill("SIGKILL")
    resolve(1)
  }, 240_000)
  child.on("exit", (c2) => {
    clearTimeout(killer)
    resolve(c2 ?? 1)
  })
})
console.log(code === 0 ? "GENERATE_OK" : "GENERATE_FAIL")
server.close()
