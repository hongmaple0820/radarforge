// ============================================================
// platform-tools —— RadarForge 作为 MCP server 的平台工具集（P2-3）
// 双向 MCP 的服务端半边：把平台核心能力以标准 MCP 工具对外开放，
// 任何 MCP 客户端（Cursor / Claude Desktop / VS Code / dsh）配一份
// mcpServers JSON 即可调用。学 dsh 插件形态的取舍（q7 方案 5.4）：
// 纯文本回传的工具走 MCP 通道（一次实现处处可用）；富产物（成片
// 播放卡）留在 dsh 插件侧。
//
// 工具面（读多写少、单用户本地服务的最小闭环）：
//   radar_ping          —— 连通性自检
//   radar_list_topics   —— 追踪话题清单
//   radar_create_idea   —— 写入选题池
//   radar_start_article —— 启动图文九步流水线（返回 runId 轮询）
//   radar_run_status    —— Run 状态与步骤摘要
//   radar_run_output    —— 取成稿 Markdown（done 后）
//   radar_list_skills   —— 已安装技能清单（候选池）
//   radar_search        —— 联网检索（经网关降级链）
// ============================================================

import { db } from "@/lib/db"
import { createArticleRun, executeArticleRunInBackground } from "@/lib/runtime/run-manager"
import { PERSONAS } from "@/lib/runtime/skills/radar-write"
import { themeList, resolveThemeId } from "@/lib/runtime/render"
import { searchWithFallback } from "@/lib/gateway"
import { loadSkills } from "@/lib/skills/loader"

export interface PlatformTool {
  name: string
  description: string
  inputSchema: {
    type: "object"
    properties: Record<string, { type: string; description: string }>
    required?: string[]
  }
  handler: (args: Record<string, unknown>) => Promise<unknown>
}

const str = (v: unknown, max = 500): string => (typeof v === "string" ? v.trim().slice(0, max) : "")

