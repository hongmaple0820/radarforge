// ============================================================
// dsh-plugin-radar · host loader（服务端半）
// 形态学自 dsh-agnes-multimodal（MIT，啾灵jiuling 原作）：
//   ctx.tools.register({ name, description, execute })
// 把「AI 资讯雷达」平台的图文六步流水线与视频线做成 dsh 模型工具。
//
// 配置（dsh 设置或宿主环境变量）：
//   RADAR_BASE  平台根地址，默认 http://localhost:3000
//
// 工具返回纯文本（成稿摘要 + 平台链接）；MP4/HTML 等富产物由
// client.js 在会话卡片里渲染，不回传给模型（学 agnes 插件的
// "result returns only plain text" 约定）。
// ============================================================

/** Services required before mounting: tool registry + web routes. */
export const inject = ["tools", "webServer"]

const RADAR_BASE = () => process.env.RADAR_BASE || "http://localhost:3000"
const POLL_MS = 5000
const TIMEOUT_MS = 6 * 60_000

async function api(path, init) {
  const res = await fetch(`${RADAR_BASE()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: AbortSignal.timeout(init?.timeout ?? 30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`radar HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

/** 等流水线跑完（queued/running → done/error） */
async function waitForRun(runId) {
  const deadline = Date.now() + TIMEOUT_MS
  while (Date.now() < deadline) {
    const { run } = await api(`/api/runs/${runId}`)
    if (run.status === "done") return run
    if (run.status === "error") throw new Error(`流水线失败：${(run.error || "").slice(0, 200)}`)
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error("流水线超时（6 分钟）——可去平台页查看进度")
}

function fmtRun(run) {
  const steps = safeJson(run.steps, [])
  const arts = run.articles ?? []
  const md = arts.length > 0 ? arts[arts.length - 1].markdown : ""
  const lines = [
    `标题：${run.ideaTitle}`,
    `模式：${run.mode} · 状态：${run.status}`,
    `六步：${steps.map((s) => `${s.name}${s.status === "done" ? "✓" : s.status === "error" ? "✗" : "…"}`).join(" → ")}`,
    `成稿：${md.length} 字符（${arts.length} 个版本）`,
    `平台链接：${RADAR_BASE()}/?run=${run.id}`,
  ]
  if (md) lines.push("", "--- 成稿全文 ---", md.slice(0, 6000))
  return lines.join("\n")
}

function safeJson(s, fallback) {
  try {
    return JSON.parse(s)
  } catch {
    return fallback
  }
}

// ── 图文工具 ─────────────────────────────────────────────────────────────

/** Register the `radar_article` model tool. */
function registerArticleTool(ctx) {
  ctx.tools.register({
    name: "radar_article",
    description:
      "Run the AI-Radar six-step article pipeline on this platform (brief → claims web-verified → persona draft → review → cover → WeChat layout). " +
      "Input: { ideaTitle: string, ideaAngle?: string, persona?: string, theme?: string, exemplarId?: string }. " +
      "Returns the finished article (Markdown) plus a platform link; images/HTML stay in the UI card, not in the result. " +
      "Use it when the user asks to 写一篇公众号文章 / 出一篇稿子 / 跑一条图文流水线.",
    async execute({ ideaTitle, ideaAngle, persona, theme, exemplarId }) {
      if (!ideaTitle) throw new Error("ideaTitle 不能为空")
      const { id } = await api("/api/runs", {
        method: "POST",
        body: JSON.stringify({ ideaTitle, ideaAngle, persona, theme, exemplarId }),
        timeout: 60_000,
      })
      const run = await waitForRun(id)
      // 会话卡片（client.js 渲染）：进度 + 成稿入口
      try {
        ctx.get("attachments")?.push?.(JSON.stringify({ type: "radar-run", runId: id, base: RADAR_BASE() }))
      } catch {
        /* 卡片挂载是尽力而为，不影响工具结果 */
      }
      return fmtRun(run)
    },
  })
}

// ── 视频工具 ─────────────────────────────────────────────────────────────

/** Register the `radar_video` model tool（导演三方向 → 分镜 → 本地成片）. */
function registerVideoTool(ctx) {
  ctx.tools.register({
    name: "radar_video",
    description:
      "Turn an existing finished article on the AI-Radar platform into a storyboard and render an MP4. " +
      "Input: { runId: string, direction?: { kind: 'fit'|'amplify'|'unexpected', name, language, accent, base, feel }, voice?: string, aspect?: '9:16'|'16:9', style?: 'motion'|'art' }. " +
      "First call /actions storyboard-directions to get three director proposals when the user hasn't chosen one. " +
      "The MP4 is shown to the USER in the UI card, never to you: the tool result returns only text (storyboard + progress + link). Do not echo video URLs or binary data.",
    async execute({ runId, direction, voice, aspect, style }) {
      if (!runId) throw new Error("runId 不能为空（先用 radar_article 或平台产出成稿）")
      // 1) 分镜（可携带选定方向）
      const { storyboard } = await api(`/api/runs/${runId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "storyboard", platform: "douyin", ...(direction ? { direction } : {}) }),
        timeout: 180_000,
      })
      // 2) 后台渲染（本地 motion 线，秒级到分钟级）
      await api(`/api/runs/${runId}/actions`, {
        method: "POST",
        body: JSON.stringify({ action: "render-video", storyboard, voice: voice ?? "xiaochen", aspect: aspect ?? "9:16", style: style ?? "motion" }),
        timeout: 60_000,
      })
      // 3) 等成片
      const deadline = Date.now() + 5 * 60_000
      while (Date.now() < deadline) {
        const { run } = await api(`/api/runs/${runId}`)
        const finals = (run.assets ?? []).filter((a) => a.role === "video-final")
        const latest = finals[finals.length - 1]
        const meta = latest ? safeJson(latest.meta, {}) : null
        if (meta?.stage === "done") {
          return [
            `《${storyboard.title}》成片完成`,
            `${storyboard.scenes.length} 分镜 · ${meta.seconds}s · ${meta.width}x${meta.height}`,
            `下载：${RADAR_BASE()}${latest.path}`,
            `分镜脚本：`, ...storyboard.scenes.map((s) => `  #${s.id} ${s.seconds}s「${s.subtitle}」${s.narration}`),
          ].join("\n")
        }
        if (meta?.stage === "error") throw new Error(`渲染失败：${meta.error}`)
        await new Promise((r) => setTimeout(r, POLL_MS))
      }
      return "渲染仍在后台进行（超出等待窗口）——成片完成后可在平台视频线查看"
    },
  })
}

// ── host loader entry ────────────────────────────────────────────────────

export function apply(ctx) {
  registerArticleTool(ctx)
  registerVideoTool(ctx)
  console.log("[dsh-plugin-radar] mounted: radar_article + radar_video →", RADAR_BASE())
}

export default apply
