// s4-citation-e2e.mjs —— S4 余项② 引用留痕 E2E（五相断言 + eval 同 run 双用）
// 流程：m01 同题同配置（无卡——本批与选题卡正交）全链 run →
//   相① artifacts.citations 键与四元组完整性
//   相② 三处一致（output / article.markdown / article.formatted 锚点集合）
//   相③ 悬空修复链（formatted 无悬空残留 + orphanRemoved 留痕字段在）
//   相④ 断言器红→绿实证（历史 done run 无 citations 键 → 断言器报红=键缺失检测有效）
//   相⑤ 步骤摘要含「引用留痕」（layout 步三种口径都含该词）
// → /api/eval 评分（宽门 7.88）+ 锚点可解析率 100%。
// 用法：bash scripts/with-server.sh "node scripts/tmp/s4-citation-e2e.mjs"
// 管线类断言串行收尾（S4 余项① retro：防多 run 自撞 429）。
const BASE = "http://localhost:3000"

const M01 = {
  title: "旗舰模型与轻量模型的差距正在拉大还是缩小",
  angle: "从推理成本与任务成功率两条曲线看分层定价背后的能力格局",
  persona: "cold-analyst",
  theme: "tech-modern",
}

let pass = 0
let fail = 0
function ok(name, extra = "") {
  pass++
  console.log(`  ✅ ${name}${extra ? `：${extra}` : ""}`)
}
function bad(name, extra = "") {
  fail++
  console.log(`  ❌ ${name}${extra ? `：${extra}` : ""}`)
}

// 断言器（与 src/lib/content/citations.ts 同口径重算：fence 外 \[\d{1,2}\]）
function anchorsOf(md) {
  const counts = new Map()
  let inFence = false
  for (const raw of String(md).split("\n")) {
    const line = raw.trimEnd()
    if (/^```/.test(line.trim())) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const m of line.matchAll(/\[(\d{1,2})\]/g)) {
      const n = Number(m[1])
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }
  }
  return counts
}
function sameCounts(a, b) {
  if (a.size !== b.size) return false
  for (const [k, v] of a) if (b.get(k) !== v) return false
  return true
}

// ---------- 相④前置：断言器红证（历史 run 无 citations 键 → 报红=检测有效） ----------
console.log("━━ S4 引用留痕 E2E（五相 + eval，一 run 双用） ━━")
const history = await fetch(`${BASE}/api/runs?limit=50`).then((r) => r.json()).then((j) => j.runs ?? j.items ?? []).catch(() => [])
const oldDone = history.find((r) => r.status === "done" && !JSON.parse(r.artifacts || "{}").citations)
if (oldDone) {
  const noKey = JSON.parse(oldDone.artifacts || "{}").citations === undefined
  noKey ? ok("相④ 断言器红证：历史 run 无 citations 键（键缺失检测有效）", oldDone.id.slice(-8)) : bad("相④ 历史 run 竟有 citations 键（红证失效）")
} else {
  console.log("  ⏭ 相④ 跳过：无历史 done run 可作红证（db 已清）")
}

// ---------- 创建 run（管线类断言串行：全脚本只此一个全链 run） ----------
// 只读复验模式：S4_CITE_RUN_ID=<runId> 跳过创建与评分，直接复验断言相（省配额）
const REUSE = process.env.S4_CITE_RUN_ID
let created = { id: REUSE }
let SKIP_EVAL = false
if (!REUSE) {
  const res = await fetch(`${BASE}/api/runs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ideaTitle: M01.title, ideaAngle: M01.angle, persona: M01.persona, theme: M01.theme }),
  }).then((r) => r.json())
  if (!res.id) {
    console.error("❌ run 创建失败", res.error ?? "")
    process.exit(1)
  }
  created = res
} else {
  SKIP_EVAL = true
  console.log(`  只读复验模式：run=${REUSE}`)
}
console.log(`  run=${created.id}`)

let run = null
const t0 = Date.now()
while (Date.now() - t0 < 480_000) {
  await new Promise((r) => setTimeout(r, 6000))
  run = await fetch(`${BASE}/api/runs/${created.id}`).then((r) => r.json()).then((j) => j.run)
  if (run && ["done", "error", "blocked"].includes(run.status)) break
}
if (run?.status !== "done") {
  console.error(`❌ 终态 ${run?.status}：${run?.error ?? ""}`)
  process.exit(1)
}
if (!REUSE) console.log(`  终态 done（${((Date.now() - t0) / 1000) | 0}s）`)

const arts = JSON.parse(run.artifacts || "{}")
const steps = JSON.parse(run.steps || "[]")
const articles = run.articles ?? []
const latest = articles[articles.length - 1] ?? null

// ---------- 相① citations 键与四元组 ----------
const cit = arts.citations
if (!cit) {
  bad("相① artifacts.citations 键存在")
  process.exit(1)
}
ok("相① artifacts.citations 键存在")
const srcs = cit.sources ?? []
const quadOk = srcs.every((s) => typeof s.idx === "number" && typeof s.citedCount === "number" && "sourceSite" in s && "sourceTitle" in s && "sourceDate" in s && "sourceUrl" in s)
const countsOk = typeof cit.total === "number" && typeof cit.verified === "number" && typeof cit.cited === "number" && typeof cit.orphanRemoved === "number"
quadOk && countsOk ? ok("相① sources 四元组+citedCount 字段完整", `${srcs.length} 条（total=${cit.total} verified=${cit.verified} cited=${cit.cited} orphanRemoved=${cit.orphanRemoved}）`) : bad("相① 字段不完整")

