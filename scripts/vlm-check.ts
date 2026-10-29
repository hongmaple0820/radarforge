import ZAI from "z-ai-web-dev-sdk"
import fs from "fs"

async function main() {
  const zai = await ZAI.create()
  const b64 = fs.readFileSync("/home/z/my-project/download/assets/phase2b-layout-preview.png").toString("base64")
  const res = await zai.chat.completions.createVision({
    messages: [{
      role: "user",
      content: [
        { type: "text", text: "这是一个 Next.js 应用截图。请检查：1) 是否渲染出带样式的文章排版预览卡片（含标题、正文、参考来源区）？2) 六步流水线进度是否显示为完成状态？3) 是否有明显布局破损？简要回答。" },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ],
    }],
    thinking: { type: "disabled" },
  })
  console.log(res.choices[0]?.message?.content)
}
main().catch(e => console.error("ERR:", e.message))
