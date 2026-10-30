import ZAI from "z-ai-web-dev-sdk"
import fs from "fs"
const zai = await ZAI.create()
const checks: { f: string; q: string }[] = [
  { f: "still-room.png", q: "这是动画一帧：应有小房间背景（墙/窗/书架）+ 一个浅蓝紫色卡通小机器人站着对镜头，头上有对话气泡吗？机器人外观描述一句。有无明显渲染破损（黑块/花屏/角色缺块）？" },
  { f: "still-point.png", q: "这是动画一帧：机器人应是举手指向上的姿势，头旁有对话气泡写着字吗？有无明显渲染破损？" },
  { f: "still-react.png", q: "这是动画一帧：应是机器人的大特写（反应镜头，占满画面），带汗滴或惊讶表情吗？有无明显渲染破损？" },
  { f: "still-insert.png", q: "这是动画一帧：应是电脑屏幕特写（插入镜头）：屏幕上滚动的代码色块/聊天气泡，画面下方或角落砸出大字（如 3000行），前景有机器人后脑勺剪影吗？有无明显渲染破损？" },
]
for (const { f, q } of checks) {
  const b64 = fs.readFileSync(`download/y4-test/${f}`).toString("base64")
  const res = await zai.chat.completions.createVision({
    messages: [{ role: "user", content: [{ type: "text", text: q }, { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } }] }],
    thinking: { type: "disabled" },
  })
  console.log(`===== ${f} =====`)
  console.log(res.choices[0]?.message?.content?.trim().slice(0, 400))
}
