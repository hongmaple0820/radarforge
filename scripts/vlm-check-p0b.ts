import ZAI from "z-ai-web-dev-sdk"
import fs from "fs"

async function main() {
  const zai = await ZAI.create()
  for (const [file, ask] of [
    ["download/assets/p0-run-detail-9steps.png", "这是内容工作流平台的 Run 详情页（已滚动到步骤条区域）。请检查：1) 是否有一排九个小步骤卡（任务书/主张取证/大纲先行/分节初稿/跨家族审稿/原子断言/正文配图/封面/微信排版）？是否对齐、无重叠溢出？2) 下方或旁边是否有「大纲」卡片（小节列表+证据徽章）？3) 有无布局破损？简要回答。"],
    ["download/assets/p0-run-detail-mid.png", "这是同一详情页的中部截图。请检查：是否有「原子断言」或「claims 来源账本」「五维审稿」等卡片正常渲染？有无文字溢出或元素重叠？简要回答。"],
  ] as [string, string][]) {
    const b64 = fs.readFileSync(`/home/z/my-project/${file}`).toString("base64")
    const res = await zai.chat.completions.createVision({
      messages: [{ role: "user", content: [
        { type: "text", text: ask },
        { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
      ] }],
      thinking: { type: "disabled" },
    })
    console.log(`\n=== ${file.split("/").pop()} ===`)
    console.log(res.choices[0]?.message?.content?.slice(0, 500))
    await new Promise((r) => setTimeout(r, 3000))
  }
}
main().catch(e => console.error("ERR:", e.message))
