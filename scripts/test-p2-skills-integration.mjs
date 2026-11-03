// ============================================================
// test-p2-skills-integration.mjs —— P2-1 技能安装管理在线集成回归（需 dev server）
// 覆盖 q7 方案 3.3 验收要点：
//   ① 产品库 12 技能全量加载且全合规（官方规范重建的质量断言）
//   ② 从 URL 安装（本地回环 zip 服务）→ 立即出现在全量清单与 Agent 候选池
//   ③ zip 文件上传安装（multipart）→ 同上
//   ④ 详情抽屉数据：SKILL.md 全文 + 目录结构 + 合规报告
//   ⑤ 启停联动：停用 → 候选池消失 + run 启动被拒（API 纵深防御）；
//      启用 → 恢复
//   ⑥ 不合规技能：安装成功但显式标注错误（不静默跳过）
//   ⑦ 产品库同名冲突 → 拒绝安装（产品库优先语义）
//   ⑧ 卸载：用户技能可卸载、产品库拒绝、不存在报 404 语义
//   ⑨ 坏包（非 zip / 无 SKILL.md）→ 400 人话错误
// 收尾：清理用户位测试技能 + 复位 skills:disabled，不留脏状态
// 运行：bash scripts/with-server.sh "node scripts/test-p2-skills-integration.mjs"
// ============================================================

