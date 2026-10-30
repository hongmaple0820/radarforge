import ZAI from "z-ai-web-dev-sdk"
import fs from "fs"
const [file, q] = process.argv.slice(2)
const zai = await ZAI.create()
const b64 = fs.readFileSync(file).toString("base64")
const res = await zai.chat.completions.createVision({
  messages: [{ role: "user", content: [{ type: "text", text: q }, { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }] }],
  thinking: { type: "disabled" },
})
console.log(res.choices[0]?.message?.content?.trim().slice(0, 500))
