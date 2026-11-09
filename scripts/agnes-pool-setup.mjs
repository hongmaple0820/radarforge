// agnes-pool-setup.mjs —— Agnes 账号池配置 + 逐账号探活（密钥零落盘版）
// 密钥来源：环境变量 AGNES_KEYS（逗号分隔），仅写入 db/custom.db SettingKV（已 gitignore）
// 常驻基础设施（2026-11-09 由 scripts/tmp/ 晋升，S4 密钥重灌向导的 server 腿；溯源见 ADR-0004/0008）
// 直跑：AGNES_KEYS="sk-...,sk-..." bash scripts/with-server.sh "node scripts/agnes-pool-setup.mjs"
// 推荐：AGNES_KEYS="sk-...,sk-..." bash scripts/agnes-key-wizard.sh（向导含输入校验/脱敏预览/探活汇总）
// 输出全程脱敏：仅显示前 6 位 + 长度
const BASE = "http://localhost:3000"

const mask = (k) => (k ? `${k.slice(0, 6)}…${k.slice(-4)}（${k.length} 字符）` : "（空）")

let pass = 0
let fail = 0
const ok = (name, extra = "") => {
  pass++
  console.log(`  ✓ ${name}${extra ? `（${extra}）` : ""}`)
}
const bad = (name, extra = "") => {
  fail++
  console.log(`  ✗ ${name}${extra ? ` → ${extra}` : ""}`)
}

async function putJson(url, body, tries = 6) {
  let lastErr = ""
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const text = await res.text()
      try {
        return { status: res.status, json: JSON.parse(text) }
      } catch {
        lastErr = `HTTP ${res.status} 非 JSON（${text.slice(0, 100) || "空响应"}）`
      }
    } catch (e) {
      lastErr = e.message
    }
    // 首次编译/瞬时故障 → 退避重试
    await new Promise((r) => setTimeout(r, 4000 * (i + 1)))
  }
  return { status: 0, json: null, error: lastErr }
}

async function main() {
  const raw = process.env.AGNES_KEYS ?? ""
  const keys = raw.split(",").map((s) => s.trim()).filter((s) => s.startsWith("sk-"))
  if (keys.length === 0) {
    console.error("AGNES_KEYS 环境变量缺失或格式不对（需逗号分隔的 sk- 密钥）")
    process.exit(1)
  }
  console.log(`━━ Agnes 账号池配置：${keys.length} 个密钥（脱敏显示） ━━`)
  keys.forEach((k, i) => console.log(`  · key-${i + 1}: ${mask(k)}`))

  // ① 写入账号池（SettingKV → db/custom.db，不入 git）
  console.log("\n━━ ① 写入账号池 ━━")
  const accounts = keys.map((k, i) => ({
    id: `agnes-${String(i + 1).padStart(2, "0")}`,
    label: `Agnes 账号 ${i + 1}`,
    site: "cn",
    baseUrl: "",
    apiKey: k,
    enabled: true,
  }))
  const savedR = await putJson(`${BASE}/api/settings`, { scope: "agnes", value: { enabled: true, accounts } })
  const saved = savedR.json
  if (saved?.message) ok("账号池保存", String(saved.message))
  else bad("账号池保存失败", savedR.error ?? JSON.stringify(saved).slice(0, 120))

  // 保存后回读（脱敏态）确认落库
  const fresh = await fetch(`${BASE}/api/settings`, { method: "GET" }).then((x) => x.json())
  const agnesRedacted = fresh?.settings?.agnes ?? fresh?.agnes
  const accCount = agnesRedacted?.accounts?.length ?? 0
  if (accCount === keys.length) {
    ok("落库回读一致", `accounts=${accCount} enabled=${agnesRedacted?.enabled} strategy=${agnesRedacted?.strategy}`)
  } else {
    bad("落库回读不一致", `accounts=${accCount}（期望 ${keys.length}）`)
  }

  // ② 池状态透出（GET /api/video-runs → agnesPool）
  console.log("\n━━ ② 池状态透出 ━━")
  const vr = await fetch(`${BASE}/api/video-runs`).then((x) => x.json())
  const pool = vr?.agnesPool
  if (pool?.configured) {
    ok("agnesPool.configured=true", `accounts=${pool.accounts} strategy=${pool.strategy} imageCapacity=${pool.imageCapacity}RPM videoReady=${pool.videoReady}`)
  } else {
    bad("agnesPool 未配置", JSON.stringify(pool ?? vr?.error).slice(0, 120))
  }

  // ③ 逐账号探活（GET /models 零成本，不花生成额度）
  console.log("\n━━ ③ 逐账号探活（GET /models 零成本） ━━")
  for (const a of accounts) {
    const probe = await fetch(`${BASE}/api/settings/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scope: "agnes", accountId: a.id }),
    }).then((x) => x.json())
    const line = `${a.id}：${probe.ok ? "有效" : "无效"}（${probe.latencyMs}ms）${probe.detail ? ` ${probe.detail}` : probe.error ? ` ${probe.error}` : ""}`
    if (probe.ok) ok(line)
    else bad(line)
  }

  // ④ 池整体 health（无 accountId → 汇总探活）
  console.log("\n━━ ④ 池整体 health ━━")
  const health = await fetch(`${BASE}/api/settings/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope: "agnes" }),
  }).then((x) => x.json())
  if (health.ok) ok("池 health 通过", `${health.latencyMs}ms ${health.detail ?? ""}`)
  else bad("池 health 未过", `${health.error ?? health.detail ?? ""}`)

  console.log(`\n━━ agnes-pool-setup：${pass} 通过 / ${fail} 失败 ━━`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error("异常：", e.message)
  process.exit(1)
})
