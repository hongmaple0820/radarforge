// ============================================================
// run-manager（runtime）—— 图文线九步流水线 + 纯图线两步流水线
// 图文线（P0 质量金字塔 L1-L3）：brief → claims → 大纲先行 →
//   分节初稿 → 跨家族审稿（≤2轮+成对比较）→ 原子断言核验 →
//   正文配图 → 封面 → 排版
// 纯图线：构图方案（LLM）→ 批量生图 → 画廊 markdown
// 后台执行 + 前端轮询；每步产物落库留痕，可回答「为什么这样写/这样画」
// ============================================================

import { db } from "@/lib/db"
import { chatRetry, chatVia, pickCrossFamilyReviewer, resolveDraftLlmName, searchWithFallback } from "@/lib/gateway"
import { generateCoverImage, generateImage } from "@/lib/gateway/providers/zai-image"
import { getSettings, styleProfilePrompt } from "@/lib/settings"
import { exemplarPrompt, type StyleExemplar } from "./skills/radar-learn"
import { extractJson, clampNum } from "./json"
import { renderWechatHtml, resolveThemeId, type RenderClaim } from "./render"
import { briefMessages, draftMessages, getPersona, type Brief, type BriefClaim } from "./skills/radar-write"
import { parseReview, reviewMessages, reviseMessages, pairwiseMessages, parsePairwise, reviewSummary, type Review } from "./skills/radar-review"
import { outlineMessages, parseOutline, sectionMessages, assembleDraft, type Outline } from "./skills/radar-outline"
import { atomicAssertionsMessages, parseAssertions, assertionStats } from "./skills/radar-verify"
import { bestMatch, MIN_HITS } from "./matching"
import {
  getImageStyle,
  getImageUsage,
  imagePlanMessages,
  cardPlanMessages,
  parseCardPlan,
  illustrationPlanMessages,
  insertImageAfterHeading,
  findHeadingIndex,
  ILLUSTRATION_STYLE_TOKEN,
  type ImagePlanItem,
  type IllustrationPlanItem,
} from "./skills/radar-image"
import { renderCardToAsset, CARD_FAMILIES, type CardPlanItem } from "./card-engine"
import { vlmCheckImage, type VlmCheckResult } from "@/lib/gateway/vlm"
import { resolveTuneInstruction } from "./tune"

export interface RunStep {
  name: string
  status: "pending" | "running" | "done" | "error" | "skipped"
  detail: string
  latencyMs: number
}

const STEP_DEFS: { name: string; label: string }[] = [
  { name: "brief", label: "任务书" },
  { name: "claims", label: "主张取证" },
  { name: "outline", label: "大纲先行" },
  { name: "draft", label: "分节初稿" },
  { name: "review", label: "跨家族审稿" },
  { name: "verify", label: "原子断言" },
  { name: "illustrate", label: "正文配图" },
  { name: "cover", label: "封面" },
  { name: "layout", label: "微信排版" },
]

export function initialSteps(): RunStep[] {
  return STEP_DEFS.map((s) => ({ name: s.name, status: "pending", detail: s.label, latencyMs: 0 }))
}

const inflight = new Set<string>()

export interface CreateArticleRunArgs {
  ideaTitle: string
  ideaAngle?: string
  persona?: string
  theme?: string
  exemplarId?: string // 文风校准档案（style-exemplars；空=不校准）
}

export async function createArticleRun(args: CreateArticleRunArgs): Promise<string> {
  const run = await db.agentRun.create({
    data: {
      kind: "article",
      ideaTitle: args.ideaTitle.slice(0, 200),
      ideaAngle: (args.ideaAngle ?? "").slice(0, 500),
      persona: args.persona ?? "cold-analyst",
      theme: args.theme ?? "radar",
      exemplarId: (args.exemplarId ?? "").slice(0, 60),
      input: args.ideaTitle,
      status: "queued",
      steps: JSON.stringify(initialSteps()),
    },
  })
  return run.id
}

export function executeArticleRunInBackground(runId: string): void {
  if (inflight.has(runId)) return
  inflight.add(runId)
  void executeArticleRun(runId).finally(() => inflight.delete(runId))
}

