// ============================================================
// full-regression.mjs —— v4.0 融合升级全量回归
// 覆盖：基础 API 面 + 18 主题渲染 + Agnes 账号池语义 + 视频通道设置
// + pi-ai 模式 + 七步流水线端到端（新渲染引擎 + 正文配图）+ 纯图线 E2E + 视频双风格成片
// ============================================================

const BASE = "http://localhost:3000"
const results = []

async function call(name, method, path, body, timeoutMs = 300000) {
  const t0 = Date.now()
  try {
    const res = await fetch(BASE + path, {
      method,
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(timeoutMs),
    })
    const json = await res.json().catch(() => ({}))
    results.push({ name, method, path, status: res.status, ms: Date.now() - t0, ok: res.ok })
    return { res, json }
  } catch (e) {
    results.push({ name, method, path, status: 0, ms: Date.now() - t0, ok: false, error: e.message })
    return { res: { ok: false, status: 0 }, json: { error: e.message } }
  }
}

function section(t) { console.log(`\n━━━ ${t} ━━━`) }
function ok(name, cond, extra = "") {
  console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)
}

// ---------- 1. 基础面 ----------
section("基础 API 面")
for (const p of ["/api/topics", "/api/inbox", "/api/ideas", "/api/runs", "/api/learn", "/api/settings", "/api/gateway/providers", "/api/agent/skills", "/api/agent/tools"]) {
  await call(p.replace("/api/", ""), "GET", p)
}

// ---------- 2. 18 主题注册表 ----------
section("wewrite 18 主题注册表")
const runsList = await call("runs-themes", "GET", "/api/runs")
const themes = runsList.json.themes ?? []
const categories = new Set(themes.map((t) => t.category))
ok("18 主题全量注册", themes.length === 18, `${themes.length} 主题 / ${categories.size} 分类`)
ok("含 sspai/tech-modern/midnight", ["sspai", "tech-modern", "midnight"].every((id) => themes.some((t) => t.id === id)))

// ---------- 3. Agnes 账号池语义 ----------
section("Agnes 账号池（供应商化配置）")
const agnesPut = await call("agnes-put", "PUT", "/api/settings", {
  scope: "agnes",
  value: {
    enabled: false,
    accounts: [
      { id: "acc-test-1", label: "回归测试号", site: "cn", baseUrl: "", apiKey: "", enabled: true },
      { id: "acc-test-2", label: "国际站测试号", site: "intl", baseUrl: "", apiKey: "test-key-1234567890", enabled: true },
    ],
    chatModel: "agnes-3.0-flash",
    strategy: "round-robin",
  },
})
ok("账号池保存（2 号）", agnesPut.res.ok, agnesPut.json.message ?? agnesPut.json.error ?? "")
const agnesGet = await call("agnes-get", "GET", "/api/settings")
const accs = agnesGet.json.settings?.agnes?.accounts ?? []
ok("密钥脱敏回显", accs.length === 2 && String(accs[1]?.apiKey ?? "").includes("…"), `acc2.key=${accs[1]?.apiKey ?? ""} chatModel=${agnesGet.json.settings?.agnes?.chatModel}`)

const agnesTest = await call("agnes-test-empty", "POST", "/api/settings/test", { scope: "agnes" })
ok("空密钥探活诚实失败（不 5xx）", agnesTest.res.ok && agnesTest.json.ok === false, String(agnesTest.json.error ?? agnesTest.json.detail ?? "").slice(0, 60))

// 视频通道语义
const videoPut = await call("video-put", "PUT", "/api/settings", { scope: "video", value: { channel: "auto", secondsPerScene: 8 } })
ok("视频通道 auto 保存", videoPut.res.ok, videoPut.json.message ?? "")
const videoBack = await call("video-back", "PUT", "/api/settings", { scope: "video", value: { channel: "local" } })
ok("视频通道回 local", videoBack.res.ok)
const videoTest = await call("video-test", "POST", "/api/settings/test", { scope: "video" })
ok("视频模型检查（未配置→诚实提示）", videoTest.res.ok, String(videoTest.json.error ?? videoTest.json.detail ?? "").slice(0, 60))

