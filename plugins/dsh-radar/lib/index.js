// ============================================================
// dsh-plugin-radar · host loader（服务端半）· v0.2.0 规范对齐版
//
// 对齐 @deepseek-ai/dsh-tools 官方 defineTool 契约（P1-1 四步补完）：
//   ① 工具定义：defineTool() + parameters（ParameterSchemaSpec 类型化
//      参数 schema，模型侧参数自动校验）+ output 必填声明（schema +
//      render，注册表强制校验输出规范 JSON）
//   ② 配置：Schemastery Config 导出 radarBase（配置层可改，环境变量
//      RADAR_BASE 作回落）——符合官方「两部署可能不同的值进 config」分层
//   ③ 诊断元数据：导出 name（加载失败可定位）
//   ④ 协作取消：execute(args, exec) 观测 exec.signal（官方约定：
//      每个异步工具都必须观测或转发该信号）
//
// timeoutMs 声明：radar_article 轮询上限 6 分钟 → 390s；radar_video
// 渲染等待上限 5 分钟 → 330s（超时是策略元数据，不是模型可见 schema）。
//
// 工具返回纯文本（成稿摘要 + 平台链接）；MP4/HTML 等富产物由
// client.js 在会话卡片里渲染，不回传给模型（学 agnes 插件的
// "result returns only plain text" 约定）。
// ============================================================

import { defineTool } from "@deepseek-ai/dsh-tools"
import Schema from "schemastery"

/** Plugin identity for cordis.yml rows / 加载失败诊断定位。 */
export const name = "dsh-plugin-radar"

/** Services required before mounting: tool registry（本插件只注册模型工具，
 *  不挂 web 路由——会话卡片 UI 走 package.json 的 dsh.client 声明）。 */
export const inject = ["tools"]

/** 配置声明（Schemastery）：dsh 设置层可改；环境变量 RADAR_BASE 作回落。 */
export const Config = Schema.object({
  radarBase: Schema.string().default("http://localhost:3000").description("AI 资讯雷达平台根地址（Next.js 应用部署处）"),
})

const POLL_MS = 5000
const ARTICLE_TIMEOUT_MS = 6 * 60_000
const VIDEO_TIMEOUT_MS = 5 * 60_000

/** 取消类错误统一翻译为人话（fetch 的 AbortError → 已取消说明） */
function rethrowFriendly(e) {
  const msg = String(e?.message ?? "")
  if (/aborted|abort/i.test(msg)) {
    throw new Error("已取消：操作中止（流水线若已创建仍在平台后台执行，可去平台页查看进度）")
  }
  throw e
}

/** 平台根地址：Config 解析值 > 环境变量 > 默认（Config default 已兜底） */
function radarBaseOf(config) {
  return process.env.RADAR_BASE || config?.radarBase || "http://localhost:3000"
}

