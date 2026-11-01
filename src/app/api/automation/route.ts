import { NextResponse } from "next/server"
import {
  getAutomationState,
  saveAutomationConfig,
  runAutomationTask,
  tickAutomation,
  getAutomationLog,
  AUTOMATION_LOG_KEY,
  type AutomationConfig,
  type AutomationTaskId,
} from "@/lib/automation"
import { db } from "@/lib/db"

export const dynamic = "force-dynamic"

// ---------- GET：配置 + 日志 + 到期状态 ----------
export async function GET() {
  const state = await getAutomationState()
  return NextResponse.json(state)
}

// ---------- POST：save（存配置）/ run（立即执行）/ tick（补跑到期）/ clearLog ----------
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      action?: string
      config?: Partial<AutomationConfig>
      task?: AutomationTaskId
    }
    const action = body.action ?? ""

    if (action === "save") {
      const config = await saveAutomationConfig(body.config ?? {})
      const state = await getAutomationState()
      return NextResponse.json({ config, due: state.due, message: "自动化配置已保存" })
    }

    if (action === "run") {
      const task = body.task
      if (!task || !["morningReport", "rssRefresh", "ideaRefresh"].includes(task)) {
        return NextResponse.json({ error: "task 必须是 morningReport | rssRefresh | ideaRefresh" }, { status: 400 })
      }
      const { config } = await getAutomationState()
      const result = await runAutomationTask(task, config)
      return NextResponse.json({ result, log: await getAutomationLog() })
    }

    if (action === "tick") {
      const out = await tickAutomation()
      if (out.ran.length === 0) return NextResponse.json({ ran: [], message: "无到期任务" })
      return NextResponse.json({ ran: out.ran, results: out.results, log: await getAutomationLog() })
    }

    if (action === "clearLog") {
      await db.settingKV.deleteMany({ where: { key: AUTOMATION_LOG_KEY } })
      return NextResponse.json({ ok: true, message: "运行日志已清空" })
    }

    return NextResponse.json({ error: `未知 action：${action}（可选 save / run / tick / clearLog）` }, { status: 400 })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}
