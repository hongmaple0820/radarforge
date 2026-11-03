// ============================================================
// compliance —— Agent Skills 官方规范合规校验（P2-1）
// 规则来源 agentskills.io/specification（q7 方案第三章 3.2 对照）：
//   - name 必填，1-64 字符，仅小写字母/数字/连字符；不得以连字符
//     开头结尾或连续连字符；且必须与目录名一致
//   - description 必填，1-1024 字符（说明做什么与何时用）
//   - 可选：license / compatibility / metadata / allowed-tools（实验性）
// 校验结果显式标注（error 阻断「合规」判定 / warn 仅提示），
// 不合规技能明确给出原因，绝不静默跳过——这是本模块存在的意义。
// ============================================================

export interface ComplianceIssue {
  rule: string
  message: string
  severity: "error" | "warn"
}

export interface ComplianceReport {
  ok: boolean
  errors: ComplianceIssue[]
  warnings: ComplianceIssue[]
}

/** 官方 name 约束：小写字母数字 + 不连续/不首尾的连字符，1-64 字符 */
export const SKILL_NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const SKILL_DESCRIPTION_MAX = 1024

function str(v: unknown): string {
  if (Array.isArray(v)) return v.join(" ")
  return typeof v === "string" ? v.trim() : ""
}

/**
 * 校验一个技能的 frontmatter 是否合规。
 * @param dirName 技能目录名（name 必须与之一致）
 * @param meta 解析后的 frontmatter（loader.parseFrontmatter 产物）
 */
export function checkSkillCompliance(dirName: string, meta: Record<string, unknown>): ComplianceReport {
  const errors: ComplianceIssue[] = []
  const warnings: ComplianceIssue[] = []

  const name = str(meta["name"])
  const description = str(meta["description"])

  // ---- name ----
  if (!name) {
    errors.push({ rule: "name.required", message: "frontmatter 缺少 name（必填）", severity: "error" })
  } else {
    if (name.length < 1 || name.length > 64) {
      errors.push({ rule: "name.length", message: `name 长度须在 1-64 字符之间（当前 ${name.length}）`, severity: "error" })
    }
    if (!SKILL_NAME_PATTERN.test(name)) {
      errors.push({
        rule: "name.pattern",
        message: `name 只允许小写字母/数字/连字符，且不得以连字符开头结尾或连续连字符（当前 "${name}"）`,
        severity: "error",
      })
    }
    // 与目录名一致性独立报告（即便 pattern 已错，mismatch 也显式指出目标名）
    if (name !== dirName) {
      errors.push({ rule: "name.matches-dir", message: `name "${name}" 必须与目录名 "${dirName}" 一致`, severity: "error" })
    }
  }

  // ---- description ----
  if (!description) {
    errors.push({ rule: "description.required", message: "frontmatter 缺少 description（必填，说明做什么与何时用）", severity: "error" })
  } else if (description.length > SKILL_DESCRIPTION_MAX) {
    errors.push({
      rule: "description.length",
      message: `description 长度不得超过 ${SKILL_DESCRIPTION_MAX} 字符（当前 ${description.length}）`,
      severity: "error",
    })
  }

  // ---- 可选字段提示（warn 不阻断）----
  if ("allowed-tools" in meta) {
    warnings.push({ rule: "allowed-tools.experimental", message: "allowed-tools 为实验性字段，当前运行时按提示读取", severity: "warn" })
  }
  if (!("license" in meta)) {
    warnings.push({ rule: "license.optional", message: "未声明 license（可选）——对外分发技能建议补充", severity: "warn" })
  }

  return { ok: errors.length === 0, errors, warnings }
}

/** 报告 → 摘要一行（人话，供列表徽标 tooltip 与 API 摘要用） */
export function complianceSummary(report: ComplianceReport): string {
  const parts: string[] = []
  if (report.ok) parts.push("合规（agentskills.io 规范）")
  for (const e of report.errors) parts.push(`错误：${e.message}`)
  for (const w of report.warnings) parts.push(`提示：${w.message}`)
  return parts.join("；")
}
