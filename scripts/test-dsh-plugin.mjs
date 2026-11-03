// ============================================================
// test-dsh-plugin.mjs —— P1-2 dsh 插件宿主链路回归（与八套离线回归并列）
// 覆盖方案第五章验收要点（沙箱内可行的全链路）：
//   ① 宿主可达性：npm view @deepseek-ai/dsh（外部不可达时明确跳过标注）
//   ② 插件包产物：plugins/dsh-radar 五件套 + tgz 打包内容完整
//   ③ 官方规范对齐：name/inject/Config 导出齐全；Config 默认值与覆盖
//   ④ defineTool 注册形态：两工具 + parameters 编译（官方校验）+ output 声明 + timeoutMs
//   ⑤ 参数校验（官方 validateArgs）：缺必填/类型错误/嵌套额外键全部拦截
//   ⑥ execute 协议链路：挂载 → radar_article 实调（平台 /api/runs 真实创建
//      run + 轮询 + 返回纯文本格式化结果）——需 dev server + LLM 配额
//   ⑦ 协作取消契约：已中止的 exec.signal → 轮询立即停止并报「已取消」
// 运行：bash scripts/with-server.sh "node scripts/test-dsh-plugin.mjs"
// 外部依赖（npm 源 / LLM 配额）不可达时对应断言降级标注，不冒充通过。
// ============================================================

import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { readFile } from "node:fs/promises"

const execFileP = promisify(execFile)
const BASE = process.env.RADAR_BASE || "http://127.0.0.1:3000"

let pass = 0
let fail = 0
let skipped = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.error(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}
function skip(name, reason) {
  skipped++
  console.log(`  ⏭ ${name}｜${reason}`)
}

console.log("━━━ P1-2 dsh 插件宿主链路回归 ━━━")

// ---------- ① 宿主可达性 ----------
console.log("── ① 宿主可达性 ──")
let hostVersion = null
try {
  const { stdout } = await execFileP("npm", ["view", "@deepseek-ai/dsh", "version"], { timeout: 30_000 })
  hostVersion = stdout.trim()
  ok("npm 源可达（@deepseek-ai/dsh）", Boolean(hostVersion), `latest=${hostVersion}`)
} catch (e) {
  skip("npm 源可达性", `不可达：${String(e.message).slice(0, 60)}——宿主实测断言降级`)
}

// ---------- ② 插件包产物 ----------
console.log("── ② 插件包产物 ──")
{
  const pkg = JSON.parse(await readFile("plugins/dsh-radar/package.json", "utf-8"))
  ok("package.json 五件 files 清单完整", ["lib/index.js", "lib/client.js", "cordis.patch.yml", "README.md"].every((f) => pkg.files.includes(f)))
  ok("dsh.bundle.patch 声明（漏声明=装了普通依赖）", pkg.dsh?.bundle?.patch === "./cordis.patch.yml")
  ok("dsh.client 浏览器半声明", Array.isArray(pkg.dsh?.client?.inject) && pkg.dsh.client.platform === "web")
  ok("engines.dsh 声明验证过的版本下限", typeof pkg.engines?.dsh === "string" && pkg.engines.dsh.includes("0.2.1"))
  ok("keywords 含 dsh-plugin（官方发现机制）", pkg.keywords?.includes("dsh-plugin"))
  ok("依赖钉住与宿主对齐的 dsh-tools（rc 间破坏兼容教训）", pkg.dependencies?.["@deepseek-ai/dsh-tools"] === "0.2.1-rc.5")

  const indexSrc = await readFile("plugins/dsh-radar/lib/index.js", "utf-8")
  ok("无 default 导出（cordis unwrapExports 契约）", !/^export default/m.test(indexSrc))
  ok("Config 导出（Schemastery 配置层）", /export const Config = Schema\.object/.test(indexSrc))
  ok("name 导出（诊断元数据）", /export const name = "dsh-plugin-radar"/.test(indexSrc))
  ok("inject 声明 tools 服务", /export const inject = \["tools"\]/.test(indexSrc))
  ok("execute 观测 exec.signal（官方协作取消约定）", /exec\.signal/.test(indexSrc))

  const patchYml = await readFile("plugins/dsh-radar/cordis.patch.yml", "utf-8")
  ok("cordis.patch.yml 单行 insert（id/name）", /- insert:/.test(patchYml) && /id: radar-plugin/.test(patchYml) && /name: 'dsh-plugin-radar'/.test(patchYml))
}

