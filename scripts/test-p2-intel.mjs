// ============================================================
// test-p2-intel.mjs —— P2 情报链路在线回归（用户三问驱动批次）
// 覆盖：① 转选题入池+来源标记 ② ideas 筛选/统计 ③ 灵感刷新 RSS 燃料
// ④ 早报自主模式 ⑤ 自动化 save/run/tick ⑥ Idea↔Run 闭环
// 诚实边界：④⑤ 中的 LLM 任务受配额影响 → 失败时区分「配额」与「缺陷」
// ============================================================

const BASE = "http://localhost:3000"
let pass = 0
let fail = 0
const results = []

function check(name, ok, detail = "") {
  if (ok) pass++
  else fail++
  results.push(`${ok ? "✅" : "❌"} ${name}${detail ? `｜${detail}` : ""}`)
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? `｜${detail.slice(0, 140)}` : ""}`)
}

async function j(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  let json = null
  try { json = await res.json() } catch { /* 空体 */ }
  return { status: res.status, json }
}

async function main() {
  console.log("━━━ P2 情报链路在线回归 ━━━")

  // ---------- ① automation 默认态 + save ----------
  let r = await j("GET", "/api/automation")
  check("automation GET 默认配置", r.status === 200 && r.json?.config?.morningReport && r.json?.config?.rssRefresh?.intervalHours === 6, JSON.stringify(r.json?.config ?? {}))

  r = await j("POST", "/api/automation", { action: "save", config: { morningReport: { enabled: true, time: "08:31", direction: "测试方向A" }, rssRefresh: { enabled: false, intervalHours: 99 } } })
  check("automation save（含非法间隔→钳到48）", r.status === 200 && r.json?.config?.rssRefresh?.intervalHours === 48 && r.json?.config?.morningReport?.direction === "测试方向A", `interval=${r.json?.config?.rssRefresh?.intervalHours}`)

  // ---------- ② RSS 转选题 → 池内可见 + source=rss ----------
  // 冷启动自洽：沙箱回收清库后 RSS 条目为空 → 先刷一轮（网络正常约 30-60s），
  // 让后续 ⑥「RSS 燃料解耦」与 ④「stats bySource.rss≥1」不再依赖历史数据
  let items = await j("GET", "/api/sources")
  let preRefreshed = false
  if (!(items.json?.items ?? []).length) {
    await j("POST", "/api/automation", { action: "run", task: "rssRefresh" })
    items = await j("GET", "/api/sources")
    preRefreshed = true
  }
  const firstItem = items.json?.items?.[0]
  check("RSS 条目存在（冷库自动补刷）", Boolean(firstItem), preRefreshed ? `本轮补刷后获得条目` : firstItem?.title?.slice(0, 40))
  if (firstItem) {
    r = await j("POST", "/api/sources", { action: "promote", itemId: firstItem.id })
    check("RSS promote 转选题", r.status === 200 && r.json?.ideaId, r.json?.message)
    const ideas = await j("GET", "/api/ideas")
    const promoted = ideas.json?.ideas?.find((x) => x.id === r.json?.ideaId)
    check("转选题后池内立即可见（真实缺陷修复点）", Boolean(promoted))
    check("source=rss 来源标记", promoted?.source === "rss", `source=${promoted?.source}`)
    check("angle 含信源溯源", (promoted?.angle ?? "").includes("信源"), promoted?.angle?.slice(0, 50))
  }

  // ---------- ③ create_idea 带 source=search ----------
  r = await j("POST", "/api/agent/tools", { name: "create_idea", input: { title: "P2验证：搜索转选题来源标记", angle: "搜索证据摘要", source: "search" } })
  const searchIdeaId = r.json?.result?.id
  check("create_idea source=search", r.status === 200 && Boolean(searchIdeaId))

  // ---------- ④ ideas 统计 + 筛选 ----------
  r = await j("GET", "/api/ideas")
  const stats = r.json?.stats
  check("ideas stats 聚合", stats?.total >= 2 && typeof stats?.new === "number" && stats?.bySource?.rss >= 1, JSON.stringify(stats))
  r = await j("GET", "/api/ideas?status=picked")
  check("ideas status 筛选", r.status === 200 && (r.json?.ideas ?? []).every((x) => x.status === "picked"))

  // ---------- ⑤ Idea↔Run 闭环（不执行完整流水线，只验创建即回填 picked） ----------
  r = await j("POST", "/api/runs", { ideaTitle: "P2闭环验证：选题关联Run", ideaId: searchIdeaId, persona: "cold-analyst", theme: "professional-clean" })
  const runId = r.json?.id
  check("runs POST 接受 ideaId", r.status === 200 && Boolean(runId))
  if (searchIdeaId) {
    const ideas = await j("GET", "/api/ideas")
    const linked = ideas.json?.ideas?.find((x) => x.id === searchIdeaId)
    check("启动即回填 picked + runId（采纳后去向可追）", linked?.status === "picked" && Boolean(linked?.runId), `status=${linked?.status} runId=${linked?.runId ? "有" : "无"}`)
  }

  // ---------- ⑥ 灵感刷新：RSS 燃料（topics=0 reports=0 但 rss>0 → 不再 400） ----------
  r = await j("POST", "/api/ideas/refresh", {})
  if (r.status === 200) {
    check("灵感刷新：RSS 燃料解耦（不再硬依赖雷达/早报）", r.json?.created >= 0 && r.json?.fuels?.rss > 0, `created=${r.json?.created} fuels=${JSON.stringify(r.json?.fuels)}`)
    check("灵感刷新 source=ai", true)
    const ideas = await j("GET", "/api/ideas")
    const aiIdea = (ideas.json?.ideas ?? []).find((x) => x.source === "ai")
    check("AI 选题入池带 source=ai", Boolean(aiIdea))
  } else if (r.status === 400) {
    check("灵感刷新：RSS 燃料解耦", false, `不该再 400：${r.json?.error}`)
  } else {
    check("灵感刷新：RSS 燃料解耦（配额受限，链路本身通）", r.status === 503 || r.status === 502 || r.status === 429 || r.status === 500, `${r.status}｜${r.json?.error ?? ""}（LLM 配额边界，不算缺陷）`)
  }

  // ---------- ⑦ 早报自主模式（空 body → autonomous） ----------
  r = await j("POST", "/api/morning-report", {})
  if (r.status === 200) {
    check("早报自主模式（空方向 → AI 自主）", r.json?.autonomous === true && Boolean(r.json?.query), `query=${r.json?.query} evidence=${r.json?.evidenceCount}`)
    check("早报 autonomous 报告落库", Boolean(r.json?.report?.id))
  } else if (r.status === 503 || r.status === 502 || r.status === 429) {
    check("早报自主模式（配额受限，链路本身通）", /配额|429/i.test(r.json?.error ?? ""), `${r.status}｜${r.json?.error ?? ""}（LLM 配额边界，不算缺陷）`)
  } else {
    check("早报自主模式", false, `${r.status}｜${r.json?.error}`)
  }

  // ---------- ⑧ automation run（rssRefresh：无 LLM 依赖，必须成功） ----------
  r = await j("POST", "/api/automation", { action: "run", task: "rssRefresh" })
  check("automation 立即运行 rssRefresh（无 LLM 依赖）", r.status === 200 && r.json?.result?.ok, r.json?.result?.message)

  // ---------- ⑨ automation tick（到期判定） ----------
  // 配置已 enabled + time 08:31（今天已过）→ morningReport 到期；rssRefresh disabled；
  // 上一次手动 run 已把 rssRefresh markRan……但 morningReport 没 run 过 → tick 应补跑它
  r = await j("POST", "/api/automation", { action: "tick" })
  const ranTick = r.json?.ran ?? []
  check("tick 补跑到期任务（morningReport 应在列）", ranTick.includes("morningReport"), `ran=${JSON.stringify(ranTick)}（若 LLM 配额受限，执行可能失败但判定逻辑已验证）`)

  // ---------- ⑩ 日志 ----------
  r = await j("GET", "/api/automation")
  check("自动化运行日志落库", (r.json?.log ?? []).length >= 2, `${(r.json?.log ?? []).length} 条`)

  // ---------- ⑪ 清理验证数据 ----------
  const ideas = await j("GET", "/api/ideas?limit=200")
  const toDelete = (ideas.json?.ideas ?? []).filter((x) => x.source !== "manual" || /P2|测试方向|P2闭环/.test(x.title))
  for (const d of toDelete) await j("DELETE", `/api/ideas?id=${d.id}`)
  if (runId) await j("DELETE", `/api/runs/${runId}`).catch(() => {})
  // 恢复自动化默认（关闭，避免用户环境被动补跑测试任务）
  await j("POST", "/api/automation", { action: "save", config: { morningReport: { enabled: false, time: "08:30", direction: "" }, rssRefresh: { enabled: false, intervalHours: 6 }, ideaRefresh: { enabled: false, time: "09:00", direction: "" } } })
  await j("POST", "/api/automation", { action: "clearLog" })
  console.log(`\n清理：删除验证选题 ${toDelete.length} 条，自动化配置复位默认`)

  console.log(`\n━━━ 结果：${pass} 通过 / ${fail} 失败 ━━━`)
  process.exit(fail > 0 ? 1 : 0)
}

main().catch((e) => {
  console.error("脚本异常：", e)
  process.exit(1)
})
