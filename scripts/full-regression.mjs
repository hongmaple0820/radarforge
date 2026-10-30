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
section("AI 搜索（真实联网，情报中心底座）")
const search = await call("search", "POST", "/api/search", { query: "AI Agent 开发框架 2026", count: 10 })
ok("搜索 REAL 且有结果", search.json.mode === "REAL" && (search.json.results?.length ?? 0) > 0, `mode=${search.json.mode} n=${search.json.results?.length ?? 0}`)

// ---------- 6. 七步流水线端到端（新渲染引擎 + wewrite 主题 + 正文配图） ----------
section("七步流水线端到端（REAL · 渲染引擎 v2 · 含配图）")
const created = await call("runs-create", "POST", "/api/runs", {
  ideaTitle: "融合回归：多模态模型成本曲线观察",
  ideaAngle: "从免费多模态 API 潮流看模型服务的定价演化",
  persona: "cold-analyst",
  theme: "tech-modern",
})
const runId = created.json.id
ok("创建 run（tech-modern 主题）", created.res.ok && Boolean(runId), runId ?? "")
if (runId) { try { (await import("fs")).writeFileSync("/tmp/reg-runid.txt", runId) } catch { /* 忽略 */ } }

if (runId) {
  let run = null
  for (let i = 0; i < 120; i++) {
    await new Promise((r) => setTimeout(r, 4000))
    const rj = await fetch(`${BASE}/api/runs/${runId}`).then((r) => r.json())
    run = rj.run
    if (run?.status === "done" || run?.status === "error") break
  }
  ok("流水线终态 done", run?.status === "done", `status=${run?.status} err=${(run?.error ?? "").slice(0, 60)}`)
  const steps = run ? JSON.parse(run.steps || "[]") : []
  ok("七步全终态（illustrate 允许 skipped）", steps.length === 7 && steps.every((s) => s.status === "done" || (s.name === "illustrate" && s.status === "skipped")), steps.map((s) => `${s.name}:${s.status}`).join(" "))
  ok("模式 REAL", run?.mode === "REAL")
  const article = run?.articles?.[run.articles.length - 1]
  const html = article?.formatted ?? ""
  ok("成稿 + 排版 v2", Boolean(article?.markdown && html), `v${article?.version} ${html.length} 字符 HTML`)
  // 正文配图：插图回插 markdown 且渲染为 figure（生图降级时允许零图，但断言管线不报错）
  const inlineImgs = (run?.assets ?? []).filter((a) => a.role === "inline" && a.path)
  ok("正文配图管线执行", steps[4]?.name === "illustrate" && ["done", "skipped"].includes(steps[4]?.status), steps[4]?.detail ?? "")
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

  // ---------- 6b. 纯图线端到端（构图方案 → 批量生图 → 画廊） ----------
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

  // 发布（三级降级）
  const pub = await call("publish", "POST", `/api/runs/${runId}/actions`, { action: "publish" })
  ok("发布三级降级", pub.res.ok && Boolean(pub.json.outcome?.levelName), `${pub.json.outcome?.level} ${pub.json.outcome?.levelName ?? ""}`)

  // ---------- 7c. 多平台导出（公众号 18 主题 / Markdown / 知乎 / 小红书 / 头条号） ----------
  section("多平台导出")
  const EXPECT = {
    wechat: { kind: "html", probe: (c) => c.includes("<section") && c.includes("参考来源") },
    markdown: { kind: "markdown", probe: (c) => c.startsWith("#") && c.includes("**参考来源**") && c.includes("[1]:") },
    zhihu: { kind: "html", probe: (c) => c.includes("<h1") && c.includes("<h2") && c.includes("<p ") && c.includes("参考来源") && c.includes("<a href") },
    xiaohongshu: { kind: "text", probe: (c) => !c.includes("<section") && !c.includes("<h1") && c.includes("◆") && c.includes("#") && c.includes("信息来源") },
    toutiao: { kind: "html", probe: (c) => c.includes("font-size:17px") && c.includes("参考来源") },
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
