import ZAI from "z-ai-web-dev-sdk"
import fs from "fs"

// P0 UI 视觉终检：九步骤条 + 大纲卡 + 直出方向卡 三张关键截图
const TARGETS = [
  {
    file: "download/assets/p0-run-detail-m01.png",
    ask: "这是一个内容工作流平台的 Run 详情页截图。请检查：1) 顶部是否有一排小步骤卡（应有九个：任务书/主张取证/大纲先行/分节初稿/跨家族审稿/原子断言/正文配图/封面/微信排版），是否对齐无重叠？2) 左列是否有「大纲」卡片（含小节编号与证据编号徽章）与「五维审稿」卡片？3) 是否有明显布局破损、文字溢出或元素重叠？简要回答。",
  },
  {
    file: "download/assets/p0-direct-directions.png",
    ask: "这是视频创作工作台截图。请检查：1) 是否显示「选题直出」模式的输入区与进度（research/directions 步骤徽章）？2) 是否有三张「导演三方向」卡片（A·Fit/B·Amplify/C·Unexpected 徽章与色带）？3) 是否有明显布局破损或文字溢出？简要回答。",
  },
]

async function main() {
  const zai = await ZAI.create()
  for (const t of TARGETS) {
    const b64 = fs.readFileSync(`/home/z/my-project/${t.file}`).toString("base64")
    const res = await zai.chat.completions.createVision({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: t.ask },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      }],
      thinking: { type: "disabled" },
    })
    console.log(`\n=== ${t.file.split("/").pop()} ===`)
    console.log(res.choices[0]?.message?.content?.slice(0, 600))
    await new Promise((r) => setTimeout(r, 3000))
  }
}
main().catch(e => console.error("ERR:", e.message))
