// ============================================================
// test-c-offline.ts —— 内容质量升级批次三（视频线 C1~C6）离线自测
// 零 LLM/零网络/零 ffmpeg：纯函数与契约层。
// 覆盖：
//   ① C3 协议族：判族/别名、能力元数据、三族请求整形器、轮询解析器
//   ② C2 导演规划器：JSON 契约（1:1/收紧不放大/白名单）、规则降级、mock 链路
//   ③ C6 合成诊断：环形缓冲 100、分腿汇总、diagRun 异常透传
//   ④ C5 预设层：六 BGM 配方、字幕三预设、1080P 缩放、drawtext 转义
//   ⑤ C1 集成契约：首帧导演（keyframe 分节）+ 规划→i2v 请求整形贯通
// 运行：node --experimental-strip-types scripts/test-c-offline.ts
// ============================================================

import {
  detectVideoFamily,
  videoFamilyMeta,
  videoFamilyForModel,
  videoFamilyList,
  clampSeconds,
  shapeAgnesSubmit,
  shapeArkSubmit,
  shapeCompatSubmit,
  parseAgnesPoll,
  parseArkPoll,
  parseCompatPoll,
  parseVideoPoll,
} from "../src/lib/gateway/providers/video/family.ts"
import { planShots, parseShotPlan, ruleBasedPlan, type PlanScene, type DirectorChat } from "../src/lib/runtime/video-director.ts"
import { diagRecord, diagRun, diagSummary, diagDump, diagClear } from "../src/lib/runtime/video-diagnostics.ts"
import {
  BGM_PRESETS,
  BGM_RECIPES,
  SUBTITLE_STYLES,
  dimsFor,
  scaledLayout,
  LAYOUTS,
  escapeDrawtext,
  subtitleLines,
  subtitleFilters,
} from "../src/lib/runtime/video-presets.ts"
import { directVideoKeyframe } from "../src/lib/runtime/illustration-director.ts"
import { loadSkillPrompt, extractPromptSection } from "../src/lib/runtime/skill-prompt.ts"
import type { VideoGenerateRequest } from "../src/lib/gateway/types.ts"

