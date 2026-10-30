// y4-desadow.mjs —— 一次性：去掉 rest 基础帧脚下的地面投影（原地覆盖）
import ZAI from "z-ai-web-dev-sdk"
import { readFileSync, writeFileSync } from "fs"

const RAW = "scripts/y4-frames-raw"
const SIZE = "864x1152"

const zai = await ZAI.create()
const restUrl = `data:image/png;base64,${readFileSync(`${RAW}/rest.png`).toString("base64")}`
const prompt = "保持角色设计、配色、描边、画风与构图完全一致，只做一个改变：删除角色脚下的深色地面投影/阴影，让脚下区域变成纯白色背景（角色双脚直接站在纯白背景上），背景整体纯白无杂物"

for (let attempt = 1; attempt <= 3; attempt++) {
  try {
    const res = await zai.images.generations.edit({ prompt, images: [{ url: restUrl }], size: SIZE })
    const b64 = res?.data?.[0]?.base64
    if (!b64) throw new Error("空返回")
    const buf = Buffer.from(b64, "base64")
    writeFileSync(`${RAW}/rest.png`, buf)
    console.log(`✓ 投影已去除（${(buf.length / 1024).toFixed(0)}KB）`)
    process.exit(0)
  } catch (e) {
    console.error(`尝试 ${attempt} 失败：${String(e?.message ?? e).slice(0, 120)}`)
    await new Promise((r) => setTimeout(r, 3000))
  }
}
process.exit(1)
