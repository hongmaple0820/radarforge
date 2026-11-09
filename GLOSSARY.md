# GLOSSARY — RadarForge 领域词汇表（双语）

> 单语境布局（仓库根一份）。代码中英混排是既成事实：本表让「中文说法 ↔ 代码标识符」一查即中。
> 消费规则见 `docs/agents/domain.md`；新增术语先查本表，缺了再补（domain-modeling 纪律）。
> 采纳日期：2026-11-09（批次 S1）；锚点均为真实代码位置。

## 数据模型（prisma/schema.prisma）

| 中文 | English | 一句定义 | 代码锚点 |
| --- | --- | --- | --- |
| 话题 | Topic | 情报侧的追踪主题，聚合报告与断言 | `prisma/schema.prisma` model Topic |
| 报告 | Report | 围绕话题的研究产出（供选题消费） | model Report |
| 断言 | Claim | 从报告提取的可验证事实句（FACT/REF/ASSERT 三类） | model Claim；`src/lib/runtime/run-manager.ts` |
| 订阅源 / 条目 | SourceFeed / FeedItem | RSS 等外部情报源与其抓取条目 | model SourceFeed、FeedItem |
| 选题 | Idea | 从情报到文章的中间产物：方向卡 + 证据可得性评估 | model Idea；`run-manager.ts` db.idea |
| 文章 | Article | 最终发布的成稿 | model Article |
| 运行 | AgentRun | 一次内容生产任务的执行记录（kind/status/stage/lengthTier） | model AgentRun；`src/lib/runtime/run-manager.ts` |
| 资产 | Asset | 产物文件记录（图片/视频/分段等，meta 留痕） | model Asset |
| 审阅记录 | ReviewRecord | 编辑对成稿的审阅意见 | model ReviewRecord |
| 学习规则 | LearningRule | 编辑飞轮沉淀的稳定写作规则（active 状态注入提示词） | model LearningRule；`radar-learn.ts` |
| 设置键值 | SettingKV | 设置中心的键值存储（含服务商密钥；库文件 gitignored） | model SettingKV；`src/lib/settings.ts` |
| 服务商档案 | ProviderRecord | 外部模型服务商的账号/端点档案 | model ProviderRecord |

## 内容管线（文章线 + 配图线）

| 中文 | English | 一句定义 | 代码锚点 |
| --- | --- | --- | --- |
| 篇幅三档 | Length Tier | short 1200~2000 / medium 2500~4000（默认）/ deep 4500~8000；逐节 ±容差 + inBand 诚实留痕 | `src/lib/runtime/length-tier.ts`（DEFAULT_TIER="medium"）；ADR-0001 |
| 叙事骨架 | Narrative Skeleton | 五种：pyramid / timeline / problem-solution / versus / scene-narrative；runId 哈希轮换 + 可显式指定 | `src/lib/runtime/narrative-skeletons.ts` |
| 证据锚点 | Evidence Anchor | 正文每段须挂的可验证事实引用（来自 Claim/metrics，禁编造） | `db/skills/wewrite-draft/SKILL.md` |
| 编辑飞轮 | Learning Flywheel | 审阅 → LearningRule → 下轮 outline/draft 提示词注入的反馈闭环 | `radar-learn.ts`；`radar-write.ts` rules 注入 |
| 流水线技能 | Pipeline Skill | 产线提示词的 SKILL.md 载体，共八个、不可停用：wewrite-brief / outline / draft / review / fact-check / illustrate / art-direct + huashu-video-direct | `src/lib/runtime/skill-prompt.ts` PIPELINE_SKILL_IDS；ADR-0007 |
| 导演（配图/首帧） | Director | 提示词工程层：B1 配图导演与视频首帧导演，中英双语结构化 prompt，失败 legacy 降级留痕 | `src/lib/runtime/illustration-director.ts`、`video-director.ts` |
| 风格包 | Style Pack | 八款视觉风格（编辑摄影/新水墨/玻璃拟态等），文章配图与视频首帧同源保视觉统一 | `src/lib/runtime/skills/radar-image.ts`（getImageStyle） |
| 模板库 | Prompt Library | 8 源 3774 条中英双语生图提示词，带署名检索式使用（bigram/拉丁双通道四字段加权） | `src/lib/runtime/prompt-library.ts`；ADR-0003 |
| 版式卡 | Layout Card | 代码排版产物：封面卡/金句卡/数据卡三类（Playwright 渲染，零错字） | `src/lib/runtime/card-engine.ts` |
| 数据卡职责分离 | kind=data | 硬数据节一律走 card-engine 代码排版，metrics 只来自真实字段禁编造 | `run-manager.ts`（B6）；card-engine.ts |
| 三通道回退链 | Image Fallback Chain | 生图链路：主通道（custom/builtin）→ agnes-image → SDK 兜底；每级失败留痕，降级不消失 | `src/lib/gateway/providers/zai-image.ts` |

