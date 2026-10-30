// y4 管线级 E2E：叙事型分镜 → art 渲染 → 观察 LLM 是否选 y4 + 全片完成
const BASE = "http://localhost:3000"
const RUN = "8b833532-f4b0-4ccb-b77a-443765a6dd01"
const sb = {
  title: "程序员吐槽：AI 写代码把我整不会了",
  hook: "那天我让 AI 帮我写个爬虫，它给了我 3000 行",
  totalSeconds: 24,
  scenes: [
    { id: 1, seconds: 4, visual: "机器人对镜头讲故事（storytime 叙事）", narration: "那天我让 AI 帮我写个爬虫，你们猜它给了我什么？", subtitle: "AI 写爬虫", broll: "" },
    { id: 2, seconds: 4, visual: "插入电脑屏幕特写，代码墙滚动，大字砸出", narration: "三千行！三百行我都要看半天，三千行我直接石化", subtitle: "3000 行代码", broll: "" },
    { id: 3, seconds: 4, visual: "反应特写：机器人惊呆冒汗", narration: "我盯着屏幕看了十分钟，一行都没看懂", subtitle: "当场石化", broll: "" },
    { id: 4, seconds: 4, visual: "机器人摊手吐槽（叙事）", narration: "最离谱的是它还写了一堆注释，解释它自己都看不懂的逻辑", subtitle: "注释比代码长", broll: "" },
    { id: 5, seconds: 4, visual: "机器人指着屏幕苦笑", narration: "所以说 AI 取代程序员？先把这三个千行爬虫维护明白再说吧", subtitle: "取代还早", broll: "" },
    { id: 6, seconds: 4, visual: "机器人耸肩收尾", narration: "关注我，下期讲我怎么让 AI 自己 debug 自己的代码", subtitle: "下期更炸", broll: "" },
  ],
  bgm: "none", caption: "AI 写代码的离谱日常",
}
const res = await fetch(`${BASE}/api/runs/${RUN}/actions`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "render-video", storyboard: sb, voice: "xiaochen", aspect: "9:16", style: "art", channel: "local" }) })
const j = await res.json()
console.log("POST:", res.status, j.message ?? j.error)
for (let i = 0; i < 110; i++) {
  await new Promise(r => setTimeout(r, 4000))
  const rj = await fetch(`${BASE}/api/runs/${RUN}`).then(r => r.json())
  const vas = (rj.run?.assets ?? []).filter(a => a.role === "video-final")
  const va = vas[vas.length - 1]
  if (!va) continue
  const m = JSON.parse(va.meta || "{}")
  if (["done", "error"].includes(m.stage)) {
    console.log("stage:", m.stage, "| seconds:", m.seconds, "| size:", (m.sizeBytes/1048576).toFixed(1) + "MB")
    console.log("最后分镜 aiNote:", m.aiNote)
    if (m.error) console.log("error:", m.error.slice(0, 200))
    if (m.stage === "done" && va.path) {
      const head = await fetch(`${BASE}${va.path}`, { method: "HEAD" })
      console.log("HEAD:", head.status, head.headers.get("content-type"))
    }
    break
  }
  if (i % 8 === 0) console.log("poll…", m.stage, m.percent + "%", m.aiNote?.slice(0, 50) ?? "")
}
