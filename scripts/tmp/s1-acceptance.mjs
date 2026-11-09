// ============================================================
// s1-acceptance.mjs —— 批次 S1（仓库脚手架）验收脚本
// ① 14 文件齐备 ② AGENTS.md ≤150 行 ③ AGENTS.md 指针全部可达
// ④ GLOSSARY 全部代码锚点真实存在（比抽样更强的全量校验）
// ⑤ 命名一致性抽样 20 条：英文标识符能在 src/ 或 db/ 命中
// 运行：node scripts/tmp/s1-acceptance.mjs
// ============================================================
import { readFileSync, existsSync, readdirSync } from "fs"
import { execSync } from "child_process"

const ROOT = "/home/z/my-project"
let pass = 0, fail = 0
const check = (name, ok, detail = "") => {
  if (ok) { pass++; console.log(`  PASS  ${name}${detail ? " · " + detail : ""}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " · " + detail : ""}`) }
}

console.log("== ① S1 文件齐备（14） ==")
const files = [
  "AGENTS.md", "GLOSSARY.md",
  "docs/agents/issue-tracker.md", "docs/agents/triage-labels.md",
  "docs/agents/domain.md", "docs/agents/coding-standards.md",
  "docs/agents/spec-template.md",
  "docs/adr/0001-length-tier-default-medium.md",
  "docs/adr/0002-video-channel-default-auto.md",
  "docs/adr/0003-prompt-library-full-with-attribution.md",
  "docs/adr/0004-agnes-account-pool.md",
  "docs/adr/0005-batch-order-article-image-video.md",
  "docs/adr/0006-i2v-retry-rotation-and-slot-release.md",
  "docs/adr/0007-skill-md-single-source-of-truth.md",
]
for (const f of files) check(f, existsSync(`${ROOT}/${f}`))

console.log("== ② AGENTS.md 行数约束（≤150） ==")
const agents = readFileSync(`${ROOT}/AGENTS.md`, "utf8")
const lines = agents.split("\n").length
check(`AGENTS.md ${lines} 行`, lines <= 150, `上限 150`)

console.log("== ③ AGENTS.md 指针可达性 ==")
// 反引号里的仓库相对路径（去 :行号 后缀）
const refs = [...agents.matchAll(/`([^`\n]+)`/g)]
  .map((m) => m[1])
  .filter((p) => /^(docs|scripts|repos|src|db|prisma|\.scratch)\//.test(p) || /^(AGENTS|GLOSSARY|worklog)\.md$/.test(p))
  .map((p) => p.replace(/:\d+(-\d+)?$/, ""))
  // 豁免：含 <> 的占位符模板路径；db/custom.db 是沙箱运行时文件（gitignored，存在性随沙箱状态）
  .filter((p) => !p.includes("<") && p !== "db/custom.db")
const uniqRefs = [...new Set(refs)]
for (const p of uniqRefs) check(`指针 ${p}`, existsSync(`${ROOT}/${p}`))
console.log(`  （共 ${uniqRefs.length} 个仓库内指针）`)

console.log("== ④ GLOSSARY 代码锚点全量存在 ==")
const glossary = readFileSync(`${ROOT}/GLOSSARY.md`, "utf8")
const anchors = [...glossary.matchAll(/[|`]((?:src|db|prisma|scripts|docs|repos)\/[^`|\s（），。；]+)/g)]
  .map((m) => m[1].replace(/:\d+$/, ""))
  .filter((p) => !p.includes("<") && p !== "db/custom.db")
const uniqAnchors = [...new Set(anchors)]
for (const p of uniqAnchors) check(`锚点 ${p}`, existsSync(`${ROOT}/${p}`))
console.log(`  （共 ${uniqAnchors.length} 个唯一锚点）`)

console.log("== ⑤ 命名一致性抽样（20 条英文标识符 ↔ 代码命中） ==")
const samples = [
  ["Topic", "model Topic"], ["Report", "model Report"], ["Claim", "model Claim"],
  ["Idea", "model Idea"], ["AgentRun", "model AgentRun"], ["Asset", "model Asset"],
  ["ReviewRecord", "model ReviewRecord"], ["LearningRule", "model LearningRule"],
  ["SettingKV", "model SettingKV"], ["SourceFeed", "model SourceFeed"],
  ["LengthTierId", "LengthTierId"], ["narrative-skeletons", "narrative-skeletons"],
  ["PIPELINE_SKILL_IDS", "PIPELINE_SKILL_IDS"], ["illustration-director", "illustration-director"],
  ["prompt-library", "prompt-library"], ["card-engine", "card-engine"],
  ["zai-image", "zai-image"], ["keyframe", "keyframe"],
  ["audioMode", "audioMode"], ["releaseVideoSlot", "releaseVideoSlot"],
]
let hits = 0
for (const [label, needle] of samples) {
  let found = false
  try {
    execSync(`rg -l -F "${needle}" ${ROOT}/src ${ROOT}/prisma ${ROOT}/db/skills 2>/dev/null | head -1`, { stdio: "pipe" })
    const out = execSync(`rg -l -F "${needle}" ${ROOT}/src ${ROOT}/prisma ${ROOT}/db/skills 2>/dev/null || true`, { stdio: "pipe", encoding: "utf8" })
    found = out.trim().length > 0
  } catch { found = false }
  if (found) hits++
  console.log(`  ${found ? "PASS" : "MISS"}  ${label}`)
}
const rate = Math.round((hits / samples.length) * 100)
check(`命名一致率 ${hits}/${samples.length} = ${rate}%（门槛 ≥90%）`, rate >= 90)

console.log("== ⑥ 词条计数（宣称 42） ==")
const entries = glossary.split("\n")
  .filter((l) => /^\| [^|]+ \| [A-Za-z]/.test(l))
  .filter((l) => !/^\| 中文 \| English /.test(l)) // 排除四个分区表头
  .length
check(`GLOSSARY 词条 ${entries} 条`, entries === 42)

console.log(`\n== 结果：${pass} pass / ${fail} fail ==`)
process.exit(fail === 0 ? 0 : 1)