## 视频线

| 中文 | English | 一句定义 | 代码锚点 |
| --- | --- | --- | --- |
| 分镜 | Storyboard | 视频的分镜脚本（visual/narration/subtitle/seconds） | `src/lib/runtime/video.ts`、`db/skills/huashu-storyboard/` |
| 首帧 | Keyframe | i2v 分镜的起始画面，B1 导演 → 三通道生图 → VLM 审帧（B3），预览可缓存复用 | `video.ts`（kf- 文件、keyframes[]） |
| i2v | Image-to-Video | 图生视频：提交（mode/size:"720P"）→ 轮询 → 下载 → 入片 | `src/lib/gateway/providers/agnes/agnes-video.ts`；ADR-0006 |
| 视频通道 | VideoChannel | local / agnes / auto（默认）/ hybrid 四值；auto=Agnes 优先失败回退 local | `src/lib/runtime/video.ts:63`；ADR-0002 |
| 音频模式 | audioMode | pending / tts / partial / muted 四态，全镜口播完成才记 tts | `video.ts:115` |
| 诊断分腿 | Diag Leg | submit / poll / download 等环节分腿统计（n/errors/avgMs），环形缓冲 + Asset.meta 留痕 | `src/lib/runtime/video-diagnostics.ts` |
| Agnes 账号池 | Agnes Pool | 多账号池化调度：round-robin / least-loaded + RPM 滑窗 + 连续 429/401 熔断 30s | `src/lib/gateway/providers/agnes/pool.ts`；ADR-0004 |
| 槽位记账 | Video Slot | acquireVideoSlot 预记 busy 60s；失败提交必须 releaseVideoSlot 释放，否则自锁 | `pool.ts`；ADR-0006 |
| 换号重试 | Account Rotation | 429/503/5xx 按账号隔离换号重试（≤活跃账号数/轮 × 3 轮，轮间节流 8s）；401/403 认证类直报 | `agnes-video.ts` submitVideo；ADR-0006 |
| 错峰 | Off-peak | 免费档视频队列时段规律：周末全天满载 503，工作日上午空闲可提交 | 实测规律；worklog 2026-11-07~09 |

## 工作流（L1 层，2026-11-09 起）

| 中文 | English | 一句定义 | 代码锚点 |
| --- | --- | --- | --- |
| 票 | Ticket / Issue | `.scratch/<feature>/issues/NN-<slug>.md` 一票一文件的工作单元 | `docs/agents/issue-tracker.md` |
| 规范 | Spec | 拍板后落 `docs/<feature>-plan.md` 的实施方案（模板固定） | `docs/agents/spec-template.md` |
| 垂直切片 | Tracer Bullet | 每票贯穿全栈的最小可验切片（非按层拆分） | 源技能 `skills/engineering/to-tickets/` |
| 阻塞边 | Blocking Edges | 票头 `Blocked by: NN, NN` 声明，全部 resolved 才解锁 | `docs/agents/issue-tracker.md` |
| 前沿轮次 | Frontier Round | 采访纪律：事实类 agent 查证、决策类用户拍板，一次一轮带推荐答案 | 源技能 `skills/productivity/grilling/` |
| 红线命令 | Red-line Command | 修 bug 前先立的一条「能在本 bug 上变红」的命令，修完转绿 | `docs/agents/coding-standards.md`；源技能 `diagnosing-bugs/` |
| 双轴评审 | Two-axis Review | Standards 轴（编码标准+smell 基线）与 Spec 轴（规范/票）分开报告 | 源技能 `skills/engineering/code-review/` |
| 诚实降级 | Honest Degradation | 所有失败显式降级 + 标注来源，禁止静默吞错（全局哲学） | `docs/agents/coding-standards.md` |
| 会话交接 | Handoff | 跨会话/跨 harness 的交接文档（引用不复制） | 源技能 `skills/productivity/handoff/` |
