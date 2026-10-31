import fs from "fs"
import ZAI from "z-ai-web-dev-sdk"

const zai = await ZAI.create()
for (const [i, desc] of [["1", "Swiss 瑞士网格金句卡（红色竖条+浅色底，引文与署名）"], ["2", "Editorial 杂志数据卡（衬线大数字指标）"], ["3", "Swiss 数据卡（网格分栏大数字）"]].entries()) {
  const b64 = fs.readFileSync(`/home/z/my-project/scripts/probe-card-${desc[0]}.png`).toString("base64")
  const res = await zai.chat.completions.createVision({
    model: "glm-4.5v",
    messages: [{
      role: "user",
      content: [
        { type: "text", text: `这是${desc[1]}。检查：1) 文字是否完整清晰无溢出无截断；2) 布局是否美观无破损无错位；3) 数字/引文是否可读。只输出 JSON：{"pass":true|false,"issues":["原因"],"readable":"读到的主文案前12字"}` },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ],
    }],
    thinking: { type: "disabled" },
  })
  console.log(`[card-${desc[0]}]`, String(res.choices?.[0]?.message?.content ?? "").slice(0, 200))
}
