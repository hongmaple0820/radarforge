// ============================================================
// dsh-plugin-radar · client（浏览器半）
// 会话内卡片：radar_article / radar_video 的富产物（进度、成稿 HTML
// 预览、MP4 播放器）在这里渲染；模型只拿到纯文本结果。
// 形态学自 dsh-agnes-multimodal（MIT）。
// ============================================================

import React from "react"

/** 工具结果里携带的 radar-run 附件渲染为进度卡 + 成稿入口 */
export function RadarRunCard({ data }) {
  const [run, setRun] = React.useState(null)
  const base = data.base || "http://localhost:3000"

  React.useEffect(() => {
    let stop = false
    const tick = async () => {
      try {
        const res = await fetch(`${base}/api/runs/${data.runId}`)
        const json = await res.json()
        if (!stop) setRun(json.run)
      } catch {
        /* 平台不可达时保留链接入口 */
      }
    }
    void tick()
    const t = setInterval(() => {
      if (run && (run.status === "done" || run.status === "error")) return
      void tick()
    }, 5000)
    return () => {
      stop = true
      clearInterval(t)
    }
  }, [data.runId, base])

  if (!run) {
    return React.createElement("div", { className: "radar-card" }, `AI 资讯雷达：连接 ${base} …`)
  }
  const steps = (() => {
    try {
      return JSON.parse(run.steps || "[]")
    } catch {
      return []
    }
  })()
  const articles = run.articles ?? []
  return React.createElement(
    "div",
    { className: "radar-card", style: { border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, fontSize: 13 } },
    React.createElement("div", { style: { fontWeight: 600, marginBottom: 6 } }, "📝 AI 资讯雷达 · 六步流水线"),
    React.createElement(
      "div",
      { style: { color: "#64748b", marginBottom: 6 } },
      steps.map((s) => `${s.name} ${s.status === "done" ? "✓" : s.status === "running" ? "⟳" : s.status === "error" ? "✗" : "·"}`).join("  "),
    ),
    React.createElement(
      "a",
      { href: `${base}/?run=${run.id}`, target: "_blank", rel: "noreferrer" },
      `打开平台详情（${run.status}${articles.length ? ` · ${articles.length} 稿` : ""}）`,
    ),
  )
}

/** 视频成片卡（radar_video done 后）：MP4 播放器 + 下载 */
export function RadarVideoCard({ data }) {
  const base = data.base || "http://localhost:3000"
  return React.createElement(
    "div",
    { style: { marginTop: 8 } },
    React.createElement("video", {
      controls: true,
      preload: "metadata",
      src: `${base}${data.path}`,
      style: { width: "100%", maxWidth: 360, borderRadius: 8, background: "#000" },
    }),
    React.createElement(
      "a",
      { href: `${base}${data.path}`, download: true, style: { display: "inline-block", marginTop: 4, fontSize: 12 } },
      "⬇ 下载 MP4",
    ),
  )
}

/** dsh client 注入入口：识别 radar 附件并挂卡片 */
export function install(renderer) {
  renderer.registerAttachment?.("radar-run", (data) => React.createElement(RadarRunCard, { data }))
  renderer.registerAttachment?.("radar-video", (data) => React.createElement(RadarVideoCard, { data }))
}
