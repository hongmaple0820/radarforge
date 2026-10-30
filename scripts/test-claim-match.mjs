// 离线验证 claims 关键词重合度匹配（CJK bigram + 拉丁词）
const tokenize = (s) => {
  const out = []
  for (const m of s.match(/[A-Za-z0-9][A-Za-z0-9_.-]*/g) ?? []) out.push(m.toLowerCase())
  const cjk = (s.match(/[\u4e00-\u9fff]+/g) ?? []).join("")
  for (let i = 0; i < cjk.length - 1; i++) out.push(cjk.slice(i, i + 2))
  return out
}
const overlap = (claim, result) => {
  const ct = new Set(tokenize(claim))
  const hay = new Set(tokenize(result))
  let hits = 0
  for (const t of ct) if (hay.has(t)) hits++
  return { hits, claimTokens: ct.size }
}

// 用例 1：相关结果（应命中 ≥2）
const c1 = "2023年主要AI公司如OpenAI、Anthropic、Google的多模态API价格较年初平均下降超过50%"
const r1a = "OpenAI 与 Anthropic 下调多模态 API 价格，年内平均降幅超 50%，多模态进入平价时代……GPT-4o mini 价格再砍半"
const r1b = "某明星官宣结婚，粉丝激动围观八卦……"
console.log("用例1 相关:", overlap(c1, r1a), "→", overlap(c1, r1a).hits >= 2 ? "✅ 核实" : "❌ 漏")
console.log("用例1 无关:", overlap(c1, r1b), "→", overlap(c1, r1b).hits >= 2 ? "❌ 误报" : "✅ 拒绝")

// 用例 2：短主张（拉丁词为主）
const c2 = "GPT-5 定价下降 80%"
const r2 = "GPT-5 发布：定价下降80%，OpenAI 掀起价格战"
console.log("用例2 相关:", overlap(c2, r2), "→", overlap(c2, r2).hits >= 2 ? "✅ 核实" : "❌ 漏")

// 用例 3：纯中文长句
const c3 = "目前市场上主流多模态模型的训练成本是单模态模型的3到5倍"
const r3 = "报告：多模态模型训练成本达单模态模型五倍，推理成本仅高出两成"
console.log("用例3 相关:", overlap(c3, r3), "→", overlap(c3, r3).hits >= 2 ? "✅ 核实" : "❌ 漏")
const r3b = "新能源汽车价格战白热化，多家车企宣布降价促销"
console.log("用例3 无关:", overlap(c3, r3b), "→", overlap(c3, r3b).hits >= 2 ? "❌ 误报" : "✅ 拒绝")
