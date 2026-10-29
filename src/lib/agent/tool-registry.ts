// ============================================================
// Tool Registry —— Agent 工具注册表（插件化，学 dsh 工具协议）
// 内置工具真实可调用；插件可通过 registerTool() 注入
// ============================================================

import { db } from "@/lib/db"
import { searchWithFallback } from "@/lib/gateway"
import { loadSkillBody } from "./skill-loader"

export interface AgentTool {
  name: string
  description: string
  builtin: boolean
  /** JSON Schema 的极简版：参数说明 */
  params: Record<string, string>
  run(input: Record<string, unknown>): Promise<unknown>
}

class ToolRegistry {
  private tools = new Map<string, AgentTool>()

  register(tool: AgentTool): void {
    this.tools.set(tool.name, tool)
  }

  unregister(name: string): boolean {
    return this.tools.delete(name)
  }

  list(): AgentTool[] {
    return [...this.tools.values()]
  }

  async execute(name: string, input: Record<string, unknown>): Promise<unknown> {
    const tool = this.tools.get(name)
    if (!tool) {
      throw new Error(
        `未识别的工具: "${name}"。已注册: ${[...this.tools.keys()].join(", ")}`,
      )
    }
    return tool.run(input)
  }
}

export const toolRegistry = new ToolRegistry()

// ---------- 内置工具 ----------

toolRegistry.register({
  name: "web_search",
  description: "联网检索（经模型网关降级链：元宝搜索 → 演示搜索）。返回标题/来源/日期/摘要。",
  builtin: true,
  params: { query: "检索词", count: "返回条数，默认 6" },
  async run(input) {
    const query = String(input.query ?? "")
    if (!query) throw new Error("web_search 需要 query 参数")
    const resp = await searchWithFallback({
      query,
      count: typeof input.count === "number" ? input.count : 6,
    })
    return { mode: resp.mode, provider: resp.provider, results: resp.results }
  },
})

toolRegistry.register({
  name: "read_skill",
  description: "读取一个已安装 Skill 的完整指令正文（SKILL.md body）",
  builtin: true,
  params: { skillId: "skill 目录名" },
  async run(input) {
    const id = String(input.skillId ?? "")
    const out = await loadSkillBody(id)
    if (!out) throw new Error(`skill "${id}" 不存在`)
    return out
  },
})

toolRegistry.register({
  name: "create_idea",
  description: "把一条选题写入选题池（ideas 表），可打分",
  builtin: true,
  params: { title: "选题标题", angle: "切入角度", score: "0-10 评分", topicId: "关联话题 id（可选）" },
  async run(input) {
    const title = String(input.title ?? "")
    if (!title) throw new Error("create_idea 需要 title 参数")
    return db.idea.create({
      data: {
        title: title.slice(0, 200),
        angle: String(input.angle ?? "").slice(0, 500),
        score: typeof input.score === "number" ? input.score : 0,
        topicId: input.topicId ? String(input.topicId) : null,
      },
    })
  },
})

toolRegistry.register({
  name: "add_inbox_item",
  description: "向收件箱写入一条结构化反馈（inbox 协议：run/report 的改进意见）",
  builtin: true,
  params: { targetType: "run | report", targetId: "目标 id", comment: "反馈内容" },
  async run(input) {
    const comment = String(input.comment ?? "")
    if (!comment) throw new Error("add_inbox_item 需要 comment 参数")
    return db.inboxItem.create({
      data: {
        targetType: String(input.targetType ?? "run"),
        targetId: String(input.targetId ?? ""),
        comment,
        runId: input.targetType === "run" && input.targetId ? String(input.targetId) : null,
      },
    })
  },
})

toolRegistry.register({
  name: "list_topics",
  description: "列出当前追踪的话题（雷达层）",
  builtin: true,
  params: {},
  async run() {
    return db.topic.findMany({ orderBy: { createdAt: "desc" }, take: 50 })
  },
})
