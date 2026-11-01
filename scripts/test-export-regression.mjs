// 多平台导出回归断言（full-regression 7c 节的独立可跑版）
const BASE = "http://localhost:3000"
const runId = process.argv[2]
if (!runId) { console.error("用法：bun scripts/test-export-regression.mjs <runId>"); process.exit(1) }
let pass = 0, fail = 0
const ok = (name, p, detail = "") => { console.log(`  ${p ? "✅" : "❌"} ${name}  ${detail}`); if (p) pass += 1; else fail += 1 }
const EXPECT = {
  wechat: { kind: "html", probe: (c) => c.includes("<section") && c.includes("参考来源") },
  markdown: { kind: "markdown", probe: (c) => c.startsWith("#") && c.includes("**参考来源**") && c.includes("[1]:") },
  zhihu: { kind: "html", probe: (c) => c.includes("<h1") && c.includes("<h2") && c.includes("<p ") && c.includes("参考来源") && c.includes("<a href") },
  xiaohongshu: { kind: "text", probe: (c) => !c.includes("<section") && !c.includes("<h1") && c.includes("◆") && c.includes("#") && c.includes("信息来源") },
  toutiao: { kind: "html", probe: (c) => c.includes("font-size:17px") && c.includes("参考来源") },
}
for (const [pid, exp] of Object.entries(EXPECT)) {
  const res = await fetch(`${BASE}/api/runs/${runId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export", platform: pid }) })
  const j = await res.json()
  const e = j.export
  ok(`导出 ${pid}`, res.ok && e?.kind === exp.kind && Boolean(e?.content) && exp.probe(e?.content ?? ""), `${e?.kind ?? "?"} ${e?.content?.length ?? 0} 字符${e?.note ? " · " + e.note.slice(0, 40) : ""}`)
}
const before = await fetch(`${BASE}/api/runs/${runId}`).then(r => r.json())
const themeBefore = before.run?.theme
const exThemed = await fetch(`${BASE}/api/runs/${runId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export", platform: "wechat", theme: "midnight" }) }).then(r => r.json())
const after = await fetch(`${BASE}/api/runs/${runId}`).then(r => r.json())
ok("主题预览不落库", exThemed.export?.content && after.run?.theme === themeBefore, `theme=${after.run?.theme}（预览 midnight 未持久化）`)
const bad = await fetch(`${BASE}/api/runs/${runId}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "export", platform: "twitter" }) })
ok("非法平台 400 拒绝", bad.status === 400, String((await bad.json()).error).slice(0, 50))
console.log(`\n导出回归：${pass} 过 / ${fail} 挂`)
process.exit(fail ? 1 : 0)
