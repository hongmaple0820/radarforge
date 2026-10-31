// 探针：① 版式卡三模板 × 两版系渲染 ② VLM 读回复核（glm-4.5v 显式模型名验证）
import fs from "fs"
import { renderCardImage } from "/home/z/my-project/src/lib/runtime/card-engine"
import ZAI from "z-ai-web-dev-sdk"

const plans: Parameters<typeof renderCardImage>[0][] = [
  { template: "cover", family: "editorial", eyebrow: "AI 资讯雷达", title: "具身智能融资观察", subtitle: "三条主线与一个共识拐点", footer: "AI 资讯雷达 · 第 44 期" },
  { template: "quote", family: "swiss", quote: "所有伟大的工具，都在教用户变懒的路上狂奔。", attribution: "—— 某产品哲学家", eyebrow: "本周金句" },
  { template: "data", family: "editorial", title: "本周 AI 大事速览", eyebrow: "数据速递", metrics: [{ value: "87.4%", label: "企业采用率" }, { value: "$2.1亿", label: "最大单笔融资" }, { value: "3.2×", label: "推理成本降幅" }] },
  { template: "data", family: "swiss", title: "模型军备竞赛", eyebrow: "DATA BRIEFING", metrics: [{ value: "18", label: "开源新模型" }, { value: "4", label: "十亿级融资" }] },
]

for (const [i, p] of plans.entries()) {
  const buf = await renderCardImage(p, { width: 1024, height: 1024 })
  const f = `/home/z/my-project/scripts/probe-card-${i}.png`
  fs.writeFileSync(f, buf)
  console.log(`[card] ${p.template} ${p.family} → ${(buf.length / 1024).toFixed(0)}KB`)
}

// VLM 读回复核（第 0 张封面卡：应能读出主标题文字）
const zai = await ZAI.create()
const b64 = fs.readFileSync("/home/z/my-project/scripts/probe-card-0.png").toString("base64")
const res = await zai.chat.completions.createVision({
  model: "glm-4.5v",
  messages: [
    {
      role: "user",
      content: [
        { type: "text", text: '这张图上有没有可读的中文文字？只回答 JSON：{"has_text":true|false,"title_prefix":"图上主标题的前6个字"}' },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ],
    },
  ],
  thinking: { type: "disabled" },
})
console.log("[vlm glm-4.5v] →", String(res.choices?.[0]?.message?.content ?? "").slice(0, 160))
