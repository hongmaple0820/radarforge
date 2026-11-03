// ============================================================
// frontmatter —— SKILL.md YAML frontmatter 解析（纯函数，零依赖）
// 从 loader.ts 拆出共享：loader / install / detail 路由同用一份解析，
// 避免三处实现漂移。覆盖常见形态：顶层标量、`|`/`>` 块标量（折叠一行）、
// `- item` 列表。
// ============================================================

/** 精简 YAML frontmatter 解析（不引 gray-matter 依赖） */
export function parseFrontmatter(raw: string): Record<string, string | string[]> {
  const meta: Record<string, string | string[]> = {}
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(raw)
  if (!m) return meta

  const lines = m[1].split(/\r?\n/)
  let i = 0
  while (i < lines.length) {
    const kv = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(lines[i])
    if (!kv) {
      i++
      continue
    }
    const key = kv[1]
    const value = kv[2].trim()

    if (value === '|' || value === '>') {
      // 块标量：收集后续缩进行，折叠为单行
      const buf: string[] = []
      i++
      while (i < lines.length && (/^\s+\S/.test(lines[i]) || lines[i].trim() === '')) {
        if (lines[i].trim()) buf.push(lines[i].trim())
        i++
      }
      meta[key] = buf.join(' ')
      continue
    }

    if (value === '') {
      // 空值：向后看是否是 `- item` 列表
      const arr: string[] = []
      let j = i + 1
      while (j < lines.length) {
        const item = /^\s+-\s+(.*)$/.exec(lines[j])
        if (!item) break
        arr.push(item[1].trim())
        j++
      }
      if (arr.length > 0) {
        meta[key] = arr
        i = j
      } else {
        meta[key] = ''
        i++
      }
      continue
    }

    // 普通标量（去掉成对引号）
    meta[key] = value.replace(/^["']|["']$/g, '')
    i++
  }
  return meta
}

/** 去掉 frontmatter 取正文 */
export function stripFrontmatter(raw: string): string {
  const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw)
  return m ? m[2] : raw
}