import { createServer } from "node:http"
import AdmZip from "adm-zip"
import { rm, readdir, mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import path from "node:path"

const BASE = "http://127.0.0.1:3000"
const USER_DIR = path.join(homedir(), ".radarforge", "skills")

let pass = 0
let fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.error(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

async function j(method, pathName, body) {
  const res = await fetch(`${BASE}${pathName}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* 非 JSON */ }
  return { status: res.status, json }
}

// ---------- fixture：构造技能 zip ----------

function makeSkillZip(entries) {
  const zip = new AdmZip()
  for (const [name, content] of entries) zip.addFile(name, Buffer.from(content))
  return zip.toBuffer()
}

const GOOD_SKILL_MD = `---
name: test-good-skill
description: 测试用合规技能，验证安装链路与候选池联动
license: MIT
---

# 测试技能

正文指令：这是一个用于回归测试的技能。
`

const BAD_SKILL_MD = `---
name: WrongName
description: d
---

正文
`

// ---------- 本地回环 zip 下载服务（测 URL 安装通道） ----------

async function startZipServer(routes) {
  const server = createServer((req, res) => {
    const route = routes[req.url]
    if (!route) {
      res.writeHead(404).end("not found")
      return
    }
    res.writeHead(200, { "Content-Type": "application/zip", "Content-Length": route.length })
    res.end(route)
  })
  await new Promise((r) => server.listen(0, "127.0.0.1", r))
  return { server, port: server.address().port }
}

// ---------- 清理助手 ----------

async function cleanupUserSkills(ids) {
  for (const id of ids) {
    await rm(path.join(USER_DIR, id), { recursive: true, force: true }).catch(() => {})
  }
}

async function main() {
  // 测试前清场（含上轮可能的残留）——先清再测基线，避免历史脏状态误报
  await cleanupUserSkills(["test-good-skill", "test-bad-skill", "test-upload-skill", "good-skill", "upload-skill"])

  console.log("━━ ① 产品库基线 ━━")
  {
    const { status, json: list } = await j("GET", "/api/skills")
    ok("GET /api/skills 200", status === 200)
    const product = (list.skills ?? []).filter((s) => s.source === "product")
    ok("产品库 12 技能", product.length === 12, `实际 ${product.length}`)
    ok("产品技能全部合规", product.every((s) => s.compliance.ok), product.filter((s) => !s.compliance.ok).map((s) => s.id).join(","))
    ok("全量清单带 disabled/合规字段", product.every((s) => typeof s.disabled === "boolean" && s.compliance !== undefined))
    const pool = await j("GET", "/api/agent/skills?force=1")
    ok("Agent 候选池含 12 技能（无用户位干扰）", (pool.json.skills ?? []).length === 12, `实际 ${(pool.json.skills ?? []).length}`)
  }

  console.log("━━ ② URL 安装（本地回环服务） ━━")
  const goodZip = makeSkillZip([["SKILL.md", GOOD_SKILL_MD], ["references/notes.md", "参考说明"]])
  const { server, port } = await startZipServer({ "/good.zip": goodZip })
  try {
    const { status, json: r } = await j("POST", "/api/skills", { action: "install-url", url: `http://127.0.0.1:${port}/good.zip` })
    ok("URL 安装 200", status === 200, JSON.stringify(r.message ?? ""))
    ok("安装报告：1 个且合规", r.ok === true && r.installed?.length === 1 && r.installed[0].compliance.ok === true, r.message)
    ok("根形态 id = SKILL.md 声明名（规范：name=目录名）", r.installed?.[0]?.id === "test-good-skill", `实际 ${r.installed?.[0]?.id}`)

    const list = await j("GET", "/api/skills")
    const installed = (list.json.skills ?? []).find((s) => s.id === "test-good-skill")
    ok("全量清单出现新技能（source=user）", installed?.source === "user" && installed?.compliance.ok === true)
    const pool = await j("GET", "/api/agent/skills?force=1")
    ok("Agent 候选池立即可用（验收要点：装完即可选用）", (pool.json.skills ?? []).some((s) => s.id === "test-good-skill"))

    // 下载失败路径
    const bad = await j("POST", "/api/skills", { action: "install-url", url: `http://127.0.0.1:${port}/missing.zip` })
    ok("404 URL → 人话错误", bad.status === 400 && /下载失败/.test(bad.json.message ?? ""), bad.json.message)
    const nonUrl = await j("POST", "/api/skills", { action: "install-url", url: "not-a-url" })
    ok("非 URL → 400", nonUrl.status === 400 && /http/.test(nonUrl.json.message ?? ""))
  } finally {
    server.close()
  }

  console.log("━━ ③ zip 上传安装（multipart） ━━")
  {
    // 子目录形态：目录名即 id（name 与目录名一致内建合规）
    const uploadZip = makeSkillZip([
      ["test-upload-skill/SKILL.md", GOOD_SKILL_MD.replace("test-good-skill", "test-upload-skill").replace("测试用合规技能，验证安装链路与候选池联动", "上传通道回归")],
    ])
    const form = new FormData()
    form.append("file", new Blob([uploadZip], { type: "application/zip" }), "upload-skill.zip")
    const res = await fetch(`${BASE}/api/skills/install`, { method: "POST", body: form })
    const r = await res.json()
    ok("上传安装 200 且合规", res.status === 200 && r.ok === true && r.installed[0].compliance.ok, r.message)
    ok("子目录形态 id = 目录名（非上传文件名）", r.installed?.[0]?.id === "test-upload-skill", `实际 ${r.installed?.[0]?.id}`)
    const list = await j("GET", "/api/skills")
    ok("上传技能入清单", (list.json.skills ?? []).some((s) => s.id === "test-upload-skill"))

    // 非 zip 坏包
    const form2 = new FormData()
    form2.append("file", new Blob([Buffer.from("这不是zip")], { type: "application/zip" }), "bad.zip")
    const res2 = await fetch(`${BASE}/api/skills/install`, { method: "POST", body: form2 })
    const r2 = await res2.json()
    ok("非 zip 坏包 → 400 人话错误", res2.status === 400 && /zip/.test(r2.message ?? ""), r2.message)

    // 无 SKILL.md 的 zip
    const noSkillZip = makeSkillZip([["README.md", "x"]])
    const form3 = new FormData()
    form3.append("file", new Blob([noSkillZip], { type: "application/zip" }), "noskill.zip")
    const res3 = await fetch(`${BASE}/api/skills/install`, { method: "POST", body: form3 })
    const r3 = await res3.json()
    ok("无 SKILL.md → 400 指向性提示", res3.status === 400 && /SKILL\.md/.test(r3.message ?? ""), r3.message)
  }

  console.log("━━ ④ 详情抽屉数据 ━━")
  {
    const { status, json: d } = await j("GET", `/api/skills/detail?id=test-good-skill`)
    ok("详情 200", status === 200)
    ok("SKILL.md 全文返回", typeof d.skill?.raw === "string" && d.skill.raw.includes("测试技能"))
    ok("目录结构含 references/", (d.skill?.tree ?? []).some((f) => f.path === "references/notes.md"))
    ok("合规报告返回", d.skill?.compliance?.ok === true)
    ok("来源判定 user", d.skill?.source === "user")
    const missing = await j("GET", "/api/skills/detail?id=no-such-skill")
    ok("不存在 → 404", missing.status === 404)
    const product = await j("GET", "/api/skills/detail?id=wewrite-brief")
    ok("产品库技能详情可读", product.status === 200 && product.json.skill.source === "product")
  }

  console.log("━━ ⑤ 启停联动 ━━")
  {
    const t = await j("POST", "/api/skills", { action: "toggle", id: "test-good-skill", disabled: true })
    ok("停用 200", t.status === 200 && t.json.ok === true, t.json.message)
    const pool = await j("GET", "/api/agent/skills?force=1")
    ok("停用后候选池移除（验收要点）", !(pool.json.skills ?? []).some((s) => s.id === "test-good-skill"))
    const list = await j("GET", "/api/skills")
    ok("全量清单仍可见且带停用标记（文件保留）", (list.json.skills ?? []).some((s) => s.id === "test-good-skill" && s.disabled === true))
    const run = await j("POST", "/api/agent/runs", { skillId: "test-good-skill", input: "测试" })
    ok("run 启动被拒（API 纵深防御）", run.status === 400 && /停用/.test(run.json.error ?? ""), run.json.error)

    const ghost = await j("POST", "/api/skills", { action: "toggle", id: "ghost-skill-xyz", disabled: true })
    ok("幽灵 id 启停 → 404（不写死状态）", ghost.status === 404, ghost.json.message)

    const e = await j("POST", "/api/skills", { action: "toggle", id: "test-good-skill", disabled: false })
    ok("再启用 200", e.status === 200)
    const pool2 = await j("GET", "/api/agent/skills?force=1")
    ok("启用后候选池恢复", (pool2.json.skills ?? []).some((s) => s.id === "test-good-skill"))
  }

  console.log("━━ ⑥ 不合规技能显式标注 ━━")
  {
    const badZip = makeSkillZip([["test-bad-skill/SKILL.md", BAD_SKILL_MD]])
    const form = new FormData()
    form.append("file", new Blob([badZip], { type: "application/zip" }), "bad-skill.zip")
    const res = await fetch(`${BASE}/api/skills/install`, { method: "POST", body: form })
    const r = await res.json()
    ok("不合规技能照样安装（ok=true）", res.status === 200 && r.ok === true, r.message)
    const inst = r.installed?.[0]
    ok("合规错误显式返回（name 大写 + 与目录名不一致）", inst?.compliance?.ok === false && inst.compliance.errors.some((e) => e.rule === "name.pattern") && inst.compliance.errors.some((e) => e.rule === "name.matches-dir"), JSON.stringify(inst?.compliance?.errors?.map((e) => e.rule)))
    const list = await j("GET", "/api/skills")
    const card = (list.json.skills ?? []).find((s) => s.id === "test-bad-skill")
    ok("清单带不合规徽标数据", card?.compliance?.ok === false)
    const d = await j("GET", "/api/skills/detail?id=test-bad-skill")
    ok("详情列出错误明细", d.status === 200 && (d.json.skill.compliance.errors ?? []).length >= 2)
  }

  console.log("━━ ⑦ 产品库同名冲突 ━━")
  {
    const conflictZip = makeSkillZip([["wewrite-brief/SKILL.md", GOOD_SKILL_MD]])
    const form = new FormData()
    form.append("file", new Blob([conflictZip], { type: "application/zip" }), "conflict.zip")
    const res = await fetch(`${BASE}/api/skills/install`, { method: "POST", body: form })
    const r = await res.json()
    ok("产品库同名 → 409 拒绝且人话提示", res.status === 409 && r.ok === false && /产品库/.test(r.message ?? ""), r.message)
  }

  console.log("━━ ⑧ 卸载 ━━")
  {
    const u = await j("POST", "/api/skills", { action: "uninstall", id: "test-good-skill" })
    ok("卸载用户技能 200", u.status === 200 && u.json.ok === true, u.json.message)
    const list = await j("GET", "/api/skills")
    ok("卸载后清单移除", !(list.json.skills ?? []).some((s) => s.id === "test-good-skill"))
    const p = await j("POST", "/api/skills", { action: "uninstall", id: "wewrite-brief" })
    ok("卸载产品库技能 → 400 拒绝", p.status === 400 && /产品库/.test(p.json.message ?? ""), p.json.message)
    const n = await j("POST", "/api/skills", { action: "uninstall", id: "ghost-skill-xyz" })
    ok("卸载不存在 → 400", n.status === 400)
  }

  console.log("━━ ⑨ 收尾清场 ━━")
  {
    await cleanupUserSkills(["test-bad-skill", "test-upload-skill", "test-good-skill", "good-skill", "upload-skill"])
    // 复位 skills:disabled（toggle 反向操作即可清干净）
    for (const id of ["test-good-skill", "test-bad-skill", "test-upload-skill"]) {
      await j("POST", "/api/skills", { action: "toggle", id, disabled: false })
    }
    const list = await j("GET", "/api/skills")
    const users = (list.json.skills ?? []).filter((s) => s.source === "user")
    ok("用户位测试技能清理干净", users.length === 0, users.map((s) => s.id).join(","))
    ok("停用集复位（disabled=0）", list.json.disabled === 0, `实际 ${list.json.disabled}`)
    const pool = await j("GET", "/api/agent/skills?force=1")
    ok("候选池回到 12 技能", (pool.json.skills ?? []).length === 12)
    // 文件系统直接核对
    const entries = await readdir(USER_DIR).catch(() => [])
    ok("用户目录无残留", entries.filter((e) => e.startsWith("test-") || e === "good-skill" || e === "upload-skill").length === 0, entries.join(","))
  }

  console.log(`\n━━ test-p2-skills-integration：${pass} 通过 / ${fail} 失败 ━━`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error("测试执行异常：", e)
  process.exit(1)
})
