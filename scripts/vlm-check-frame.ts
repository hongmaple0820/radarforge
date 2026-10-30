// vlm-check-frame.ts —— 用 VLM 检查 y4 帧库原始图质量（白底/全身/无阴影/姿势正确）
// 用法：bun scripts/vlm-check-frame.ts <raw-dir> [names...]
import ZAI from "z-ai-web-dev-sdk"
import fs from "fs"
import path from "path"

const RAW = process.argv[2] ?? "scripts/y4-frames-raw"
const names = process.argv.slice(3)
const files = names.length ? names.map((n) => `${n}.png`) : fs.readdirSync(RAW).filter((f) => f.endsWith(".png"))

const zai = await ZAI.create()
for (const f of files) {
  const p = path.join(RAW, f)
  if (!fs.existsSync(p)) { console.log(`${f}: 不存在`); continue }
  const b64 = fs.readFileSync(p).toString("base64")
  try {
    const res = await zai.chat.completions.createVision({
      messages: [{
        role: "user",
        content: [
          { type: "text", text: "检查这张卡通角色帧图，逐项回答（每项一行，是/否+一句说明）：1) 背景是否为纯白且无杂物？2) 是否有地面阴影或投影？3) 角色是否全身完整可见（头到脚，无裁切）？4) 角色是否大致居中且脚靠近画面底部？5) 角色是什么（一句话描述外观+姿势+嘴部状态）？" },
          { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
        ],
      }],
      thinking: { type: "disabled" },
    })
    console.log(`===== ${f} =====`)
    console.log(res.choices[0]?.message?.content?.trim())
  } catch (e) {
    console.log(`===== ${f} ===== VLM 失败：${(e as Error & { message?: string })?.message ?? e}`)
  }
}
