// ============================================================
// run-manager（runtime）—— 图文线七步流水线 + 纯图线两步流水线
// 图文线：brief 任务书 → claims 取证 → 初稿 → 五维审稿
//         → 正文配图（插图规划+生成+回插）→ 封面 → 排版
// 纯图线：构图方案（LLM）→ 批量生图 → 画廊 markdown
// 后台执行 + 前端轮询；每步产物落库留痕，可回答「为什么这样写/这样画」
// ============================================================

import { db } from "@/lib/db"
import { chatRetry, searchWithFallback } from "@/lib/gateway"
import { generateCoverImage, generateImage } from "@/lib/gateway/providers/zai-image"
import { getSettings, styleProfilePrompt } from "@/lib/settings"
import { exemplarPrompt, type StyleExemplar } from "./skills/radar-learn"
import { extractJson, clampNum } from "./json"
import { renderWechatHtml, resolveThemeId, type RenderClaim } from "./render"
import { briefMessages, draftMessages, getPersona, type Brief, type BriefClaim } from "./skills/radar-write"
import { parseReview, reviewMessages, reviseMessages } from "./skills/radar-review"
import {
  getImageStyle,
  getImageUsage,
  imagePlanMessages,
  illustrationPlanMessages,
  insertImageAfterHeading,
  findHeadingIndex,
  ILLUSTRATION_STYLE_TOKEN,
  type ImagePlanItem,
  type IllustrationPlanItem,
} from "./skills/radar-image"

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
        // 关键词重合度匹配（修复旧「假命中」：取第一条长结果就算核实）
        // 分词：拉丁/数字词 + CJK 二元组（中文无空格，单词级 token 会整句成一个词导致重合度恒 0）
        const tokenize = (s: string): string[] => {
          const out: string[] = []
          for (const m of s.match(/[A-Za-z0-9][A-Za-z0-9_.-]*/g) ?? []) out.push(m.toLowerCase())
          const cjk = (s.match(/[\u4e00-\u9fff]+/g) ?? []).join("")
          for (let i = 0; i < cjk.length - 1; i++) out.push(cjk.slice(i, i + 2))
          return out
        }
        const claimTokens = new Set(tokenize(c.text))
        const overlap = (r: { title: string; passage: string }) => {
          const hay = new Set(tokenize(`${r.title} ${r.passage.slice(0, 400)}`))
          let hits = 0
          for (const t of claimTokens) if (hay.has(t)) hits++
          return hits
        }
        const ranked = [...resp.results].sort((a, b) => overlap(b) - overlap(a))
        const best = ranked[0]
        const bestHits = best ? overlap(best) : 0
        if (best && resp.mode === "REAL" && bestHits >= 2) {
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
      return `${facts.length} 条 fact 主张取证：${found} 条找到来源（关键词重合度≥2 命中）`
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

    // ========== Step 5: 正文配图（可选：插图规划 → zai-image 生成 → 回插 markdown） ==========
    // 修复「文章里没有图」：从成稿提炼 2~3 个插图位（锚定小节标题），
    // 生成与文风一致的扁平插画并回插 markdown；生图降级不阻断（跳过该图留痕）
    await step(
      4,
      async () => {
        let plan: IllustrationPlanItem[] | null = null
        for (const temp of [0.3, 0.1]) {
          const raw = await chatRetry(illustrationPlanMessages(finalDraft), { temperature: temp })
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

    // ========== Step 6: 封面（可选，失败降级留痕） ==========
    await step(
      5,
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

    // ========== Step 7: 微信排版 ==========
    await step(6, async () => {
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
}

export async function createImageRun(args: CreateImageRunArgs): Promise<string> {
  const usage = getImageUsage(args.usage)
  const style = getImageStyle(args.style)
  const count = Math.min(9, Math.max(1, Math.floor(args.count) || 3))
  const run = await db.agentRun.create({
    data: {
      kind: "image",
      ideaTitle: args.subject.slice(0, 200),
      // 自描述参数行：`${用途} · ${风格} · ${N} 张`（执行时反向解析，UI 可直接展示）
      ideaAngle: `${usage.label} · ${style.label} · ${count} 张`.slice(0, 500),
      persona: style.id,
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
  const style = getImageStyle(run.persona || "modern-flat")
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

  try {
    // ========== Step 1: 构图方案（LLM） ==========
    let plan: ImagePlanItem[] | null = null
    await step(0, async () => {
      for (const temp of [0.5, 0.2]) {
        const raw = await chatRetry(
          imagePlanMessages({ subject: run.input || run.ideaTitle, usageId: usage.id, styleId: style.id, count }),
          { temperature: temp },
        )
        plan = extractJson<ImagePlanItem[]>(raw)
        if (Array.isArray(plan) && plan.length > 0) break
      }
      if (!Array.isArray(plan) || plan.length === 0) throw new Error("构图方案解析失败（两档温度重试后仍不合格式，请重试）")
      artifacts.plan = plan.slice(0, count)
      return `${Math.min(plan.length, count)} 个构图概念｜${style.label}｜${usage.label}`
    })

    // ========== Step 2: 批量生图（逐张生成留痕，全降级才算失败） ==========
    await step(1, async () => {
      const items = (plan ?? []).filter((x) => x?.concept).slice(0, count)
      if (items.length === 0) throw new Error("构图方案为空")
      let ok = 0
      let degraded = 0
      const gallery: { path: string; caption: string }[] = []
      const outputLines = [`# ${run.ideaTitle}`, "", `> 纯图线 · ${usage.label} · ${style.label} · ${items.length} 张`, ""]
      for (let i = 0; i < items.length; i++) {
        const it = items[i]
        const img = await generateImage(`${it.concept}，${style.prompt}`, runId, `card-${i + 1}`, usage.size)
        const caption = (it.caption ?? `图 ${i + 1}`).slice(0, 30)
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
        ok++
        gallery.push({ path: img.filePath, caption })
        outputLines.push(`![${caption}](${img.filePath})`, "")
        await db.asset.create({
          data: {
            runId, kind: "image", role: i === 0 ? "hero" : `card-${i + 1}`, provider: "zai-image", path: img.filePath,
            meta: JSON.stringify({ size: usage.size, bytes: img.sizeBytes, caption, concept: it.concept.slice(0, 200), index: i + 1 }),
          },
        })
      }
      if (ok === 0) throw new Error(`全部生图降级：${(plan ?? []).length} 张均未成功（可稍后重试或在设置中心配置自定义生图端点）`)
      artifacts.gallery = gallery
      const output = outputLines.join("\n")
      await db.agentRun.update({ where: { id: runId }, data: { output } })
      return `${ok}/${items.length} 张已生成（${usage.size}）${degraded > 0 ? `，${degraded} 张降级留痕` : ""}`
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
