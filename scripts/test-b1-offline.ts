// ============================================================
// test-b1-offline.ts —— 内容质量升级批次一离线自测（零 LLM/零网络）
// 覆盖：
//   ① A2 篇幅三档：档位解析/钳制/逐节校验/滚动窗/规则文本
//   ② A1 SKILL 接管：分节提取/占位符渲染/用户位覆盖/缺技能显式报错
//   ③ A2 消息组装：outline/section/draft 档位注入（真实 db/skills 事实源）
//   ④ B1 导演：拼装/解析/legacy 降级（纯函数层）
// 运行：node --experimental-strip-types scripts/test-b1-offline.ts
// ============================================================

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "fs"
import { tmpdir } from "os"
import { join } from "path"

import {
  LENGTH_TIERS, resolveLengthTier, clampSectionWords, maxSections,
  sectionWordNeedsRetry, countWords, rollingContext, tierWordRule,
} from "../src/lib/runtime/length-tier.ts"
import {
  extractPromptSection, renderPromptTemplate, loadSkillPrompt, SkillPromptMissingError, PIPELINE_SKILL_IDS,
} from "../src/lib/runtime/skill-prompt.ts"
import { assemblePromptFull } from "../src/lib/runtime/illustration-director.ts"
import { parseOutline, sectionMessages, outlineMessages } from "../src/lib/runtime/skills/radar-outline.ts"
import { draftMessages } from "../src/lib/runtime/skills/radar-write.ts"
import { getImageStyle } from "../src/lib/runtime/skills/radar-image.ts"

