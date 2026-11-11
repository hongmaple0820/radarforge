// ============================================================
// test-b2-offline.ts —— 内容质量升级批次二离线自测（零 LLM/零网络）
// 覆盖：
//   ① B4 模板库：3774 条全量加载、bigram 检索、范例块拼装
//   ② B2 八风格包：风格齐全、新风格提示词质量
//   ③ B6 密度分档 + 职责分离：illustrationPlanMessages 注入、dataCardMessages 事实源
//   ④ A3 叙事骨架：五骨架、轮换稳定性、outline 消息注入
//   ⑤ A5 扩写消息：SKILL.md expand 分节事实源
//   ⑥ S4 选题采访器（topic-interviewer）
//   ⑦ S4 引用留痕（citation-provenance）
//   ⑧ AIHOT 接入（aihot-access P1：MCP 种子 / 18 源 / ETag / 原文直链）
//   ⑨ AIHOT 增强票（05：热点参考注入 aihot-context-block）
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
import { briefMessages, expandMessages } from "../src/lib/runtime/skills/radar-write.ts"
import { extractPromptSection, loadSkillPrompt, renderPromptTemplate, PIPELINE_SKILL_IDS } from "../src/lib/runtime/skill-prompt.ts"
import { validateIdeaCard, distillIdeaCard, ideaCardBlock, parseInterviewQuestions } from "../src/lib/content/idea-card.ts"
import { interviewerMessages } from "../src/lib/runtime/skills/topic-interview.ts"
import {
  lintArticleCitations, stripOrphanAnchors, citationsArtifact,
  type CitationSource,
} from "../src/lib/content/citations.ts"
import { DEFAULT_MCP_SERVERS } from "../src/lib/agent/mcp-seeds.ts"
import { DEFAULT_FEEDS, fetchAndParse, parseFeed, originalLinkFromDescription } from "../src/lib/sources/rss.ts"
import { aihotBlock, type AihotTopic } from "../src/lib/content/aihot-block.ts"
import http from "node:http"

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

// ---------- ⑥ S4 选题采访器 ----------

