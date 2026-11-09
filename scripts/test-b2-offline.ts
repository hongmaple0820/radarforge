// ============================================================
// test-b2-offline.ts —— 内容质量升级批次二离线自测（零 LLM/零网络）
// 覆盖：
//   ① B4 模板库：3774 条全量加载、bigram 检索、范例块拼装
//   ② B2 八风格包：风格齐全、新风格提示词质量
//   ③ B6 密度分档 + 职责分离：illustrationPlanMessages 注入、dataCardMessages 事实源
//   ④ A3 叙事骨架：五骨架、轮换稳定性、outline 消息注入
//   ⑤ A5 扩写消息：SKILL.md expand 分节事实源
// 运行：node --experimental-strip-types scripts/test-b2-offline.ts
// ============================================================

import {
  retrieveTemplates, queryTokens, exemplarBlock, libraryStats, resetLibraryCache,
} from "../src/lib/runtime/prompt-library.ts"
import { IMAGE_STYLES } from "../src/lib/runtime/skills/radar-image.ts"
import { illustrationPlanMessages, dataCardMessages } from "../src/lib/runtime/skills/radar-image.ts"
import { LENGTH_TIERS, tierIllustrationRule, resolveLengthTier } from "../src/lib/runtime/length-tier.ts"
import { NARRATIVE_SKELETONS, pickSkeleton, resolveSkeleton, skeletonBlock, SKELETON_IDS } from "../src/lib/runtime/narrative-skeletons.ts"
import { outlineMessages } from "../src/lib/runtime/skills/radar-outline.ts"
import { expandMessages } from "../src/lib/runtime/skills/radar-write.ts"
import { extractPromptSection } from "../src/lib/runtime/skill-prompt.ts"

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

const brief = { targetReader: "r", realProblem: "p", coreJudgment: "j", counterView: "c", boundary: "b", claims: [] }

// ---------- ① B4 模板库 ----------

console.log("━━ ① B4 模板库（3774 条检索式使用） ━━")
{
  resetLibraryCache()
  const stats = await libraryStats()
  assert(stats.total === 3774, "全量 3774 条入库加载", `total=${stats.total}`)
  assert(stats.files === 8, "八个快照文件", `files=${stats.files}`)

  // bigram 检索：科技数据类查询应命中信息图/数据类模板
  const hits = await retrieveTemplates("科技 数据可视化 图表 信息图 蓝色", { limit: 3 })
  assert(hits.length > 0, "bigram 检索有命中", `n=${hits.length}`)
  assert(hits.every((h) => h.prompt.length > 20 && h.title.length > 0), "命中条目结构完整（title+prompt）")
  const hitScores = hits.map((h) => `${h.categoryZh}:${h.title.slice(0, 12)}`).join(" / ")
  console.log(`    ↳ top3: ${hitScores}`)

  // 英文词检索
  const enHits = await retrieveTemplates("isometric 3D dashboard", { limit: 2 })
  assert(enHits.length > 0, "拉丁词检索通道")
  // 无命中查询（纯生僻拉丁词，不带常见 bigram）
  const none = await retrieveTemplates("qqqwwwzzz", { limit: 2 })
  assert(none.length === 0, "无命中返回空（不硬凑）")

  // queryTokens 双通道
  assert(queryTokens("大模型A100芯片").includes("大模") && queryTokens("大模型A100芯片").includes("a100"), "分词双通道（CJK bigram + 拉丁词）")

  // 范例块拼装
  const block = exemplarBlock(hits)
  assert(block.includes("【专业生图提示词范例") && block.includes("范例1"), "范例块格式（学结构不灌全文）")
  assert(!block.includes("英文版"), "范例块只取中文段（不灌双语全文）")
  assert(exemplarBlock([]) === "", "空命中返回空串")

  // limit 钳制
  const many = await retrieveTemplates("图标 logo 品牌", { limit: 99 })
  assert(many.length <= 10, "limit 上限 10（防上下文爆）", `n=${many.length}`)
}

// ---------- ② B2 八风格包 ----------

console.log("━━ ② B2 八风格包 ━━")
{
  assert(IMAGE_STYLES.length === 8, "八个风格", `n=${IMAGE_STYLES.length}`)
  const ids = IMAGE_STYLES.map((s) => s.id)
  assert(["editorial-photo", "ink-wash", "glass-3d"].every((id) => ids.includes(id)), "三个新风格在列")
  assert(IMAGE_STYLES.every((s) => s.prompt.includes("无文字无水印")), "共同铁律：无文字无水印")
  assert(IMAGE_STYLES.every((s) => s.desc && s.desc.length > 6), "每个风格带一句定位说明（UI 提示）")
  assert(IMAGE_STYLES.filter((s) => s.prompt.includes("影棚")).length === 1, "编辑摄影：影棚光浅景深特征")
  assert(IMAGE_STYLES.filter((s) => s.prompt.includes("水墨")).length === 1, "新水墨：宣纸墨晕特征")
}

// ---------- ③ B6 密度分档 + 职责分离 ----------

