// VLM 质检闭环探针：对刚渲染的版式卡跑一次 vlmCheckImage（layout 判定）
import { renderCardToAsset } from "../src/lib/runtime/card-engine.ts"
import { vlmCheckImage } from "../src/lib/gateway/vlm.ts"

const card = {
  template: "data", family: "swiss", eyebrow: "DATA BRIEFING",
  title: "开源模型三个月三分天下", subtitle: "许可证宽松度决定生态位",
  metrics: [
    { value: "87.4%", label: "企业采用率" },
    { value: "3.2×", label: "推理成本降幅" },
    { value: "¥2.1亿", label: "单季融资" },
  ],
  footer: "AI NEWS RADAR", caption: "数据卡 VLM 探针",
}
const out = await renderCardToAsset(card, { runId: "vlmprobe", slug: "vlm-data-card", size: { width: 1024, height: 1024 } })
console.log("渲染:", out.filePath, `${(out.sizeBytes / 1024).toFixed(0)}KB`)

const r = await vlmCheckImage({ absPath: out.absPath, concept: "data|开源模型三个月三分天下", caption: "数据卡 VLM 探针", kind: "layout" })
console.log("VLM 判定:", JSON.stringify(r, null, 2))
process.exit(r.done ? 0 : 1)
