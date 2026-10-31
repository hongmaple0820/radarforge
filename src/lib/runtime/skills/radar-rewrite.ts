// ============================================================
// radar-rewrite —— 一稿多发改写 skill
// 同一成稿 → 平台定制版（CSDN / 小红书 / 抖音口播稿）
// ============================================================

import type { ChatMessage } from "@/lib/gateway/types"

export interface RewriteTarget {
  id: string
  label: string
  instruction: string
}

export const REWRITE_TARGETS: RewriteTarget[] = [
  {
    id: "csdn",
    label: "CSDN 博客版",
    instruction: [
      "改写为 CSDN 技术博客风格：",
      "- 开头加一段「本文速览」引用块（3~5 行要点）",
      "- 标题可加技术关键词便于搜索",
      "- 文末加「参考来源」列表（带可点击 URL，CSDN 支持外链）",
      "- 保留 [n] 标记可改为 [n] 文字形式",
      "- 语气可更技术化，篇幅保持或略增",
    ].join("\n"),
  },
  {
    id: "xiaohongshu",
    label: "小红书笔记版",
    instruction: [
      "改写为小红书笔记风格：",
      "- 标题 ≤20 字带 1~2 个 emoji（用文字描述位置）",
      "- 正文 ≤600 字，短句为主，分段密集",
      "- 开头一行钩子，结尾 3~5 个话题标签（#xxx）",
      "- 去掉 [n] 上标，来源信息浓缩为文末一行「信息来源」",
    ].join("\n"),
  },
  {
    id: "shortvideo",
    label: "短视频口播稿",
    instruction: [
      "改写为 60 秒短视频口播稿：",
      "- 前 3 秒钩子（提问/冲突/反常识）",
      "- 全文口语化短句，总字数 220~280 字",
      "- 用「——」标注分镜停顿，重要数字单独一行",
      "- 结尾一个互动引导 + 信息来源一句话",
    ].join("\n"),
  },
]

export function rewriteMessages(markdown: string, target: RewriteTarget): ChatMessage[] {
  return [
    {
      role: "system",
      content: `你是多平台内容运营，擅长一稿多发改写。${target.instruction}\n输出改写后的完整内容，格式用 Markdown。不要解释。`,
    },
    { role: "user", content: markdown.slice(0, 9000) },
  ]
}

// ---------- 视频分镜脚本（视频线 MVP：脚本先行，成片渲染属 Phase 3） ----------

export interface StoryboardScene {
  id: number
  seconds: number
  visual: string // 画面描述（拍摄/素材建议）
  narration: string // 口播文本
  subtitle: string // 屏幕字幕
  broll: string // B-roll 素材建议
  /** P1 混合通道：code=代码动画（数据/字排/对比，确定性零错字）｜model=AI 视频模型（实景/情绪 b-roll，5~10s）；缺省 code */
  render?: "code" | "model"
}

/** 选定方向的轻量摘要（随分镜存储，供渲染取色与恢复） */
export interface DirectionBrief {
  key: string
  kind: string
  name: string
  language: string
  accent: string
  base: string
  feel: string
}

export interface Storyboard {
  title: string
  hook: string // 前 3 秒钩子
  totalSeconds: number
  scenes: StoryboardScene[]
  bgm: string // 音乐风格建议
  caption: string // 发布文案 + 话题标签
  direction?: DirectionBrief
}

