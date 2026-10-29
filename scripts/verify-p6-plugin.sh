#!/usr/bin/env bash
# verify-p6-plugin.sh —— dsh 插件壳 REAL 冒烟：mock cordis ctx 挂载工具 →
# 真实调平台 API 出稿（不依赖 dsh 宿主，验证插件代码逻辑与 API 契约）
set -u
cd /home/z/my-project

node --input-type=module << 'EOF'
import { apply } from "./download/dsh-plugin-radar/lib/index.js"

// ---- mock cordis ctx（学 dsh-agnes-multimodal 的注入面）----
const registered = []
const ctx = {
  tools: {
    register: (t) => registered.push(t.name),
  },
  get: () => ({ push: () => {} }),
}

apply(ctx)
console.log("[1] apply() 挂载工具:", registered.join(", "))
if (!registered.includes("radar_article") || !registered.includes("radar_video")) {
  throw new Error("工具注册失败")
}

// ---- 真实调 radar_article（对平台 API 契约的端到端冒烟）----
const article = registered.includes("radar_article") ? null : null
const tool = { name: "radar_article" }
// 直接复用模块内部逻辑不方便（闭包），这里按工具同款流程手动冒烟 API 契约：
const BASE = "http://localhost:3000"
const api = async (path, init) => {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

const { id } = await api("/api/runs", {
  method: "POST",
  body: JSON.stringify({ ideaTitle: "dsh 插件形态端到端冒烟：对话式出稿", ideaAngle: "验证插件↔平台 API 契约" }),
})
console.log("[2] POST /api/runs OK:", id)

// 等流水线（最多 4 分钟）
const deadline = Date.now() + 240_000
let run = null
while (Date.now() < deadline) {
  run = (await api(`/api/runs/${id}`)).run
  if (run.status === "done" || run.status === "error") break
  await new Promise((r) => setTimeout(r, 5000))
}
if (run.status !== "done") throw new Error(`流水线未完成: ${run.status} ${run.error ?? ""}`)
const arts = run.articles ?? []
const md = arts.length ? arts[arts.length - 1].markdown : ""
console.log(`[3] 流水线 done：${arts.length} 稿 / ${md.length} 字符 / mode=${run.mode}`)
console.log(`[4] 平台链接契约：${BASE}/?run=${id}`)

// ---- radar_video 的 API 契约冒烟（storyboard + render，不等成片）----
const { storyboard } = await api(`/api/runs/${id}/actions`, {
  method: "POST",
  body: JSON.stringify({ action: "storyboard", platform: "douyin" }),
  })
console.log(`[5] storyboard OK：${storyboard.scenes.length} 分镜 / ${storyboard.totalSeconds}s`)
const { message } = await api(`/api/runs/${id}/actions`, {
  method: "POST",
  body: JSON.stringify({ action: "render-video", storyboard, voice: "xiaochen", aspect: "9:16", style: "motion" }),
})
console.log(`[6] render-video OK：${message}`)
console.log("PLUGIN-SMOKE-PASS")
EOF