console.log("━━ ③ B6 密度分档 + 数据卡/意境图职责分离 ━━")
{
  const short = resolveLengthTier("short")
  const medium = resolveLengthTier("medium")
  const deep = resolveLengthTier("deep")
  assert(short.illustrationsMax === 2 && medium.illustrationsMax === 3 && deep.illustrationsMax === 5, "密度分档 2/3/5")
  assert(tierIllustrationRule(deep) === "3~5 张", "密度规则文本注入")

  // 插图规划消息：count_rule 注入 SKILL.md 占位符 + kind 字段在指令里
  const msgs = await illustrationPlanMessages("# T\n\n## 一\n正文", undefined, { countRule: "3~5 张" })
  assert(msgs[0].content.includes("3~5 张"), "count_rule 注入规划 prompt")
  assert(msgs[0].content.includes("kind") && msgs[0].content.includes("data"), "kind 职责分离指令在 prompt")
  assert(msgs[0].content.includes("零错字"), "data=代码排版零错字语义")

  // dataCardMessages：art-direct data-card 分节事实源
  const dmsgs = await dataCardMessages({ heading: "成本下降", point: "推理成本一年降 50%", evidence: ["A100 推理价格从 $x 降到 $y", "批量折扣扩大三倍"], caption: "成本曲线" })
  assert(dmsgs[0].content.includes("数据卡编辑"), "data-card 分节人格")
  assert(dmsgs[0].content.includes("数字只来自证据材料"), "数字纪律（正向表述，S3 改写）")
  assert(dmsgs[1].content.includes("A100 推理价格"), "证据文本注入 user 消息")
}

// ---------- ④ A3 叙事骨架 ----------

console.log("━━ ④ A3 五种叙事骨架 ━━")
{
  assert(NARRATIVE_SKELETONS.length === 5, "五骨架", NARRATIVE_SKELETONS.map((s) => s.id).join("/"))
  assert(SKELETON_IDS.length === 5, "合法 id 清单")
  // 轮换稳定性：同 seed 同骨架；分布覆盖（哈希均匀性抽查）
  assert(pickSkeleton("run-aaa").id === pickSkeleton("run-aaa").id, "同 runId 稳定")
  const seen = new Set<string>()
  for (let i = 0; i < 200; i++) seen.add(pickSkeleton(`seed-${i}`).id)
  assert(seen.size === 5, "200 个 seed 覆盖全部五骨架", [...seen].join("/"))
  assert(resolveSkeleton("bogus") === null, "非法骨架 → null（自动轮换）")
  assert(resolveSkeleton("") === null, "空骨架 → null")
  // 骨架指令注入 outline 消息
  const sk = pickSkeleton("run-xyz")
  const omsgs = await outlineMessages({ brief, ideaTitle: "T", ideaAngle: "", claims: [], skeleton: sk, researchGaps: ["未证实的某数据"] })
  assert(omsgs[0].content.includes(sk.structureRule.slice(0, 20)), "骨架结构指令注入 system")
  assert(omsgs[1].content.includes("研究缺口") && omsgs[1].content.includes("未证实的某数据"), "A4 研究缺口注入 user 消息")
  // 无骨架 → 默认结构语义（占位符渲染为空，SKILL.md 内置默认结构行）
  const omsgs2 = await outlineMessages({ brief, ideaTitle: "T", ideaAngle: "", claims: [] })
  assert(omsgs2[0].content.includes("未指定骨架时用默认结构"), "无骨架 → SKILL.md 默认结构语义保留（S3 措辞）")
  // skeletonBlock 空安全
  assert(skeletonBlock(null) === "", "skeletonBlock 空安全")
}

// ---------- ⑤ A5 扩写消息 ----------

console.log("━━ ⑤ A5 扩写补救（不注水纪律） ━━")
{
  const deep = resolveLengthTier("deep")
  const emsgs = await expandMessages({ draft: "# T\n\n## 一\n短文", persona: { id: "p", label: "冷面分析师", desc: "", voice: "克制冷静" }, tier: deep })
  assert(emsgs[0].content.includes("扩写编辑"), "expand 分节人格（SKILL.md 事实源）")
  assert(emsgs[0].content.includes("4500~8000"), "档位目标注入")
  assert(emsgs[0].content.includes("三类之外的增量都算注水"), "不注水纪律（正向表述，S3 改写）")
  assert(emsgs[1].content.includes("当前 7 字") || emsgs[1].content.includes("还差约"), "当前字数与缺口计算注入")

  // SKILL.md 分节完整性（draft 三分节）
  const { loadSkillPrompt } = await import("../src/lib/runtime/skill-prompt.ts")
  const draftSrc = await loadSkillPrompt("wewrite-draft")
  for (const sec of ["section", "single", "expand"]) {
    assert(extractPromptSection(draftSrc.body, sec).length > 50, `draft SKILL.md ${sec} 分节存在`)
  }
}

console.log("")
console.log(`━━━ 结果：${pass} 通过 / ${fail} 失败 ━━`)
process.exit(fail > 0 ? 1 : 0)
