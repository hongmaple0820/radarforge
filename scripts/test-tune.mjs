// ============================================================
// test-tune.mjs —— prompt 变体调优（P1 p15）离线单测（零 LLM）
// 覆盖：变体注册表完整性 / sectionMessages·draftMessages 注入位 /
//       SettingKV 读写与回滚 / aggregateTuneReport 聚合推荐数学
// 运行：node scripts/test-tune.mjs
// ============================================================
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const { PROMPT_VARIANTS, getVariant, resolveTuneInstruction, applyVariant, clearTune, aggregateTuneReport } = await import("../src/lib/runtime/tune.ts")
const { sectionMessages } = await import("../src/lib/runtime/skills/radar-outline.ts")
const { draftMessages } = await import("../src/lib/runtime/skills/radar-write.ts")

let pass = 0, fail = 0
function ok(name, cond, extra = "") {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? `｜${extra}` : ""}`) }
  else { fail++; console.log(`  ❌ ${name}${extra ? `｜${extra}` : ""}`) }
}

console.log("━━━ p15 调优 · 离线单测 ━━━")

// ---------- ① 注册表 ----------
console.log("── ① 变体注册表 ──")
ok("四变体注册", PROMPT_VARIANTS.length === 4, PROMPT_VARIANTS.map((v) => v.key).join("/"))
ok("key 唯一", new Set(PROMPT_VARIANTS.map((v) => v.key)).size === 4)
ok("v0 基线指令为空", getVariant("v0")?.instruction === "")
ok("v1~v3 指令非空且带调优标记", ["v1", "v2", "v3"].every((k) => (getVariant(k)?.instruction ?? "").includes("【调优指令")))
ok("每变体带调优假设", PROMPT_VARIANTS.every((v) => v.hypothesis.length > 10))
ok("getVariant 非法 key → undefined", getVariant("vx") === undefined)

// ---------- ② 提示词注入位 ----------
console.log("── ② 提示词注入位 ──")
const outline = { title: "T", sections: [{ heading: "H", point: "P", evidence: [1], illustration: "", words: 200 }] }
const brief = { targetReader: "r", realProblem: "p", coreJudgment: "j", counterView: "c", boundary: "b" }
const persona = { id: "cold-analyst", label: "冷面分析师", desc: "d", voice: "v" }
const claims = [{ idx: 1, text: "t", claimType: "事实", verified: true, sourceSite: "s", sourceTitle: "tt", sourceDate: "2026-10-01", sourceUrl: "u" }]
const baseInput = { outline, sectionIndex: 0, brief, persona, claims, rules: [], ideaTitle: "标题", ideaAngle: "", writtenSoFar: [] }

const withTune = sectionMessages({ ...baseInput, tunePrompt: "【调优指令·测试】每段一个论点" })
ok("sectionMessages：注入调优指令", withTune[0].content.includes("【调优指令·测试】每段一个论点"))
const withoutTune = sectionMessages(baseInput)
ok("sectionMessages：无调优指令零侵入", !withoutTune[0].content.includes("调优指令"))
ok("sectionMessages：铁律仍在（优先级未变）", withoutTune[0].content.includes("【铁律（优先级最高）】"))

const draftIn = { brief, persona, claims, rules: [], ideaTitle: "标题", ideaAngle: "" }
const draftWith = draftMessages({ ...draftIn, tunePrompt: "【调优指令·测试】证据密度" })
ok("draftMessages：注入调优指令（单遍降级路径同生效）", draftWith[0].content.includes("【调优指令·测试】证据密度"))
ok("draftMessages：无指令零侵入", !draftMessages(draftIn)[0].content.includes("调优指令"))

// ---------- ③ SettingKV 读写与回滚 ----------
console.log("── ③ SettingKV 读写 ──")
try { await clearTune() } catch { /* 首次可能无记录 */ }
let t0 = await resolveTuneInstruction()
ok("无记录 → v0 基线空指令", t0.variant === "v0" && t0.instruction === "")
const applied = await applyVariant("v2", "test")
ok("apply v2 → 返回注入指令", applied.variant === "v2" && applied.instruction === getVariant("v2")?.instruction)
t0 = await resolveTuneInstruction()
ok("resolve 读回 v2 指令", t0.variant === "v2" && t0.instruction === getVariant("v2")?.instruction)
const t1 = await applyVariant("v0", "test")
ok("apply v0 = 回基线", t1.instruction === "")
await clearTune()
t0 = await resolveTuneInstruction()
ok("clear → 回基线", t0.variant === "v0")
let threw = false
try { await applyVariant("vx") } catch { threw = true }
ok("非法变体 apply → throw", threw)

// ---------- ④ 聚合推荐数学 ----------
console.log("── ④ aggregateTuneReport ──")
const mk = (variant, topicId, average) => ({ variant, runId: `r-${variant}-${topicId}`, topicId, average, scores: { accuracy: average, viewpoint: average, usefulness: average, voice: average, readability: average }, wordCount: 1200 })
const rep1 = aggregateTuneReport({ topics: ["m01"], scores: [mk("v0", "m01", 8.0), mk("v1", "m01", 8.4), mk("v2", "m01", 8.2)] })
ok("均分计算正确", rep1.variants.find((v) => v.variant === "v1")?.mean === 8.4)
ok("排序按均分降序", rep1.variants[0].variant === "v1")
ok("推荐最优变体 v1", rep1.recommended === "v1")
ok("门禁率（≥8.0 计过）", rep1.variants.find((v) => v.variant === "v1")?.gatePassRate === 1)
const rep2 = aggregateTuneReport({ topics: ["m01"], scores: [mk("v0", "m01", 8.3), mk("v1", "m01", 8.1)] })
ok("变体劣于基线 → 不推荐", rep2.recommended === null)
const rep3 = aggregateTuneReport({ topics: ["m01"], scores: [mk("v1", "m01", 8.4)] })
ok("无基线数据 → 不推荐（防误判）", rep3.recommended === null && rep3.baselineMean === null)
const rep4 = aggregateTuneReport({ topics: ["m01", "m02"], scores: [mk("v0", "m01", 8.0), mk("v0", "m02", 8.2), mk("v2", "m01", 8.3), mk("v2", "m02", 8.5)] })
const v2mean = rep4.variants.find((v) => v.variant === "v2")?.mean ?? 0
ok("多题均值聚合", Math.abs(v2mean - 8.4) < 1e-9 && rep4.recommended === "v2")
ok("报告含样本量警告（防过拟合声明）", rep1.note.includes("样本量小"))
ok("topics 回写", rep4.topics.join(",") === "m01,m02")
const rep5 = aggregateTuneReport({ topics: [], scores: [] })
ok("空输入不崩", rep5.variants.length === 0 && rep5.recommended === null)

// ---------- 收尾 ----------
await clearTune()
await db.$disconnect()
console.log("")
console.log(`━━━ 结果：${pass} 通过 / ${fail} 失败 ━━━`)
process.exit(fail === 0 ? 0 : 1)