async function api(base, path, init) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    signal: init?.signal ?? AbortSignal.timeout(init?.timeout ?? 30_000),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`radar HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

/** 等流水线跑完（queued/running → done/error）；协作取消：外部信号触发即停止轮询 */
async function waitForRun(base, runId, deadlineMs, signal) {
  const deadline = Date.now() + deadlineMs
  while (Date.now() < deadline) {
    if (signal?.aborted) throw new Error("已取消：流水线仍在平台后台执行，可去平台页查看进度")
    const { run } = await api(base, `/api/runs/${runId}`)
    if (run.status === "done") return run
    if (run.status === "error") throw new Error(`流水线失败：${(run.error || "").slice(0, 200)}`)
    await new Promise((r) => setTimeout(r, POLL_MS))
  }
  throw new Error(`流水线超时（${Math.round(deadlineMs / 1000)}s）——可去平台页查看进度`)
}

function fmtRun(base, run) {
  const steps = safeJson(run.steps, [])
  const arts = run.articles ?? []
  const md = arts.length > 0 ? arts[arts.length - 1].markdown : ""
  const lines = [
    `标题：${run.ideaTitle}`,
    `模式：${run.mode} · 状态：${run.status}`,
    `六步：${steps.map((s) => `${s.name}${s.status === "done" ? "✓" : s.status === "error" ? "✗" : "…"}`).join(" → ")}`,
    `成稿：${md.length} 字符（${arts.length} 个版本）`,
    `平台链接：${base}/?run=${run.id}`,
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

// ── host loader entry ────────────────────────────────────────────────────

export function apply(ctx, config) {
  const base = () => radarBaseOf(config)

  // ── 图文工具：radar_article（defineTool + 类型化参数 + output 声明） ──
  ctx.tools.register(
    defineTool({
      name: "radar_article",
      description:
        "Run the AI-Radar six-step article pipeline (brief → claims web-verified → persona draft → review → cover → WeChat layout). " +
        "Use it when the user asks to 写一篇公众号文章 / 出一篇稿子 / 跑一条图文流水线. " +
        "Returns the finished article (Markdown) plus a platform link; images/HTML stay in the UI card, not in the result.",
      parameters: {
        ideaTitle: { type: "string", required: true, description: "文章主题或选题标题（一句话说清写什么）" },
        ideaAngle: { type: "string", description: "切入角度 / 备注（可选）" },
        persona: { type: "string", description: "主笔人格（可选，如 犀利主笔 / 极客工程师）" },
        theme: { type: "string", description: "排版主题（可选，18 主题任选其一）" },
        exemplarId: { type: "string", description: "文风校准范文 id（可选，先用平台设置中心录范文）" },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: String(value) }],
      },
      timeoutMs: ARTICLE_TIMEOUT_MS + 30_000,
      async execute(args, exec) {
        try {
          const { id } = await api(base(), "/api/runs", {
            method: "POST",
            body: JSON.stringify(args),
            timeout: 60_000,
            signal: exec.signal,
          })
          const run = await waitForRun(base(), id, ARTICLE_TIMEOUT_MS, exec.signal)
          // 会话卡片（client.js 渲染）：进度 + 成稿入口
          try {
            ctx.get("attachments")?.push?.(JSON.stringify({ type: "radar-run", runId: id, base: base() }))
          } catch {
            /* 卡片挂载是尽力而为，不影响工具结果 */
          }
          return fmtRun(base(), run)
        } catch (e) {
          rethrowFriendly(e)
        }
      },
    })
  )

  // ── 视频工具：radar_video（导演三方向 → 分镜 → 本地成片） ──
  ctx.tools.register(
    defineTool({
      name: "radar_video",
      description:
        "Turn an existing finished article on the AI-Radar platform into a storyboard and render an MP4. " +
        "First ask the user to pick a direction (or call with no direction) when undecided. " +
        "The MP4 is shown to the USER in the UI card, never to you: the tool result returns only text. " +
        "Do not echo video URLs or binary data.",
      parameters: {
        runId: { type: "string", required: true, description: "成稿 run 的 id（先用 radar_article 或平台产出成稿）" },
        direction: {
          type: "object",
          additionalProperties: false,
          description: "选定方向（可选；不传则平台自动提案）",
          properties: {
            kind: { type: "string", description: "fit | amplify | unexpected" },
            name: { type: "string", description: "方向名" },
            language: { type: "string", description: "视觉语言描述" },
            accent: { type: "string", description: "强调点" },
            base: { type: "string", description: "基调" },
            feel: { type: "string", description: "情绪感受" },
          },
        },
        voice: { type: "string", description: "口播音色（可选，默认 xiaochen）" },
        aspect: { type: "string", description: "画幅 9:16 | 16:9（可选，默认 9:16）" },
        style: { type: "string", description: "本地渲染风格 motion | art（可选，默认 motion）" },
      },
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: String(value) }],
      },
      timeoutMs: VIDEO_TIMEOUT_MS + 30_000,
      async execute(args, exec) {
        try {
          // 1) 分镜（可携带选定方向）
          const { storyboard } = await api(base(), `/api/runs/${args.runId}/actions`, {
            method: "POST",
            body: JSON.stringify({ action: "storyboard", platform: "douyin", ...(args.direction ? { direction: args.direction } : {}) }),
            timeout: 180_000,
            signal: exec.signal,
          })
          // 2) 后台渲染（本地 motion 线，秒级到分钟级）
          await api(base(), `/api/runs/${args.runId}/actions`, {
            method: "POST",
            body: JSON.stringify({
              action: "render-video",
              storyboard,
              voice: args.voice ?? "xiaochen",
              aspect: args.aspect ?? "9:16",
              style: args.style ?? "motion",
            }),
            timeout: 60_000,
            signal: exec.signal,
          })
          // 3) 等成片（协作取消：外部信号触发即停止轮询）
          const deadline = Date.now() + VIDEO_TIMEOUT_MS
          while (Date.now() < deadline) {
            if (exec.signal?.aborted) throw new Error("已取消：渲染仍在平台后台执行，完成后可在平台视频线查看")
            const { run } = await api(base(), `/api/runs/${args.runId}`)
            const finals = (run.assets ?? []).filter((a) => a.role === "video-final")
            const latest = finals[finals.length - 1]
            const meta = latest ? safeJson(latest.meta, {}) : null
            if (meta?.stage === "done") {
              return [
                `《${storyboard.title}》成片完成`,
                `${storyboard.scenes.length} 分镜 · ${meta.seconds}s · ${meta.width}x${meta.height}`,
                `下载：${base()}${latest.path}`,
                `分镜脚本：`,
                ...storyboard.scenes.map((s) => `  #${s.id} ${s.seconds}s「${s.subtitle}」${s.narration}`),
              ].join("\n")
            }
            if (meta?.stage === "error") throw new Error(`渲染失败：${meta.error}`)
            await new Promise((r) => setTimeout(r, POLL_MS))
          }
          return "渲染仍在后台进行（超出等待窗口）——成片完成后可在平台视频线查看"
        } catch (e) {
          rethrowFriendly(e)
        }
      },
    })
  )

  console.log("[dsh-plugin-radar] mounted: radar_article + radar_video →", base())
}
// 注：不 export default——cordis unwrapExports 取 exports.default ?? exports，
// default 会把命名导出折叠成裸函数丢失 inject/Config（真实宿主实测教训）。
// 对象形态（命名导出 apply/name/inject/Config）与 agnes 参考插件一致。