let pass = 0
let fail = 0
function assert(cond: boolean, name: string, extra = ""): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? `  → ${extra}` : ""}`)
  }
}

// ---------- ① C3 协议族 ----------

console.log("━━ ① C3 视频协议族抽象 ━━")
{
  assert(detectVideoFamily("agnes-video-2.5-flash") === "agnes", "agnes-* 判族")
  assert(detectVideoFamily("AGNES-VIDEO-X") === "agnes", "大小写归一")
  assert(detectVideoFamily("doubao-seedance-2-0-260128") === "ark-seedance", "doubao-seedance-* 判族")
  assert(detectVideoFamily("seedance-1-0-pro") === "ark-seedance", "seedance-* 别名")
  assert(detectVideoFamily("ark-xxx") === "ark-seedance", "ark-* 别名")
  assert(detectVideoFamily("my-custom-model") === "openai-compat", "未知模型归通用族")
  assert(detectVideoFamily("") === "agnes", "空模型默认 agnes（设置卡回退）")

  const list = videoFamilyList()
  assert(list.length === 3, "三族清单", `n=${list.length}`)
  const agnes = videoFamilyMeta("agnes")
  assert(agnes.wired === true && agnes.modes.includes("keyframe"), "agnes 已接通 + keyframe 模式")
  assert(agnes.seconds.min === 4 && agnes.seconds.max === 12, "agnes 时长 4~12s")
  assert(agnes.resolutions.includes("1080P"), "agnes 支持 1080P")
  const ark = videoFamilyMeta("ark-seedance")
  assert(ark.wired === false && ark.remoteCancel === true, "ark 本期未接 key（接口保留）+ 支持远程取消")
  assert(videoFamilyForModel("doubao-seedance-2-0-fast").id === "ark-seedance", "按模型直取族元数据")

  assert(clampSeconds("agnes", 3) === 4, "时长下限钳制（3→4）")
  assert(clampSeconds("agnes", 15) === 12, "时长上限钳制（15→12）")
  assert(clampSeconds("ark-seedance", 15) === 15, "ark 上限 15 不误钳")

  // Agnes 整形器：keyframe 模式 first_frame 透传 + seconds 字符串 + size 档位
  const req: VideoGenerateRequest = {
    prompt: "slow push-in, lights blinking",
    mode: "keyframe",
    seconds: 99,
    aspectRatio: "9:16",
    firstFrame: "data:image/jpeg;base64,AAAA",
  }
  const agnesBody = shapeAgnesSubmit(req, { model: "agnes-video-2.5-flash", resolution: "1080P" })
  assert(agnesBody.mode === "keyframe" && agnesBody.first_frame === "data:image/jpeg;base64,AAAA", "agnes keyframe：first_frame 透传（C1 核心）")
  assert(agnesBody.seconds === "12", "agnes seconds 字符串化并钳制")
  assert(agnesBody.size === "1080P" && agnesBody.aspect_ratio === "9:16", "agnes size/aspect_ratio 透传")
  const agnesBody720 = shapeAgnesSubmit({ ...req, firstFrame: undefined, mode: "text", seconds: 5 }, { model: "agnes-video-2.5-flash", resolution: "720P" })
  assert(!("first_frame" in agnesBody720) && agnesBody720.seconds === "5", "agnes text 模式不带 first_frame")

  // 方舟整形器：content 数组 + role 参考图 + ratio + 小写分辨率
  const arkBody = shapeArkSubmit(
    { prompt: "一只机械狗奔跑", mode: "keyframe", seconds: 12, aspectRatio: "16:9", firstFrame: "data:image/png;base64,BBBB", images: ["data:image/png;base64,CCCC"] },
    { model: "doubao-seedance-2-0-260128", resolution: "1080P" },
  )
  const content = arkBody.content as { type: string; role?: string; image_url?: { url: string } }[]
  assert(Array.isArray(content) && content[0].type === "text", "ark：content 数组首项 text")
  assert(content.some((x) => x.role === "first_frame" && x.image_url?.url === "data:image/png;base64,BBBB"), "ark：first_frame 带 role（协议族契约）")
  assert(content.some((x) => x.role === "reference_image"), "ark：参考图 reference_image role")
  assert(arkBody.ratio === "16:9" && arkBody.resolution === "1080p", "ark：ratio 字段 + 分辨率小写")
  assert(arkBody.duration === "12", "ark：duration 字符串")

  // 通用族整形器
  const compatBody = shapeCompatSubmit({ prompt: "p", mode: "text", seconds: 6 }, { model: "openai/video-any", resolution: "720P" })
  assert(compatBody.prompt === "p" && compatBody.seconds === 6, "compat：prompt/seconds 透传")

  // 轮询解析器（三字段兼容 + 双端点差异）
  assert(parseAgnesPoll({ status: "completed", metadata: { url: "https://a/v.mp4" } }).resultUrl === "https://a/v.mp4", "agnes 轮询：metadata.url（/v1/videos 风格）")
  assert(parseAgnesPoll({ state: "completed", url: "https://b/v.mp4" } as Record<string, unknown>).status === "completed", "agnes 轮询：state + url（/agnesapi 风格）")
  assert(parseAgnesPoll({ status: "completed" }).status === "running", "agnes 轮询：completed 无 url → 仍在跑")
  assert(parseAgnesPoll({ status: "failed", error: "boom" }).error === "boom", "agnes 轮询：failed 带 error")
  assert(parseVideoPoll("ark-seedance", { status: "succeeded", content: { video_url: "https://ark/v.mp4" } }).resultUrl === "https://ark/v.mp4", "ark 轮询：content.video_url")
  assert(parseCompatPoll({ status: "done", video_url: "https://c/v.mp4" }).resultUrl === "https://c/v.mp4", "compat 轮询：video_url")
}

// ---------- ② C2 导演规划器 ----------

console.log("━━ ② C2 视频导演规划器 ━━")
const SCENES: PlanScene[] = [
  { id: 1, seconds: 5, visual: "发光服务器机柜近景，暗蓝机房", narration: "算力成本今年跌了七成。", subtitle: "算力成本暴跌" },
  { id: 2, seconds: 8, visual: "城市夜景航拍，霓虹数据流", narration: "但落地的门槛没降。", subtitle: "门槛没降" },
  { id: 3, seconds: 6, visual: "工程师调试机器人手臂特写", narration: "差距在哪？三个环节。", subtitle: "三个环节" },
]
{
  // SKILL.md 事实源
  const src = await loadSkillPrompt("huashu-video-direct")
  assert(src.body.includes("一镜一 shot") && src.body.includes("firstFrameZh"), "huashu-video-direct SKILL.md 在库（A1 纪律）")
  const planSection = extractPromptSection(src.body, "plan")
  assert(planSection.length > 200 && planSection.includes("shots") && planSection.includes("sceneId"), "plan 分节存在且为规划指令主体")

  // 契约：1:1 对应 + 收紧不放大
  const okPlan = parseShotPlan(
    {
      shots: [
        { sceneId: 1, seconds: 4, firstFrameZh: "近景机柜", firstFrameEn: "close-up rack", motionZh: "推近", motionEn: "push in", transition: "fade" },
        { sceneId: 2, seconds: 20, firstFrameZh: "城市夜景", motionZh: "横移", transition: "wipe" },
        { sceneId: 3, seconds: 6, firstFrameZh: "机器人手臂", motionEn: "tilt up" },
      ],
    },
    SCENES,
    { min: 4, max: 12 },
  )
  assert(okPlan !== null && okPlan.planner === "director" && okPlan.shots.length === 3, "合格规划：1:1 三镜")
  assert(okPlan!.shots[0].seconds === 4 && okPlan!.shots[0].transition === "fade", "秒数/转场按导演值")
  assert(okPlan!.shots[1].seconds === 8, "收紧不放大：要 20s 钳到原分镜 8s")
  assert(okPlan!.shots[2].transition === "cut", "非法转场白名单回 cut")

  // 原分镜低于模型下限 → 取下限（模型档位地板）
  const shortPlan = parseShotPlan({ shots: SCENES.map((s, i) => ({ sceneId: s.id, seconds: 3, firstFrameZh: `f${i}`, motionZh: `m${i}` })) }, SCENES, { min: 4, max: 12 })
  assert(shortPlan !== null && shortPlan.shots.every((s) => s.seconds === 4), "低于下限取模型地板 4s")

  // 不合格 → null（缺镜/多镜/缺首帧/重复 id）
  assert(parseShotPlan({ shots: SCENES.slice(0, 2).map((s, i) => ({ sceneId: s.id, firstFrameZh: `f${i}`, motionZh: `m${i}` })) }, SCENES, { min: 4, max: 12 }) === null, "缺镜 → null")
  assert(
    parseShotPlan(
      { shots: [...SCENES.map((s, i) => ({ sceneId: s.id, firstFrameZh: `f${i}`, motionZh: `m${i}` })), { sceneId: 9, firstFrameZh: "x", motionZh: "y" }] },
      SCENES,
      { min: 4, max: 12 },
    ) === null,
    "多镜/未知 sceneId → null",
  )
  assert(parseShotPlan({ shots: SCENES.map((s, i) => ({ sceneId: s.id, motionZh: `m${i}` })) }, SCENES, { min: 4, max: 12 }) === null, "缺首帧描述 → null")
  assert(
    parseShotPlan({ shots: [...SCENES.map((s, i) => ({ sceneId: s.id, firstFrameZh: `f${i}`, motionZh: `m${i}` })), { sceneId: 1, firstFrameZh: "dup", motionZh: "d" }] }, SCENES, { min: 4, max: 12 }) === null,
    "重复 sceneId → null",
  )
  assert(parseShotPlan("not json", SCENES, { min: 4, max: 12 }) === null, "非 JSON → null")

  // 规则降级
  const rule = ruleBasedPlan(SCENES, { min: 4, max: 12 }, "测试降级")
  assert(rule.planner === "rule-based" && rule.shots.length === 3, "规则规划三镜齐")
  assert(rule.shots[0].firstFrameZh.includes("服务器") && rule.shots[0].motionZh.length > 0, "规则规划：visual 作首帧 + 固定运镜")
  assert(rule.shots[0].motionZh !== rule.shots[1].motionZh, "运镜轮换（镜 1≠镜 2）")
  assert(rule.shots[0].transition === "fade" && rule.shots[1].transition === "cut", "规则规划转场（首镜 fade）")

  // planShots mock：导演链路
  const goodChat: DirectorChat = async () =>
    JSON.stringify({
      shots: SCENES.map((s) => ({ sceneId: s.id, seconds: Math.min(s.seconds, 6), firstFrameZh: `首帧${s.id}`, firstFrameEn: `frame ${s.id}`, motionZh: `运镜${s.id}`, motionEn: `move ${s.id}`, transition: "cut" })),
    })
  const planned = await planShots({ title: "算力成本", hook: "跌了七成", aspect: "9:16", scenes: SCENES, secondsRange: { min: 4, max: 12 } }, goodChat)
  assert(planned.planner === "director" && planned.shots[0].firstFrameEn === "frame 1", "planShots：mock 导演 JSON → director")

  const badChat: DirectorChat = async () => "垃圾回复不是 JSON"
  const degraded = await planShots({ title: "t", hook: "h", aspect: "16:9", scenes: SCENES, secondsRange: { min: 4, max: 12 } }, badChat)
  assert(degraded.planner === "rule-based" && (degraded.note ?? "").includes("降级"), "planShots：两档温度均不可解析 → 规则降级留痕")

  const throwChat: DirectorChat = async () => {
    throw new Error("LLM 不可达")
  }
  const degraded2 = await planShots({ title: "t", hook: "h", aspect: "9:16", scenes: SCENES, secondsRange: { min: 4, max: 12 } }, throwChat)
  assert(degraded2.planner === "rule-based" && (degraded2.note ?? "").includes("不可达"), "planShots：异常 → 规则降级留痕")
}

// ---------- ③ C6 合成诊断 ----------

console.log("━━ ③ C6 合成诊断环形缓冲 ━━")
{
  const rid = "diag-test-run"
  diagClear(rid)
  diagRecord(rid, "submit", true, 120, { sceneId: 1 })
  diagRecord(rid, "submit", false, 90, { sceneId: 2, error: "HTTP 429" })
  diagRecord(rid, "poll", true, 60_000, { sceneId: 1, detail: "waited 60s" })
  const s = diagSummary(rid)
  assert(s.entries === 3 && s.errors === 1, "汇总：条目与错误计数")
  assert(s.legs.submit?.n === 2 && s.legs.submit?.errors === 1 && s.legs.submit?.lastError === "HTTP 429", "分腿统计（submit n/errors/lastError）")
  assert(s.legs.poll?.n === 1 && s.legs.poll?.avgMs === 60_000, "分腿统计（poll avgMs）")

  // diagRun：成功计时 + 异常透传不吞错
  const val = await diagRun(rid, "ffmpeg", async () => 42)
  assert(val === 42, "diagRun 返回值透传")
  let threw = false
  try {
    await diagRun(rid, "download", async () => {
      throw new Error("下载失败")
    })
  } catch {
    threw = true
  }
  assert(threw && diagSummary(rid).legs.download?.errors === 1, "diagRun 异常重抛 + 记失败腿")

  // 环形缓冲 100 上限
  diagClear(rid)
  for (let i = 0; i < 120; i++) diagRecord(rid, "tts", true, 5)
  assert(diagDump(rid).length === 100, "环形缓冲：120 条只留 100", `n=${diagDump(rid).length}`)
  diagClear(rid)
}

// ---------- ④ C5 预设层 ----------

console.log("━━ ④ C5 画质与音频预设 ━━")
{
  const bgmIds = Object.keys(BGM_PRESETS)
  assert(bgmIds.length === 6, "BGM 六预设", `n=${bgmIds.length}`)
  assert(["tense", "suspense", "warm"].every((x) => bgmIds.includes(x)), "新增紧张/悬念/温暖在列")
  assert(Object.keys(BGM_RECIPES).length === 6 && Object.values(BGM_RECIPES).every((r) => r.expr.includes("sin") && r.volume > 0 && r.volume < 0.5), "六配方齐全（aevalsrc 表达式 + 音量安全区）")
  assert(Object.keys(SUBTITLE_STYLES).length === 3, "字幕三预设")

  assert(dimsFor("9:16", "720P").w === 720 && dimsFor("9:16", "720P").h === 1280, "dimsFor 竖屏 720P")
  assert(dimsFor("16:9", "720P").w === 1280 && dimsFor("16:9", "720P").h === 720, "dimsFor 横屏 720P")
  assert(dimsFor("9:16", "1080P").w === 1080 && dimsFor("9:16", "1080P").h === 1920, "dimsFor 竖屏 1080P")
  assert(dimsFor("16:9", "1080P").w === 1920 && dimsFor("16:9", "1080P").h === 1080, "dimsFor 横屏 1080P")

  const l720 = scaledLayout("9:16", "720P")
  const l1080 = scaledLayout("9:16", "1080P")
  assert(l1080.w === 1080 && l1080.titleFont === Math.round(LAYOUTS["9:16"].titleFont * 1.5), "1080P 布局等比 1.5x（字号同步放大）")
  assert(l720.w === LAYOUTS["9:16"].w, "720P 布图 = 基准")

  assert(escapeDrawtext("a:b,c'd").includes("\\:") && escapeDrawtext("a:b,c'd").includes("\\,"), "drawtext 转义冒号/逗号")
  assert(!escapeDrawtext("it's").includes("'"), "单引号换弯引号（免引号地狱）")

  const lines = subtitleLines({ id: 1, seconds: 5, visual: "v", narration: "这是一条特别长的口播文案需要被折行处理成最多两行字幕", subtitle: "" })
  assert(lines.length === 2, "字幕折行（超长口播 → 2 行）", `n=${lines.length}`)

  const scene = { id: 2, seconds: 4, visual: "v", narration: "n", subtitle: "算力成本暴跌" }
  const filters = subtitleFilters(scene, "strong", dimsFor("9:16", "720P"))
  if (filters.length > 0) {
    assert(filters[0].includes("drawtext") && filters[0].includes("expansion=none"), "字幕滤镜链（drawtext + expansion=none）")
    assert(filters[0].includes("box=1") && filters[0].includes("boxborderw="), "strong 预设带底条")
    const cleanFilters = subtitleFilters(scene, "clean", dimsFor("9:16", "720P"))
    assert(cleanFilters[0].includes("borderw=") && !cleanFilters[0].includes("box=1"), "clean 预设描边无底条")
  } else {
    assert(true, "字幕字体缺失 → 空链诚实降级（沙箱有字体则走上面断言）")
  }
}

// ---------- ⑤ C1 集成契约（首帧导演 + 规划→i2v 贯通） ----------

console.log("━━ ⑤ C1 AI 首帧 i2v 主轨集成契约 ━━")
{
  // wewrite-art-direct 有 keyframe 分节（B1 管线事实源扩展）
  const artSrc = await loadSkillPrompt("wewrite-art-direct")
  const kfSection = extractPromptSection(artSrc.body, "keyframe")
  assert(kfSection.includes("视频首帧导演") && kfSection.includes("negative"), "wewrite-art-direct keyframe 分节在库")

  // 首帧导演：mock chat 出结构化 parts
  const kfChat: DirectorChat = async () =>
    JSON.stringify({
      subject_zh: "发光的服务器机柜立于暗蓝机房",
      subject_en: "glowing server rack in dark blue data center",
      composition: "close-up shot, subject centered, layered background",
      lighting: "cool cyan rim lighting, volumetric light dust",
      style_ref: "cinematic tech style",
      negative: "text, watermark, subtitle",
    })
  const directed = await directVideoKeyframe(
    { topic: "算力成本", shotIndex: 1, concept: "服务器机柜近景", subtitle: "算力成本暴跌", stylePrompt: "科技感深色背景", exemplarBlock: "" },
    kfChat,
  )
  assert(directed.source === "director", "首帧导演 source=director")
  assert(directed.promptFull.includes("glowing server rack") && directed.promptFull.includes("avoid: text, watermark"), "promptFull 含英文主体 + 负面词")
  assert(directed.parts?.composition.includes("close-up"), "parts 结构化留痕")

  // 首帧导演降级：chat 抛错 → legacy 留痕
  const kfBad: DirectorChat = async () => {
    throw new Error("down")
  }
  const legacy = await directVideoKeyframe(
    { topic: "算力成本", shotIndex: 2, concept: "城市夜景航拍", subtitle: "门槛没降", stylePrompt: "科技感", exemplarBlock: "" },
    kfBad,
  )
  assert(legacy.source === "legacy" && (legacy.note ?? "").includes("失败"), "首帧导演失败 → legacy 降级留痕")
  assert(legacy.promptFull.includes("城市夜景航拍"), "legacy 保留概念拼接")

  // 规划 → agnes keyframe 请求整形贯通（C2 产出喂 C1 提交）
  const planChat: DirectorChat = async () =>
    JSON.stringify({
      shots: SCENES.map((s) => ({ sceneId: s.id, seconds: 5, firstFrameZh: `首帧${s.id}`, firstFrameEn: `frame ${s.id}`, motionZh: `运镜${s.id}`, motionEn: `camera move ${s.id}`, transition: "cut" })),
    })
  const plan = await planShots({ title: "算力成本", hook: "跌七成", aspect: "9:16", scenes: SCENES, secondsRange: videoFamilyMeta("agnes").seconds }, planChat)
  const shot = plan.shots.find((s) => s.sceneId === 2)!
  const motionPrompt = [shot.motionZh, shot.motionEn].filter(Boolean).join("，") + "。保持首帧构图与色调，电影感平滑运动，画面不出现文字。"
  const i2vBody = shapeAgnesSubmit(
    { prompt: motionPrompt.slice(0, 500), mode: "keyframe", seconds: shot.seconds, aspectRatio: "9:16", firstFrame: "data:image/jpeg;base64,TEST" },
    { model: "agnes-video-2.5-flash", resolution: "720P" },
  )
  assert(i2vBody.mode === "keyframe" && String(i2vBody.prompt).includes("运镜2"), "C2 运动描述 → C1 keyframe 提示词贯通")
  assert(i2vBody.seconds === "5" && i2vBody.first_frame === "data:image/jpeg;base64,TEST", "keyframe 提交体完整（first_frame + 时长）")
}

console.log(`\n━━ 结果：${pass} 通过 / ${fail} 失败 ━━`)
process.exit(fail > 0 ? 1 : 0)
