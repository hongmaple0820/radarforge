// c3-browser-smoke.mjs —— 批次三浏览器视觉冒烟
// ① 视频线工作台：通道卡（AI 首帧 i2v 主轨文案 + 池徽章）+ 预览开关 + 六 BGM 选项
// ② 需有分镜才能见渲染控制 → 用 E2E run（artifacts 带 storyboard 的 done run，视频面板从 run 资产恢复分镜）
// ③ 成片卡：v1 预览阶段卡（首帧画廊 + 确认按钮）/ v2 done（镜头来源/首帧统计/诊断行）
// 截图存 download/assets/c3-*.png；Radix tab 用 mousedown dispatchEvent 激活。
import { chromium } from "playwright"

const BASE = "http://localhost:3000"
const ok = (name, cond, extra = "") => console.log(`  ${cond ? "✅" : "❌"} ${name}${extra ? `  ${extra}` : ""}`)

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
console.log("[1] goto", BASE)
await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 90000 })
await page.waitForSelector('[role="tab"], [data-radix-collection-item]', { timeout: 60000 })
await page.waitForTimeout(1500)

console.log("[2] 创作台 → 视频线（嵌套 tab）")
await page.locator('[role="tab"]').filter({ hasText: "创作台" }).first()
  .evaluate((el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })))
await page.waitForTimeout(1800)
await page.locator('[role="tab"]').filter({ hasText: "视频线" }).first()
  .evaluate((el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })))
await page.waitForTimeout(2200)
await page.screenshot({ path: "download/assets/c3-video-entry.png" })

// ---- ② 选中 E2E run（分镜从 video-final meta 恢复 → 通道卡出现） ----
const fs = await import("fs/promises")
const state = JSON.parse(await fs.readFile("scripts/tmp/c3-e2e-state.json", "utf-8"))
const runOpt = page.locator("select").first().locator("option", { hasText: "E2E-c3" }).first()
const hasOpt = await runOpt.count()
ok("源稿下拉含 E2E run", hasOpt > 0)
if (hasOpt) {
  await page.locator("select").first().selectOption({ label: await runOpt.textContent() }).catch(async () => {
    // label 匹配失败时按值选（value=runId）
    await page.locator("select").first().selectOption(state.runId)
  })
  await page.waitForTimeout(2500)
}

// ---- ③ 通道卡文案与池徽章（分镜就绪后出现） ----
const i2vCard2 = await page.locator("button", { hasText: "AI 首帧 i2v 主轨" }).count()
ok("通道卡：AI 首帧 i2v 主轨文案", i2vCard2 > 0)
const hybridCard2 = await page.locator("button", { hasText: "model 镜头 i2v" }).count()
ok("通道卡：混合通道 model 镜头 i2v 文案", hybridCard2 > 0)
const poolBadge2 = await page.locator("text=池").count()
ok("池状态徽章可见（C4 显式指引）", poolBadge2 > 0)
await page.locator("button", { hasText: "AI 首帧 i2v 主轨" }).first().click().catch(() => {})
await page.waitForTimeout(700)
const previewToggle2 = await page.locator("button", { hasText: "分镜预览先行" }).count()
ok("C2 预览开关（选 i2v 通道后出现）", previewToggle2 > 0)
await page.screenshot({ path: "download/assets/c3-channel-i2v.png" })

// ---- ④ BGM 六选项 ----
const bgmSelect = page.locator('select[aria-label="BGM 配乐"]').first()
const bgmOptions = await bgmSelect.locator("option").allTextContents().catch(() => [])
ok("BGM 六预设下拉", bgmOptions.length >= 7, `n=${bgmOptions.length}（${bgmOptions.join("/")}）`)

// ---- ⑤ 成片卡（v2 done）：镜头来源/首帧统计/诊断行 ----
const segRow = await page.locator("text=镜头来源：").count()
ok("成片卡：镜头来源构成行（C1 留痕）", segRow > 0)
const kfStat = await page.locator("text=AI 首帧 ").count()
ok("成片卡：首帧质量统计行", kfStat > 0)
const i2vBadge = await page.locator("text=i2v 0/3 镜").count()
ok("成片卡：i2v 占比徽章（诚实 0/3）", i2vBadge > 0)
await page.screenshot({ path: "download/assets/c3-video-done.png" })

// ---- ⑥ 切 v1 预览版本：首帧画廊 + 确认按钮 ----
const v1Chip = page.locator("button", { hasText: "v1" }).first()
if (await v1Chip.count()) {
  await v1Chip.click().catch(() => {})
  await page.waitForTimeout(1200)
  const gallery = await page.locator("text=分镜预览确认区").count()
  ok("v1 预览卡：分镜预览确认区（预览即所提交）", gallery > 0)
  const confirmBtn = await page.locator("button", { hasText: "确认渲染成片" }).count()
  ok("v1 预览卡：确认渲染成片按钮（复用首帧）", confirmBtn > 0)
  const kfImg = await page.locator('img[src*="video-frames"]').count()
  ok("v1 预览卡：首帧画廊图片", kfImg >= 3, `n=${kfImg}`)
  await page.screenshot({ path: "download/assets/c3-video-preview-gallery.png" })
} else {
  ok("v1 版本 chip 在列（跳过画廊断言）", false, "未找到 v1 chip")
}

const directBtn = await page.locator("button", { hasText: "选题直出" }).count()
ok("选题直出入口在列", directBtn > 0)
await page.screenshot({ path: "download/assets/c3-video-overview.png", fullPage: false })

// ---- ④ 设置中心视频卡：字幕样式三预设 ----
console.log("[3] 设置中心 → 视频通道卡")
await page.locator('[role="tab"]').filter({ hasText: "设置" }).first()
  .evaluate((el) => el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true })))
await page.waitForTimeout(1500)
const subtitleBtn = await page.locator("button", { hasText: "清爽描边" }).count()
ok("设置卡：字幕样式三预设（清爽描边在列）", subtitleBtn > 0)
await page.screenshot({ path: "download/assets/c3-settings-video.png" })

await browser.close()
console.log("[done] c3 browser smoke")
