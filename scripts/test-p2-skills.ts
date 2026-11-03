// ============================================================
// test-p2-skills.ts —— P2-1 技能安装管理离线自测（node --experimental-strip-types 直跑）
// 覆盖（纯函数层，不触 DB / 文件系统 / 网络）：
//   ① 合规校验五类错误：缺 name / 非法字符 / 与目录名不一致 /
//      缺 description / description 超长；正例全绿
//   ② GitHub URL 转换：tree 形态 / blob 形态 / 非 GitHub 返回 null
//   ③ zip 候选识别：根形态 / 一层子目录形态（GitHub archive）/
//      多技能批量 / 无 SKILL.md 报错 / zip-slip 与垃圾条目过滤
//   ④ id 清洗 sanitizeId：大写转小写、非法字符转连字符、空回退
//   ⑤ 限额：单文件 2MB / 包总量 20MB（超限抛人话错误）
// 运行：node --experimental-strip-types scripts/test-p2-skills.ts
// ============================================================

import { checkSkillCompliance, complianceSummary, SKILL_NAME_PATTERN } from "../src/lib/skills/compliance.ts"
import { githubUrlToZip, sanitizeId, findSkillCandidates, MAX_FILE_BYTES, type ZipEntryLike } from "../src/lib/skills/zip-struct.ts"

