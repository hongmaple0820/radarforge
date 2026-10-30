// 复现 art 引擎 y4_storytime 启动失败：加载 clip.html 并捕获 console + bootError
import { chromium } from "playwright"
import { createServer } from "http"
import { readFile } from "fs/promises"
import path from "path"

const ENGINE_DIR = "/home/z/my-project/public/engine/art-motion"

const server = createServer(async (req, res) => {
  try {
    const url = (req.url ?? "/").split("?")[0]
    const file = path.join(ENGINE_DIR, url === "/" ? "clip.html" : url.replace(/^\//, ""))
    const body = await readFile(file)
    const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json", ".woff": "font/woff", ".woff2": "font/woff2" }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" })
    res.end(body)
  } catch {
    res.writeHead(404)
    res.end("not found")
  }
})
await new Promise((r) => server.listen(0, "127.0.0.1", r))
const port = server.address().port

// 逐个语法 boot 测试（paper 色板，data 给空对象——最小化复现）
const GRAMMARS = ["t1_3b1b", "t2_keynote_ui", "t3_finance_chart", "y1_kurzgesagt", "y2_vox", "y3_whiteboard", "y4_storytime", "y5_kinetic_type"]

const browser = await chromium.launch({ headless: true })
for (const g of GRAMMARS) {
  const context = await browser.newContext({ viewport: { width: 720, height: 1280 } })
  const page = await context.newPage()
  const logs = []
  page.on("console", (m) => logs.push(`[console.${m.type()}] ${m.text().slice(0, 200)}`))
  page.on("pageerror", (e) => logs.push(`[pageerror] ${String(e).slice(0, 300)}`))
  await page.addInitScript(`window.CLIP_SPEC = ${JSON.stringify({ grammar: g, duration: 3, fps: 30, width: 720, height: 1280, theme: "paper", data: {}, cues: [] })};`)
  try {
    await page.goto(`http://127.0.0.1:${port}/clip.html?render=1`, { waitUntil: "load", timeout: 30000 })
    await page.waitForFunction("window.__ready === true || !!window.__bootFailed", undefined, { timeout: 30000 }).catch(() => {})
    const ready = await page.evaluate("window.__ready === true")
    const bootFailed = await page.evaluate("!!window.__bootFailed")
    const bootError = await page.evaluate("window.__bootError || ''")
    console.log(`${ready ? "✅" : "❌"} ${g}: ready=${ready} bootFailed=${bootFailed} err="${String(bootError).slice(0, 120)}"`)
    if (!ready && logs.length) console.log("   页面日志：\n   " + logs.slice(0, 6).join("\n   "))
  } catch (e) {
    console.log(`❌ ${g}: ${String(e).slice(0, 150)}`)
    console.log("   页面日志：\n   " + logs.slice(0, 6).join("\n   "))
  }
  await context.close()
}
await browser.close()
server.close()
process.exit(0)
