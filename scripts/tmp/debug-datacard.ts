// debug-datacard.ts —— 数据卡文案解析失败复现：打印 LLM 原始回复 + parseCardPlan 结果
import { dataCardMessages } from "../../src/lib/runtime/skills/radar-image.ts"
import { extractJson } from "../../src/lib/runtime/json.ts"

// parseCardPlan 从 card-engine 导入（与产线同一实现）
const { parseCardPlan } = await import("../../src/lib/runtime/card-engine.ts")
// chat 走 SDK 直调（builtin 模式等价 chatRetry 主链路；gateway 的 @/ 别名 CLI 解析不了）
const { default: ZAI } = await import("z-ai-web-dev-sdk")
const zai = await ZAI.create()

const input = {
  heading: "成本对决：开源的经济优势",
  point: "同等任务下开源模型的 API 定价显著低于闭源旗舰，成本差距达 3-5 倍",
  evidence: [
    "开源模型 API 定价约为闭源旗舰的 1/3 至 1/5",
    "自托管开源模型在批量推理场景成本优势进一步扩大",
  ],
  caption: "成本差距达3-5倍",
}

for (const temp of [0.3, 0.1]) {
  console.log(`━━ 温度 ${temp} ━━`)
  const msgs = await dataCardMessages(input)
  console.log("── system prompt（前 300 字）──")
  console.log(msgs[0].content.slice(0, 300))
  const res = await zai.chat.completions.create({
    messages: msgs.map((m) => ({ role: m.role, content: m.content })),
    temperature: temp,
  })
  const raw = res.choices?.[0]?.message?.content ?? ""
  console.log("── LLM 原始回复 ──")
  console.log(JSON.stringify(raw)?.slice(0, 600))
  const parsed = extractJson(raw)
  console.log("── extractJson 结果 ──")
  console.log(JSON.stringify(parsed)?.slice(0, 400))
  const card = parseCardPlan(parsed ?? raw, 1)
  console.log("── parseCardPlan 结果 ──")
  console.log(JSON.stringify(card)?.slice(0, 300))
  if (card && card.length > 0) {
    console.log("✅ 解析成功，本温度可出卡")
    break
  }
  console.log("❌ 本温度解析失败")
}
