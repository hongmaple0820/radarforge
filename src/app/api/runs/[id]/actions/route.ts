import { NextResponse } from "next/server"
import { db } from "@/lib/db"
import { chatRetry } from "@/lib/gateway"
import { generateCoverImage } from "@/lib/gateway/providers/zai-image"
import { extractJson } from "@/lib/runtime/json"
import { relayoutForRun } from "@/lib/runtime/relayout"
import { diffMarkdown, learnMessages, parseRules } from "@/lib/runtime/skills/radar-learn"
import { REWRITE_TARGETS, rewriteMessages, storyboardMessages, parseStoryboard, parseDirections, directionsMessages, TTS_VOICES, type DirectionBrief, type DirectionProposal } from "@/lib/runtime/skills/radar-rewrite"
import { publishWechat } from "@/lib/publish/wechat"
import { startVideoRenderInBackground, startSceneReviseInBackground, type VideoAspect, type RenderProgress, type VideoStyle, type VideoChannel, type BgmPreset, type SceneRevision } from "@/lib/runtime/video"
import { resolveThemeId } from "@/lib/runtime/render"

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  try {
    const body = (await req.json()) as { action?: string; markdown?: string; target?: string; theme?: string; platform?: string; voice?: string; aspect?: string; storyboard?: unknown; style?: string; channel?: string; bgm?: string; direction?: unknown; sceneId?: number; feedback?: string; baseAssetId?: string }
    const action = body.action ?? ""

    // ---------- edit：用户改稿 → 喂飞轮 ----------
    if (action === "edit") {
      const latest = await db.article.findFirst({ where: { runId: id }, orderBy: { version: "desc" } })
      if (!latest) return NextResponse.json({ error: "没有成稿可改" }, { status: 400 })
      const newMarkdown = (body.markdown ?? "").trim()
      if (!newMarkdown) return NextResponse.json({ error: "markdown 不能为空" }, { status: 400 })

      // 保存新版本 + relayout（改稿后自动重排版，与流水线第 6 步同一引擎）
      const relayout = await relayoutForRun(id, newMarkdown, latest.title)
      await db.article.create({
        data: { runId: id, version: latest.version + 1, title: relayout.title, markdown: newMarkdown, wordCount: relayout.wordCount, formatted: relayout.formatted },
      })

      // diff → 提炼规则（宁缺毋滥：无差异跳过）
      const diff = diffMarkdown(latest.markdown, newMarkdown)
      if (diff.length === 0) {
        return NextResponse.json({ saved: true, diffCount: 0, rules: [], message: "保存成功，无实质差异，飞轮跳过（宁缺毋滥）" })
      }
      // 降温重试：规则提炼偶发非 JSON → 0.15 保守档
      let rules: { rule: string; rationale: string }[] = []
      for (const temp of [0.3, 0.15]) {
        const raw = await chatRetry(learnMessages(diff), { temperature: temp })
        rules = parseRules(extractJson(raw))
        if (rules.length > 0) break
      }
      for (const r of rules) {
        await db.learningRule.create({ data: { runId: id, rule: r.rule, rationale: r.rationale, status: "proposed" } })
      }
      return NextResponse.json({
        saved: true,
        diffCount: diff.length,
        rules,
        message: rules.length > 0 ? `保存成功，${diff.length} 处差异提炼出 ${rules.length} 条候选规则，待确认` : `保存成功，${diff.length} 处差异未提炼出稳定规则`,
      })
    }

    // ---------- rewrite：一稿多发 ----------
    if (action === "rewrite") {
      const latest = await db.article.findFirst({ where: { runId: id }, orderBy: { version: "desc" } })
      if (!latest) return NextResponse.json({ error: "没有成稿可改写" }, { status: 400 })
      const target = REWRITE_TARGETS.find((t) => t.id === (body.target ?? ""))
      if (!target) return NextResponse.json({ error: `未知改写目标：${body.target}` }, { status: 400 })
      const out = await chatRetry(rewriteMessages(latest.markdown, target), { temperature: 0.7 })
      if (!out) throw new Error("改写失败（LLM 空返回）")
      await db.asset.create({
        data: { runId: id, kind: "html", role: `rewrite-${target.id}`, provider: "zai-llm", path: "", meta: JSON.stringify({ wordCount: out.replace(/\s/g, "").length }) },
      })
      return NextResponse.json({ rewrite: out, target: target.label, wordCount: out.replace(/\s/g, "").length })
    }

    // ---------- storyboard-directions：导演三方向提案（学 huashu-motion director §4） ----------
    if (action === "storyboard-directions") {
      const latest = await db.article.findFirst({ where: { runId: id }, orderBy: { version: "desc" } })
      if (!latest) return NextResponse.json({ error: "没有成稿可提案方向" }, { status: 400 })
      const platform = ["douyin", "shipinhao", "bilibili"].includes(body.platform ?? "") ? body.platform! : "douyin"
      let directions: DirectionProposal[] = []
      for (const temp of [0.7, 0.35]) {
        const raw = await chatRetry(directionsMessages(latest.markdown, platform), { temperature: temp })
        directions = parseDirections(extractJson(raw) ?? raw)
        if (directions.length >= 3) break
      }
      if (directions.length < 3) throw new Error("三方向提案失败（两档温度重试后仍不足三个），请重试")
      await db.asset.create({
        data: {
          runId: id, kind: "video", role: "storyboard-directions", provider: "zai-llm", path: "",
          meta: JSON.stringify({ platform, directions, brief: latest.title }),
        },
      })
      return NextResponse.json({ directions, platform })
    }

    // ---------- storyboard：视频分镜脚本（可携带选定方向） ----------
    if (action === "storyboard") {
      const latest = await db.article.findFirst({ where: { runId: id }, orderBy: { version: "desc" } })
      if (!latest) return NextResponse.json({ error: "没有成稿可改编分镜" }, { status: 400 })
      const platform = ["douyin", "shipinhao", "bilibili"].includes(body.platform ?? "") ? body.platform! : "douyin"
      // 选定方向（轻量校验：hex 色板与 kind 白名单）
      const d = (body.direction ?? null) as Record<string, unknown> | null
      const HEX = /^#[0-9a-fA-F]{6}$/
      const direction: DirectionBrief | undefined =
        d && typeof d === "object" && d.name
          ? {
              key: String(d.key ?? "A").slice(0, 1),
              kind: ["fit", "amplify", "unexpected"].includes(String(d.kind)) ? String(d.kind) : "fit",
              name: String(d.name).slice(0, 24),
              language: String(d.language ?? "").slice(0, 160),
              accent: HEX.test(String(d.accent)) ? String(d.accent) : "#f59e0b",
              base: HEX.test(String(d.base)) ? String(d.base) : "#0b1220",
              feel: String(d.feel ?? "").slice(0, 160),
            }
          : undefined
      // 降温重试：分镜 JSON 偶发不合格式 → 0.3 保守档（两档失败才报错）
      let storyboard: ReturnType<typeof parseStoryboard> = null
      for (const temp of [0.6, 0.3]) {
        const raw = await chatRetry(storyboardMessages(latest.markdown, platform, direction), { temperature: temp })
        storyboard = parseStoryboard(extractJson(raw))
        if (storyboard) break
      }
      if (!storyboard) throw new Error("分镜解析失败（两档温度重试后仍不合格式），请重试")
      if (direction) storyboard = { ...storyboard, direction }
      await db.asset.create({
        data: {
          runId: id, kind: "video", role: `storyboard-${platform}`, provider: "zai-llm", path: "",
          meta: JSON.stringify({ title: storyboard.title, scenes: storyboard.scenes.length, totalSeconds: storyboard.totalSeconds, ...(direction ? { direction } : {}) }),
        },
      })
      return NextResponse.json({ storyboard, platform })
    }

    // ---------- cover：手动（重新）生成封面（生图降级后可重试，配好自定义端点即生效） ----------
    if (action === "cover") {
      const latest = await db.article.findFirst({ where: { runId: id }, orderBy: { version: "desc" } })
      if (!latest) return NextResponse.json({ error: "没有成稿，无法提炼封面描述" }, { status: 400 })
      const title = latest.markdown.match(/^#\s+(.+)$/m)?.[1] ?? latest.title
      const img = await generateCoverImage(
        `微信公众号文章封面，主题：${title}，风格：现代扁平插画，蓝灰科技配色，简洁大气，无文字`,
        id,
      )
      const asset = await db.asset.create({
        data: {
          runId: id, kind: "image", role: "cover",
          provider: img.ok ? "zai-image(手动)" : "zai-image(手动·降级)",
          path: img.filePath,
          meta: JSON.stringify({ size: "1344x768", bytes: img.sizeBytes, manual: true }),
          error: img.error ?? "",
        },
      })
      if (!img.ok) {
        return NextResponse.json({ assetId: asset.id, ok: false, error: img.error?.slice(0, 120) ?? "生图失败" }, { status: 200 })
      }
      return NextResponse.json({ assetId: asset.id, ok: true, path: img.filePath, sizeBytes: img.sizeBytes })
    }

    // ---------- render-video：分镜 → 成片 MP4（三通道 + 方向调色板 + BGM） ----------
    if (action === "render-video") {
      const storyboard = parseStoryboard(body.storyboard)
      if (!storyboard || storyboard.scenes.length < 3) {
        return NextResponse.json({ error: "分镜数据不完整（至少 3 个分镜），请先生成视频分镜" }, { status: 400 })
      }
      const voice = TTS_VOICES.some((v) => v.id === body.voice) ? body.voice! : "xiaochen"
      const aspect: VideoAspect = body.aspect === "16:9" ? "16:9" : "9:16"
      const style: VideoStyle = body.style === "art" ? "art" : "motion"
      const channel: VideoChannel | undefined = body.channel === "agnes" || body.channel === "auto" || body.channel === "local" ? body.channel : undefined
      const bgm: BgmPreset = ["uplift", "tech", "calm"].includes(body.bgm ?? "") ? (body.bgm as BgmPreset) : "none"
      const progress: RenderProgress = {
        stage: "queued", percent: 0, sceneDone: 0, sceneTotal: storyboard.scenes.length,
        audioMode: "pending", voice, aspect, style, channel: channel === "agnes" ? "agnes" : "local",
        ...(bgm !== "none" ? { bgm } : {}),
      }
      const asset = await db.asset.create({
        data: {
          runId: id, kind: "video", role: "video-final", provider: `${channel === "agnes" ? "agnes-video" : style === "art" ? "art-motion" : "ffmpeg"}+tts`, path: "",
          meta: JSON.stringify({ ...progress, storyboard }),
        },
      })
      startVideoRenderInBackground(id, asset.id, storyboard, { voice, aspect, style, channel, bgm })
      const styleLabel = channel === "agnes" ? "Agnes AI 模型" : style === "art" ? "艺术动画（art-motion 引擎）" : "商业片（motion 场景卡）"
      return NextResponse.json({
        assetId: asset.id,
        message: `成片渲染已开始：${storyboard.scenes.length} 个分镜 · ${aspect} · ${styleLabel}${storyboard.direction ? ` · 方向「${storyboard.direction.name}」` : ""}${bgm !== "none" ? " · BGM" : ""} · ${TTS_VOICES.find((v) => v.id === voice)?.label}`,
      })
    }

    // ---------- revise-scene：指着改（单场景局部重渲染 → 版本树） ----------
    if (action === "revise-scene") {
      const storyboard = parseStoryboard(body.storyboard)
      if (!storyboard || storyboard.scenes.length < 3) {
        return NextResponse.json({ error: "分镜数据不完整" }, { status: 400 })
      }
      const sceneId = Number(body.sceneId)
      const feedback = (body.feedback ?? "").trim()
      if (!sceneId || !feedback) {
        return NextResponse.json({ error: "sceneId 与 feedback（修改意见）不能为空" }, { status: 400 })
      }
      if (feedback.length > 300) {
        return NextResponse.json({ error: "意见太长（≤300 字），拆开逐条改更稳" }, { status: 400 })
      }
      // 基线 meta（承接版本链/durations/revisions；指向上一版 video-final）
      const baseAssetId = (body.baseAssetId ?? "").trim()
      const baseAsset = baseAssetId ? await db.asset.findUnique({ where: { id: baseAssetId } }) : null
      let baseVersion = 0
      let baseDurations: number[] = []
      let baseRevisions: SceneRevision[] = []
      if (baseAsset) {
        try {
          const m = JSON.parse(baseAsset.meta) as { version?: number; durations?: number[]; revisions?: SceneRevision[] }
          baseVersion = Number(m.version ?? 1) || 1
          baseDurations = Array.isArray(m.durations) ? m.durations : []
          baseRevisions = Array.isArray(m.revisions) ? m.revisions : []
        } catch {
          /* 基线 meta 损坏 → 从头记 */
        }
      }
      const voice = TTS_VOICES.some((v) => v.id === body.voice) ? body.voice! : "xiaochen"
      const aspect: VideoAspect = body.aspect === "16:9" ? "16:9" : "9:16"
      const style: VideoStyle = body.style === "art" ? "art" : "motion"
      const bgm: BgmPreset = ["uplift", "tech", "calm"].includes(body.bgm ?? "") ? (body.bgm as BgmPreset) : "none"
      const progress: RenderProgress = {
        stage: "queued", percent: 0, sceneDone: 0, sceneTotal: storyboard.scenes.length,
        audioMode: "pending", voice, aspect, style, channel: "local",
        aiNote: `分镜 #${sceneId} 局部重做中…`,
        ...(bgm !== "none" ? { bgm } : {}),
      }
      const asset = await db.asset.create({
        data: {
          runId: id, kind: "video", role: "video-final", provider: `${style === "art" ? "art-motion" : "ffmpeg"}+revise`, path: "",
          meta: JSON.stringify({ ...progress, storyboard }),
        },
      })
      startSceneReviseInBackground(id, asset.id, storyboard, {
        sceneId, feedback, voice, aspect, style, bgm,
        baseVersion, baseDurations, baseRevisions,
      })
      return NextResponse.json({
        assetId: asset.id,
        message: `指着改已受理：分镜 #${sceneId} 将按意见重做，其余分镜不动 → 出 v${baseVersion + 1} 新版本`,
      })
    }

    // ---------- retheme：切换排版主题（不重跑流水线，秒级重排） ----------
    if (action === "retheme") {
      const theme = resolveThemeId(body.theme ?? "")
      const latest = await db.article.findFirst({ where: { runId: id }, orderBy: { version: "desc" } })
      if (!latest) return NextResponse.json({ error: "没有成稿可重排" }, { status: 400 })
      await db.agentRun.update({ where: { id }, data: { theme } })
      const relayout = await relayoutForRun(id, latest.markdown, latest.title)
      await db.article.update({ where: { id: latest.id }, data: { formatted: relayout.formatted } })
      return NextResponse.json({ theme, htmlLength: relayout.formatted.length, message: `已切换为 ${theme} 主题并重排版（${relayout.formatted.length} 字符 HTML）` })
    }

    // ---------- publish：三级降级发布 ----------
    if (action === "publish") {
      const outcome = await publishWechat(id)
      return NextResponse.json({ outcome })
    }

    return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
