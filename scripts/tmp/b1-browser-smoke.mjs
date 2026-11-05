// b1-browser-smoke.mjs —— 批次一浏览器视觉冒烟
// ① 创作台向导：填选题 → 下一步 → 篇幅档位三卡（默认 medium 高亮）
// ② 设置中心 → 内容策略分区 → 文章产线卡（档位+风格下拉）
// 截图存 download/assets/b1-*.png；Radix tab 用 mousedown dispatchEvent 激活。
import { chromium } from "playwright"

const BASE = "http://localhost:3000"
const ok = (name, cond, extra = "") => console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
console.log("[1] goto", BASE)
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 })
await page.waitForSelector('[role="tab"], [data-radix-collection-item]', { timeout: 60000 })
await page.waitForTimeout(1500)
console.log("[2] 页面就绪 title=", await page.title())

// ---- ① 创作台向导 ----
console.log("[3] 切创作台 tab")
await page.locator('[role="tab"]').filter({ hasText: "创作台" }).first()
  .evaluate((el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })))
await page.waitForTimeout(1500)
await page.screenshot({ path: "download/assets/b1-studio-entry.png" })

// 向导模式（若默认高级表单，切「向导」）
const wizardBtn = page.locator("button", { hasText: "向导" }).first()
if (await wizardBtn.count()) await wizardBtn.click().catch(() => {})
await page.waitForTimeout(400)

// 填选题标题 → 下一步
const titleInput = page.locator("input").first()
await titleInput.fill("大模型推理成本拐点观察")
await page.screenshot({ path: "download/assets/b1-wizard-step1.png" })
const nextBtn = page.locator("button", { hasText: "下一步" }).first()
await nextBtn.click().catch(() => {})
await page.waitForTimeout(600)

// 篇幅档位三卡（step2：人格/篇幅/主题同屏）
const tierCard = page.locator("button", { hasText: "标准深度" }).first()
const tierVisible = await tierCard.count() > 0
ok("向导第二步：篇幅档位卡可见", tierVisible)
const deepBtn = page.locator("button", { hasText: "封面级长文" }).first()
if (tierVisible && (await deepBtn.count())) {
  await deepBtn.click().catch(() => {})
  await page.waitForTimeout(200)
}
await page.screenshot({ path: "download/assets/b1-wizard-tier.png", fullPage: false })
const deepActive = await page.locator("button", { hasText: "封面级长文" }).first().evaluate((el) => el.className.includes("amber")).catch(() => false)
ok("点选 deep 档高亮生效", deepActive, String(deepActive))

// ---- ② 设置中心 文章产线卡 ----
console.log("[4] 切设置 tab")
await page.locator('[role="tab"]').filter({ hasText: "设置中心" }).first()
  .evaluate((el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })))
await page.waitForTimeout(1500)
const contentTab = page.locator("button, [role=\"tab\"]", { hasText: "内容策略" }).first()
if (await contentTab.count()) {
  await contentTab.evaluate((el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))).catch(() => {})
}
await page.waitForTimeout(800)
const articleCard = page.locator("#settings-card-article")
ok("设置中心：文章产线卡可见", (await articleCard.count()) > 0)
if (await articleCard.count()) {
  await articleCard.scrollIntoViewIfNeeded().catch(() => {})
  await page.waitForTimeout(300)
  const tierBtns = await articleCard.locator("button", { hasText: /短篇快讯|标准深度|封面级长文/ }).count()
  ok("文章产线卡：三档按钮齐", tierBtns === 3, `n=${tierBtns}`)
  const styleSelect = await articleCard.locator("select").count()
  ok("文章产线卡：插图风格下拉在", styleSelect >= 1, `n=${styleSelect}`)
  await articleCard.screenshot({ path: "download/assets/b1-settings-article-card.png" })
}

await browser.close()
console.log("截图：download/assets/b1-{studio-entry,wizard-step1,wizard-tier,settings-article-card}.png")
