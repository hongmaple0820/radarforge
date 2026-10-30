// test-y4-render.ts —— y4 故事帧库端到端验证
// 用与管线完全一致的注入方式（Y4_CHARACTER_FRAMES）渲染一段 y4 clip + 三张静帧
// 覆盖：普通房间场景（title/point 嘴部动画）、highlight、react 反应特写、insert 插入镜头（后脑勺前景）
import { renderArtClip, renderArtStill, Y4_CHARACTER_FRAMES, type ArtClipSpec } from "../src/lib/runtime/art-engine"
import { mkdir, writeFile } from "fs/promises"

const OUT = "download/y4-test"
await mkdir(OUT, { recursive: true })

const spec: ArtClipSpec = {
  grammar: "y4_storytime",
  duration: 7,
  fps: 30,
  width: 720,
  height: 1280,
  theme: "paper",
  data: { character: { frames: Y4_CHARACTER_FRAMES } },
  cues: [
    { at: 0.4, kind: "title", text: "AI 圈这周炸了三件事", sub: "炸了三件事" },
    { at: 2.0, kind: "point", text: "第一件：新模型跑分碾压", sub: "跑分碾压", data: { pose: "point" } },
    { at: 3.2, kind: "highlight" },
    { at: 4.2, kind: "react", dur: 1.2 },
    { at: 5.6, kind: "insert", text: "3000行", sub: "帮我写个爬虫", dur: 1.4, data: { count: 3000, unit: "行" } },
  ],
}

console.log("== 渲染 7s y4 clip（含全部 5 种 cue）==")
const { seconds, sizeBytes } = await renderArtClip(spec, `${OUT}/y4-clip.mp4`)
console.log(`✓ MP4：${seconds}s，${(sizeBytes / 1024).toFixed(0)}KB → ${OUT}/y4-clip.mp4`)

console.log("== 静帧抽查 ==")
const stills: [string, number][] = [
  ["still-room.png", 1.2], // 房间 + 角色说话（嘴部动画）
  ["still-point.png", 2.6], // point 姿势 + 气泡
  ["still-react.png", 4.8], // react 反应特写
  ["still-insert.png", 6.6], // insert 插入镜头（代码墙 + 大字 + 后脑勺前景）
]
for (const [name, t] of stills) {
  const buf = await renderArtStill(spec, t)
  await writeFile(`${OUT}/${name}`, buf)
  console.log(`✓ ${name}（t=${t}s，${(buf.length / 1024).toFixed(0)}KB）`)
}
console.log("全部完成")
