import ZAI from "z-ai-web-dev-sdk"
import fs from "fs"

const PAGES = process.argv.slice(2)
const QUESTIONS = [
  "这是 PDF 方案文档的某一页。请检查排版质量：1) 是否有文字溢出页面边缘或被截断？2) 表格是否列对齐、表头完整？3) 是否出现乱码、方块字（豆腐块）或 Markdown 符号（**、#、|---|）残留？4) 标题/正文层级是否清晰？用两三句话给出结论，若有问题请具体指出位置。",
]

async function main() {
  const zai = await ZAI.create()
  for (const p of PAGES) {
    const b64 = fs.readFileSync(p).toString("base64")
    const res = await zai.chat.completions.createVision({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: QUESTIONS[0] },
          { type: "image_url", image_url: { url: `data:image/jpeg;base64,${b64}` } },
        ],
      }],
      thinking: { type: "disabled" },
    })
    console.log(`=== ${p.split("/").pop()} ===`)
    console.log(res.choices[0]?.message?.content?.slice(0, 500))
  }
}
main().catch(e => { console.error("ERR:", e.message); process.exit(1) })
