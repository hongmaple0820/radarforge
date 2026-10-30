// ============================================================
// gen-y4-frames.mjs —— y4 故事帧库生成（zai-image）
// 1 张基础帧（rest，文生图）+ 10 张姿势/口型帧（图生图编辑，保持角色一致性）
// 原始图统一纯白底 → scripts/y4-frames-raw/<name>.png
// 之后再由 scripts/process-y4-frames.py 抠透明底并标准化
// 用法：bun scripts/gen-y4-frames.mjs [name ...]（可只重生成指定帧；已存在的跳过，可断点续跑）
// ============================================================
import ZAI from "z-ai-web-dev-sdk"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"

const RAW = "scripts/y4-frames-raw"
mkdirSync(RAW, { recursive: true })
const SIZE = "864x1152" // 3:4 竖版，全身站立

// 角色设定（所有帧共用，保证一致性）：
// 圆滚滚的小机器人 · 浅蓝紫机身 · 深藏青粗描边 · 深色屏脸圆眼 · 橙色围巾 · 扁平矢量插画风
const STYLE = "扁平矢量卡通插画风格：一个圆滚滚的可爱小机器人，浅蓝紫色哑光机身，深藏青色均匀粗描边，头顶一根圆润小天线，脸是一块深色圆角屏幕显示两只圆圆的亮青色眼睛，脖子系一条橙色小围巾，短胳膊短腿，脚踩平底短靴，全身完整可见"
const BG = "纯白色背景（#FFFFFF），无阴影、无地面投影、无渐变、无文字、无装饰元素，角色居中，双脚并拢站在画面底部，构图干净"

const BASE_PROMPT = `${STYLE}，站立姿势：双臂自然垂在身体两侧，双手放松，脸上是小微笑（嘴巴闭合）。${BG}，高质量，角色设定图`

// 10 张衍生帧：全部从 rest 编辑而来（保持同一角色）
const EDITS = {
  rest_open: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做一个改变：脸上的嘴巴张开成圆形（说话张嘴帧），眼睛不变",
  talk: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做一个改变：右臂抬起在胸前做讲解手势（前臂抬起、掌心向上），嘴巴微张，其余不变",
  talk_open: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做两个改变：右臂抬起在胸前做讲解手势（掌心向上），嘴巴张大呈圆形（说话张嘴帧）",
  point: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做一个改变：右臂伸直向上高高举起、食指指向上方，表情自信，嘴巴闭合",
  point_open: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做两个改变：右臂伸直向上举起、食指指向上方，嘴巴张开呈圆形（说话张嘴帧）",
  shrug: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做一个改变：双臂向两侧上方摊开耸肩、双掌朝上，眉毛上挑，嘴巴抿成微微担忧的弧线",
  type: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做一个改变：双臂向前伸出在身前半空中打字（手指微曲像在敲看不见的键盘），身体微微前倾，眼睛看向下方",
  stiff: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做一个改变：双臂笔直贴在身体两侧、站得僵直，眼睛瞪大发直，嘴巴变成一条短横线（呆住的表情）",
  react: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做一个改变：惊讶表情——眼睛瞪到最大、嘴巴微张成小 O 形、身体微微后仰",
  back: "保持角色设计、配色、描边、画风、纯白背景与构图完全一致，只做一个改变：角色完全转过身去呈现背面视图——只见后脑勺、背部、小天线和背后的围巾结，不露出正脸",
}

const only = process.argv.slice(2) // 可指定只跑某些帧

async function genImage(zai, prompt) {
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await zai.images.generations.create({ prompt: prompt.slice(0, 500), size: SIZE })
      const b64 = res?.data?.[0]?.base64
      if (!b64) throw new Error("空返回")
      return Buffer.from(b64, "base64")
    } catch (e) {
      lastErr = e
      console.error(`    尝试 ${attempt} 失败：${String(e?.message ?? e).slice(0, 120)}`)
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
  throw lastErr
}

async function editImage(zai, dataUrl, prompt) {
  let lastErr
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await zai.images.generations.edit({ prompt: prompt.slice(0, 500), images: [{ url: dataUrl }], size: SIZE })
      const b64 = res?.data?.[0]?.base64
      if (!b64) throw new Error("空返回")
      return Buffer.from(b64, "base64")
    } catch (e) {
      lastErr = e
      console.error(`    尝试 ${attempt} 失败：${String(e?.message ?? e).slice(0, 120)}`)
      await new Promise((r) => setTimeout(r, 3000 * attempt))
    }
  }
  throw lastErr
}

const zai = await ZAI.create()

// ---- 基础帧 rest（文生图）----
if (!only.length || only.includes("rest")) {
  if (existsSync(`${RAW}/rest.png`)) {
    console.log("跳过 rest（已存在）")
  } else {
    console.log("生成基础帧 rest …")
    const buf = await genImage(zai, BASE_PROMPT)
    writeFileSync(`${RAW}/rest.png`, buf)
    console.log(`  ✓ rest.png（${(buf.length / 1024).toFixed(0)}KB）`)
  }
}

// ---- 衍生帧（图生图编辑）----
const restBuf = readFileSync(`${RAW}/rest.png`)
const restUrl = `data:image/png;base64,${restBuf.toString("base64")}`

for (const [name, prompt] of Object.entries(EDITS)) {
  if (only.length && !only.includes(name)) continue
  if (existsSync(`${RAW}/${name}.png`)) {
    console.log(`跳过 ${name}（已存在）`)
    continue
  }
  console.log(`编辑 ${name} …`)
  const buf = await editImage(zai, restUrl, prompt)
  writeFileSync(`${RAW}/${name}.png`, buf)
  console.log(`  ✓ ${name}.png（${(buf.length / 1024).toFixed(0)}KB）`)
}

console.log("全部完成：原始帧已就绪，待 process-y4-frames.py 抠透明底")