async function executeArticleRun(runId: string): Promise<void> {
  const run = await db.agentRun.findUnique({ where: { id: runId } })
  if (!run || run.kind !== "article" || run.status === "running" || run.status === "done") return

  const steps = initialSteps()
  let mode = "DEMO"
  const artifacts: Record<string, unknown> = {}
  const settings = await getSettings()
  const stylePrompt = styleProfilePrompt(settings.style)
  // P1 p15 调优指令（评测驱动选优变体；v0 基线为空串 → 零改动）
  const tune = await resolveTuneInstruction()
  // 文风校准档案（学 wewrite exemplar：仅结构节奏，安全条款在注入块内）
  const exItem = run.exemplarId ? (settings.exemplars.items.find((x) => x.id === run.exemplarId) ?? null) : null
  const exPrompt = exItem
    ? exemplarPrompt({
        id: exItem.id, name: exItem.name, source: exItem.source,
        createdAt: exItem.createdAt, words: exItem.words,
        fingerprint: {
          structure: exItem.fingerprint.structure ?? "",
          rhythm: exItem.fingerprint.rhythm ?? "",
          lexicon: exItem.fingerprint.lexicon ?? "",
          rhetoric: exItem.fingerprint.rhetoric ?? "",
          voice: exItem.fingerprint.voice ?? "",
          endings: exItem.fingerprint.endings ?? "",
        },
      })
    : ""

  await db.agentRun.update({ where: { id: runId }, data: { status: "running", steps: JSON.stringify(steps) } })

  const save = () => db.agentRun.update({ where: { id: runId }, data: { steps: JSON.stringify(steps) } }).catch(() => {})

  const step = async (i: number, fn: () => Promise<string>, opts?: { optional?: boolean }) => {
    steps[i] = { ...steps[i], status: "running" }
    await save()
    const t0 = Date.now()
    try {
      const detail = await fn()
      steps[i] = { ...steps[i], status: "done", detail, latencyMs: Date.now() - t0 }
    } catch (e) {
      steps[i] = { ...steps[i], status: opts?.optional ? "skipped" : "error", detail: (e as Error).message.slice(0, 200), latencyMs: Date.now() - t0 }
      if (!opts?.optional) throw e
    }
    await save()
  }

  try {
    // ========== Step 1: brief 任务书 ==========
    let brief: Brief | null = null
    await step(0, async () => {
      // 降温重试：0.4 偶发非 JSON / 缺字段 / 空返回 → 0.2 保守档 → 0.3 第三档（同 ideas/refresh 已验证模式）
      let parsed: Brief | null = null
      for (const temp of [0.4, 0.2, 0.3]) {
        const raw = await chatRetry(briefMessages(run.ideaTitle, run.ideaAngle, stylePrompt), { temperature: temp })
        if (!raw || raw.replace(/\s/g, "").length < 20) continue // 空返回按失败重试
        parsed = extractJson<Brief>(raw)
        if (parsed?.coreJudgment) break
      }
      brief = parsed
      if (!brief?.coreJudgment) throw new Error("任务书解析失败（三档温度重试后仍不合格式，请重试）")
      artifacts.brief = brief
      const claimsCount = Array.isArray(brief.claims) ? brief.claims.length : 0
      return `读者：${brief.targetReader?.slice(0, 24) ?? "?"}｜核心判断：${brief.coreJudgment?.slice(0, 40) ?? "?"}｜待核主张 ${claimsCount} 条${stylePrompt ? "｜风格定位已注入" : ""}`
    })

    // ========== Step 2: claims 取证（每条 fact 联网核对） ==========
    const verifiedClaims: (BriefClaim & RenderClaim & { verified: boolean; claimType: string })[] = []
    await step(1, async () => {
      const facts = (brief?.claims ?? []).filter((c) => c.type === "fact").slice(0, 5)
      let found = 0
      let idx = 0
      for (const c of facts) {
        idx++
        const resp = await searchWithFallback({
          query: c.text.slice(0, 40),
          count: 10,
          industry: "news",
          freshness: "d30",
        })
        if (resp.mode === "REAL") mode = "REAL"
        // 关键词重合度匹配（修复旧「假命中」：取第一条长结果就算核实）
        // 分词与阈值在 runtime/matching.ts（与原子断言核验共用，离线用例验证）
        const { best, hits } = bestMatch(c.text, resp.results)
        if (best && resp.mode === "REAL" && hits >= MIN_HITS) {
          found++
          verifiedClaims.push({
            type: c.type,
            text: c.text,
            idx,
            claimType: c.type,
            verified: true,
            sourceTitle: best.title,
            sourceSite: best.site,
            sourceDate: best.date,
            sourceUrl: best.url,
          })
          await db.claim.create({
            data: {
              runId,
              idx,
              claimType: c.type,
              text: c.text.slice(0, 500),
              quote: best.passage.slice(0, 200),
              sourceTitle: best.title,
              sourceUrl: best.url,
              sourceSite: best.site,
              sourceDate: best.date,
              kind: "FACT",
              verified: true,
            },
          })
        } else {
          verifiedClaims.push({
            type: c.type,
            text: c.text,
            idx,
            claimType: c.type,
            verified: false,
            sourceTitle: "",
            sourceSite: "",
            sourceDate: "",
            sourceUrl: "",
          })
          await db.claim.create({
            data: {
              runId,
              idx,
              claimType: c.type,
              text: c.text.slice(0, 500),
              kind: "FACT",
              verified: false,
            },
          })
        }
      }
      // 非 fact 主张也入账本（不编号，初稿不作为事实引用）
      for (const c of (brief?.claims ?? []).filter((x) => x.type !== "fact").slice(0, 3)) {
        await db.claim.create({
          data: { runId, idx: 0, claimType: c.type, text: c.text.slice(0, 500), kind: "REF", verified: null },
        })
      }
      return `${facts.length} 条 fact 主张取证：${found} 条找到来源（关键词重合度≥${MIN_HITS} 命中）`
    })

    // ========== Step 3: 大纲先行（P0 L2 结构层；失败降级回单遍写作） ==========
    let outline: Outline | null = null
    await step(
      2,
      async () => {
        for (const temp of [0.4, 0.2]) {
          const raw = await chatRetry(
            outlineMessages({
              brief: brief!,
              ideaTitle: run.ideaTitle,
              ideaAngle: run.ideaAngle,
              claims: verifiedClaims.map((c) => ({ idx: c.idx, text: c.text, verified: c.verified })),
              stylePrompt,
            }),
            { temperature: temp },
          )
          outline = parseOutline(extractJson(raw))
          if (outline) break
        }
        if (!outline) return "大纲解析失败（两档温度重试）→ 初稿回退单遍生成（老管线，不阻断）"
        artifacts.outline = outline
        const withIllus = outline.sections.filter((s) => s.illustration).length
        const totalWords = outline.sections.reduce((s2, x) => s2 + x.words, 0)
        return `${outline.sections.length} 节大纲｜预算 ${totalWords} 字｜配图位 ${withIllus} 节｜标题「${outline.title.slice(0, 20)}」`
      },
      { optional: true },
    )

    // ========== Step 4: 分节初稿（逐节聚焦写作；无大纲则单遍） ==========
    let draft = ""
    await step(3, async () => {
      const persona = getPersona(run.persona)
      const rules = await db.learningRule.findMany({ where: { status: "active" }, orderBy: { hits: "desc" }, take: 8 })
      const claimsInput = verifiedClaims.map((c) => ({
        idx: c.idx,
        text: c.text,
        claimType: c.claimType,
        verified: c.verified,
        sourceTitle: c.sourceTitle,
        sourceSite: c.sourceSite,
        sourceDate: c.sourceDate,
        sourceUrl: c.sourceUrl,
      }))
      if (outline) {
        // 分节生成：每节只带着自己的论点与证据写作，上下文聚焦（STORM 分节写入）
        const bodies: string[] = []
        for (let i = 0; i < outline.sections.length; i++) {
          const raw = await chatRetry(
            sectionMessages({
              outline,
              sectionIndex: i,
              brief: brief!,
              persona,
              claims: claimsInput,
              rules: rules.map((r) => r.rule),
              ideaTitle: run.ideaTitle,
              ideaAngle: run.ideaAngle,
              stylePrompt,
              exemplarPrompt: exPrompt,
              tunePrompt: tune.instruction,
              writtenSoFar: bodies,
            }),
            { temperature: 0.75 },
          )
          if (!raw || raw.replace(/\s/g, "").length < 50) {
            throw new Error(`第 ${i + 1} 节生成过短或为空（${raw?.length ?? 0} 字符）`)
          }
          bodies.push(raw)
        }
        draft = assembleDraft(outline, bodies)
      } else {
        // 降级：老管线单遍生成
        const raw = await chatRetry(
          draftMessages({
            brief: brief!,
            persona,
            claims: claimsInput,
            rules: rules.map((r) => r.rule),
            ideaTitle: run.ideaTitle,
            ideaAngle: run.ideaAngle,
            stylePrompt,
            exemplarPrompt: exPrompt,
            tunePrompt: tune.instruction,
          }),
          { temperature: 0.75 },
        )
        if (!raw) throw new Error("初稿生成失败（LLM 空返回）")
        draft = raw
      }
      if (rules.length > 0) {
        await db.$transaction(rules.map((r) => db.learningRule.update({ where: { id: r.id }, data: { hits: { increment: 1 } } })))
      }
      const wordCount = draft.replace(/\s/g, "").length
      const title = draft.match(/^#\s+(.+)$/m)?.[1] ?? run.ideaTitle
      await db.article.create({
        data: { runId, version: 0, title: title.slice(0, 120), markdown: draft, wordCount },
      })
      return outline
        ? `${persona.label}｜分节 ${outline.sections.length}/${outline.sections.length}｜${wordCount} 字｜注入飞轮规则 ${rules.length} 条${tune.instruction ? `｜调优 ${tune.variant}` : ""}`
        : `${persona.label}｜单遍降级｜${wordCount} 字｜注入飞轮规则 ${rules.length} 条${tune.instruction ? `｜调优 ${tune.variant}` : ""}`
    })

    // ========== Step 5: 跨家族审稿（≤2 轮修订 + 成对比较裁决） ==========
    // LLM-as-a-Judge 三对策（2411.15594）：裁判换家族（自我偏好）；
    // 成对比较交换位置（位置偏差）；修订上限 2 轮（过度修改漂移）。
    // 成对比较只在接受「修订稿确实更优」时通过——防越改越差。
    let finalDraft = draft
    await step(4, async () => {
      const persona = getPersona(run.persona)
      const draftLlm = resolveDraftLlmName()
      const reviewer = pickCrossFamilyReviewer(draftLlm)
      // 裁判实际生效者（跨家族故障回退后如实改标，绝不冒充跨家族）
      let judgeUsed = reviewer.provider
      let judgeCross = reviewer.crossFamily
      let judgeNote = reviewer.note
      // 裁判调用：跨家族走 chatVia（失败回退主链路）；同家族走 chatRetry
      const judge = async (msgs: Parameters<typeof chatRetry>[0], temperature: number) => {
        if (reviewer.crossFamily) {
          try {
            return await chatVia(reviewer.provider, msgs, { temperature })
          } catch {
            /* 裁判家族故障 → 回退主链路（不炸流水线），并如实改标 */
            judgeUsed = draftLlm
            judgeCross = false
            judgeNote = `裁判 ${reviewer.provider} 调用失败 → 回退 ${draftLlm}（同家族审稿）`
          }
        }
        return chatRetry(msgs, { temperature })
      }
      const reviewOnce = async (md: string): Promise<Review | null> => {
        for (const temp of [0.2, 0.1]) {
          const raw = await judge(reviewMessages(md, persona.label), temp)
          const r = parseReview(extractJson(raw))
          if (r) return r
        }
        return null
      }
      const first = await reviewOnce(draft)
      if (!first) return `审稿解析失败，跳过｜${judgeNote}`

      artifacts.review = { family: judgeNote, rounds: [], pairwise: [] }
      const roundLog: { round: number; average: number; revised: boolean }[] = []
      const pairwiseLog: { round: number; accepted: boolean; reason: string }[] = []
      let current = draft
      let lastReview = first

      // ≤2 轮：每轮 = 裁判评分 →（未达标时）作者修订 + 成对比较裁决
      for (let round = 1; round <= 2; round++) {
        const review = round === 1 ? first : await reviewOnce(current)
        if (!review) break // 第二轮评分解析失败 → 保留现有结论
        lastReview = review
        if (review.average >= 7.5) {
          roundLog.push({ round, average: review.average, revised: false })
          await db.reviewRecord.create({
            data: {
              runId, round,
              scoresJson: JSON.stringify(review.scores),
              commentsJson: JSON.stringify(review.comments),
              average: review.average,
              revised: false,
            },
          })
          break
        }
        // 未达标 → 修订（写作家族自己改，裁判只评不改）
        let revisedDraft = ""
        try {
          revisedDraft = await chatRetry(reviseMessages(current, review), { temperature: 0.5 })
        } catch {
          revisedDraft = ""
        }
        if (!revisedDraft || revisedDraft.length < 400) {
          roundLog.push({ round, average: review.average, revised: false })
          await db.reviewRecord.create({
            data: {
              runId, round,
              scoresJson: JSON.stringify(review.scores),
              commentsJson: JSON.stringify(review.comments),
              average: review.average,
              revised: false,
            },
          })
          break
        }
        // 成对比较裁决（两个方向各评一次，交换位置防位置偏差）
        const summary = reviewSummary(review)
        let accepted = false
        let reason = ""
        try {
          const v1 = parsePairwise(extractJson(await judge(pairwiseMessages({ original: current, revised: revisedDraft, reviewSummary: summary }, false), 0.2)))
          const v2 = parsePairwise(extractJson(await judge(pairwiseMessages({ original: current, revised: revisedDraft, reviewSummary: summary }, true), 0.2)))
          if (v1 && v2) {
            // 归一化：修订稿在两个方向下的胜场
            const revisedWins = (v1.winner === "B" ? 1 : 0) + (v2.winner === "A" ? 1 : 0)
            const originalWins = (v1.winner === "A" ? 1 : 0) + (v2.winner === "B" ? 1 : 0)
            accepted = revisedWins > originalWins || (revisedWins === originalWins && revisedWins === 0)
            reason = v1.reason || v2.reason
          } else {
            accepted = true // 裁决不可用 → 相信修订（有明确的审稿意见兜底）
            reason = "成对裁决解析失败，按审稿意见采纳修订"
          }
        } catch {
          accepted = true
          reason = "成对裁决调用失败，按审稿意见采纳修订"
        }
        pairwiseLog.push({ round, accepted, reason })
        await db.reviewRecord.create({
          data: {
            runId, round,
            scoresJson: JSON.stringify(review.scores),
            commentsJson: JSON.stringify(review.comments),
            average: review.average,
            revised: accepted,
          },
        })
        roundLog.push({ round, average: review.average, revised: accepted })
        if (accepted) {
          current = revisedDraft
          finalDraft = revisedDraft
          const wordCount = revisedDraft.replace(/\s/g, "").length
          const title = revisedDraft.match(/^#\s+(.+)$/m)?.[1] ?? run.ideaTitle
          const vMax = await db.article.findFirst({ where: { runId }, orderBy: { version: "desc" } })
          await db.article.create({
            data: { runId, version: (vMax?.version ?? 0) + 1, title: title.slice(0, 120), markdown: revisedDraft, wordCount },
          })
        } else {
          break // 修订被否决（越改越差）→ 保留原稿，停止轮次
        }
      }
      ;(artifacts.review as { family: string; rounds: unknown[]; pairwise: unknown[] }).rounds = roundLog
      ;(artifacts.review as { family: string; rounds: unknown[]; pairwise: unknown[] }).pairwise = pairwiseLog
      const dims = Object.entries(lastReview.scores).map(([k, v]) => `${k} ${clampNum(v, 0, 10, 0)}`).join(" / ")
      const revisions = roundLog.filter((r) => r.revised).length
      return `均分 ${lastReview.average}｜${judgeCross ? `跨家族裁判 ${judgeUsed}` : `同家族裁判 ${judgeUsed}`}｜${revisions} 轮修订${revisions > 0 ? `（成对比较裁决 ${pairwiseLog.filter((p) => p.accepted).length}/${pairwiseLog.length} 采纳）` : "（一轮通过）"}｜${dims}`
    })

    // ========== Step 6: 原子断言核验（P0 L1 事实层；FActScore 式） ==========
    // 成稿拆 10~20 条原子事实断言 → 逐条检索核验（关键词重合度）→
    // 无据率超阈值（30%）→ 发布门禁拦截（publish 需 force 或改稿）。
    // 搜索 DEMO 模式时诚实跳过（降级数据不可作核验依据）。
    await step(
      5,
      async () => {
        if (mode !== "REAL") {
          return "搜索为 DEMO 模式，断言核验跳过（演示数据不可作核验依据；配置搜索密钥后自动启用）"
        }
        let assertions: { text: string }[] = []
        for (const temp of [0.3, 0.1]) {
          const raw = await chatRetry(atomicAssertionsMessages(finalDraft), { temperature: temp })
          assertions = parseAssertions(extractJson(raw))
          if (assertions.length > 0) break
        }
        if (assertions.length === 0) return "断言抽取失败，跳过（不阻断）"
        const items: { text: string; verified: boolean; sourceUrl: string; sourceSite: string }[] = []
        let verifiedCount = 0
        for (let i = 0; i < assertions.length; i++) {
          const a = assertions[i]
          const resp = await searchWithFallback({ query: a.text.slice(0, 40), count: 8, industry: "news" })
          const { best, hits } = bestMatch(a.text, resp.results)
          const ok = Boolean(best && resp.mode === "REAL" && hits >= MIN_HITS)
          if (ok) verifiedCount++
          items.push({ text: a.text, verified: ok, sourceUrl: ok ? best!.url : "", sourceSite: ok ? best!.site : "" })
          // 落账本（kind=ASSERT，idx=0 不进脚注渲染；UI 从 artifacts 断言卡展示）
          await db.claim.create({
            data: {
              runId,
              idx: 0,
              claimType: "fact",
              text: a.text.slice(0, 500),
              quote: ok ? (best!.passage ?? "").slice(0, 200) : "",
              sourceTitle: ok ? best!.title : "",
              sourceUrl: ok ? best!.url : "",
              sourceSite: ok ? best!.site : "",
              sourceDate: ok ? best!.date : "",
              kind: "ASSERT",
              verified: ok,
            },
          })
        }
        const stats = assertionStats(verifiedCount, items.length)
        artifacts.assertions = { ...stats, items: items.map((x) => ({ text: x.text.slice(0, 100), verified: x.verified, sourceUrl: x.sourceUrl, sourceSite: x.sourceSite })) }
        const pct = (stats.unsupportedRate * 100).toFixed(0)
        return stats.gateBlocked
          ? `⚠️ ${stats.total} 条断言：${stats.verified} 有据 / ${stats.unsupported} 无据（无据率 ${pct}% > ${(stats.threshold * 100).toFixed(0)}% 阈值）→ 发布门禁拦截`
          : `${stats.total} 条断言：${stats.verified} 有据 / ${stats.unsupported} 无据（${pct}% ≤ ${(stats.threshold * 100).toFixed(0)}% 阈值，门禁通过）`
      },
      { optional: true },
    )

    // ========== Step 7: 正文配图（可选：插图规划 → zai-image 生成 → 回插 markdown） ==========
    // 修复「文章里没有图」：优先采纳大纲期配图位（P0 大纲 JSON 的
    // illustration/imageCaption 字段），从成稿提炼 2~3 个插图位（锚定小节标题），
    // 生成与文风一致的扁平插画并回插 markdown；生图降级不阻断（跳过该图留痕）
    await step(
      6,
      async () => {
        let plan: IllustrationPlanItem[] | null = null
        const outlineHints = outline
          ? outline.sections.map((s) => ({ heading: s.heading, illustration: s.illustration, imageCaption: s.imageCaption }))
          : undefined
        for (const temp of [0.3, 0.1]) {
          const raw = await chatRetry(illustrationPlanMessages(finalDraft, outlineHints), { temperature: temp })
          plan = extractJson<IllustrationPlanItem[]>(raw)
          if (Array.isArray(plan) && plan.length > 0) break
        }
        if (!Array.isArray(plan) || plan.length === 0) return "插图规划失败，跳过（不阻断）"
        const items = plan.filter((x) => x?.anchor && x?.concept).slice(0, 3)
        if (items.length === 0) return "规划无有效锚点，跳过（不阻断）"
        let md = finalDraft
        let inserted = 0
        let degraded = 0
        for (let i = 0; i < items.length; i++) {
          const it = items[i]
          // 先验锚点（找不到就不浪费一次生图）
          if (findHeadingIndex(md, it.anchor) < 0) continue
          const img = await generateImage(
            `${it.concept}，${ILLUSTRATION_STYLE_TOKEN}`,
            runId,
            `ill-${i + 1}`,
            "1344x768",
          )
          if (!img.ok) {
            degraded++
            await db.asset.create({
              data: {
                runId, kind: "image", role: "inline", provider: "zai-image(降级)", path: "",
                meta: JSON.stringify({ caption: it.caption ?? "", anchor: it.anchor.slice(0, 60), index: i + 1 }),
                error: img.error ?? "",
              },
            })
            continue
          }
          const caption = (it.caption ?? "").slice(0, 30) || `配图 ${i + 1}`
          const inserted2 = insertImageAfterHeading(md, it.anchor, `![${caption}](${img.filePath})`)
          if (!inserted2) continue
          md = inserted2
          inserted++
          await db.asset.create({
            data: {
              runId, kind: "image", role: "inline", provider: "zai-image", path: img.filePath,
              meta: JSON.stringify({ size: "1344x768", bytes: img.sizeBytes, caption, anchor: it.anchor.slice(0, 60), index: i + 1 }),
            },
          })
        }
        if (inserted > 0) {
          finalDraft = md
          artifacts.illustrations = { planned: items.length, inserted, degraded }
          const latest = await db.article.findFirst({ where: { runId }, orderBy: { version: "desc" } })
          if (latest) {
            await db.article.update({
              where: { id: latest.id },
              data: { markdown: md, wordCount: md.replace(/\s/g, "").length },
            })
          }
        }
        if (inserted === 0 && degraded === 0) return "锚点全部未命中，未插图（不阻断）"
        return `${inserted}/${items.length} 张插图已插入正文${degraded > 0 ? `，${degraded} 张降级留痕` : ""}`
      },
      { optional: true },
    )

    // ========== Step 8: 封面（可选，失败降级留痕） ==========
    await step(
      7,
      async () => {
        const title = finalDraft.match(/^#\s+(.+)$/m)?.[1] ?? run.ideaTitle
        const img = await generateCoverImage(
          `微信公众号文章封面，主题：${title}，风格：现代扁平插画，蓝灰科技配色，简洁大气，无文字`,
          runId,
        )
        await db.asset.create({
          data: {
            runId,
            kind: "image",
            role: "cover",
            provider: img.ok ? "zai-image" : "zai-image(降级)",
            path: img.filePath,
            meta: JSON.stringify({ size: "1344x768", bytes: img.sizeBytes }),
            error: img.error ?? "",
          },
        })
        if (!img.ok) return `生图降级（${img.error?.slice(0, 80)}）——无封面出稿，不阻断`
        return `封面已生成 ${img.filePath}（${Math.round(img.sizeBytes / 1024)}KB）`
      },
      { optional: true },
    )

    // ========== Step 9: 微信排版 ==========
    await step(8, async () => {
      const theme = resolveThemeId(run.theme)
      const renderClaims: RenderClaim[] = verifiedClaims
        .filter((c) => c.verified)
        .map((c) => ({ idx: c.idx, sourceSite: c.sourceSite, sourceTitle: c.sourceTitle, sourceDate: c.sourceDate, sourceUrl: c.sourceUrl }))
      const title = finalDraft.match(/^#\s+(.+)$/m)?.[1] ?? run.ideaTitle
      const html = renderWechatHtml(finalDraft, renderClaims, {
        theme,
        title,
        wordCount: finalDraft.replace(/\s/g, "").length,
      })
      const latest = await db.article.findFirst({ where: { runId }, orderBy: { version: "desc" } })
      if (latest) {
        await db.article.update({ where: { id: latest.id }, data: { formatted: html } })
      }
      artifacts.layout = { theme, htmlLength: html.length, refs: renderClaims.length }
      return `${html.length} 字符 HTML｜${theme} 主题｜${renderClaims.length} 条来源脚注｜7 项质量点`
    })

    await db.agentRun.update({
      where: { id: runId },
      data: {
        status: "done",
        mode,
        output: finalDraft,
        steps: JSON.stringify(steps),
        artifacts: JSON.stringify(artifacts),
        finishedAt: new Date(),
      },
    })
  } catch (e) {
    await db.agentRun
      .update({
        where: { id: runId },
        data: { status: "error", error: (e as Error).message.slice(0, 500), steps: JSON.stringify(steps), finishedAt: new Date() },
      })
      .catch(() => {})
  }
}

// ============================================================
// 纯图线（image run）：主题 → 构图方案（LLM）→ 批量生图 → 画廊
// 不写文章、不做搜索；产品定位：封面/组图/概念卡的独立产线
// P1 升级 2.0：mode=gen 生成式（zai-image + VLM 读回复核）｜
//   mode=layout 版式卡（代码排版零错字 + VLM 读回复核），
//   双层校验：规划提示词内置清单自检（生图前）+ 读回图片复核（生图后），
//   未过自动重试一次（重试提示拼进下一次方案），VLM 不可达诚实标「未质检」
// ============================================================

const IMAGE_STEP_DEFS: { name: string; label: string }[] = [
  { name: "plan", label: "构图方案" },
  { name: "gen", label: "批量生图" },
]

export function initialImageSteps(): RunStep[] {
  return IMAGE_STEP_DEFS.map((s) => ({ name: s.name, status: "pending", detail: s.label, latencyMs: 0 }))
}

const inflightImage = new Set<string>()

export interface CreateImageRunArgs {
  subject: string
  usage: string
  style: string
  count: number
  /** gen=生成式生图（默认）｜layout=版式卡（代码排版） */
  mode?: "gen" | "layout"
  /** layout 模式锁定版系（editorial/swiss；空=LLM 自选） */
  family?: string
}

export async function createImageRun(args: CreateImageRunArgs): Promise<string> {
  const usage = getImageUsage(args.usage)
  const mode = args.mode === "layout" ? "layout" : "gen"
  const count = Math.min(9, Math.max(1, Math.floor(args.count) || 3))
  const familyOk = CARD_FAMILIES.some((f) => f.id === args.family)
  const style = getImageStyle(args.style)
  const run = await db.agentRun.create({
    data: {
      kind: "image",
      ideaTitle: args.subject.slice(0, 200),
      // 自描述参数行（执行时反向解析，UI 可直接展示）
      ideaAngle: `${mode === "layout" ? "版式卡" : "生成式"} · ${usage.label} · ${count} 张`.slice(0, 500),
      persona: mode === "layout" ? `layout${familyOk ? `:${args.family}` : ""}` : style.id,
      theme: usage.id,
      input: args.subject,
      status: "queued",
      steps: JSON.stringify(initialImageSteps()),
    },
  })
  return run.id
}

export function executeImageRunInBackground(runId: string): void {
  if (inflightImage.has(runId)) return
  inflightImage.add(runId)
  void executeImageRun(runId).finally(() => inflightImage.delete(runId))
}

async function executeImageRun(runId: string): Promise<void> {
  const run = await db.agentRun.findUnique({ where: { id: runId } })
  if (!run || run.kind !== "image" || run.status === "running" || run.status === "done") return

  const steps = initialImageSteps()
  const artifacts: Record<string, unknown> = {}
  const usage = getImageUsage(run.theme)
  const size = usage.size.split("x").map(Number) as [number, number]
  const mode: "gen" | "layout" = run.persona?.startsWith("layout") ? "layout" : "gen"
  const familyLock = mode === "layout" ? run.persona.split(":")[1] : undefined
  const familyOk = CARD_FAMILIES.some((f) => f.id === familyLock)
  const style = getImageStyle(mode === "gen" ? run.persona || "modern-flat" : "modern-flat")
  const count = Math.min(9, Math.max(1, Number(run.ideaAngle.match(/(\d+)\s*张/)?.[1] ?? 3) || 3))

  await db.agentRun.update({ where: { id: runId }, data: { status: "running", steps: JSON.stringify(steps) } })
  const save = () => db.agentRun.update({ where: { id: runId }, data: { steps: JSON.stringify(steps) } }).catch(() => {})

  const step = async (i: number, fn: () => Promise<string>, opts?: { optional?: boolean }) => {
    steps[i] = { ...steps[i], status: "running" }
    await save()
    const t0 = Date.now()
    try {
      const detail = await fn()
      steps[i] = { ...steps[i], status: "done", detail, latencyMs: Date.now() - t0 }
    } catch (e) {
      steps[i] = { ...steps[i], status: opts?.optional ? "skipped" : "error", detail: (e as Error).message.slice(0, 200), latencyMs: Date.now() - t0 }
      if (!opts?.optional) throw e
    }
    await save()
  }

  /** 质检结果摘要（Asset meta.vlm 留痕） */
  const vlmNote = (v: VlmCheckResult | null, retried: boolean): string => {
    if (!v || !v.done) return v?.error ? `未质检（VLM 不可达：${v.error.slice(0, 60)}）` : "未质检"
    if (v.pass) return retried ? "重试后通过" : "质检通过"
    return `质检未过（${v.issues.join("；") || "原因不明"}）`
  }

  try {
    // ========== Step 1: 构图方案 / 版式文案（LLM，含生图前清单自检） ==========
    let plan: ImagePlanItem[] | null = null
    let cards: CardPlanItem[] | null = null
    await step(0, async () => {
      for (const temp of [0.5, 0.2]) {
        if (mode === "layout") {
          const raw = await chatRetry(
            cardPlanMessages({ subject: run.input || run.ideaTitle, usageId: usage.id, count, familyId: familyOk ? familyLock : undefined }),
            { temperature: temp },
          )
          cards = parseCardPlan(extractJson(raw) ?? raw, count)
          if (cards && cards.length > 0) break
        } else {
          const raw = await chatRetry(
            imagePlanMessages({ subject: run.input || run.ideaTitle, usageId: usage.id, styleId: style.id, count }),
            { temperature: temp },
          )
          plan = extractJson<ImagePlanItem[]>(raw)
          if (Array.isArray(plan) && plan.length > 0) break
        }
      }
      if (mode === "layout") {
        if (!cards || cards.length === 0) throw new Error("版式卡文案解析失败（两档温度重试后仍不合格式，请重试）")
        artifacts.cards = cards.slice(0, count)
        return `${Math.min(cards.length, count)} 张版式卡文案｜${familyOk ? `${familyLock} 版系锁定` : "版系 LLM 自选"}｜代码排版零错字`
      }
      if (!Array.isArray(plan) || plan.length === 0) throw new Error("构图方案解析失败（两档温度重试后仍不合格式，请重试）")
      artifacts.plan = plan.slice(0, count)
      return `${Math.min(plan.length, count)} 个构图概念｜${style.label}｜${usage.label}`
    })

    // ========== Step 2: 批量产出（逐张生成 + VLM 读回复核，未过重试一次留痕） ==========
    await step(1, async () => {
      let ok = 0
      let degraded = 0
      let vlmPass = 0
      let vlmFail = 0
      let vlmSkip = 0
      let retried = 0
      const gallery: { path: string; caption: string }[] = []
      const outputLines = [`# ${run.ideaTitle}`, "", `> 纯图线 · ${mode === "layout" ? "版式卡（代码排版）" : usage.label + " · " + style.label} · ${usage.label}`, ""]

      const items: number[] = Array.from({ length: mode === "layout" ? (cards ?? []).length : (plan ?? []).filter((x) => x?.concept).length }, (_, i) => i)
      for (const i of items.slice(0, count)) {
        const caption = mode === "layout" ? ((cards ?? [])[i]?.caption ?? `图 ${i + 1}`).slice(0, 30) : ((plan ?? [])[i]?.caption ?? `图 ${i + 1}`).slice(0, 30)

        if (mode === "layout") {
          // ---- 版式卡：代码排版渲染（确定性，零错字）----
          const card = (cards ?? [])[i]
          let rendered: { filePath: string; absPath: string; sizeBytes: number } | null = null
          try {
            rendered = await renderCardToAsset(card, { runId, slug: `card-${i + 1}`, size: { width: size[0], height: size[1] } })
          } catch (e) {
            degraded++
            await db.asset.create({
              data: {
                runId, kind: "image", role: i === 0 ? "hero" : `card-${i + 1}`, provider: "card-engine(降级)", path: "",
                meta: JSON.stringify({ size: usage.size, caption, template: card.template, family: card.family, index: i + 1 }),
                error: (e as Error).message,
              },
            })
            continue
          }
          if (!rendered) continue
          // VLM 读回复核：不过 → 截短文案重渲染一次（版式卡失败主因是文字溢出）
          let vlm = await vlmCheckImage({ absPath: rendered.absPath, concept: `${card.template}｜${card.title}${card.quote ? "｜" + card.quote : ""}`, caption, kind: "layout" })
          let didRetry = false
          if (vlm.done && !vlm.pass) {
            didRetry = true
            retried++
            const shrunk: CardPlanItem = {
              ...card,
              title: card.title.slice(0, Math.max(8, card.title.length - 4)),
              subtitle: card.subtitle?.slice(0, 20),
              quote: card.quote?.slice(0, 44),
            }
            try {
              const again = await renderCardToAsset(shrunk, { runId, slug: `card-${i + 1}`, size: { width: size[0], height: size[1] } })
              const vlm2 = await vlmCheckImage({ absPath: again.absPath, concept: `${card.template}｜${shrunk.title}`, caption, kind: "layout" })
              if (vlm2.done && vlm2.pass) vlm = vlm2
              rendered = again
            } catch {
              /* 重渲染失败保留首图 + 首次质检结果 */
            }
          }
          if (vlm.done && vlm.pass) vlmPass++
          else if (vlm.done) vlmFail++
          else vlmSkip++
          ok++
          gallery.push({ path: rendered.filePath, caption })
          outputLines.push(`![${caption}](${rendered.filePath})`, "")
          await db.asset.create({
            data: {
              runId, kind: "image", role: i === 0 ? "hero" : `card-${i + 1}`, provider: "card-engine(代码排版)", path: rendered.filePath,
              meta: JSON.stringify({
                size: usage.size, bytes: rendered.sizeBytes, caption, template: card.template, family: card.family, index: i + 1,
                vlm: vlmNote(vlm, didRetry),
              }),
            },
          })
          continue
        }

        // ---- 生成式：zai-image 生图 + VLM 读回复核（未过带建议重试一次）----
        const it = (plan ?? [])[i]
        let prompt = `${it.concept}，${style.prompt}`
        const img = await generateImage(prompt, runId, `card-${i + 1}`, usage.size)
        if (!img.ok) {
          degraded++
          await db.asset.create({
            data: {
              runId, kind: "image", role: i === 0 ? "hero" : `card-${i + 1}`, provider: "zai-image(降级)", path: "",
              meta: JSON.stringify({ size: usage.size, caption, concept: it.concept.slice(0, 200), index: i + 1 }),
              error: img.error ?? "",
            },
          })
          continue
        }
        let finalImg = img
        let vlm = await vlmCheckImage({ absPath: img.absPath, concept: it.concept, caption, kind: "gen" })
        let didRetry = false
        if (vlm.done && !vlm.pass && vlm.retryHint) {
          // 带质检建议重试一次（覆盖同名文件；首图失败留证在 Asset.error 文案里）
          didRetry = true
          retried++
          prompt = `${prompt}。注意规避以下问题：${vlm.retryHint}`
          const img2 = await generateImage(prompt, runId, `card-${i + 1}`, usage.size)
          if (img2.ok) {
            const vlm2 = await vlmCheckImage({ absPath: img2.absPath, concept: `${it.concept}（重试：${vlm.retryHint}）`, caption, kind: "gen" })
            if (vlm2.done && vlm2.pass) vlm = vlm2
            finalImg = img2
          }
        }
        if (vlm.done && vlm.pass) vlmPass++
        else if (vlm.done) vlmFail++
        else vlmSkip++
        ok++
        gallery.push({ path: finalImg.filePath, caption })
        outputLines.push(`![${caption}](${finalImg.filePath})`, "")
        await db.asset.create({
          data: {
            runId, kind: "image", role: i === 0 ? "hero" : `card-${i + 1}`, provider: "zai-image", path: finalImg.filePath,
            meta: JSON.stringify({
              size: usage.size, bytes: finalImg.sizeBytes, caption, concept: it.concept.slice(0, 200), index: i + 1,
              vlm: vlmNote(vlm, didRetry),
            }),
          },
        })
      }
      if (ok === 0) throw new Error(`全部产出降级：${items.length} 张均未成功（${mode === "layout" ? "版式渲染引擎异常" : "生图端点不稳定，可稍后重试或在设置中心配置自定义生图端点"}）`)
      artifacts.gallery = gallery
      const vlmSummary = `质检：${vlmPass} 过 / ${vlmFail} 未过 / ${vlmSkip} 未检${retried > 0 ? `（${retried} 张重试）` : ""}`
      artifacts.vlm = { pass: vlmPass, fail: vlmFail, skip: vlmSkip, retried }
      const output = outputLines.join("\n")
      await db.agentRun.update({ where: { id: runId }, data: { output } })
      return `${ok}/${items.length} 张已产出（${usage.size}）｜${vlmSummary}${degraded > 0 ? `，${degraded} 张降级留痕` : ""}`
    })

    await db.agentRun.update({
      where: { id: runId },
      data: {
        status: "done",
        mode: "REAL",
        steps: JSON.stringify(steps),
        artifacts: JSON.stringify(artifacts),
        finishedAt: new Date(),
      },
    })
  } catch (e) {
    await db.agentRun
      .update({
        where: { id: runId },
        data: { status: "error", error: (e as Error).message.slice(0, 500), steps: JSON.stringify(steps), finishedAt: new Date() },
      })
      .catch(() => {})
  }
}
