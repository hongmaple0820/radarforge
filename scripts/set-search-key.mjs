// set-search-key.mjs —— 把 SearchPro 密钥落库（provider:search）
// 密钥只走环境变量传入，绝不写进任何入库文件（用法：SEARCH_KEY=sk-xxx bun scripts/set-search-key.mjs）
import { PrismaClient } from "@prisma/client"

const db = new PrismaClient()
const key = process.env.SEARCH_KEY?.trim()
if (!key) {
  console.error("缺少 SEARCH_KEY 环境变量（SEARCH_KEY=sk-xxx bun scripts/set-search-key.mjs）")
  process.exit(1)
}

await db.settingKV.upsert({
  where: { key: "provider:search" },
  update: { value: JSON.stringify({ apiKey: key }) },
  create: { key: "provider:search", value: JSON.stringify({ apiKey: key }) },
})

const row = await db.settingKV.findUnique({ where: { key: "provider:search" } })
const masked = key.slice(0, 6) + "…" + key.slice(-4)
console.log(`已落库 provider:search（掩码 ${masked}），value 长度 ${row.value.length}`)
await db.$disconnect()