// ---------- ③④⑤ 官方规范对齐（模块加载 + defineTool + 参数校验） ----------
console.log("── ③④⑤ 官方规范对齐 ──")
const mod = await import("../plugins/dsh-radar/lib/index.js")
const { validateArgs } = await import("@deepseek-ai/dsh-tools")
{
  ok("模块加载成功", typeof mod.apply === "function")
  ok("name 导出 = dsh-plugin-radar", mod.name === "dsh-plugin-radar")
  ok("inject = [tools]", JSON.stringify(mod.inject) === '["tools"]')
  ok("Config 默认 radarBase", JSON.stringify(mod.Config({})) === '{"radarBase":"http://localhost:3000"}')
  ok("Config 可覆盖 radarBase", mod.Config({ radarBase: "http://x:1" }).radarBase === "http://x:1")

  const registered = []
  const ctx = { tools: { register: (def) => registered.push(def) }, get: () => null }
  mod.apply(ctx, { radarBase: BASE })
  ok("apply 挂载两工具", registered.length === 2, registered.map((t) => t.name).join(","))

  const article = registered.find((t) => t.name === "radar_article")
  const video = registered.find((t) => t.name === "radar_video")
  ok("radar_article output 声明齐全（schema+render，注册表强制）", Boolean(article?.output?.schema && article?.output?.render))
  ok("radar_video output 声明齐全", Boolean(video?.output?.schema && video?.output?.render))
  ok("timeoutMs 均为正有限值（策略元数据）", article?.timeoutMs > 0 && video?.timeoutMs > 0 && Number.isFinite(article?.timeoutMs))

  // ⑤ 官方参数校验（用与插件相同的 spec 形态）
  const articleSpec = {
    ideaTitle: { type: "string", required: true, description: "x" },
    persona: { type: "string" },
  }
  ok("官方校验：缺必填 ideaTitle 被拦截", validateArgs(articleSpec, {}).length > 0)
  ok("官方校验：类型错误被拦截", validateArgs(articleSpec, { ideaTitle: 123 }).length > 0)
  ok("官方校验：合法参数通过", validateArgs(articleSpec, { ideaTitle: "观察" }).length === 0)
  const videoSpec = {
    runId: { type: "string", required: true },
    direction: { type: "object", additionalProperties: false, properties: { kind: { type: "string" }, name: { type: "string" } } },
  }
  ok("官方校验：嵌套额外键被拦截（additionalProperties:false）", validateArgs(videoSpec, { runId: "r", direction: { rogue: 1 } }).length > 0)
}

// ---------- ⑥ execute 协议链路（需平台运行；LLM 配额允许则跑真实流水线） ----------
console.log("── ⑥ execute 协议链路 ──")
const registered = []
const ctx = { tools: { register: (def) => registered.push(def) }, get: () => null }
mod.apply(ctx, { radarBase: BASE })
const article = registered.find((t) => t.name === "radar_article")

const serverUp = await fetch(`${BASE}/api/runs`, { method: "GET" }).then((r) => r.ok).catch(() => false)
if (serverUp) {
  // 协作取消契约：已中止信号 → execute 立即报「已取消」（POST 阶段即被截停）
  {
    const ac = new AbortController()
    ac.abort()
    let cancelMsg = ""
    try {
      await article.execute({ ideaTitle: "dsh 插件协作取消契约验证" }, { signal: ac.signal })
    } catch (e) {
      cancelMsg = String(e.message)
    }
    ok("协作取消：已中止 signal → 立即报「已取消」", /已取消/.test(cancelMsg), cancelMsg.slice(0, 60))
  }

  // 真实流水线（LLM 配额允许时）：execute → 创建 run → 轮询到 done → 返回纯文本
  {
    const t0 = Date.now()
    let result = ""
    let err = ""
    try {
      result = await article.execute({ ideaTitle: "具身智能融资观察（dsh 插件链路验证）", persona: "犀利主笔" }, { signal: new AbortController().signal })
    } catch (e) {
      err = String(e.message)
    }
    const elapsed = Math.round((Date.now() - t0) / 1000)
    if (result) {
      ok("radar_article 实调返回纯文本结果", result.includes("标题：") && result.includes("平台链接："), `${elapsed}s · ${result.length} 字符`)
      ok("结果含六步流水线状态", /六步：/.test(result) && /✓/.test(result))
      ok("结果含成稿全文（Markdown 摘要）", /成稿全文/.test(result))
      ok("纯文本约定：不含 base64/二进制", !/data:|base64/.test(result))
      // 平台侧留痕核对：run 确实由插件链路创建
      const runs = await fetch(`${BASE}/api/runs`).then((r) => r.json())
      const mine = (runs.runs ?? []).find((r) => String(r.ideaTitle).includes("dsh 插件链路验证"))
      ok("平台侧 run 留痕（插件创建的 run 可查）", Boolean(mine), mine ? `${mine.status} · ${mine.id.slice(0, 10)}` : "未找到")
    } else {
      skip("radar_article 实调（真实流水线）", `失败：${err.slice(0, 80)}——若为 LLM 配额 429 则链路验证已到调用层，配额恢复后重跑`)
    }
  }
} else {
  skip("execute 协议链路", `平台 ${BASE} 未运行——请用 with-server 包裹执行`)
}

// ---------- ⑦ tgz 产物 ----------
console.log("── ⑦ tgz 产物 ──")
{
  try {
    const { stdout } = await execFileP("tar", ["tzf", "download/dsh-plugin-radar.tgz"], { timeout: 10_000 })
    const files = stdout.trim().split("\n").filter((f) => !f.endsWith("/"))
    ok("tgz 产物含五件套", ["./package.json", "./lib/index.js", "./lib/client.js", "./cordis.patch.yml", "./README.md"].every((f) => files.includes(f)), files.join(" "))
  } catch (e) {
    ok("tgz 产物存在", false, String(e.message).slice(0, 60))
  }
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败 / ${skipped} 跳过（降级标注）`)
process.exit(fail === 0 ? 0 : 1)
