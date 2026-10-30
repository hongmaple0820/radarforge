// 配额窗口等待探针：最多等 <maxMin> 分钟，每 45s 探一次，恢复即退出 0
const maxMin = Number(process.argv[2] ?? 9)
const { default: ZAI } = await import("z-ai-web-dev-sdk")
const zai = await ZAI.create()
const t0 = Date.now()
while (Date.now() - t0 < maxMin * 60_000) {
  try {
    const r = await zai.chat.completions.create({ messages: [{ role: "user", content: "回复两个字：正常" }], stream: false, thinking: { type: "disabled" }, temperature: 0 })
    if (r?.choices?.[0]?.message?.content) {
      console.log(`QUOTA-OK after ${Math.round((Date.now() - t0) / 1000)}s → ${(r.choices[0].message.content).slice(0, 12)}`)
      process.exit(0)
    }
  } catch {
    /* still limited */
  }
  await new Promise((r) => setTimeout(r, 45_000))
}
console.log(`QUOTA-STILL-LIMITED after ${maxMin}min`)
process.exit(1)
