// ============================================================
// /api/settings/test —— 设置中心「测试连通」
// 按 scope 执行真实最小调用（非 404 探测）：
//   search: SearchPro 最小查询一条
//   llm:    按 settings.llm.mode 分派（builtin/custom/agnes/pi-ai）真实 chat 一条
//   image:  真实生图一张（测完清理产物）
//   agnes:  accountId → probeAccount 单账号 /models 探活；无 id → 池 health
//   video:  local → ffmpeg 可用性；agnes/auto → agnes-video health
// 统一返回 { ok, latencyMs, detail?, error? }
// ============================================================

import { NextResponse } from "next/server"
import { execFile } from "child_process"
import { unlink } from "fs/promises"
import { promisify } from "util"
import { getSettings, type AgnesAccount } from "@/lib/settings"
import { chat } from "@/lib/gateway"
import { yuanbaoSearch } from "@/lib/gateway/providers/yuanbao-search"
import { generateCoverImage } from "@/lib/gateway/providers/zai-image"
import { agnesVideo } from "@/lib/gateway/providers/agnes/agnes-video"
import { agnesLlm } from "@/lib/gateway/providers/agnes/agnes-llm"
import { probeAccount } from "@/lib/gateway/providers/agnes/pool"
import type { HealthReport } from "@/lib/gateway/types"

const execFileP = promisify(execFile)

type Scope = "llm" | "search" | "image" | "agnes" | "video"

interface TestResult {
  ok: boolean
  latencyMs: number
  detail?: string
  error?: string
}

function fromHealth(r: HealthReport): TestResult {
  return {
    ok: r.status === "healthy",
    latencyMs: r.latencyMs ?? 0,
    detail: r.detail,
    error: r.error,
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { scope?: Scope; accountId?: string }
    const scope = body.scope
    if (!scope || !["llm", "search", "image", "agnes", "video"].includes(scope)) {
      return NextResponse.json({ ok: false, error: "scope 必须是 llm/search/image/agnes/video" }, { status: 400 })
    }
    const s = await getSettings(true)
    let result: TestResult

    if (scope === "search") {
      if (!s.search.apiKey && !process.env.WSA_API_KEY) {
        result = { ok: false, latencyMs: 0, error: "搜索密钥未配置（设置中心或环境变量 WSA_API_KEY）" }
      } else {
        const t0 = Date.now()
        try {
          const hits = await yuanbaoSearch.search({ query: "AI", count: 10 })
          result = { ok: hits.length > 0, latencyMs: Date.now() - t0, detail: `真实检索返回 ${hits.length} 条` }
        } catch (e) {
          result = { ok: false, latencyMs: Date.now() - t0, error: (e as Error).message.slice(0, 140) }
        }
      }
    } else if (scope === "llm") {
      const t0 = Date.now()
      try {
        const out = await chat([{ role: "user", content: "连通测试：请只回复两个字「正常」" }], { temperature: 0 })
        result = { ok: Boolean(out && out.trim()), latencyMs: Date.now() - t0, detail: `真实回复：${out.trim().slice(0, 30)}` }
      } catch (e) {
        result = { ok: false, latencyMs: Date.now() - t0, error: (e as Error).message.slice(0, 140) }
      }
    } else if (scope === "image") {
      const t0 = Date.now()
      const testId = `conntest-${Date.now()}`
      try {
        const img = await generateCoverImage("连通测试：深蓝色科技感纯色背景", testId)
        if (img.ok) {
          await unlink(img.absPath).catch(() => {}) // 测试产物即测即删
          result = { ok: true, latencyMs: Date.now() - t0, detail: `真实出图 ${(img.sizeBytes / 1024).toFixed(0)}KB` }
        } else {
          result = { ok: false, latencyMs: Date.now() - t0, error: (img.error ?? "生图失败").slice(0, 140) }
        }
      } catch (e) {
        result = { ok: false, latencyMs: Date.now() - t0, error: (e as Error).message.slice(0, 140) }
      }
    } else if (scope === "agnes") {
      if (body.accountId) {
        const acc: AgnesAccount | undefined = s.agnes.accounts.find((a) => a.id === body.accountId)
        if (!acc) result = { ok: false, latencyMs: 0, error: "账号不存在（可能已删除，请刷新）" }
        else if (!acc.apiKey) result = { ok: false, latencyMs: 0, error: "该账号密钥为空" }
        else {
          const p = await probeAccount(acc)
          result = { ok: p.ok, latencyMs: p.latencyMs, detail: p.detail, error: p.ok ? undefined : p.detail }
        }
      } else {
        // 全池探活：可用账号 = 已启用 + 已填密钥
        const usable = s.agnes.accounts.filter((a) => a.enabled && a.apiKey)
        if (usable.length === 0) {
          const total = s.agnes.accounts.length
          result = {
            ok: false,
            latencyMs: 0,
            error:
              total === 0
                ? "账号池为空——先「+添加账号」填密钥，点「保存账号池」，再「启用 Agnes 池」"
                : `${total} 个账号均不可用（需已启用且已填密钥）——检查账号行开关与密钥后重试`,
          }
        } else if (!s.agnes.enabled) {
          // 池开关未开也逐号探活：让用户在启用前就能验证密钥有效性
          const t0 = Date.now()
          const probes = await Promise.all(usable.map((a) => probeAccount(a)))
          const okCount = probes.filter((p) => p.ok).length
          const firstFail = probes.find((p) => !p.ok)?.detail ?? ""
          result = {
            ok: okCount > 0,
            latencyMs: Date.now() - t0,
            detail: `${okCount}/${usable.length} 个账号密钥有效——池开关未开，点「启用 Agnes 池」后三通道生效`,
            error: okCount > 0 ? undefined : `全部账号探活失败（0/${usable.length}）：${firstFail}`.slice(0, 140),
          }
        } else {
          const h = await agnesLlm.health?.()
          result = h ? fromHealth(h) : { ok: true, latencyMs: 0, detail: "Provider 无健康检查，视为可用" }
        }
      }
    } else {
      // video
      if (s.video.channel === "local") {
        const t0 = Date.now()
        try {
          const { stdout } = await execFileP("ffmpeg", ["-version"])
          result = { ok: true, latencyMs: Date.now() - t0, detail: `本地渲染可用：${stdout.split("\n")[0].slice(0, 40)}` }
        } catch (e) {
          result = { ok: false, latencyMs: Date.now() - t0, error: `ffmpeg 不可用：${(e as Error).message.slice(0, 80)}` }
        }
      } else {
        const h = await agnesVideo.health?.()
        result = h ? fromHealth(h) : { ok: true, latencyMs: 0, detail: "Provider 无健康检查，视为可用" }
      }
    }

    return NextResponse.json(result)
  } catch (e) {
    return NextResponse.json({ ok: false, latencyMs: 0, error: (e as Error).message.slice(0, 140) }, { status: 200 })
  }
}
