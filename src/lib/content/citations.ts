// ============================================================
// citations —— 文章引用留痕（S4 余项② citation-provenance）
// 纯函数三件：lintArticleCitations / stripOrphanAnchors /
// citationsArtifact。零依赖（客户端可安全引入，distill 单一实现
// 于服务端调用侧——idea-card.ts 同层同先例）。
//
// 口径对齐 render.ts（唯一事实源）：
//   - 正文锚点 = [n]（1~2 位数字，\[\d{1,2}\]）；
//   - 围栏代码块（``` 开关，/^```/ 行首检测）内的 [n] 不参与
//     锚点渲染，故不参与统计与修复；
//   - 悬空锚 = 编号超范围 或 对应 claim 未证实（脚注区跳号缺位，
//     renderClaims 仅含 verified claims——Step 9 过滤同源）。
// ============================================================

export interface CitationSource {
  idx: number // [n] 上标编号（claims 账本 idx>0；REF/ASSERT idx=0 不入）
  claimType: string
  text: string
  verified: boolean
  sourceSite: string
  sourceTitle: string
  sourceDate: string
  sourceUrl: string
}

export interface LintCitations {
  anchors: number // 正文锚点总数（fence 外）
  valid: number // 可解析锚点次数（编号存在且 verified）
  orphanNumbers: number[] // 悬空编号（去重升序）
  orphanOccurrences: number // 悬空锚点出现次数
  used: number[] // 被引用且可解析的编号（去重升序）
  orphanDetail: { n: number; count: number }[]
}

export interface CitationsArtifact {
  total: number // fact claims 总数（含未证实，审计视角）
  verified: number
  cited: number // citedCount > 0 的来源数
  orphanRemoved: number // 机械移除的悬空锚次数（0=全绿无需修复）
  sources: (CitationSource & { citedCount: number })[]
}

const ANCHOR_RE = /\[(\d{1,2})\]/g
const FENCE_RE = /^```/

/** verified 编号集（悬空判定的唯一依据；idx=0 的 REF/ASSERT 天然不在） */
function verifiedSet(claims: CitationSource[]): Set<number> {
  return new Set(claims.filter((c) => c.verified && c.idx > 0).map((c) => c.idx))
}

/** 逐行扫描锚点（fence 行与 fence 内容不参与——与排版口径一致） */
function scanAnchors(markdown: string): Map<number, number> {
  const counts = new Map<number, number>()
  let inFence = false
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd()
    if (FENCE_RE.test(line.trim())) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    for (const m of line.matchAll(ANCHOR_RE)) {
      const n = Number(m[1])
      counts.set(n, (counts.get(n) ?? 0) + 1)
    }
  }
  return counts
}

export function lintArticleCitations(markdown: string, claims: CitationSource[]): LintCitations {
  const ok = verifiedSet(claims)
  const counts = scanAnchors(markdown)
  let anchors = 0
  let valid = 0
  let orphanOccurrences = 0
  const used: number[] = []
  const orphanNumbers: number[] = []
  const orphanDetail: LintCitations["orphanDetail"] = []
  for (const [n, count] of [...counts.entries()].sort((a, b) => a[0] - b[0])) {
    anchors += count
    if (ok.has(n)) {
      valid += count
      used.push(n)
    } else {
      orphanOccurrences += count
      orphanNumbers.push(n)
      orphanDetail.push({ n, count })
    }
  }
  return { anchors, valid, orphanNumbers, orphanOccurrences, used, orphanDetail }
}

/**
 * 机械移除悬空锚（最小干预：保留句子，不改写语义；orphan 清单由
 * lint 结果随 artifacts.citations 留痕——D2 决策）。无悬空时返回
 * 原文字节级不变（零改动路径）。
 */
export function stripOrphanAnchors(
  markdown: string,
  claims: CitationSource[],
): { text: string; removed: number } {
  const ok = verifiedSet(claims)
  let removed = 0
  const out: string[] = []
  let inFence = false
  for (const rawLine of markdown.split("\n")) {
    const line = rawLine.trimEnd()
    if (FENCE_RE.test(line.trim())) {
      inFence = !inFence
      out.push(line)
      continue
    }
    if (inFence) {
      out.push(line)
      continue
    }
    const stripped = line.replace(ANCHOR_RE, (m: string, d: string) => {
      if (ok.has(Number(d))) return m
      removed++
      return ""
    })
    out.push(stripped)
  }
  return { text: out.join("\n"), removed }
}

/**
 * 组装 artifacts.citations（D1：独立键；D4：fact claims 全量含未证实
 * flagged，REF/ASSERT 不入由调用侧保证——verifiedClaims 数组本身只含
 * fact 主张）。
 */
export function citationsArtifact(
  claims: CitationSource[],
  lint: LintCitations,
  orphanRemoved = 0,
): CitationsArtifact {
  const facts = claims.filter((c) => c.idx > 0)
  const citedCounts = new Map<number, number>()
  for (const n of lint.used) citedCounts.set(n, (citedCounts.get(n) ?? 0) + 1)
  return {
    total: facts.length,
    verified: facts.filter((c) => c.verified).length,
    cited: [...citedCounts.keys()].length,
    orphanRemoved,
    sources: facts.map((c) => ({
      idx: c.idx,
      claimType: c.claimType,
      text: c.text.slice(0, 500),
      verified: c.verified,
      sourceSite: c.sourceSite,
      sourceTitle: c.sourceTitle.slice(0, 120),
      sourceDate: c.sourceDate,
      sourceUrl: c.sourceUrl,
      citedCount: citedCounts.get(c.idx) ?? 0,
    })),
  }
}