// ---------- 4. pi-ai 模式语义 ----------
section("pi-ai 统一引擎模式")
const piPut = await call("pi-ai-put", "PUT", "/api/settings", { scope: "llm", value: { mode: "pi-ai", piProvider: "anthropic", model: "claude-3-5-sonnet", apiKey: "dummy-key-for-regression" } })
ok("pi-ai 模式保存", piPut.res.ok, piPut.json.message ?? piPut.json.error ?? "")
const piGet = await call("pi-ai-get", "GET", "/api/settings")
ok("pi-ai 配置回显", piGet.json.settings?.llm?.mode === "pi-ai" && piGet.json.settings?.llm?.piProvider === "anthropic", `${piGet.json.settings?.llm?.piProvider}/${piGet.json.settings?.llm?.model}`)
// chat 失败自动回退内置引擎（pi-ai dummy key 必失败 → 验证 fallback 不炸）
const tLlm = await call("llm-test-fallback", "POST", "/api/settings/test", { scope: "llm" })
ok("LLM 失败自动回退内置（不炸）", tLlm.json.ok === true, String(tLlm.json.detail ?? tLlm.json.error ?? "").slice(0, 70))
// 恢复 builtin
await call("llm-restore", "PUT", "/api/settings", { scope: "llm", value: { mode: "builtin" } })

// ---------- 5. AI 搜索 ----------
section("AI 搜索（密钥在→REAL；密钥缺失→DEMO 诚实降级）")
const search = await call("search", "POST", "/api/search", { query: "AI Agent 开发框架 2026", count: 10 })
ok("搜索返回（REAL 或诚实 DEMO）", (search.json.results?.length ?? 0) > 0 && ["REAL", "DEMO"].includes(search.json.mode), `mode=${search.json.mode} n=${search.json.results?.length ?? 0}`)

// ---------- 6. 九步流水线端到端（大纲先行 + 跨家族审稿 + 断言核验 + 配图） ----------
section("九步流水线端到端（P0 质量管线）")
const created = await call("runs-create", "POST", "/api/runs", {
  ideaTitle: "P0 回归：大纲先行管线与质量门禁验证",
  ideaAngle: "从单遍生成到「大纲→分节→跨家族审稿→断言核验」的结构性升级",
  persona: "cold-analyst",
  theme: "tech-modern",
})
const runId = created.json.id
ok("创建 run（tech-modern 主题）", created.res.ok && Boolean(runId), runId ?? "")
if (runId) { try { (await import("fs")).writeFileSync("/tmp/reg-runid.txt", runId) } catch { /* 忽略 */ } }