export function storyboardMessages(markdown: string, platform: string, direction?: DirectionBrief): ChatMessage[] {
  const dirBlock = direction
    ? [
        "",
        "【已选定导演方向（分镜必须贯彻它的语言与节奏）】",
        `方向 ${direction.key} · ${direction.name}（${direction.kind === "amplify" ? "B·放大" : direction.kind === "unexpected" ? "C·意外" : "A·贴合"}）`,
        `语言与技法：${direction.language}`,
        `节奏：${direction.feel}`,
        `主视觉色 #${direction.accent.replace("#", "")}（场景卡/字幕强调都用这个色系）`,
        "分镜的 visual 要按这个方向的语言写（怎么动、什么材质），不是通用描述；分镜节奏长短要对齐方向 feel 的快慢。",
      ].join("\n")
    : ""
  return [
    {
      role: "system",
      content: [
        "你是短视频编导，把图文成稿改编为可拍摄的分镜脚本。",
        `目标平台：${platform}。总时长 45~75 秒，6~9 个分镜。`,
        "要求：",
        "- hook：前 3 秒钩子（提问/冲突/反常识），一句话",
        "- 每个分镜：seconds（2~12 秒）、visual（画面怎么做：实拍/屏幕录制/AI 素材）、narration（口播，口语短句）、subtitle（屏幕大字 ≤12 字）、broll（空镜素材建议）",
        "- render（混合通道标注，每个分镜必填）：画面是数据/数字/对比/字排/流程/品牌一致性 → \"code\"（代码动画，确定可控零错字）；画面是实景氛围/情绪镜头/转场空镜 → \"model\"（AI 视频模型 5~10 秒插播）。资讯速递类视频 code 应占大多数，model 只在真正需要实拍感的镜头用（通常 1~3 镜）",
        "- caption：发布文案（含 3~5 个 #话题标签）",
        "- 事实数字保留原文，不得新增未经证实的数字",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{`,
        `  "title": "视频标题",`,
        `  "hook": "前3秒钩子",`,
        `  "totalSeconds": 60,`,
        `  "scenes": [ { "id": 1, "seconds": 5, "render": "code", "visual": "...", "narration": "...", "subtitle": "...", "broll": "..." } ],`,
        `  "bgm": "音乐风格建议",`,
        `  "caption": "发布文案 #标签"`,
        `}`,
      ].join("\n") + dirBlock,
    },
    { role: "user", content: markdown.slice(0, 9000) },
  ]
}

// ---------- 选题直出（P0：视频线解耦图文线） ----------
// 输入是「选题 + 检索摘要」而非成稿；分镜吃检索要点而非全文，
// 事实密度有下限（检索摘要带着日期与来源）；没有的文章细节不编造。

export interface ResearchDigestItem {
  title: string
  site: string
  date: string
  url: string
  snippet: string
}

export interface ResearchDigest {
  mode: "REAL" | "DEMO"
  items: ResearchDigestItem[]
}

export function digestToText(digest: ResearchDigest): string {
  return digest.items
    .map((r, i) => `${i + 1}. ${r.title}（${r.site} · ${r.date}）\n   ${r.snippet}`)
    .join("\n")
}

export function storyboardDirectMessages(input: {
  topic: string
  angle: string
  digest: ResearchDigest
  platform: string
  direction?: DirectionBrief
}): ChatMessage[] {
  const dirBlock = input.direction
    ? [
        "",
        "【已选定导演方向（分镜必须贯彻它的语言与节奏）】",
        `方向 ${input.direction.key} · ${input.direction.name}（${input.direction.kind === "amplify" ? "B·放大" : input.direction.kind === "unexpected" ? "C·意外" : "A·贴合"}）`,
        `语言与技法：${input.direction.language}`,
        `节奏：${input.direction.feel}`,
        `主视觉色 #${input.direction.accent.replace("#", "")}（场景卡/字幕强调都用这个色系）`,
        "分镜的 visual 要按这个方向的语言写（怎么动、什么材质），不是通用描述。",
      ].join("\n")
    : ""
  return [
    {
      role: "system",
      content: [
        "你是短视频编导。用户给一个选题（没有成稿），你基于检索到的资讯要点直接创作分镜脚本。",
        `目标平台：${input.platform}。总时长 45~75 秒，6~9 个分镜。`,
        "要求：",
        "- hook：前 3 秒钩子（提问/冲突/反常识），一句话",
        "- 每个分镜：seconds（2~12 秒）、visual（画面怎么做：数据卡/大字/素材混剪）、narration（口播，口语短句）、subtitle（屏幕大字 ≤12 字）、broll（空镜素材建议）",
        "- render（混合通道标注，每个分镜必填）：数据/数字/对比/字排/流程 → \"code\"（代码动画）；实景氛围/情绪镜头/转场空镜 → \"model\"（AI 视频模型 5~10 秒）。code 应占大多数，model 只给真正需要实拍感的镜头（1~3 镜）",
        "- caption：发布文案（含 3~5 个 #话题标签）",
        "- 事实数字只能来自检索摘要（保留原文数字与日期），检索没有的细节一律不编造——宁可讲观点也不造事实",
        "- 检索摘要为 DEMO 演示数据时（标题带「演示数据」），只借用主题方向，不使用其中的具体数字",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{`,
        `  "title": "视频标题",`,
        `  "hook": "前3秒钩子",`,
        `  "totalSeconds": 60,`,
        `  "scenes": [ { "id": 1, "seconds": 5, "render": "code", "visual": "...", "narration": "...", "subtitle": "...", "broll": "..." } ],`,
        `  "bgm": "音乐风格建议",`,
        `  "caption": "发布文案 #标签"`,
        `}`,
      ].join("\n") + dirBlock,
    },
    {
      role: "user",
      content: [
        `选题：${input.topic}`,
        `角度：${input.angle || "（自行判断最佳角度）"}`,
        "",
        "【检索摘要（唯一的事实来源）】",
        digestToText(input.digest) || "（无检索结果：全部用观点推进，不出现任何具体数字）",
      ].join("\n"),
    },
  ]
}

export function directionsDirectMessages(input: { topic: string; angle: string; digest: ResearchDigest; platform: string }): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是宣传片导演（学 huashu-motion 的导演工作流）。理解这个选题与检索要点，为它提出三个真正不同的视频方向，供用户三选一。",
        `目标平台：${input.platform}，成片 45~75 秒。`,
        "三方向规则（严格执行）：",
        "- A · Fit（贴合）：信息形态与内容个性指向的、稳妥而优秀的语言。是安全选择。",
        "- B · Amplify（放大）：同一信息推向更大胆的语言——一镜到底 / 大字报字体当主角 / 更快节奏蒙太奇 / 空间纵深，任选其一。能量比 A 高。",
        "- C · Unexpected（意外）：换一种仍然承载信息、契合气质的意外语言——艺术史重构 / 角色小故事 / 编辑拼贴 / 日常器物开场等。仍要讲这件事本身，不是为新奇而新奇。",
        "- 恰好一个方向使用「空间纵深」（把界面/数据/物件放进空间里运镜），其余两个以平面语言为主。",
        "- 三个方向的差异必须在「语言与材质」，不许只是换配色；能量轴也要有差异，至少一个是快节奏蒙太奇版。",
        "- 每个方向 palette.accent 取内容自然衍生色（主题色/数据色/情绪色），base 一深一浅要有别，note 一句话说明颜色从哪来。",
        "- 推荐标记 recommended：按内容形态选一个最合适的（不默认 A）。",
        "每字段都短而具体（feel 要提到前 3 秒无声时观众看到什么）。严格输出 JSON（不要 markdown 代码块）：",
        `{`,
        `  "directions": [`,
        `    { "key": "A", "kind": "fit", "name": "证据链", "language": "节奏卡点 + 数据砸入（语言 + 技法）", "logline": "一句话：钩子→…→结尾", "why": "信息形态+个性 → 该语言", "feel": "蒙太奇 · 120BPM · 前3秒：大数字砸满屏", "palette": { "accent": "#38bdf8", "base": "#0b1220", "note": "科技蓝取自数据图表" }, "depth": false, "recommended": false },`,
        `    { "key": "B", "kind": "amplify", "name": "…", "language": "…", "logline": "…", "why": "…", "feel": "…", "palette": { "accent": "…", "base": "…", "note": "…" }, "depth": true, "recommended": true },`,
        `    { "key": "C", "kind": "unexpected", "name": "…", "language": "…", "logline": "…", "why": "…", "feel": "…", "palette": { "accent": "…", "base": "…", "note": "…" }, "depth": false, "recommended": false }`,
        `  ]`,
        `}`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `选题：${input.topic}`,
        `角度：${input.angle || "（自行判断）"}`,
        "",
        "【检索摘要（供理解内容形态）】",
        digestToText(input.digest).slice(0, 4000) || "（无检索结果，按选题字面理解）",
      ].join("\n"),
    },
  ]
}

// ---------- 导演三方向提案（学 huashu-motion director §4：A·Fit / B·Amplify / C·Unexpected） ----------

export interface DirectionProposal {
  key: "A" | "B" | "C"
  kind: "fit" | "amplify" | "unexpected"
  name: string // 方向名（两~五字，有辨识度）
  language: string // motion language + 技法亮点（怎么动）
  logline: string // 一句话讲整片：钩子 + 结尾
  why: string // 为什么适合这个内容（信息形态 + 个性一句话）
  feel: string // 节奏感：连续/蒙太奇/混剪 · 快慢 · 前 3 秒无声看什么
  palette: { accent: string; base: string; note: string } // 主色 / 底色（hex）+ 用色来源说明
  depth: boolean // 是否空间纵深方向（三方向中恰好一个）
  recommended: boolean // 导演推荐
}

export function directionsMessages(markdown: string, platform: string): ChatMessage[] {
  return [
    {
      role: "system",
      content: [
        "你是宣传片导演（学 huashu-motion 的导演工作流）。通读这篇内容，为它提出三个真正不同的视频方向，供用户三选一。",
        `目标平台：${platform}，成片 45~75 秒。`,
        "三方向规则（严格执行）：",
        "- A · Fit（贴合）：信息形态与内容个性指向的、稳妥而优秀的语言。是安全选择。",
        "- B · Amplify（放大）：同一信息推向更大胆的语言——一镜到底 / 大字报字体当主角 / 更快节奏蒙太奇 / 空间纵深，任选其一。能量比 A 高。",
        "- C · Unexpected（意外）：换一种仍然承载信息、契合气质的意外语言——艺术史重构 / 角色小故事 / 编辑拼贴 / 日常器物开场等。仍要讲这件事本身，不是为新奇而新奇。",
        "- 恰好一个方向使用「空间纵深」（把界面/数据/物件放进空间里运镜），其余两个以平面语言为主。",
        "- 三个方向的差异必须在「语言与材质」，不许只是换配色；能量轴也要有差异，至少一个是快节奏蒙太奇版。",
        "- 每个方向 palette.accent 取内容自然衍生色（主题色/数据色/情绪色），base 一深一浅要有别，note 一句话说明颜色从哪来。",
        "- 推荐标记 recommended：按内容形态选一个最合适的（不默认 A）。",
        "每字段都短而具体（feel 要提到前 3 秒无声时观众看到什么）。严格输出 JSON（不要 markdown 代码块）：",
        `{`,
        `  "directions": [`,
        `    { "key": "A", "kind": "fit", "name": "证据链", "language": "节奏卡点 + 数据砸入（语言 + 技法）", "logline": "一句话：钩子→…→结尾", "why": "信息形态+个性 → 该语言", "feel": "蒙太奇 · 120BPM · 前3秒：大数字砸满屏", "palette": { "accent": "#38bdf8", "base": "#0b1220", "note": "科技蓝取自数据图表" }, "depth": false, "recommended": false },`,
        `    { "key": "B", "kind": "amplify", "name": "…", "language": "…", "logline": "…", "why": "…", "feel": "…", "palette": { "accent": "…", "base": "…", "note": "…" }, "depth": true, "recommended": true },`,
        `    { "key": "C", "kind": "unexpected", "name": "…", "language": "…", "logline": "…", "why": "…", "feel": "…", "palette": { "accent": "…", "base": "…", "note": "…" }, "depth": false, "recommended": false }`,
        `  ]`,
        `}`,
      ].join("\n"),
    },
    { role: "user", content: markdown.slice(0, 9000) },
  ]
}

const HEX_RE = /^#[0-9a-fA-F]{6}$/

export function parseDirections(raw: unknown): DirectionProposal[] {
  if (!raw || typeof raw !== "object") return []
  const o = raw as Record<string, unknown>
  const list = Array.isArray(o.directions) ? o.directions : []
  const out: DirectionProposal[] = []
  const seenKind = new Set<string>()
  for (const item of list) {
    const x = item as Record<string, unknown>
    const kindRaw = String(x.kind ?? "")
    const kind: DirectionProposal["kind"] = kindRaw === "amplify" ? "amplify" : kindRaw === "unexpected" ? "unexpected" : "fit"
    if (seenKind.has(kind)) continue
    seenKind.add(kind)
    const p = (x.palette ?? {}) as Record<string, unknown>
    const accent = HEX_RE.test(String(p.accent)) ? String(p.accent) : "#f59e0b"
    const base = HEX_RE.test(String(p.base)) ? String(p.base) : "#0b1220"
    out.push({
      key: kind === "fit" ? "A" : kind === "amplify" ? "B" : "C",
      kind,
      name: String(x.name ?? "").slice(0, 24) || "未命名方向",
      language: String(x.language ?? "").slice(0, 160),
      logline: String(x.logline ?? "").slice(0, 160),
      why: String(x.why ?? "").slice(0, 160),
      feel: String(x.feel ?? "").slice(0, 160),
      palette: { accent, base, note: String(p.note ?? "").slice(0, 120) },
      depth: Boolean(x.depth),
      recommended: Boolean(x.recommended),
    })
  }
  return out.slice(0, 3)
}

// ---------- 指着改：单场景修订（学 huashu-motion studio「指着帧提意见」） ----------

export function sceneReviseMessages(scene: StoryboardScene, sb: Storyboard, feedback: string): ChatMessage[] {
  const dirNote = sb.direction ? `整片方向：${sb.direction.key} · ${sb.direction.name}（${sb.direction.language}；节奏：${sb.direction.feel}）` : "整片方向：未指定"
  return [
    {
      role: "system",
      content: [
        "你是视频剪辑师。用户看了成片后指着这一个分镜提了修改意见，你只改这一个分镜，其它分镜不动。",
        dirNote,
        "要求：",
        "- 严格针对意见修改 subtitle / narration / visual / seconds 中的相关字段；意见没提到的字段原样保留",
        "- seconds 随口播长度自然调整（2~12 秒），事实数字保留原文不得新增",
        "- reason 一句话说清改了什么",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{ "id": ${scene.id}, "seconds": 5, "visual": "...", "narration": "...", "subtitle": "...", "broll": "...", "reason": "改动说明" }`,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        `视频标题：${sb.title}（钩子：${sb.hook}）`,
        `当前分镜 #${scene.id}（${scene.seconds}s）：`,
        `字幕：${scene.subtitle}`,
        `口播：${scene.narration}`,
        `画面：${scene.visual}`,
        `素材：${scene.broll}`,
        "",
        `用户指着这个分镜说：${feedback}`,
      ].join("\n"),
    },
  ]
}

export function parseSceneRevision(raw: unknown, fallback: StoryboardScene): { scene: StoryboardScene; reason: string } {
  const x = (raw ?? {}) as Record<string, unknown>
  const scene: StoryboardScene = {
    id: fallback.id,
    seconds: Math.min(20, Math.max(1, Number(x.seconds) || fallback.seconds)),
    visual: String(x.visual ?? fallback.visual).slice(0, 200),
    narration: String(x.narration ?? fallback.narration).slice(0, 300),
    subtitle: String(x.subtitle ?? fallback.subtitle).slice(0, 30),
    broll: String(x.broll ?? fallback.broll).slice(0, 120),
  }
  const reason = String(x.reason ?? "").slice(0, 200) || "已按意见调整"
  return { scene, reason }
}

// ---------- 指着改 · 图文线选段改写（P1 交互三件套 · 抓手 5） ----------
// 视频线「指着改」（时间轴点击→单分镜重做→版本树）平移到图文：
// 选中段落 → 只重写这一节 → 存为新版本（文章版本树）。改稿动作已
// 存在（rewrite target / edit），这里补的是「选段」交互的服务端半边。

/** 把成稿 markdown 按 ## 小节切开（前言作为第 0 节，heading 为空串） */
export function splitMarkdownSections(markdown: string): { index: number; heading: string; text: string }[] {
  const lines = markdown.split(/\n/)
  const sections: { heading: string; lines: string[] }[] = []
  let cur: { heading: string; lines: string[] } = { heading: "", lines: [] }
  for (const line of lines) {
    if (/^##\s+/.test(line)) {
      if (cur.lines.some((l) => l.trim())) sections.push(cur)
      cur = { heading: line.replace(/^##\s+/, "").trim(), lines: [line] }
    } else {
      cur.lines.push(line)
    }
  }
  if (cur.lines.some((l) => l.trim())) sections.push(cur)
  return sections.map((s, i) => ({ index: i, heading: s.heading, text: s.lines.join("\n").trim() }))
}

/** 选段改写提示词：只重写本节，上下文来自前后节摘要，铁律防漂移 */
export function sectionRewriteMessages(input: {
  articleTitle: string
  sectionIndex: number
  totalSections: number
  sectionHeading: string
  sectionText: string
  prevDigest: string
  nextDigest: string
  feedback: string
}): ChatMessage[] {
  const system = [
    "你是资深公众号编辑，负责「指着改」：作者选中了一节，你只重写这一节，把它改得更好。",
    "",
    "【铁律（优先级最高）】",
    "1. 只输出本节重写后的完整文本，不要输出其他节、不要解释、不要客套。",
    "2. 原节以「## 小节标题」开头的，重写稿也必须以「## 」开头（标题可润色）。",
    "3. 引用编号 [n] 原样保留或按原节证据对应，禁止编造新的来源或数字。",
    "4. 不引入原节与用户意见之外的新事实；证据不足处宁可删去，不脑补。",
    "5. 篇幅与原节相当（±30% 以内），除非用户意见明确要求扩写/删减。",
    "6. 与前后节保持衔接：不重复邻节内容，不产生逻辑断裂。",
  ].join("\n")
  const user = [
    `文章标题：${input.articleTitle}`,
    `本节是全文第 ${input.sectionIndex + 1}/${input.totalSections} 节${input.sectionHeading ? `（「${input.sectionHeading}」）` : "（开篇前言）"}。`,
    "",
    "【前一节摘要（保持衔接，不要重复）】",
    input.prevDigest || "（本节即开篇，无前一节）",
    "",
    "【后一节摘要（为后文留钩子）】",
    input.nextDigest || "（本节即末节，无后一节）",
    "",
    "【本节原文】",
    input.sectionText.slice(0, 6000),
    "",
    "【作者改稿意见（最高优先级，逐条落实）】",
    input.feedback.trim() || "（未给具体意见：请提升表达密度与节奏，砍掉空话套话）",
  ].join("\n")
  return [
    { role: "system", content: system },
    { role: "user", content: user },
  ]
}

/** 归一化选段改写产物：保住 ## 开头契约，防 LLM 输出全文或解释 */
export function normalizeSectionRewrite(raw: string, section: { heading: string; text: string }): string {
  let out = (raw ?? "").trim()
  // 剥掉可能的代码围栏与「以下是…」客套行
  out = out.replace(/^```(?:markdown)?\s*\n?/i, "").replace(/\n?```\s*$/i, "")
  out = out.replace(/^(?:以下是|这是|改写后)[^\n]*[:：]\s*\n/i, "")
  // 清洗后为空 → 直接判失败（先于标题补回，防空壳标题骗过校验）
  if (!out) return ""
  const hadHeading = /^##\s+/.test(section.text)
  if (hadHeading && !/^##\s+/.test(out)) {
    // 丢了节标题 → 补回原标题（保守：不猜新标题）
    out = `## ${section.heading}\n\n${out}`
  }
  // 明显输出全文（节节数暴涨）→ 视为失败返回空
  const sectionCount = (out.match(/^##\s+/gm) ?? []).length
  if (sectionCount > 2) return ""
  return out
}

// ---------- 视频成片（TTS 口播音色清单，客户端与服务端共用） ----------

export const TTS_VOICES: { id: string; label: string }[] = [
  { id: "xiaochen", label: "小陈 · 沉稳专业" },
  { id: "tongtong", label: "彤彤 · 温暖亲切" },
  { id: "chuichui", label: "吹吹 · 活泼可爱" },
  { id: "kazi", label: "卡兹 · 清晰标准" },
  { id: "douji", label: "豆吉 · 自然流畅" },
  { id: "luodo", label: "罗多 · 富有感染力" },
  { id: "jam", label: "Jam · 英音绅士" },
]

// ---------- 艺术动画线：分镜 → clip spec（huashu-art-motion 契约） ----------

export interface ArtSpecItem {
  sceneId: number
  grammar: string
  theme?: string
  data: Record<string, unknown>
  cues: { at: number; kind: string; text?: string; sub?: string; data?: Record<string, unknown> }[]
}

/** 8 语法速查（喂给 LLM 的契约摘要，源自 clip_schema.json） */
const GRAMMAR_CHEATSHEET = [
  "t2_keynote_ui（发布会卡片）：specData eyebrow/title/subtitle/accent；cue kind: title/card/step/highlight/number；适合观点卡、步骤、大数字",
  "t3_finance_chart（财经图表）：specData title/unit/source/chart(bar|line)/series[{label,value}]/highlight；cue kind: bar/line/highlight/number；适合数据与对比",
  "y5_kinetic_type（动态大字）：specData palette；cue kind: title/point/number/highlight；适合金句与情绪节奏",
  "y3_whiteboard（白板手绘）：cue kind: title/point/draw(image 必填 data.icon)/image；适合过程讲解",
  "y1_kurzgesagt（科普穿行）：cue kind: title/point/enter；适合概念类比",
  "y2_vox（剪报调查）：cue kind: image/clip/title/point/highlight(data.rect)；适合新闻线索调查感",
  "t1_3b1b（公式形变）：cue kind: title/equation(data.tokens)/point/line；适合推理链",
  "y4_storytime（故事帧库）：角色在小房间里对镜头讲，反应特写+插入镜头；cue kind: title/point/highlight/react/insert；point/title 可带 data.pose（talk/point/shrug/type）；insert 用 sub 写角色打出的一行字、text 写砸出的大字（如「3000行」）、data.count/unit 写右上角计数器；适合叙事段、吐槽、程序员梗。角色帧库由管线自动注入（勿写 data.character）",
].join("\n")

export function artSpecMessages(storyboard: Storyboard, aspect: "9:16" | "16:9"): ChatMessage[] {
  const dims = aspect === "9:16" ? "720×1280（竖屏）" : "1280×720（横屏）"
  const scenes = storyboard.scenes
    .map((s) => `分镜${s.id}（${s.seconds}s）：字幕「${s.subtitle}」；口播：${s.narration}；画面意图：${s.visual}`)
    .join("\n")
  return [
    {
      role: "system",
      content: [
        "你是动画导演，把分镜脚本转成艺术动画引擎的 clip spec（JSON）。",
        `画布 ${dims}，fps 30。每个分镜产出一个 spec：duration = 分镜秒数（2~8s），grammar 从下面 8 语法中按内容类型选最合适的一个：`,
        GRAMMAR_CHEATSHEET,
        "主题 theme 八选一：paper/poster/ink/navy/bauhaus/snow/wood/chalk（全片统一）。",
        "规则：",
        "- cues.at 从 0.3s 起排，与口播节奏对齐（每秒约 4 字）；kind 必须是该语法支持的",
        "- subtitle 的字放进 cue 的 text；数字事实保留原文，不得编造 series 数值——没有数据就用 t2/y5 文字卡，不要硬造图表",
        "- data 里只写该语法 specData 认识的字段；y4_storytime 不要写 data.character（管线自动注入内置角色帧库）",
        "严格输出 JSON（不要 markdown 代码块）：",
        `{ "specs": [ { "sceneId": 1, "grammar": "t2_keynote_ui", "theme": "paper", "data": { "title": "…", "subtitle": "…" }, "cues": [ { "at": 0.3, "kind": "title" } ] } ] }`,
      ].join("\n"),
    },
    { role: "user", content: `标题：${storyboard.title}\n钩子：${storyboard.hook}\n${scenes}` },
  ]
}

const VALID_GRAMMARS = new Set(["t1_3b1b", "t2_keynote_ui", "t3_finance_chart", "y1_kurzgesagt", "y2_vox", "y3_whiteboard", "y4_storytime", "y5_kinetic_type"])
// y4_storytime 已回归白名单：管线在渲染前自动注入内置角色帧库（Y4_CHARACTER_FRAMES，zai-image 生成）
const VALID_THEMES = new Set(["paper", "poster", "ink", "navy", "bauhaus", "snow", "wood", "chalk"])

export function parseArtSpecs(raw: unknown): ArtSpecItem[] {
  if (!raw || typeof raw !== "object") return []
  const o = raw as Record<string, unknown>
  const list = Array.isArray(o.specs) ? o.specs : []
  const out: ArtSpecItem[] = []
  for (const item of list) {
    const x = item as Record<string, unknown>
    const grammar = String(x.grammar ?? "")
    if (!VALID_GRAMMARS.has(grammar)) continue
    const theme = VALID_THEMES.has(String(x.theme)) ? String(x.theme) : undefined
    const cuesRaw = Array.isArray(x.cues) ? x.cues : []
    const cues = cuesRaw
      .map((c) => {
        const q = c as Record<string, unknown>
        return {
          at: Math.min(15, Math.max(0, Number(q.at) || 0)),
          kind: String(q.kind ?? "").slice(0, 20),
          text: q.text !== undefined ? String(q.text).slice(0, 60) : undefined,
          sub: q.sub !== undefined ? String(q.sub).slice(0, 60) : undefined,
          data: q.data && typeof q.data === "object" ? (q.data as Record<string, unknown>) : undefined,
        }
      })
      .filter((q) => q.kind)
    out.push({
      sceneId: Number(x.sceneId) || out.length + 1,
      grammar,
      theme,
      data: x.data && typeof x.data === "object" ? (x.data as Record<string, unknown>) : {},
      cues,
    })
  }
  return out.slice(0, 12)
}

export function parseStoryboard(raw: unknown): Storyboard | null {
  if (!raw || typeof raw !== "object") return null
  const o = raw as Record<string, unknown>
  const d = (o.direction ?? null) as Record<string, unknown> | null
  const direction: DirectionBrief | undefined =
    d && typeof d === "object"
      ? {
          key: String(d.key ?? "A").slice(0, 1),
          kind: ["fit", "amplify", "unexpected"].includes(String(d.kind)) ? String(d.kind) : "fit",
          name: String(d.name ?? "").slice(0, 24),
          language: String(d.language ?? "").slice(0, 160),
          accent: HEX_RE.test(String(d.accent)) ? String(d.accent) : "#f59e0b",
          base: HEX_RE.test(String(d.base)) ? String(d.base) : "#0b1220",
          feel: String(d.feel ?? "").slice(0, 160),
        }
      : undefined
  const scenesRaw = Array.isArray(o.scenes) ? o.scenes : []
  const scenes: StoryboardScene[] = scenesRaw
    .map((s, i) => {
      const x = s as Record<string, unknown>
      return {
        id: Number(x.id) || i + 1,
        seconds: Math.min(20, Math.max(1, Number(x.seconds) || 4)),
        visual: String(x.visual ?? "").slice(0, 200),
        narration: String(x.narration ?? "").slice(0, 300),
        subtitle: String(x.subtitle ?? "").slice(0, 30),
        broll: String(x.broll ?? "").slice(0, 120),
        ...(x.render === "model" ? { render: "model" as const } : { render: "code" as const }),
      }
    })
    .filter((x) => x.narration || x.visual)
  if (scenes.length < 3) return null
  const totalSeconds = Number(o.totalSeconds) || scenes.reduce((s, x) => s + x.seconds, 0)
  return {
    title: String(o.title ?? "").slice(0, 80),
    hook: String(o.hook ?? "").slice(0, 80),
    totalSeconds: Math.min(180, Math.max(10, totalSeconds)),
    scenes: scenes.slice(0, 12),
    bgm: String(o.bgm ?? "").slice(0, 80),
    caption: String(o.caption ?? "").slice(0, 300),
    ...(direction ? { direction } : {}),
  }
}
