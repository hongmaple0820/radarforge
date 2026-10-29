// ============================================================
// run-manager（runtime）—— 图文线六步流水线
// brief 任务书 → claims 取证 → 初稿 → 五维审稿 → 封面 → 排版
// 后台执行 + 前端轮询；每步产物落库留痕，可回答「为什么这样写」
// ============================================================

import { db } from "@/lib/db"
import { chatRetry, searchWithFallback } from "@/lib/gateway"
import { generateCoverImage } from "@/lib/gateway/providers/zai-image"
import { getSettings, styleProfilePrompt } from "@/lib/settings"
import { exemplarPrompt, type StyleExemplar } from "./skills/radar-learn"
import { extractJson, clampNum } from "./json"
import { renderWechatHtml, resolveThemeId, type RenderClaim } from "./render"
import { briefMessages, draftMessages, getPersona, type Brief, type BriefClaim } from "./skills/radar-write"
import { parseReview, reviewMessages, reviseMessages } from "./skills/radar-review"

export interface RunStep {
  name: string
  status: "pending" | "running" | "done" | "error" | "skipped"
  detail: string
  latencyMs: number
}

const STEP_DEFS: { name: string; label: string }[] = [
  { name: "brief", label: "任务书" },
  { name: "claims", label: "主张取证" },
  { name: "draft", label: "初稿" },
  { name: "review", label: "五维审稿" },
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
      // 降温重试：0.4 偶发非 JSON / 缺字段 → 0.2 保守档重试一次（同 ideas/refresh 已验证模式）
      let parsed: Brief | null = null
      for (const temp of [0.4, 0.2]) {
        const raw = await chatRetry(briefMessages(run.ideaTitle, run.ideaAngle, stylePrompt), { temperature: temp })
        parsed = extractJson<Brief>(raw)
        if (parsed?.coreJudgment) break
      }
      brief = parsed
      if (!brief?.coreJudgment) throw new Error("任务书解析失败（两档温度重试后仍不合格式，请重试）")
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
        // 简单相关性匹配：取第一条（SearchPro 已按相关度排序），标题或正文与主张有交集才算命中
        const best = resp.results.find(
          (r) => r.passage.length > 60 || r.title.length > 8,
        ) ?? resp.results[0]
        if (best && resp.mode === "REAL") {
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
      return `${facts.length} 条 fact 主张取证：${found} 条找到来源（Industry=news · Freshness=d30）`
    })

    // ========== Step 3: 初稿 ==========
    let draft = ""
    await step(2, async () => {
      const persona = getPersona(run.persona)
      const rules = await db.learningRule.findMany({ where: { status: "active" }, orderBy: { hits: "desc" }, take: 8 })
      const raw = await chatRetry(
        draftMessages({
          brief: brief!,
          persona,
          claims: verifiedClaims.map((c) => ({
            idx: c.idx,
            text: c.text,
            claimType: c.claimType,
            verified: c.verified,
            sourceTitle: c.sourceTitle,
            sourceSite: c.sourceSite,
            sourceDate: c.sourceDate,
            sourceUrl: c.sourceUrl,
          })),
          rules: rules.map((r) => r.rule),
          ideaTitle: run.ideaTitle,
          ideaAngle: run.ideaAngle,
          stylePrompt,
          exemplarPrompt: exPrompt,
        }),
        { temperature: 0.75 },
      )
      if (!raw) throw new Error("初稿生成失败（LLM 空返回）")
      draft = raw
      if (rules.length > 0) {
        await db.$transaction(rules.map((r) => db.learningRule.update({ where: { id: r.id }, data: { hits: { increment: 1 } } })))
      }
      const wordCount = raw.replace(/\s/g, "").length
      const title = raw.match(/^#\s+(.+)$/m)?.[1] ?? run.ideaTitle
      await db.article.create({
        data: { runId, version: 0, title: title.slice(0, 120), markdown: raw, wordCount },
      })
      return `${persona.label}｜${wordCount} 字｜注入飞轮规则 ${rules.length} 条`
    })

    // ========== Step 4: 五维审稿（不过关 revise 一轮） ==========
    let finalDraft = draft
    await step(3, async () => {
      const persona = getPersona(run.persona)
      // 降温重试：审稿 JSON 偶发不合格式 → 0.1 保守档重试
      let review: ReturnType<typeof parseReview> = null
      for (const temp of [0.2, 0.1]) {
        const reviewRaw = await chatRetry(reviewMessages(draft, persona.label), { temperature: temp })
        review = parseReview(extractJson(reviewRaw))
        if (review) break
      }
      if (!review) return "审稿解析失败，跳过（初稿直接进入排版）"
      artifacts.review = review
      const avg = review.average
      let revised = false
      if (avg < 7.5) {
        try {
          const revisedDraft = await chatRetry(reviseMessages(draft, review), { temperature: 0.5 })
          if (revisedDraft && revisedDraft.length > 400) {
            finalDraft = revisedDraft
            revised = true
            const wordCount = revisedDraft.replace(/\s/g, "").length
            const title = revisedDraft.match(/^#\s+(.+)$/m)?.[1] ?? run.ideaTitle
            const v0 = await db.article.findFirst({ where: { runId }, orderBy: { version: "asc" } })
            await db.article.create({
              data: { runId, version: (v0?.version ?? 0) + 1, title: title.slice(0, 120), markdown: revisedDraft, wordCount },
            })
          }
        } catch {
          /* 修订失败保留初稿 */
        }
      }
      await db.reviewRecord.create({
        data: {
          runId,
          round: 1,
          scoresJson: JSON.stringify(review.scores),
          commentsJson: JSON.stringify(review.comments),
          average: avg,
          revised,
        },
      })
      const dims = Object.entries(review.scores).map(([k, v]) => `${k} ${clampNum(v, 0, 10, 0)}`).join(" / ")
      return `均分 ${avg}${revised ? "（已修订一轮）" : "（通过）"}｜${dims}`
    })

    // ========== Step 5: 封面（可选，失败降级留痕） ==========
    await step(
      4,
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

    // ========== Step 6: 微信排版 ==========
    await step(5, async () => {
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