let pass = 0
let fail = 0
function assert(cond: boolean, name: string, extra = ""): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? `  → ${extra}` : ""}`)
  }
}

// ---------- ① A2 篇幅三档（纯函数） ----------

console.log("━━ ① A2 篇幅三档 ━━")
{
  assert(LENGTH_TIERS.length === 3, "三档定义齐全", LENGTH_TIERS.map((t) => t.id).join("/"))
  const short = resolveLengthTier("short")
  const medium = resolveLengthTier("medium")
  const deep = resolveLengthTier("deep")
  assert(short.totalMin === 1200 && short.totalMax === 2000, "short：1200~2000")
  assert(medium.totalMin === 2500 && medium.totalMax === 4000, "medium：2500~4000（用户拍板默认）")
  assert(deep.totalMin === 4500 && deep.totalMax === 8000, "deep：4500~8000")
  assert(resolveLengthTier("bogus").id === "medium", "非法档位回退 medium")
  assert(resolveLengthTier(undefined).id === "medium", "缺省回退 medium")
  assert(resolveLengthTier("").id === "medium", "空串回退 medium（旧 run 无字段场景）")

  // 钳制点：每节 words
  assert(clampSectionWords(99999, deep) === deep.sectionWordsMax, "deep 每节钳到 1200（旧硬编码 500 已破除）")
  assert(clampSectionWords(10, deep) === deep.sectionWordsMin, "deep 每节下限 300")
  assert(clampSectionWords("abc", medium) === medium.sectionWordsDefault, "非数字回退档位缺省")
  assert(clampSectionWords(50, short) === short.sectionWordsMin, "short 每节下限 100（旧语义保留）")
  assert(maxSections(deep) === 14, "deep 小节数上限 14（旧 MAX_SECTIONS=8 已破除）")
  assert(maxSections(short) === 6, "short 小节数上限 6")

  // 逐节校验容差带
  assert(!sectionWordNeedsRetry(300, 210), "预算 300 实际 210（70%）→ 不重生")
  assert(sectionWordNeedsRetry(300, 190), "预算 300 实际 190（63%）→ 重生")
  assert(!sectionWordNeedsRetry(300, 450), "预算 300 实际 450（150%）→ 不重生")
  assert(sectionWordNeedsRetry(300, 500), "预算 300 实际 500（167%）→ 重生")
  assert(!sectionWordNeedsRetry(600, 0), "空串交由上游短文检查（此处不误报）")

  // 滚动窗
  const ctx = rollingContext(["A".repeat(1000), "B".repeat(1000), "C".repeat(1000)], deep)
  assert(ctx.length === 3, "滚动窗等长")
  assert(ctx[0].length === deep.contextBriefChars, "最早节压到短摘要（260）")
  assert(ctx[1].length === deep.contextFullChars && ctx[2].length === deep.contextFullChars, "近 2 节保留全长摘要（900）")
  const ctxShort = rollingContext(["A".repeat(1000), "B".repeat(1000)], short)
  assert(ctxShort[0].length === short.contextFullChars, "short 近 2 节也走全摘要")

  // 规则文本
  assert(tierWordRule(medium).includes("2500~4000"), "medium 字数铁律文本")
  assert(countWords("# 标题\n正文 内容") === 7, "字数口径：去空白（与 Article.wordCount 一致）")
}

// ---------- ② A1 SKILL 接管（skill-prompt 纯函数 + 临时目录） ----------

console.log("━━ ② A1 SKILL 接管 ━━")
{
  // 分节提取
  const body = "前置说明\n<!-- prompt: review -->\n评审规则A\n<!-- prompt: revise -->\n修订规则B\n"
  assert(extractPromptSection(body, "review").includes("评审规则A") && !extractPromptSection(body, "review").includes("修订规则B"), "命名分节精确提取")
  assert(extractPromptSection(body) === body.trim(), "无 section 参数 → 整体正文")
  assert(extractPromptSection(body, "nonexistent") === body.trim(), "未知分节名 → 宽容退回整体")
  const single = "只有一个 prompt 的正文"
  assert(extractPromptSection(single, "review") === single, "无任何标记 → 整体（单 prompt 技能兼容）")

  // 占位符渲染
  assert(renderPromptTemplate("你好 {{name}}，档位 {{tier}}", { name: "雷达", tier: "deep" }) === "你好 雷达，档位 deep", "占位符替换")
  assert(renderPromptTemplate("A{{missing}}B", {}) === "AB", "未提供变量 → 空串（条件块干净消失）")
  assert(!renderPromptTemplate("{{a}}\n\n\n\n{{b}}", { a: "1", b: "2" }).includes("\n\n\n"), "3+ 空行收敛")

  // 真实产品库事实源（A1 验收：技能在，prompt 主体在）
  const briefSrc = await loadSkillPrompt("wewrite-brief")
  assert(briefSrc.from === "product", "brief 技能来自产品库")
  assert(briefSrc.body.includes("{{style_block}}"), "brief SKILL.md 含占位符（事实源形态）")
  const draftSrc = await loadSkillPrompt("wewrite-draft")
  assert(draftSrc.body.includes("<!-- prompt: section -->") && draftSrc.body.includes("<!-- prompt: single -->"), "draft SKILL.md 双分节")
  const reviewSrc = await loadSkillPrompt("wewrite-review")
  assert(extractPromptSection(reviewSrc.body, "pairwise").includes("第三方内容编辑"), "review 三分节之 pairwise")
  const outlineSrc = await loadSkillPrompt("wewrite-outline")
  assert(outlineSrc.body.includes("{{sections_rule}}") && outlineSrc.body.includes("{{total_words_rule}}"), "outline SKILL.md 档位占位符")
  const directSrc = await loadSkillPrompt("wewrite-art-direct")
  assert(extractPromptSection(directSrc.body, "inline").includes("插画导演") && extractPromptSection(directSrc.body, "cover").includes("封面艺术总监"), "art-direct 双分节（inline/cover）")
  assert((await loadSkillPrompt("wewrite-illustrate")).body.includes("配图编辑"), "illustrate 技能在库")
  assert((await loadSkillPrompt("wewrite-fact-check")).body.includes("原子断言"), "fact-check 技能在库")

  // 缺技能显式报错（A1 验收：不静默回退）
  let threw = false
  try {
    await loadSkillPrompt("wewrite-not-exist-xyz")
  } catch (e) {
    threw = e instanceof SkillPromptMissingError
  }
  assert(threw, "缺失技能 → SkillPromptMissingError（拒绝静默回退）")

  // 用户位覆盖优先级（临时目录注入）
  const tmpRoot = mkdtempSync(join(tmpdir(), "b1-skill-"))
  const userDir = join(tmpRoot, "user")
  const productDir = join(tmpRoot, "product")
  mkdirSync(join(userDir, "wewrite-brief"), { recursive: true })
  mkdirSync(join(productDir, "wewrite-brief"), { recursive: true })
  writeFileSync(join(productDir, "wewrite-brief", "SKILL.md"), "---\nname: wewrite-brief\ndescription: d\n---\n产品库版本", "utf-8")
  writeFileSync(join(userDir, "wewrite-brief", "SKILL.md"), "---\nname: wewrite-brief\ndescription: d\n---\n用户覆盖版本", "utf-8")
  const overridden = await loadSkillPrompt("wewrite-brief", { productDir, userDir })
  assert(overridden.from === "user" && overridden.body === "用户覆盖版本", "用户位同名技能覆盖产品库（A1 语义）")
  const onlyProduct = await loadSkillPrompt("wewrite-brief", { productDir, userDir: join(tmpRoot, "empty-user") })
  assert(onlyProduct.from === "product", "无用户位 → 产品库")
  rmSync(tmpRoot, { recursive: true, force: true })

  // 管线技能清单
  assert(PIPELINE_SKILL_IDS.size === 7, "七个管线技能（brief/outline/draft/review/fact-check/illustrate/art-direct）")
  assert(PIPELINE_SKILL_IDS.has("wewrite-draft") && !PIPELINE_SKILL_IDS.has("wewrite-polish"), "polish 等下游技能不在管线清单")
}

// ---------- ③ A2 消息组装（真实 SKILL.md 事实源 + 档位注入） ----------

console.log("━━ ③ 消息组装（档位注入） ━━")
{
  const brief = { targetReader: "r", realProblem: "p", coreJudgment: "j", counterView: "c", boundary: "b", claims: [] }
  const persona = { id: "cold-analyst", label: "冷面分析师", desc: "d", voice: "克制冷静" }
  const claims = [{ idx: 1, text: "t", claimType: "事实", verified: true, sourceSite: "s", sourceTitle: "tt", sourceDate: "2026-10-01", sourceUrl: "u" }]

  const deep = resolveLengthTier("deep")
  const outMsgs = await outlineMessages({ brief, ideaTitle: "T", ideaAngle: "", claims: [], tier: deep })
  assert(outMsgs[0].content.includes("8~14 个小节"), "deep 大纲指令：8~14 节")
  assert(outMsgs[0].content.includes("合计 4500~8000"), "deep 大纲指令：合计 4500~8000")
  assert(outMsgs[0].content.includes("每节 300~1200"), "deep 大纲指令：每节 300~1200")
  const medMsgs = await outlineMessages({ brief, ideaTitle: "T", ideaAngle: "", claims: [] })
  assert(medMsgs[0].content.includes("6~9 个小节") && medMsgs[0].content.includes("合计 2500~4000"), "缺省 tier=medium（6~9 节 · 2500~4000，与设置默认一致）")

  // parseOutline 档位钳制 + A2 合计预算带归一化
  const mkOutline = (n: number, words: number) => ({
    title: "T",
    sections: Array.from({ length: n }, (_, i) => ({ heading: `H${i}`, point: `P${i}`, evidence: [], illustration: "", imageCaption: "", words })),
  })
  const sumOf = (o: { sections: { words: number }[] } | null) => o!.sections.reduce((a, s) => a + s.words, 0)
  const parsedDeep = parseOutline(mkOutline(12, 1100), deep)
  assert(parsedDeep !== null && parsedDeep.sections.length === 12, "deep：12 节全保留（旧上限 8 会截断）")
  assert(sumOf(parsedDeep) <= deep.totalMax, `deep：合计 13200 压回带 ≤8000（实得 ${sumOf(parsedDeep)}）`)
  assert(parsedDeep!.sections.every((s) => s.words >= deep.sectionWordsMin && s.words <= deep.sectionWordsMax), "deep：归一后每节仍在 300~1200 区间")
  const parsedShort = parseOutline(mkOutline(12, 1100), resolveLengthTier("short"))
  assert(parsedShort!.sections.length === 6, "short：超限节截到 6")
  assert(sumOf(parsedShort) <= 2000, `short：合计 3000（6×500）压回带 ≤2000（实得 ${sumOf(parsedShort)}）`)
  // 实测回归场景：medium 8 节 × 300 = 2400 < 2500 → 曾致成稿 2257 字带外
  const med = resolveLengthTier("medium")
  const normLow = parseOutline(mkOutline(8, 300), med)
  assert(normLow !== null && sumOf(normLow) >= med.totalMin, `medium：合计 2400 抬进带 ≥2500（实得 ${sumOf(normLow)}）`)
  const normIn = parseOutline(mkOutline(7, 450), med)
  assert(normIn !== null && normIn.sections.every((s) => s.words === 450), "medium：合计 3150 已在带内 → 逐节不动")

  // sectionMessages：铁律与人格来自 SKILL.md；retryNote 注入
  const outline = { title: "T", sections: [{ heading: "H", point: "P", evidence: [1], illustration: "", imageCaption: "", words: 300 }] }
  const base = { outline, sectionIndex: 0, brief, persona, claims, rules: [], ideaTitle: "T", ideaAngle: "", writtenSoFar: [] }
  const secMsgs = await sectionMessages(base)
  assert(secMsgs[0].content.includes("【铁律（优先级最高）】"), "section：铁律来自 SKILL.md")
  assert(secMsgs[0].content.includes("冷面分析师") && secMsgs[0].content.includes("克制冷静"), "section：人格注入")
  assert(secMsgs[1].content.includes("字数预算：300 字"), "section：字数预算注入")
  const retryMsgs = await sectionMessages({ ...base, retryNote: "上一次生成 120 字，偏离预算" })
  assert(retryMsgs[1].content.includes("字数反馈") && retryMsgs[1].content.includes("偏离预算"), "section：重生反馈注入")

  // draftMessages（单遍回退）：档位铁律
  const draftDeep = await draftMessages({ brief, persona, claims, rules: [], ideaTitle: "T", ideaAngle: "", tier: deep })
  assert(draftDeep[0].content.includes("字数 4500~8000 字"), "draft 单遍：deep 铁律注入")
  const draftDefault = await draftMessages({ brief, persona, claims, rules: [], ideaTitle: "T", ideaAngle: "" })
  assert(draftDefault[0].content.includes("字数 2500~4000 字"), "draft 单遍：无 tier 缺省 medium 铁律（与设置默认一致）")
}

// ---------- ④ B1 导演纯函数层 ----------

console.log("━━ ④ B1 配图导演（纯函数） ━━")
{
  const parts = {
    subjectZh: "一座由数据流构成的城市",
    subjectEn: "a city made of flowing data streams, glowing nodes",
    composition: "wide shot, city on left third",
    lighting: "cool blue-grey palette, soft directional light",
    styleRef: "modern flat illustration, geometric",
    negative: "text, watermark, extra fingers",
  }
  const full = assemblePromptFull(parts, "现代扁平插画风")
  assert(full.includes("一座由数据流构成的城市"), "拼装含中文主体")
  assert(full.includes("a city made of flowing data streams"), "拼装含英文主体")
  assert(full.endsWith("。avoid: text, watermark, extra fingers"), "负面词收尾（avoid: 前缀）")
  const noNegative = assemblePromptFull({ ...parts, negative: "" }, "fallback")
  assert(!noNegative.includes("avoid:"), "无负面词不拼 avoid 段")
  const fallbackStyle = assemblePromptFull({ ...parts, styleRef: "" }, "现代扁平插画风，蓝灰")
  assert(fallbackStyle.includes("现代扁平插画风，蓝灰"), "style_ref 缺失回退风格基准")

  // 风格预设（A2/B2 前置：图文线风格入口）
  const styles = ["modern-flat", "tech-data", "hand-drawn", "isometric", "neon-cyber"]
  assert(styles.every((id) => getImageStyle(id).prompt.length > 10), "五种风格预设可用")
  assert(getImageStyle("bogus").id === "modern-flat", "非法风格回退 modern-flat")
}

console.log("")
console.log(`━━━ 结果：${pass} 通过 / ${fail} 失败 ━━`)
process.exit(fail === 0 ? 0 : 1)
