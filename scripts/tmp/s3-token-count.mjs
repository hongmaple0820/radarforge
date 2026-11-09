// s3-token-count.mjs —— S3 批次 token 缩减验收：before(git HEAD) vs after(工作区)
// 估法：① char/4（方案口径）② CJK 感知（CJK 字符×1 + 其他÷4，更接近真实 token）
// 运行：node scripts/tmp/s3-token-count.mjs
import { readFileSync } from "fs"
import { execSync } from "child_process"

const SKILLS = [
  "wewrite-brief", "wewrite-outline", "wewrite-draft", "wewrite-review",
  "wewrite-fact-check", "wewrite-illustrate", "wewrite-art-direct", "huashu-video-direct",
]
const ROOT = "/home/z/my-project"

const countCJK = (s) => (s.match(/[\u4e00-\u9fff\u3000-\u303f\uff00-\uffef]/g) || []).length
const tok4 = (s) => Math.round(s.length / 4)
const tokCJK = (s) => {
  const cjk = countCJK(s)
  return Math.round(cjk + (s.length - cjk) / 4)
}

const stripFm = (s) => {
  const m = s.match(/^---\n[\s\S]*?\n---\n?/)
  return m ? s.slice(m[0].length) : s
}

const rows = []
for (const id of SKILLS) {
  const before = execSync(`git -C ${ROOT} show HEAD:db/skills/${id}/SKILL.md`, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 })
  const after = readFileSync(`${ROOT}/db/skills/${id}/SKILL.md`, "utf8")
  const bb = stripFm(before), ab = stripFm(after)
  rows.push({
    id,
    b4: tok4(before), a4: tok4(after),
    bc: tokCJK(before), ac: tokCJK(after),
    bb4: tok4(bb), ab4: tok4(ab),
    bbc: tokCJK(bb), abc: tokCJK(ab),
  })
}

const sum = (k) => rows.reduce((a, r) => a + r[k], 0)
const mean = (k) => sum(k) / rows.length
const pct = (a, b) => (((a / b) - 1) * 100).toFixed(1)
console.log("id".padEnd(22), "file b→a Δ%", "   body b→a Δ%（char/4｜CJK）")
for (const r of rows) {
  console.log(r.id.padEnd(22), `${String(r.b4).padStart(4)}→${String(r.a4).padStart(4)} ${pct(r.a4, r.b4).padStart(6)}%`, `   ${String(r.bb4).padStart(4)}→${String(r.ab4).padStart(4)} ${pct(r.ab4, r.bb4).padStart(6)}%｜${String(r.bbc).padStart(4)}→${String(r.abc).padStart(4)} ${pct(r.abc, r.bbc).padStart(6)}%`)
}
console.log("─".repeat(84))
console.log(`文件级平均  char/4：${Math.round(mean("b4"))} → ${Math.round(mean("a4"))}（${pct(mean("a4"), mean("b4"))}%）｜ CJK：${Math.round(mean("bc"))} → ${Math.round(mean("ac"))}（${pct(mean("ac"), mean("bc"))}%）`)
console.log(`正文体平均  char/4：${Math.round(mean("bb4"))} → ${Math.round(mean("ab4"))}（${pct(mean("ab4"), mean("bb4"))}%）｜ CJK：${Math.round(mean("bbc"))} → ${Math.round(mean("abc"))}（${pct(mean("abc"), mean("bbc"))}%）`)
console.log(`正文体合计  char/4：${sum("bb4")} → ${sum("ab4")}（${pct(sum("ab4"), sum("bb4"))}%）｜ CJK：${sum("bbc")} → ${sum("abc")}（${pct(sum("abc"), sum("bbc"))}%）`)
console.log(`目标：平均 -20%±5%（band [-25%, -15%]）`)
