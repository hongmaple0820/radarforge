// 探测脚本：验证 SVG→PNG（sharp）+ TTS（SDK）+ ffmpeg 合成链路
import sharp from "sharp"
import fs from "fs/promises"

const OUT = "/home/z/my-project/scripts/probe-out"
await fs.mkdir(OUT, { recursive: true })

// 1) sharp 栅格化带中文的 SVG（三档字重）
const svg = (weight) => `<svg xmlns="http://www.w3.org/2000/svg" width="720" height="1280">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f172a"/><stop offset="1" stop-color="#334155"/>
    </linearGradient>
  </defs>
  <rect width="720" height="1280" fill="url(#bg)"/>
  <rect x="40" y="500" width="640" height="180" rx="24" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.25)" stroke-width="2"/>
  <text x="360" y="590" font-family="Noto Sans SC" font-weight="${weight}" font-size="56" fill="#f8fafc" text-anchor="middle">AI 资讯雷达 2.0</text>
  <text x="360" y="650" font-family="Noto Sans SC" font-weight="400" font-size="28" fill="#94a3b8" text-anchor="middle">证据驱动的创作工作台</text>
  <text x="360" y="1200" font-family="Sarasa Mono SC" font-size="22" fill="#64748b" text-anchor="middle">SCENE 01 / 08</text>
</svg>`
for (const w of [400, 700, 900]) {
  const png = await sharp(Buffer.from(svg(w))).png().toBuffer()
  await fs.writeFile(`${OUT}/w${w}.png`, png)
  console.log(`sharp weight=${w} OK ${png.length}B`)
}

// 2) TTS（SDK）
const { default: ZAI } = await import("z-ai-web-dev-sdk")
const zai = await ZAI.create()
const t0 = Date.now()
const res = await zai.audio.tts.create({
  input: "这里是口播测试：AI 资讯雷达，证据先行。三大模型升级，价格战开打。",
  voice: "xiaochen",
  speed: 1.0,
  response_format: "wav",
  stream: false,
})
const buf = Buffer.from(new Uint8Array(await res.arrayBuffer()))
await fs.writeFile(`${OUT}/tts.wav`, buf)
console.log(`TTS OK ${buf.length}B ${Date.now() - t0}ms`)