console.log("━━ ⑥ S4 选题采访器（frontier 轮次产品化） ━━")
{
  // 事实源：SKILL.md 存在、frontier 纪律要素、三维度、完成判据
  const src = await loadSkillPrompt("topic-interviewer")
  assert(src.from === "product", "产品库命中（两级加载）")
  assert(src.body.length > 200, "正文非空且足量", `${src.body.length} 字`)
  assert(src.body.includes("一轮") && src.body.includes("推荐"), "frontier 纪律（一轮问齐+每问推荐）")
  for (const d of ["audience", "boundary", "evidence"]) assert(src.body.includes(d), `维度 ${d} 在协议中`)
  assert(src.body.includes("完成判据"), "完成判据可判定")
  assert(!PIPELINE_SKILL_IDS.has("topic-interviewer"), "非产线技能（停用=入口隐藏而非断线）")

  // 问题协议校验：合法过、越界拒、缺维拒、空推荐拒、非数组拒
  const good = [
    { id: "q1", dimension: "audience", question: "写给谁？", recommended: "刚接触该领域的工程师" },
    { id: "q2", dimension: "audience", question: "读者处境？", recommended: "正在做技术选型" },
    { id: "q3", dimension: "boundary", question: "只看国内吗？", recommended: "只看国内，海外仅作对照" },
    { id: "q4", dimension: "boundary", question: "失效条件？", recommended: "新规落地后失效" },
    { id: "q5", dimension: "evidence", question: "哪些公开数据？", recommended: "价格表与融资新闻" },
    { id: "q6", dimension: "evidence", question: "还有吗？", recommended: "学术基准测试结果" },
  ]
  assert(parseInterviewQuestions(good)?.length === 6, "合法协议通过（6 问三维度）")
  assert(parseInterviewQuestions({ questions: good })?.length === 6, "协议示形包裹对象解包（LLM 实际输出形态）")
  assert(parseInterviewQuestions({ questions: good.slice(0, 4) }) === null, "包裹内越界同样拒收")
  assert(parseInterviewQuestions(good.slice(0, 4)) === null, "4 问（<5）拒收")
  assert(parseInterviewQuestions([...good, { id: "q7", dimension: "audience", question: "x", recommended: "y" }, { id: "q8", dimension: "audience", question: "x", recommended: "y" }, { id: "q9", dimension: "audience", question: "x", recommended: "y" }]) === null, "9 问（>8）拒收")
  assert(parseInterviewQuestions(good.filter((q) => q.dimension !== "evidence")) === null, "维度缺失拒收")
  const badRec = good.map((q, i) => (i === 0 ? { ...q, recommended: "" } : q))
  assert(parseInterviewQuestions(badRec) === null, "空推荐拒收")
  assert(parseInterviewQuestions("not-an-array") === null, "非数组拒收")

  // 蒸馏：同维度归并、全空拒收
  const qa = good.map((q) => ({ ...q, answer: q.recommended }))
  const distilled = distillIdeaCard(qa)
  assert(distilled?.audience === "刚接触该领域的工程师；正在做技术选型", "同维度归并（；连接）")
  assert(distilled?.boundary.includes("只看国内") && distilled?.evidence.includes("价格表"), "边界/证据维度蒸馏")
  assert(distilled?.qa?.length === 6, "qa 留痕随卡")
  assert(distillIdeaCard(good.map((q) => ({ ...q, answer: "" }))) === null, "全空作答 → null")

  // 卡校验：钳长、截断、空白拒收、非对象拒收
  const long = "字".repeat(600)
  const validated = validateIdeaCard({ audience: long, boundary: "边界", evidence: "证据", qa: [...qa, ...qa] })
  assert(validated !== null && validated.audience.length === 500, "超长钳 500")
  assert(validated?.qa?.length === 8, "qa 超限截到 8")
  assert(validated?.qa?.every((x) => x.question.length <= 200 && x.answer.length <= 200 && x.recommended.length <= 200) === true, "qa 逐条截 200")
  assert(validateIdeaCard({ audience: " ", boundary: "b", evidence: "e" }) === null, "空白字段拒收")
  assert(validateIdeaCard(null) === null, "非对象拒收")

  // 注入帧：结构完整、约束语义在帧内
  const block = ideaCardBlock({ audience: "A 读者", boundary: "B 边界", evidence: "E 证据" })
  assert(block.includes("【选题卡（用户采访确认）】"), "帧头")
  assert(block.includes("目标受众：A 读者") && block.includes("适用边界：B 边界") && block.includes("证据可得性：E 证据"), "三字段行")
  assert(block.includes("为准"), "卡优先约束语义在帧内")

  // brief 无卡字节级不变：占位符零字节贡献
  const briefSrc = await loadSkillPrompt("wewrite-brief")
  const rendered = renderPromptTemplate(briefSrc.body, { style_block: "", idea_card_block: "" })
  const withoutToken = renderPromptTemplate(briefSrc.body.replace(/\{\{idea_card_block\}\}/g, ""), { style_block: "" })
  assert(rendered === withoutToken, "无卡占位符零字节贡献（字节级不变）")
  assert(!/\{\{/.test(rendered), "无占位符残留")
  assert(!rendered.includes("选题卡"), "无卡渲染不含选题卡语义")

  // briefMessages 组装：无卡不注入；有卡注入；user 形态不变
  const noCardMsgs = await briefMessages("测试选题", "")
  assert(noCardMsgs[0].content === rendered, "briefMessages 无卡 = SKILL.md 直渲染（逐字节）")
  const card = validateIdeaCard({ audience: "刚接触该领域的工程师", boundary: "只看国内", evidence: "价格表与融资新闻" })
  const withCardMsgs = await briefMessages("测试选题", "", undefined, card ?? undefined)
  assert(withCardMsgs[0].content.includes("【选题卡（用户采访确认）】"), "有卡注入帧")
  assert(withCardMsgs[0].content.includes("刚接触该领域的工程师"), "卡字段值进 system")
  assert(withCardMsgs[1].content.includes("测试选题"), "user 消息形态不变")

  // 采访消息组装：system=SKILL.md 渲染；user 含选题与角度
  const ivMsgs = await interviewerMessages("某选题", "某角度")
  assert(ivMsgs[0].content === renderPromptTemplate((await loadSkillPrompt("topic-interviewer")).body, {}), "system=SKILL.md 渲染")
  assert(ivMsgs[1].content.includes("某选题") && ivMsgs[1].content.includes("某角度"), "user 含选题与角度")
  const ivMsgs2 = await interviewerMessages("某选题", "")
  assert(ivMsgs2[1].content.includes("自行判断"), "无角度时自行判断提示")
}

// ---------- ⑦ S4 引用留痕（citation-provenance） ----------

console.log("━━ ⑦ S4 引用留痕（A4 引用面闭环，S4 余项②） ━━")
{
  // 账本：1/3 号 verified，2 号未证实（脚注区跳号缺位），编号空间=3
  const claims: CitationSource[] = [
    { idx: 1, claimType: "fact", text: "甲公司完成 B 轮融资", verified: true, sourceSite: "36氪", sourceTitle: "甲公司获 B 轮融资", sourceDate: "2026-10-01", sourceUrl: "https://36kr.com/p/1" },
    { idx: 2, claimType: "fact", text: "乙市发布新规", verified: false, sourceSite: "", sourceTitle: "", sourceDate: "", sourceUrl: "" },
    { idx: 3, claimType: "fact", text: "丙产品 Q3 增长 40%", verified: true, sourceSite: "虎嗅", sourceTitle: "丙产品 Q3 财报", sourceDate: "2026-11-01", sourceUrl: "https://huxiu.com/2" },
  ]
  const md = [
    "# 标题",
    "",
    "甲公司完成 B 轮融资[1]，业内关注[2]，相关传闻[2]。",
    "丙产品 Q3 增长 40%[3]。",
    "另有夸张说法[9]与宽编号[123]。",
    "```",
    "代码块内 [4] 不是锚点（排版不走 inlineMd 锚点）",
    "```",
    "结尾[0]。",
  ].join("\n")

  // lint：锚点统计 / 悬空两种形态 / fence 口径 / 三位编号与 [0] 语义
  const lint = lintArticleCitations(md, claims)
  assert(lint.anchors === 6, "锚点总数（fence 内 [4] 与三位 [123] 不计）", `${lint.anchors}`)
  assert(lint.valid === 2, "可解析锚点（[1]×1+[3]×1）", `${lint.valid}`)
  assert(JSON.stringify(lint.orphanNumbers) === JSON.stringify([0, 2, 9]), "悬空编号去重排序（[2]未证实/[9]超范围/[0]越界）")
  assert(lint.orphanOccurrences === 4, "悬空出现次数（[2]×2+[9]×1+[0]×1）", `${lint.orphanOccurrences}`)
  assert(JSON.stringify(lint.used) === JSON.stringify([1, 3]), "被引用且可解析编号集")

  // strip：机械移除悬空锚保留句子；valid 不动；fence 不误伤；无悬空字节级不变
  const strip = stripOrphanAnchors(md, claims)
  assert(strip.removed === 4, "移除计数（[2]×2+[9]×1+[0]×1）", `${strip.removed}`)
  assert(!strip.text.includes("[2]") && !strip.text.includes("[9]") && !strip.text.includes("[0]"), "悬空锚全移除")
  assert(strip.text.includes("B 轮融资[1]") && strip.text.includes("40%[3]"), "valid 锚保留")
  assert(strip.text.includes("代码块内 [4] 不是锚点"), "fence 内 [4] 不误伤（口径与排版一致）")
  assert(strip.text.includes("宽编号[123]"), "三位编号不属于锚点正则（\\d{1,2} 口径对齐 render）")
  const clean = "干净稿[1]一句[3]两句。\n```py\nx[9]\n```"
  const stripClean = stripOrphanAnchors(clean, claims)
  assert(stripClean.text === clean && stripClean.removed === 0, "无悬空 → 字节级不变（零改动路径）")

  // citationsArtifact：fact 全量含未证实 flagged；四元组与 citedCount；REF/ASSERT 不入由调用侧保证
  const art = citationsArtifact(claims, lint, strip.removed)
  assert(art.total === 3 && art.verified === 2 && art.cited === 2, "total/verified/cited 计数")
  assert(art.orphanRemoved === 4, "orphanRemoved 留痕随账本")
  assert(art.sources[0].sourceSite === "36氪" && art.sources[0].sourceTitle === "甲公司获 B 轮融资", "四元组字段名与 db.claim 一致")
  assert(art.sources[0].sourceUrl === "https://36kr.com/p/1" && art.sources[2].sourceDate === "2026-11-01", "url/date 完整")
  assert(art.sources[0].citedCount === 1 && art.sources[1].citedCount === 0 && art.sources[2].citedCount === 1, "citedCount 逐条")
  assert(art.sources[1].verified === false, "未证实 flagged 入账本（审计视角）")

  // 空账本：全部锚悬空；artifact 空；strip 后正文无锚
  const lintEmpty = lintArticleCitations("提到[1]和[2]", [])
  assert(lintEmpty.anchors === 2 && lintEmpty.valid === 0 && lintEmpty.orphanOccurrences === 2, "空账本 → 全悬空")
  const artEmpty = citationsArtifact([], lintEmpty, 2)
  assert(artEmpty.total === 0 && artEmpty.sources.length === 0, "空 sources 不硬凑")
  const stripEmpty = stripOrphanAnchors("提到[1]和[2]", [])
  assert(stripEmpty.text === "提到和" && stripEmpty.removed === 2, "空账本机械移除")

  // wordCount 口径对齐（票 02 重算留缝）：锚点字符计入正文体字数
  const wc = (s: string) => s.replace(/\s/g, "").length
  assert(wc(md) - wc(strip.text) === 12, "移除 4 锚 × 3 字符 = 12（\\s 剔除同口径）", `${wc(md) - wc(strip.text)}`)
}

// ---------- ⑧ AIHOT 接入（aihot-access P1：MCP 种子 / 18 源 / ETag / 原文直链） ----------

console.log("━━ ⑧ AIHOT 接入 ━━")
{
  // 票 01：MCP 默认种子常量（独立零依赖模块，mcp-client 消费）
  assert(DEFAULT_MCP_SERVERS.length === 2, "MCP 默认种子两行（DeepWiki + AIHOT）", DEFAULT_MCP_SERVERS.map((s) => s.name).join(" / "))
  const aihotSeed = DEFAULT_MCP_SERVERS.find((s) => s.name === "AIHOT")
  assert(aihotSeed?.transport === "http" && aihotSeed?.url === "https://aihot.news/api/mcp" && aihotSeed?.enabled === true, "AIHOT 行四元组精确（http / api/mcp / enabled）", JSON.stringify(aihotSeed ?? null))
  // 票 02：DEFAULT_FEEDS 18 条 AIHOT 源（D2「全都要」：6 主源 + 6 分类 + 6 全文分类）
  assert(DEFAULT_FEEDS.length === 42, "默认源 24 → 42（+18 AIHOT）", `n=${DEFAULT_FEEDS.length}`)
  const aihotFeeds = DEFAULT_FEEDS.filter((f) => f.site === "aihot.news")
  assert(aihotFeeds.length === 18, "AIHOT 源 18 条（D2 全都要）", `n=${aihotFeeds.length}`)
  const urlSet = new Set(DEFAULT_FEEDS.map((f) => f.url))
  assert(urlSet.size === DEFAULT_FEEDS.length, "全表 url 唯一（幂等补种兜底）", `dup=${DEFAULT_FEEDS.length - urlSet.size}`)
  const aihotExpected = new Set([
    "https://aihot.news/feed.xml", "https://aihot.news/feed/full.xml", "https://aihot.news/feed/all.xml",
    "https://aihot.news/feed/daily.xml", "https://aihot.news/feed/weekly.xml", "https://aihot.news/feed/monthly.xml",
    ...["ai-models", "ai-products", "industry", "paper", "tip", "opinion"].map((s) => `https://aihot.news/feed/category/${s}.xml`),
    ...["ai-models", "ai-products", "industry", "paper", "tip", "opinion"].map((s) => `https://aihot.news/feed/full/category/${s}.xml`),
  ])
  assert(aihotFeeds.every((f) => aihotExpected.has(f.url)) && aihotFeeds.length === aihotExpected.size, "18 地址与官方 feed 全表精确相等（6 主源+6 分类+6 全文分类）")
  assert(aihotFeeds.every((f) => f.category === "AI聚合" && f.name.startsWith("AIHOT") && f.name.length > 4), "统一 category=AI聚合、命名 AIHOT 前缀")
  const nonAihot = DEFAULT_FEEDS.filter((f) => f.site !== "aihot.news")
  assert(nonAihot.length === 24 && nonAihot.every((f) => !f.url.includes("aihot")), "原 24 源零改动（IN 语义：非 AIHOT 行不受影响）")

  // 票 03：ETag 条件请求（本地 HTTP 服务器 304 往返，零外网）
  const localXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>本地测试源</title><item><title>本地条目</title><link>http://127.0.0.1/x</link></item></channel></rss>`
  const localEtag = 'W/"etag-local-1"'
  const seenIfNoneMatch: string[] = []
  const server = http.createServer((req, res) => {
    seenIfNoneMatch.push(String(req.headers["if-none-match"] ?? ""))
    if (req.headers["if-none-match"] === localEtag) {
      res.writeHead(304, { ETag: localEtag })
      res.end()
      return
    }
    res.writeHead(200, { "Content-Type": "application/rss+xml", ETag: localEtag })
    res.end(localXml)
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()))
  const localPort = (server.address() as { port: number }).port
  const localUrl = `http://127.0.0.1:${localPort}/feed.xml`
  try {
    const e1 = await fetchAndParse(localUrl)
    assert(e1.notModified === false && e1.feed.items.length === 1, "第一轮 200 + 正常解析（无 etag 不发条件头）", `items=${(e1 as { feed?: { items?: unknown[] } }).feed?.items?.length ?? "n/a"}`)
    assert(e1.etag === localEtag, "第一轮捕获响应 ETag（回存种子）", String((e1 as { etag?: string }).etag ?? "n/a"))
    const e2 = await fetchAndParse(localUrl, 5_000, "", e1.etag)
    assert(e2.notModified === true, "第二轮带 If-None-Match → 304 notModified（零正文传输）", `notModified=${(e2 as { notModified?: boolean }).notModified}`)
    assert(e2.feed.items.length === 0, "notModified 时 feed 为空壳")
    assert(e2.etag === localEtag, "304 回显 ETag 保留（不清空）")
    const e3 = await fetchAndParse(localUrl, 5_000, "", "")
    assert(e3.notModified === false && e3.feed.items.length === 1, "IN1：不带 etag → 200 正常解析（既有行为不变）")
    assert(seenIfNoneMatch.length === 3 && seenIfNoneMatch[0] === "" && seenIfNoneMatch[1] === localEtag && seenIfNoneMatch[2] === "", "服务器侧验证：仅第二轮携带 If-None-Match", seenIfNoneMatch.join(" / "))
  } finally {
    server.close()
  }

  // 票 04：原文直链（originalLinkFromDescription 函数族 + parseFeed 发现层）
  assert(originalLinkFromDescription('<p><a href="https://example.com/post/1">🔗 阅读原文</a>｜<a href="https://aihot.news/items/abc">via AIHOT</a></p>') === "https://example.com/post/1", "带「阅读原文」标签锚取 href")
  assert(originalLinkFromDescription('<a href="https://aihot.news/items/x">via AIHOT</a>') === null, "无标签锚 → null（站内链不误判）")
  assert(originalLinkFromDescription("无锚文本") === null, "无锚 → null")
  assert(originalLinkFromDescription('<a href="https://a.com/1">点这里</a><a href="https://a.com/2">阅读原文</a>') === "https://a.com/2", "多锚取带标签者（非首个）")
  assert(originalLinkFromDescription('<a href="javascript:void(0)">阅读原文</a>') === null, "非 http(s) 协议拒收")
  assert(originalLinkFromDescription('<a class="x" href="https://a.com/3">阅读原文</a>') === "https://a.com/3", "带属性锚仍取 href")

  // parseFeed AIHOT 样例：originalUrl 只发现不改写（url 仍为站内阅读页）
  const aihotSampleXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>AIHOT — 精选</title><ttl>30</ttl><item><title><![CDATA[某公司发布新模型]]></title><link>https://aihot.news/items/abc123</link><description><![CDATA[<p>摘要文字。</p><p><a href="https://example.com/post/1">🔗 阅读原文</a>｜<a href="https://aihot.news/items/abc123">via AIHOT</a></p>]]></description><category>AI 模型</category><pubDate>Tue, 11 Nov 2026 08:00:00 GMT</pubDate><guid isPermaLink="false">abc123</guid></item></channel></rss>`
  const ap = parseFeed(aihotSampleXml)
  assert(ap.items.length === 1 && ap.items[0].guid === "abc123", "AIHOT 样例：guid 拾取（isPermaLink 属性旁路）")
  assert(ap.items[0].url === "https://aihot.news/items/abc123", "解析层不改写 url（条目页忠实保留，回填归存储层）")
  assert(ap.items[0].originalUrl === "https://example.com/post/1", "originalUrl 发现层抽出（阅读原文锚）")
  assert(ap.items[0].publishedAt !== null && ap.items[0].summary.includes("摘要文字") && !ap.items[0].summary.includes("<a"), "pubDate/去标签摘要既有行为不回退")
  const plainXml = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title><item><title>普通源条目</title><link>https://plain.example/x</link><description><![CDATA[<p>无标签链接 <a href="https://plain.example/y">详情</a></p>]]></description></item></channel></rss>`
  assert(parseFeed(plainXml).items[0].originalUrl === "", "IN2：无「阅读原文」锚的普通形态不产出 originalUrl")
}

// ---------- ⑨ AIHOT 增强票（aihot-context-block：热点参考注入） ----------
console.log("━━ ⑨ AIHOT 热点参考注入（aihot-access 05） ━━")
{
  // 帧纪律（纯函数层，b2 直读零依赖口径）
  assert(aihotBlock([]) === "", "空数组 → 空串（无数据零贡献）")
  const topics: AihotTopic[] = [
    { title: "某公司发布新模型", summary: "官方给出总参 280B 与 1M 上下文规格，权重将开源。" },
    { title: "某厂商 IPO 定价", summary: "发行价区间 70 至 78 美元，估值接近 1.3 万亿美元。" },
    { title: "某基准测试出结果", summary: "编码与 Agent 任务上进入第一梯队。" },
  ]
  const blk = aihotBlock(topics)
  assert(blk.includes("【AIHOT 热点参考"), "帧头")
  assert(blk.includes("某公司发布新模型") && blk.includes("某厂商 IPO 定价") && blk.includes("某基准测试出结果"), "三条目行全部入帧")
  assert(blk.includes("仅作视野参考") || blk.includes("视野参考"), "纪律句在帧内（事实仍须走证据链）")
  assert(!blk.includes("undefined") && !blk.includes("NaN"), "无 undefined/NaN 残留")

  // 截断纪律：title 80 / summary 120
  const longTopic: AihotTopic = { title: "长".repeat(100), summary: "摘".repeat(300) }
  const longBlk = aihotBlock([longTopic])
  assert(!longBlk.includes("长".repeat(81)), "title 截 80（无超长残留）")
  assert(!longBlk.includes("摘".repeat(121)), "summary 截 120（无超长残留）")
  assert(longBlk.includes("长".repeat(80)) && longBlk.includes("摘".repeat(120)), "截断边界保留（80/120 内容完整）")

  // 占位符事实源：两 SKILL.md 持 {{aihot_block}}
  const briefSrc05 = await loadSkillPrompt("wewrite-brief")
  assert(briefSrc05.body.includes("{{aihot_block}}"), "wewrite-brief 持 {{aihot_block}} 占位符")
  assert(/\{\{style_block\}\}\{\{idea_card_block\}\}\{\{aihot_block\}\}/.test(briefSrc05.body), "三占位符同线相邻（渲染行形态）")
  const ivSrc05 = await loadSkillPrompt("topic-interviewer")
  assert(ivSrc05.body.includes("{{aihot_block}}"), "topic-interviewer 持 {{aihot_block}} 占位符")

  // IN1 无数据字节级不变：三占位符全空渲染 === 剔占位符渲染
  const stripped = briefSrc05.body.replace(/\{\{style_block\}\}\{\{idea_card_block\}\}\{\{aihot_block\}\}/g, "")
  const rendered05 = renderPromptTemplate(briefSrc05.body, { style_block: "", idea_card_block: "", aihot_block: "" })
  assert(rendered05 === renderPromptTemplate(stripped, { style_block: "" }), "IN1：无数据字节级不变（渲染 === 剔占位符渲染）")
  assert(!/\{\{/.test(rendered05), "无占位符残留")

  // briefMessages 第 5 参：默认空 = SKILL.md 直渲染（⑥ 节旧断言兼容）；传入块注入 system
  const noBlkMsgs = await briefMessages("测试选题", "")
  assert(noBlkMsgs[0].content === rendered05, "briefMessages 默认参数 = 直渲染（逐字节）")
  const withBlkMsgs = await briefMessages("测试选题", "", undefined, undefined, aihotBlock(topics))
  assert(withBlkMsgs[0].content.includes("【AIHOT 热点参考"), "brief system 注入热点帧")
  assert(withBlkMsgs[0].content.includes("某公司发布新模型"), "条目值进 system")

  // interviewerMessages 第 3 参：默认空 = SKILL.md 直渲染；传入块注入
  const ivNoBlk = await interviewerMessages("某选题", "")
  assert(ivNoBlk[0].content === renderPromptTemplate(ivSrc05.body, { aihot_block: "" }), "interviewerMessages 默认 = 直渲染")
  const ivWithBlk = await interviewerMessages("某选题", "", aihotBlock(topics))
  assert(ivWithBlk[0].content.includes("【AIHOT 热点参考"), "interviewer system 注入热点帧")
}

console.log("")
console.log(`━━━ 结果：${pass} 通过 / ${fail} 失败 ━━━`)
process.exit(fail > 0 ? 1 : 0)
