// ============================================================
// test-prisma-mirror.mjs —— prisma-mirror 兜底模块离线自测（不触网）
// 覆盖：版本输出解析（含前导噪声/坏输入）、静态服务命中与 404、
//       路径穿越防护、prepareMirror 幂等跳过（预置全量文件→零下载）。
// 运行：node scripts/test-prisma-mirror.mjs
// ============================================================
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs"
import { join } from "path"

const ROOT = "/tmp/prisma-mirror"
const FAKE_HASH = "a".repeat(40)
const FAKE_PLATFORM = "debian-openssl-3.0.x"
const FAKE_DIR = join(ROOT, "all_commits", FAKE_HASH, FAKE_PLATFORM)
let pass = 0, fail = 0
const t = (name, cond) => {
  if (cond) { pass++; console.log(`  ✅ ${name}`) }
  else { fail++; console.log(`  ❌ ${name}`) }
}

// 造隔离的假镜像目录（不动真实 hash 目录，那边存着已预热的真引擎）
rmSync(FAKE_DIR, { recursive: true, force: true })
mkdirSync(FAKE_DIR, { recursive: true })

const { parsePrismaVersionOutput, prepareMirror, startMirrorServer } = await import("./prisma-mirror.mjs")

// ---------- ① 版本输出解析 ----------
console.log("① parsePrismaVersionOutput")
const fixture = `Prisma schema loaded from prisma/schema.prisma
{
  "prisma": "6.19.2",
  "computed-binarytarget": "debian-openssl-3.0.x",
  "default-engines-hash": "${FAKE_HASH}",
  "node.js": "v24.22.1"
}`
const parsed = parsePrismaVersionOutput(fixture)
t("前导噪声 + JSON 正确解析出 hash/platform", parsed.hash === FAKE_HASH && parsed.platform === FAKE_PLATFORM)
t("附带 prisma 版本号", parsed.prisma === "6.19.2")
let threw = false
try { parsePrismaVersionOutput("not json at all") } catch { threw = true }
t("无 JSON 输入抛错", threw)
threw = false
try { parsePrismaVersionOutput('{"prisma":"6.19.2"}') } catch { threw = true }
t("缺 hash/platform 抛错", threw)

// ---------- ② prepareMirror 幂等跳过 ----------
console.log("② prepareMirror 幂等（全量预置 → 不触网）")
const { MIRROR_FILES } = { MIRROR_FILES: null } // 不可导出常量就用行为验证
// 预置全部六件（若实现仍尝试 curl 远端 all_commits/<假hash>/… 必 404/超时 → 抛错）
for (const f of ["schema-engine.gz", "schema-engine.gz.sha256", "schema-engine.sha256",
  "libquery_engine.so.node.gz", "libquery_engine.so.node.gz.sha256", "libquery_engine.so.node.sha256"]) {
  writeFileSync(join(FAKE_DIR, f), `fake-${f}`)
}
let prepared = null
try { prepared = prepareMirror({ hash: FAKE_HASH, platform: FAKE_PLATFORM }) } catch (e) { console.log("    异常：" + e.message) }
t("全量预置时零下载直接返回目录", prepared === FAKE_DIR)
// 空文件视为缺失：删掉一件置 0 字节 → 期望抛错（假 hash 远端不存在）
writeFileSync(join(FAKE_DIR, "schema-engine.sha256"), "")
let threw2 = false
try { prepareMirror({ hash: FAKE_HASH, platform: FAKE_PLATFORM }) } catch { threw2 = true }
t("0 字节残缺文件触发补下（假 hash 远端 404 → 抛错）", threw2)
writeFileSync(join(FAKE_DIR, "schema-engine.sha256"), "fake-schema-engine.sha256")

// ---------- ③ 静态服务 ----------
console.log("③ startMirrorServer（仅 127.0.0.1）")
const srv = await startMirrorServer()
const base = `http://127.0.0.1:${srv.port}`
const hit = await fetch(`${base}/all_commits/${FAKE_HASH}/${FAKE_PLATFORM}/schema-engine.gz`).then((r) => r.text())
t("正常路径命中并返回内容", hit === "fake-schema-engine.gz")
const miss = await fetch(`${base}/all_commits/${FAKE_HASH}/${FAKE_PLATFORM}/nope.bin`)
t("不存在文件 404", miss.status === 404)
const trav = await fetch(`${base}/all_commits/${FAKE_HASH}/%2e%2e/%2e%2e/%2e%2e/etc/passwd`)
t("路径穿越被挡（404 而非读穿）", trav.status === 404)
const trav2 = await fetch(`${base}/../../../../etc/passwd`)
t("裸 ../ 穿越 404", trav2.status === 404)
srv.close()

// ---------- ④ 清理 ----------
rmSync(FAKE_DIR, { recursive: true, force: true })
t("测试目录已清理", !existsSync(FAKE_DIR))

console.log(`━━━ test-prisma-mirror：${pass} 过 / ${fail} 挂 ━━━`)
process.exit(fail > 0 ? 1 : 0)