let pass = 0
let fail = 0
function assert(cond: boolean, name: string, extra = ""): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? `  → ${extra}` : ""}`)
  }
}

// ---------- ① 合规校验 ----------

console.log("━━ ① 合规校验（agentskills.io 规则）━━")
{
  const good = checkSkillCompliance("pdf-summary", { name: "pdf-summary", description: "总结 PDF 文档要点，输入文件路径时使用" })
  assert(good.ok, "正例：name=目录名 + description → 合规")
  assert(good.errors.length === 0, "正例：零 error", JSON.stringify(good.errors))

  const noName = checkSkillCompliance("x", { description: "d" })
  assert(!noName.ok && noName.errors.some((e) => e.rule === "name.required"), "缺 name → name.required 错误")

  const badCase = checkSkillCompliance("MySkill", { name: "MySkill", description: "d" })
  assert(!badCase.ok && badCase.errors.some((e) => e.rule === "name.pattern"), "大写 name → name.pattern 错误")

  const hyphen = checkSkillCompliance("-bad-", { name: "-bad-", description: "d" })
  assert(!hyphen.ok && hyphen.errors.some((e) => e.rule === "name.pattern"), "首尾连字符 → name.pattern 错误")

  const mismatch = checkSkillCompliance("dir-a", { name: "dir-b", description: "d" })
  assert(!mismatch.ok && mismatch.errors.some((e) => e.rule === "name.matches-dir"), "name ≠ 目录名 → name.matches-dir 错误")

  const noDesc = checkSkillCompliance("x", { name: "x" })
  assert(!noDesc.ok && noDesc.errors.some((e) => e.rule === "description.required"), "缺 description → description.required 错误")

  const longDesc = checkSkillCompliance("x", { name: "x", description: "y".repeat(1025) })
  assert(!longDesc.ok && longDesc.errors.some((e) => e.rule === "description.length"), "description 1025 字符 → description.length 错误")

  const edge = checkSkillCompliance("x", { name: "x", description: "y".repeat(1024) })
  assert(edge.ok, "description 恰 1024 字符 → 合规（边界含）")

  const warn = checkSkillCompliance("x", { name: "x", description: "d", "allowed-tools": ["a"] })
  assert(warn.ok && warn.warnings.some((w) => w.rule === "allowed-tools.experimental"), "allowed-tools → warn 不阻断")

  assert(SKILL_NAME_PATTERN.test("a1-b2") && !SKILL_NAME_PATTERN.test("a--b") && !SKILL_NAME_PATTERN.test("-a"), "name 正则三断言")

  assert(complianceSummary(good).includes("合规"), "complianceSummary 人话摘要")
}

// ---------- ② GitHub URL 转换 ----------

console.log("━━ ② GitHub URL 转换 ━━")
{
  const tree = githubUrlToZip("https://github.com/anthropics/skills/tree/main/template-skill")
  assert(tree?.zipUrl === "https://codeload.github.com/anthropics/skills/zip/refs/heads/main", "tree → codeload zip URL", JSON.stringify(tree))
  assert(tree?.subpath === "template-skill", "tree → 子路径")

  const treeDeep = githubUrlToZip("https://github.com/o/r/tree/v1.2/sub/dir/")
  assert(treeDeep?.zipUrl === "https://codeload.github.com/o/r/zip/refs/heads/v1.2", "带 ref 的 tree 转换")
  assert(treeDeep?.subpath === "sub/dir", "深层子路径 + 尾斜杠剥离")

  const blob = githubUrlToZip("https://github.com/o/r/blob/main/skills/my-skill/SKILL.md")
  assert(blob?.subpath === "skills/my-skill", "blob 单文件页 → 所在目录")

  assert(githubUrlToZip("https://example.com/foo.zip") === null, "非 GitHub → null")
  assert(githubUrlToZip("not a url") === null, "非 URL → null")
}

// ---------- ③ zip 候选识别 ----------

console.log("━━ ③ zip 候选识别 ━━")

function mk(entries: [string, string][]): ZipEntryLike[] {
  return entries.map(([entryName, content]) => ({ entryName, getData: () => Buffer.from(content) }))
}

{
  // 根形态
  const c = findSkillCandidates(mk([["SKILL.md", "---\nname: t\ndescription: t\n---\nbody"], ["references/notes.md", "x"]]))
  assert(c.length === 1 && c[0].id === "" && c[0].files.length === 2, "根形态：候选 1 个，id 待命名", JSON.stringify(c.map((x) => x.id)))
  assert(c[0].files.some((f) => f.entry === "references/notes.md"), "根形态：子目录文件保留相对路径")

  // GitHub archive 形态（仓库根包裹层自动剥壳）
  const gh = findSkillCandidates(mk([["repo-main/", ""], ["repo-main/template-skill/SKILL.md", "x"], ["repo-main/template-skill/scripts/run.sh", "y"], ["repo-main/README.md", "z"]]))
  assert(gh.length === 1 && gh[0].id === "template-skill", "archive 形态：剥壳后目录名即技能 id", JSON.stringify(gh.map((x) => x.id)))
  assert(gh[0].files.every((f) => !f.entry.startsWith("repo-main") && !f.entry.includes("README")), "archive 形态：仓库根剥离 + README 不进技能")
  assert(gh[0].files.some((f) => f.entry === "scripts/run.sh"), "archive 形态：技能子目录文件保留相对路径")

  // 单目录包裹（直接下载的单技能 zip）
  const single = findSkillCandidates(mk([["my-skill/SKILL.md", "x"], ["my-skill/references/notes.md", "y"]]))
  assert(single.length === 1 && single[0].id === "my-skill", "单目录包裹：剥壳后目录名做 id（保 name=dir 合规）", JSON.stringify(single.map((x) => x.id)))
  assert(single[0].files.some((f) => f.entry === "references/notes.md"), "单目录包裹：子目录文件保留")

  // 多技能批量
  const multi = findSkillCandidates(mk([["a/SKILL.md", "x"], ["b/SKILL.md", "y"], ["c/other.txt", "z"]]))
  assert(multi.length === 2 && multi.map((m) => m.id).join() === "a,b", "技能仓库：含 SKILL.md 的子目录全部识别，无 SKILL.md 的跳过")

  // 无 SKILL.md → 空候选（人话错误由调用方 installFromZipBuffer 抛出）
  const none = findSkillCandidates(mk([["a/x.md", "x"]]))
  assert(none.length === 0, "无 SKILL.md → 空候选（错误由安装入口抛人话提示）")

  // zip-slip 与垃圾条目
  const safe = findSkillCandidates(mk([["SKILL.md", "x"], ["__MACOSX/junk", "x"], [".DS_Store", "x"], ["../evil.txt", "x"]]))
  assert(safe.length === 1 && safe[0].files.length === 1 && safe[0].files[0].entry === "SKILL.md", "zip-slip / __MACOSX / .DS_Store 全部过滤")

  // subpath 剥离（条目已无仓库根时，只取指定子路径下的技能）
  const sub = findSkillCandidates(mk([["a/SKILL.md", "x"], ["b/SKILL.md", "y"]]), "a")
  assert(sub.length === 1 && sub[0].files[0].entry === "SKILL.md", "subpath 指定：只取该子路径的技能且相对化")
}

// ---------- ④ sanitizeId ----------

console.log("━━ ④ id 清洗 ━━")
{
  assert(sanitizeId("My Skill!.zip") === "my-skill-zip", "非法字符 → 连字符")
  assert(sanitizeId("template-skill") === "template-skill", "已合规则不变")
  assert(sanitizeId("---") === "installed-skill", "清洗后为空 → 回退默认名")
  assert(sanitizeId("UPPER_case") === "upper-case", "大小写归一")
}

// ---------- ⑤ 限额 ----------

console.log("━━ ⑤ 限额防护 ━━")
{
  const big = Buffer.alloc(MAX_FILE_BYTES + 1)
  try {
    findSkillCandidates([{ entryName: "SKILL.md", getData: () => big }])
    assert(false, "单文件超限应抛错")
  } catch (e) {
    assert((e as Error).message.includes("2MB"), "单文件 2MB 超限 → 人话错误", (e as Error).message)
  }
  const many: ZipEntryLike[] = []
  for (let i = 0; i < 205; i++) many.push({ entryName: i === 0 ? "SKILL.md" : `f${i}.txt`, getData: () => Buffer.from("x") })
  try {
    findSkillCandidates(many)
    assert(false, "文件数超限应抛错")
  } catch (e) {
    assert((e as Error).message.includes("200"), "200 文件上限 → 人话错误", (e as Error).message)
  }
}

// ---------- 汇总 ----------

console.log(`\n━━ test-p2-skills：${pass} 通过 / ${fail} 失败 ━━`)
if (fail > 0) process.exit(1)
