// ============================================================
// state —— 技能启停状态存储（P2-1）
// 停用语义：不出现在 Agent 运行时候选池，但文件保留（不删除）。
// 存储：SettingKV `skills:disabled` = JSON 字符串数组（技能 id 集合）。
// 独立小模块（不走 lib/settings 的类型化 AppSettings——那是供应商
// 配置域；技能域单独演进，避免为每个新键扩 AppSettings 类型）。
// ============================================================

import { db } from "@/lib/db"

const KEY = "skills:disabled"
const CACHE_TTL = 5_000

let cache: { at: number; ids: Set<string> } | null = null

function invalidate() {
  cache = null
}

/** 读取停用集合（5s 内存缓存；读取失败按空集处理） */
export async function getDisabledSkills(): Promise<Set<string>> {
  if (cache && Date.now() - cache.at < CACHE_TTL) return cache.ids
  let ids = new Set<string>()
  try {
    const row = await db.settingKV.findUnique({ where: { key: KEY } })
    if (row) {
      const parsed = JSON.parse(row.value)
      if (Array.isArray(parsed)) ids = new Set(parsed.filter((x) => typeof x === "string"))
    }
  } catch {
    // 库不可用/值损坏 → 空集（停用是增强功能，不阻断加载）
  }
  cache = { at: Date.now(), ids }
  return ids
}

/** 设置技能启停（写库 + 失效缓存），返回操作后的停用集合 */
export async function setSkillDisabled(id: string, disabled: boolean): Promise<Set<string>> {
  const ids = new Set(await getDisabledSkills())
  if (disabled) ids.add(id)
  else ids.delete(id)
  await db.settingKV.upsert({
    where: { key: KEY },
    create: { key: KEY, value: JSON.stringify([...ids]) },
    update: { value: JSON.stringify([...ids]) },
  })
  invalidate()
  return ids
}