export const PLATFORM_TOOLS: PlatformTool[] = [
  {
    name: "radar_ping",
    description: "连通性自检：返回服务器标识与时间戳（MCP 接入冒烟用）",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      return { ok: true, server: "radarforge", time: new Date().toISOString() }
    },
  },
  {
    name: "radar_list_topics",
    description: "列出平台的追踪话题（雷达层）：名称、关键词、激活态与选题数",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const topics = await db.topic.findMany({
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { _count: { select: { ideas: true } } },
      })
      return {
        total: topics.length,
        topics: topics.map((t) => ({ id: t.id, name: t.name, keywords: t.keywords, active: t.active, ideaCount: t._count.ideas })),
      }
    },
  },
  {
    name: "radar_create_idea",
    description: "把一条选题写入选题池（可选打分与切入角度）。写完后可用 radar_start_article 直接启动流水线。",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "选题标题（必填，≤200 字）" },
        angle: { type: "string", description: "切入角度（可选）" },
        score: { type: "number", description: "选题评分 0-10（可选，默认 0）" },
      },
      required: ["title"],
    },
    async handler(args) {
      const title = str(args.title, 200)
      if (!title) throw new Error("title 不能为空")
      const score = typeof args.score === "number" ? Math.max(0, Math.min(10, args.score)) : 0
      const idea = await db.idea.create({ data: { title, angle: str(args.angle), score, source: "manual" } })
      return { ok: true, ideaId: idea.id, title, angle: idea.angle, score }
    },
  },
  {
    name: "radar_start_article",
    description:
      "启动图文九步流水线（brief → claims 取证 → 大纲 → 分节初稿 → 跨家族审稿 → 原子断言 → 配图 → 封面 → 排版）。异步执行：立即返回 runId，用 radar_run_status 轮询、radar_run_output 取成稿。",
    inputSchema: {
      type: "object",
      properties: {
        ideaTitle: { type: "string", description: "选题标题（必填）" },
        ideaAngle: { type: "string", description: "切入角度（可选）" },
        persona: { type: "string", description: "写作人格 id（可选；默认 cold-analyst）" },
        theme: { type: "string", description: "排版主题 id（可选；默认 radar）" },
        ideaId: { type: "string", description: "选题池条目 id（可选；传入则回填关联）" },
      },
      required: ["ideaTitle"],
    },
    async handler(args) {
      const ideaTitle = str(args.ideaTitle, 200)
      if (!ideaTitle) throw new Error("ideaTitle 不能为空")
      const persona = str(args.persona, 60)
      if (persona && !PERSONAS.some((p) => p.id === persona)) {
        throw new Error(`未知人格 "${persona}"；可选：${PERSONAS.map((p) => p.id).join(", ")}`)
      }
      const theme = resolveThemeId(str(args.theme, 40))
      const runId = await createArticleRun({
        ideaTitle,
        ideaAngle: str(args.ideaAngle),
        persona: persona || undefined,
        theme,
        ideaId: str(args.ideaId, 60) || undefined,
      })
      executeArticleRunInBackground(runId)
      return {
        ok: true,
        runId,
        hint: "流水线后台执行中（图文九步，通常 1-5 分钟）；用 radar_run_status 查询进度、radar_run_output 取成稿",
        personas: PERSONAS.map((p) => ({ id: p.id, label: p.label })),
        themes: themeList().map((t) => ({ id: t.id, label: t.label })),
      }
    },
  },
  {
    name: "radar_run_status",
    description: "查询图文流水线 Run 的状态：九步进度摘要、模式（REAL/DEMO）与错误留痕",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string", description: "radar_start_article 返回的 runId" } },
      required: ["runId"],
    },
    async handler(args) {
      const runId = str(args.runId, 60)
      const run = await db.agentRun.findUnique({ where: { id: runId } })
      if (!run) throw new Error(`run "${runId}" 不存在`)
      let steps: { name: string; status: string; detail: string; latencyMs: number }[] = []
      try {
        steps = JSON.parse(run.steps)
      } catch {
        steps = []
      }
      return {
        runId,
        status: run.status,
        mode: run.mode,
        ideaTitle: run.ideaTitle,
        persona: run.persona,
        theme: run.theme,
        steps: steps.map((s) => ({ name: s.name, status: s.status, detail: s.detail, latencyMs: s.latencyMs })),
        error: run.error || undefined,
        finishedAt: run.finishedAt?.toISOString() ?? undefined,
      }
    },
  },
  {
    name: "radar_run_output",
    description: "取已完成的图文流水线成稿 Markdown（status=done 时可取；含 [n] 引用标注）",
    inputSchema: {
      type: "object",
      properties: { runId: { type: "string", description: "run id" } },
      required: ["runId"],
    },
    async handler(args) {
      const runId = str(args.runId, 60)
      const run = await db.agentRun.findUnique({ where: { id: runId } })
      if (!run) throw new Error(`run "${runId}" 不存在`)
      if (run.status !== "done") {
        throw new Error(`run 状态为 ${run.status}（成稿在 done 后可取）；先轮询 radar_run_status`)
      }
      return { runId, ideaTitle: run.ideaTitle, wordCount: run.output.length, markdown: run.output }
    },
  },
  {
    name: "radar_list_skills",
    description: "列出 Agent 候选池中的已安装技能（Agent Skills 开放标准；产品库 + 用户自装位，停用项不在池）",
    inputSchema: { type: "object", properties: {} },
    async handler() {
      const skills = await loadSkills()
      const pool = skills.filter((s) => !s.disabled)
      return {
        total: pool.length,
        skills: pool.map((s) => ({ id: s.id, name: s.name, description: s.description.slice(0, 200), source: s.source, compliant: s.compliance.ok })),
      }
    },
  },
  {
    name: "radar_search",
    description: "联网检索（经平台网关降级链：元宝搜索 → 演示搜索）。返回标题/来源/日期/摘要。",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "检索词（必填）" },
        count: { type: "number", description: "返回条数（可选，默认 6，上限 10）" },
      },
      required: ["query"],
    },
    async handler(args) {
      const query = str(args.query, 200)
      if (!query) throw new Error("query 不能为空")
      const count = typeof args.count === "number" ? Math.max(1, Math.min(10, Math.floor(args.count))) : 6
      const resp = await searchWithFallback({ query, count })
      return {
        mode: resp.mode,
        provider: resp.provider,
        results: resp.results.map((r) => ({ title: r.title, url: r.url, site: r.site, date: r.date, summary: r.passage?.slice(0, 200) })),
      }
    },
  },
]

export function findPlatformTool(name: string): PlatformTool | undefined {
  return PLATFORM_TOOLS.find((t) => t.name === name)
}