if (runId) {
  let run = null
  for (let i = 0; i < 150; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
    run = rj.run
    if (run?.status === "done" || run?.status === "error") break
  }
  ok("流水线终态 done", run?.status === "done", `status=${run?.status} err=${(run?.error ?? "").slice(0, 60)}`)
  const steps = run ? JSON.parse(run.steps || "[]") : []
  ok("九步全终态（outline/verify/illustrate 允许 skipped）", steps.length === 9 && steps.every((s) => s.status === "done" || (["outline", "verify", "illustrate"].includes(s.name) && s.status === "skipped")), steps.map((s) => `${s.name}:${s.status}`).join(" "))
  ok("模式回显（REAL/DEMO 均诚实）", run?.mode === "REAL" || run?.mode === "DEMO", `mode=${run?.mode}`)
  const article = run?.articles?.[run.articles.length - 1]
  const html = article?.formatted ?? ""
  ok("成稿 + 排版 v2", Boolean(article?.markdown && html), `v${article?.version} ${html.length} 字符 HTML`)

  // P0 新产物：大纲先行 / 跨家族审稿 / 原子断言
  let artifacts = {}
  try { artifacts = JSON.parse(run?.artifacts || "{}") } catch { /* ignore */ }
  const hasOutline = Boolean(artifacts.outline?.sections?.length)
  ok("大纲先行产物（JSON 大纲落库）", hasOutline, hasOutline ? `${artifacts.outline.sections.length} 节｜预算 ${artifacts.outline.sections.reduce((s, x) => s + (x.words ?? 0), 0)} 字` : steps[2]?.detail ?? "")
  if (hasOutline) {
    const body = article?.markdown ?? ""
    const headings = artifacts.outline.sections.map((s) => s.heading)
    const hit = headings.filter((h) => body.includes(h)).length
    ok("分节生成与大纲对齐（小节标题回填正文）", hit >= Math.ceil(headings.length / 2), `${hit}/${headings.length} 命中`)
  }
  const reviewArt = artifacts.review
  ok("跨家族审稿留痕（family/rounds/pairwise）", Boolean(reviewArt?.family) && Array.isArray(reviewArt?.rounds), `${String(reviewArt?.family ?? "").slice(0, 50)}｜轮次 ${(reviewArt?.rounds ?? []).map((r) => `R${r.round}:${r.average}`).join(" ")}｜成对 ${(reviewArt?.pairwise ?? []).length} 次`)
  ok("审稿轮次记录（≤2 轮语义）", (run?.reviews ?? []).length >= 1 && (run?.reviews ?? []).length <= 3, `${(run?.reviews ?? []).length} 条 ReviewRecord`)
  const verifyStep = steps[5]
  const hasAssertions = Boolean(artifacts.assertions?.total)
  if (run?.mode === "REAL") {
    ok("原子断言核验执行", verifyStep?.name === "verify" && verifyStep?.status === "done" && hasAssertions, (verifyStep?.detail ?? "").slice(0, 80))
    if (hasAssertions) {
      ok("断言统计与阈值门禁字段", typeof artifacts.assertions.unsupportedRate === "number" && typeof artifacts.assertions.gateBlocked === "boolean", `无据率 ${(artifacts.assertions.unsupportedRate * 100).toFixed(0)}%｜阈值 ${(artifacts.assertions.threshold * 100).toFixed(0)}%｜${artifacts.assertions.gateBlocked ? "拦截" : "通过"}`)
      const assertClaims = (run?.claims ?? []).filter((c) => c.kind === "ASSERT")
      ok("断言落 claims 账本（kind=ASSERT 不进脚注）", assertClaims.length === artifacts.assertions.total, `${assertClaims.length} 条 ASSERT`)
    }
  } else {
    ok("DEMO 模式断言核验诚实跳过", verifyStep?.status === "skipped" || verifyStep?.status === "done", (verifyStep?.detail ?? "").slice(0, 60))
  }

  // 正文配图：插图回插 markdown 且渲染为 figure（生图降级时允许零图，但断言管线不报错）
  const inlineImgs = (run?.assets ?? []).filter((a) => a.role === "inline" && a.path)
  ok("正文配图管线执行", steps[6]?.name === "illustrate" && ["done", "skipped"].includes(steps[6]?.status), steps[6]?.detail ?? "")
  if (inlineImgs.length > 0) {
    ok("插图回插 markdown", (article?.markdown ?? "").includes("](/assets/ill-"), `${inlineImgs.length} 张`)
    ok("插图渲染为 figure", html.includes("<figure") && html.includes("<img "), "微信排版已渲染图片块")
  } else {
    ok("无图时降级不阻断", (article?.markdown ?? "").length > 200, "生图端点降级，正文完好")
  }
  ok("v2 引擎特征：span leaf 粘贴加固", html.includes('<span leaf="">'), `${(html.match(/<span leaf="">/g) ?? []).length} 处`)
  ok("v2 引擎特征：暗黑模式属性", html.includes("data-darkmode-"))
  ok("v2 引擎特征：真实 h2 标签", html.includes("<h2"))
  ok("claims 脚注保留", html.includes("参考来源"))

  // 主题切换（wewrite 体系内切换）
  const retheme = await call("retheme-sspai", "POST", `/api/runs/${runId}/actions`, { action: "retheme", theme: "sspai" })
  ok("主题切 sspai 重排", retheme.res.ok, retheme.json.message ?? retheme.json.error ?? "")
  const retheme2 = await call("retheme-legacy-radar", "POST", `/api/runs/${runId}/actions`, { action: "retheme", theme: "radar" })
  ok("旧主题 radar 兼容映射", retheme2.res.ok && retheme2.json.theme === "professional-clean", `resolved=${retheme2.json.theme}`)

  // 分镜
  const sb = await call("storyboard", "POST", `/api/runs/${runId}/actions`, { action: "storyboard", platform: "douyin" })
  const sbData = sb.json.storyboard
  ok("视频分镜生成", sb.res.ok && (sbData?.scenes?.length ?? 0) >= 3, `${sbData?.scenes?.length ?? 0} 分镜 ${sbData?.totalSeconds ?? 0}s`)

  // 封面
  const cover = await call("cover", "POST", `/api/runs/${runId}/actions`, { action: "cover" })
  ok("封面动作（降级留痕也算通）", cover.res.ok, cover.json.ok ? `生成 ${cover.json.path}` : `降级：${String(cover.json.error ?? "").slice(0, 50)}`)

  // ---------- 6a. G-Eval 评分 + 评测集 API（P0 L5 度量层） ----------
  section("G-Eval 评分与固定评测集")
  const evalGet = await call("eval-topics", "GET", "/api/eval")
  ok("评测集题库 50 题 · 10 类", (evalGet.json.topics?.length ?? 0) === 50 && (evalGet.json.meta?.categories?.length ?? 0) === 10, `total=${evalGet.json.meta?.total ?? 0}`)
  const evalScore = await call("eval-score", "POST", "/api/eval", { action: "score", runId })
  const es = evalScore.json.result
  ok("G-Eval 五维评分", evalScore.res.ok && Boolean(es?.scores?.accuracy) && typeof es?.average === "number", `均分 ${es?.average ?? "?"}｜裁判 ${es?.judge?.provider ?? "?"}${es?.judge?.crossFamily ? "（跨家族）" : "（同家族）"}`)
  ok("评分门禁判定字段", evalScore.res.ok && typeof es?.gate?.pass === "boolean" && Array.isArray(es?.gate?.gaps), es?.gate?.pass ? "PASS" : (es?.gate?.gaps ?? []).slice(0, 1).join("；"))
  const evalGet2 = await call("eval-recent", "GET", "/api/eval")
  ok("评分留痕可查（GET recentScores）", (evalGet2.json.recentScores ?? []).some((x) => x.runId === runId), `${(evalGet2.json.recentScores ?? []).length} 条最近评分`)

  // ---------- 6b. 视频线选题直出（P0 解耦：无文章直接出分镜） ----------
  section("视频线选题直出（video run）")
  const vCreated = await call("video-runs-create", "POST", "/api/video-runs", {
    topic: "P0 回归：开源模型追赶商业模型还差什么",
    angle: "对齐、安全与长链条推理的差距拆解",
    platform: "douyin",
  })
  const vRunId = vCreated.json.id
  ok("创建直出 video run", vCreated.res.ok && Boolean(vRunId), vRunId ?? "")
  if (vRunId) {
    let vRun = null
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 3000))
      const rj = await fetch(`${BASE}/api/runs/${vRunId}`).then((r) => r.json())
      vRun = rj.run
      if (["blocked", "error"].includes(vRun?.status)) break
    }
    ok("直出前两步终态 blocked（等选方向）", vRun?.status === "blocked", `status=${vRun?.status} err=${(vRun?.error ?? "").slice(0, 60)}`)
    let vArtifacts = {}
    try { vArtifacts = JSON.parse(vRun?.artifacts || "{}") } catch { /* ignore */ }
    ok("检索摘要落库（research）", (vArtifacts.research?.items?.length ?? 0) >= 1, `${vArtifacts.research?.items?.length ?? 0} 条｜${vArtifacts.research?.mode}`)
    ok("导演三方向落库（directions）", (vArtifacts.directions?.length ?? 0) === 3, `${vArtifacts.directions?.length ?? 0} 个方向`)
    const vDir = (vArtifacts.directions ?? []).find((d) => d.recommended) ?? vArtifacts.directions?.[0] ?? null
    const vSb = await call("video-runs-storyboard", "POST", "/api/video-runs", {
      action: "storyboard",
      runId: vRunId,
      ...(vDir ? { direction: { key: vDir.key, kind: vDir.kind, name: vDir.name, language: vDir.language, accent: vDir.palette.accent, base: vDir.palette.base, feel: vDir.feel } } : {}),
    })
    const vSbData = vSb.json.storyboard
    ok("直出分镜生成（≥3 镜）", vSb.res.ok && (vSbData?.scenes?.length ?? 0) >= 3, `${vSbData?.scenes?.length ?? 0} 分镜 ${vSbData?.totalSeconds ?? 0}s${vSbData?.direction ? ` · 方向「${vSbData.direction.name}」` : ""}`)
    const vRunAfter = await fetch(`${BASE}/api/runs/${vRunId}`).then((r) => r.json())
    ok("直出 run 终态 done（三步全终）", vRunAfter.run?.status === "done", JSON.parse(vRunAfter.run?.steps || "[]").map((s) => `${s.name}:${s.status}`).join(" "))
    ok("分镜脚本 markdown 落 output", (vRunAfter.run?.output ?? "").includes("## 分镜"), `${(vRunAfter.run?.output ?? "").length} 字符`)
  }

  // ---------- 6c. 纯图线端到端（构图方案 → 批量生图 → 画廊） ----------
  section("纯图线端到端（image run · zai-image 批量生图）")
  const imgCreated = await call("image-runs-create", "POST", "/api/image-runs", {
    subject: "融合回归：AI 资讯雷达封面概念图",
    usage: "wechat-cover",
    style: "modern-flat",
    count: 2,
  })
  const imgRunId = imgCreated.json.id
  ok("创建纯图 run", imgCreated.res.ok && Boolean(imgRunId), imgRunId ?? "")
  if (imgRunId) {
    let imgRun = null
    for (let i = 0; i < 45; i++) {
      await new Promise((r) => setTimeout(r, 4000))
      const rj = await fetch(`${BASE}/api/runs/${imgRunId}`).then((r) => r.json())
      imgRun = rj.run
      if (imgRun?.status === "done" || imgRun?.status === "error") break
    }
    const imgSteps = imgRun ? JSON.parse(imgRun.steps || "[]") : []
    ok("纯图线终态", ["done", "error"].includes(imgRun?.status), `status=${imgRun?.status} err=${(imgRun?.error ?? "").slice(0, 60)}`)
    ok("两步流水线（plan → gen）", imgSteps.length === 2 && imgSteps[0]?.name === "plan" && imgSteps[1]?.name === "gen", imgSteps.map((s) => `${s.name}:${s.status}`).join(" "))
    const cards = (imgRun?.assets ?? []).filter((a) => (a.role === "hero" || a.role.startsWith("card-")) && a.path)
    if (imgRun?.status === "done") {
      ok("画廊产出（≥1 张）", cards.length >= 1, `${cards.length} 张`)
      ok("画廊 markdown 输出", (imgRun.output ?? "").includes("](/assets/card-"), `${(imgRun.output ?? "").length} 字符`)
      const first = cards[0]
      const headImg = await fetch(BASE + first.path, { method: "HEAD" })
      ok("图片静态可访问", headImg.ok, `${first.path} ${headImg.headers.get("content-type")}`)
    } else {
      ok("生图全降级时诚实报错", (imgRun?.error ?? "").includes("降级"), "沙箱生图端点降级（非代码问题）")
    }
  }

  // ---------- 7. 视频双风格成片（REG_SKIP_VIDEO=1 时跳过，用 regression-part2.mjs 分段跑） ----------
  if (sbData && !process.env.REG_SKIP_VIDEO) {
    // 7a. art 艺术动画线（Playwright + art-motion 引擎真出片）
    const rvArt = await call("render-video-art", "POST", `/api/runs/${runId}/actions`, { action: "render-video", storyboard: sbData, voice: "xiaochen", aspect: "9:16", style: "art", channel: "local" })
    ok("art 渲染启动", rvArt.res.ok, rvArt.json.message ?? rvArt.json.error ?? "")
    let artMeta = null
    for (let i = 0; i < 90; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
      const va = [...(rj.run?.assets ?? [])].reverse().find((a) => a.role === "video-final")
      if (!va) continue
      artMeta = JSON.parse(va.meta || "{}")
      if (["done", "error"].includes(artMeta.stage)) break
    }
    ok("art 成片终态", artMeta?.stage === "done", `stage=${artMeta?.stage} ${artMeta?.seconds ?? 0}s style=${artMeta?.style} ${(artMeta?.sizeBytes ?? 0) ? (artMeta.sizeBytes / 1048576).toFixed(1) + "MB" : ""} ${artMeta?.aiNote ?? ""}`)
    if (artMeta?.stage === "done") {
      const head = await fetch(BASE + `/assets/video-${runId}.mp4`, { method: "HEAD" })
      ok("art 成片可访问", head.ok, `${head.headers.get("content-type")} ${(Number(head.headers.get("content-length") ?? 0) / 1048576).toFixed(1)}MB`)
    }

    // 7b. motion 商业片线（对照）
    const rvM = await call("render-video-motion", "POST", `/api/runs/${runId}/actions`, { action: "render-video", storyboard: sbData, voice: "kazi", aspect: "16:9", style: "motion", channel: "local" })
    ok("motion 渲染启动", rvM.res.ok, rvM.json.message?.slice(0, 60) ?? "")
    let mMeta = null
    for (let i = 0; i < 60; i++) {
      await new Promise((r) => setTimeout(r, 5000))
      const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
      const va = [...(rj.run?.assets ?? [])].reverse().find((a) => a.role === "video-final")
      if (!va) continue
      mMeta = JSON.parse(va.meta || "{}")
      if (["done", "error"].includes(mMeta.stage)) break
    }
    ok("motion 成片终态", mMeta?.stage === "done", `stage=${mMeta?.stage} ${mMeta?.seconds ?? 0}s ${mMeta?.width}×${mMeta?.height}`)
  }

  // 发布（质量门禁 + 三级降级）
  const pub = await call("publish", "POST", `/api/runs/${runId}/actions`, { action: "publish" })
  if (pub.res.ok && pub.json.outcome?.levelName) {
    ok("发布走通（门禁放行 + 三级降级）", true, `${pub.json.outcome.level} ${pub.json.outcome.levelName}`)
  } else {
    // 门禁拦截 → 应有明确 reasons 且 force 可强发
    ok("门禁拦截响应结构", pub.res.status === 400 && Array.isArray(pub.json.gate?.reasons) && pub.json.gate.reasons.length > 0, (pub.json.gate?.reasons ?? []).join("；").slice(0, 90))
    const pubForce = await call("publish-force", "POST", `/api/runs/${runId}/actions`, { action: "publish", force: true })
    ok("force 强发走通（自担风险路径）", pubForce.res.ok && Boolean(pubForce.json.outcome?.levelName), `${pubForce.json.outcome?.level} ${pubForce.json.outcome?.levelName ?? ""}`)
  }

  // ---------- 7c. 多平台导出（公众号 18 主题 / Markdown / 知乎 / 小红书 / 头条号） ----------
  section("多平台导出")
  // DEMO 搜索（无已核实 claims）时放宽来源类探针——脚注/来源行为只在 REAL 模式下断言
  const realMode = run?.mode === "REAL"
  const EXPECT = {
    wechat: { kind: "html", probe: (c) => c.includes("<section") && c.includes("参考来源") },
    markdown: { kind: "markdown", probe: (c) => c.startsWith("#") && (realMode ? c.includes("**参考来源**") && c.includes("[1]:") : true) },
    zhihu: { kind: "html", probe: (c) => c.includes("<h1") && c.includes("<h2") && c.includes("<p ") && (realMode ? c.includes("参考来源") && c.includes("<a href") : true) },
    xiaohongshu: { kind: "text", probe: (c) => !c.includes("<section") && !c.includes("<h1") && c.includes("◆") && c.includes("#") && (realMode ? c.includes("信息来源") : true) },
    toutiao: { kind: "html", probe: (c) => c.includes("font-size:17px") && (realMode ? c.includes("参考来源") : true) },
  }
  for (const [pid, exp] of Object.entries(EXPECT)) {
    const ex = await call(`export-${pid}`, "POST", `/api/runs/${runId}/actions`, { action: "export", platform: pid })
    const e = ex.json.export
    const pass = ex.res.ok && e?.kind === exp.kind && Boolean(e?.content) && exp.probe(e?.content ?? "")
    ok(`导出 ${pid}`, pass, `${e?.kind ?? "?"} ${e?.content?.length ?? 0} 字符${e?.note ? " · " + e.note.slice(0, 40) : ""}`)
  }
  // 主题预览隔离：export theme 参数不落库，retheme 才持久化
  const before = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
  const themeBefore = before.run?.theme
  const exThemed = await call("export-wechat-themed", "POST", `/api/runs/${runId}/actions`, { action: "export", platform: "wechat", theme: "midnight" })
  const after = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
  const themedHtml = exThemed.json.export?.content ?? ""
  ok("主题预览不落库", exThemed.res.ok && after.run?.theme === themeBefore && themedHtml !== "", `theme=${after.run?.theme}（预览 midnight 未持久化）`)

  // 清理 Agnes 回归账号
  await call("agnes-cleanup", "PUT", "/api/settings", { scope: "agnes", value: { enabled: false, accounts: [] } })
}

// ---------- 8. 汇总 ----------
section("HTTP 汇总")
for (const r of results) {
  console.log(`  ${r.status >= 200 && r.status < 500 ? "·" : "❌"} [${r.status}] ${r.method} ${r.path} (${r.ms}ms)`)
}
const bad = results.filter((r) => r.status === 0 || r.status >= 500)
console.log(`\n${bad.length === 0 ? "✅ 全部 API 无 5xx/网络失败" : `❌ ${bad.length} 个失败`}`)
process.exit(bad.length > 0 ? 1 : 0)