// ---------- 相⑤ 步骤摘要 ----------
const layoutDetail = (steps.find((s) => s.name === "layout" || /排版/.test(String(s.label))) ?? {}).detail ?? ""
layoutDetail.includes("引用留痕") ? ok("相⑤ layout 步摘要含「引用留痕」", layoutDetail.slice(-90)) : bad("相⑤ 摘要缺引用留痕口径", layoutDetail.slice(-90))

// ---------- 相② 三处一致（IN2） ----------
const outAnchors = anchorsOf(run.output ?? "")
if (latest && latest.markdown != null) {
  const mdAnchors = anchorsOf(latest.markdown)
  sameCounts(outAnchors, mdAnchors)
    ? ok("相② output 与 article.markdown 锚点集合一致（次数级）", `${outAnchors.size} 个编号`)
    : bad("相② output vs markdown 锚点不一致", `${[...outAnchors]} vs ${[...mdAnchors]}`)
} else {
  bad("相② article.markdown 不可得")
}
if (latest && latest.formatted) {
  // 正文锚点（参考来源标题之前；AIGC 文案含「参考来源核对」——用标题闭合形态切分）
  const cut = latest.formatted.indexOf("参考来源</span>")
  const bodyPart = cut > 0 ? latest.formatted.slice(0, cut) : latest.formatted
  const htmlAnchorNums = [...bodyPart.matchAll(/<span leaf="">\[(\d{1,2})\]<\/span>/g)].map((m) => Number(m[1]))
  const verifiedSet = new Set(srcs.filter((s) => s.verified).map((s) => s.idx))
  const N = srcs.length
  const claimsInHtml = htmlAnchorNums.filter((n) => n <= N)
  const mdNums = [...outAnchors.keys()]
  const setEq = claimsInHtml.length === mdNums.reduce((acc, n) => acc + outAnchors.get(n), 0) && mdNums.every((n) => claimsInHtml.filter((x) => x === n).length === outAnchors.get(n))
  setEq ? ok("相② formatted 正文锚点与 output 一致（次数级，链接编号 >N 除外）", `html=${htmlAnchorNums.length}（claims ${claimsInHtml.length} + 链接 ${htmlAnchorNums.length - claimsInHtml.length}）`) : bad("相② formatted 锚点与 output 不一致", `html=[${htmlAnchorNums}] md={${[...outAnchors]}}`)
  // ---------- 相③ 悬空修复链（修正后无悬空残留） ----------
  const dangling = htmlAnchorNums.filter((n) => n <= N && !verifiedSet.has(n))
  dangling.length === 0 ? ok("相③ formatted 无悬空锚残留（≤N 编号全部可解析）") : bad("相③ formatted 悬空锚残留", `[${dangling}]`)
} else {
  bad("相②/③ article.formatted 不可得")
}
typeof cit.orphanRemoved === "number" ? ok("相③ orphanRemoved 留痕字段在", `${cit.orphanRemoved} 个（0=全绿路径）`) : bad("相③ orphanRemoved 缺失")

// ---------- 锚点可解析率（eval 前置度量） ----------
const outAnchorsArr = [...outAnchors.keys()]
const verifiedSet2 = new Set(srcs.filter((s) => s.verified).map((s) => s.idx))
const resolvable = outAnchorsArr.filter((n) => verifiedSet2.has(n)).length
const resRate = outAnchorsArr.length > 0 ? resolvable / outAnchorsArr.length : 1
console.log(`  📊 锚点可解析率 ${resRate * 100}%（${resolvable}/${outAnchorsArr.length} 编号）｜引用率 ${cit.total > 0 ? Math.round((cit.cited / cit.total) * 100) : 0}%（${cit.cited}/${cit.total} 来源被引）`)

// ---------- eval（同 run 双用，不另烧管线配额；只读复验模式跳过） ----------
if (SKIP_EVAL) {
  console.log("  ⏭ eval 跳过（只读复验模式）")
  const e2ePassR = fail === 0 && resRate === 1
  console.log(`\n━━━ E2E 复验：${pass} 通过 / ${fail} 失败｜可解析率 ${(resRate * 100).toFixed(0)}% ━━━`)
  process.exit(e2ePassR ? 0 : 1)
}
const score = async (attempt = 1) => {
  const res = await fetch(`${BASE}/api/eval`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "score", runId: created.id }),
  })
  const json = await res.json()
  if (!res.ok) {
    if (/429|too many|timeout/i.test(String(json.error)) && attempt < 3) {
      console.log(`  ⏳ 评分限流，等 90s 重试（第 ${attempt} 次）…`)
      await new Promise((r) => setTimeout(r, 90_000))
      return score(attempt + 1)
    }
    throw new Error(json.error)
  }
  return json.result
}
const s = await score()
const dims = Object.entries(s.scores).map(([k, v]) => `${k}${v}`).join("/")
console.log(`  均分 ${s.average}（${dims}）｜${s.judge.crossFamily ? "跨家族" : "同家族"}裁判${s.gate.pass ? "｜门禁 PASS" : "｜门禁 FAIL"}`)
if (!s.gate.pass) s.gate.gaps.forEach((g) => console.log(`    ⚠️ ${g}`))

const PASS_LINE = 7.88
const evalPass = s.average >= PASS_LINE
const e2ePass = fail === 0 && resRate === 1
console.log(`\n━━━ E2E：${pass} 通过 / ${fail} 失败｜可解析率 ${(resRate * 100).toFixed(0)}%｜eval 均分 ${s.average}（宽门 ≥${PASS_LINE}：${evalPass ? "PASS" : "FAIL"}） ━━━`)
process.exit(e2ePass && evalPass ? 0 : 1)
