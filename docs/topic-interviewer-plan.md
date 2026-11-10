# 选题采访器（topic-interviewer）方案

> 状态：已拍板（决策点见 §5，拍板记录同节末；依据开工令「继续推进」+ 用户既有「按推荐建议来」模式，全按选项 A 采纳、可翻案）
> 日期：2026-11-10 · 作者：主 Agent（Z.ai）
> 姊妹篇：`docs/mattpocock-skills-adoption-plan.md`（S4 批次余项①；mattpocock/skills 工作流全仓落地 S4 收官件）

## 0. 结论摘要

把文章创作入口的选题从「一句话标题」升级为「采访过的选题卡」：向导第 1 步新增「AI 补全选题卡」——一次 LLM 采访（5~8 问，受众/边界/证据可得性三维度，每问带推荐答案，frontier 纪律），用户逐问采纳或改写，合成选题卡随 run 创建落库，brief 步骤按卡写作（targetReader/boundary/claims 三字段从「凭空发明」变「卡约束下细化」）。引入新技能 `db/skills/topic-interviewer/SKILL.md`（唯一事实源，非产线技能：停用即采访入口隐藏，流水线照跑——诚实降级）；不引入新表、不引入 schema 迁移（卡落 `AgentRun.artifacts.ideaCard`）；无卡路径字节级不变（离线断言钉死）。本特性按 S2 纪律全流程留痕（frontier 轮次 → 本方案 → `.scratch/` 票 → 双轴评审 → retro）。

## 1. 问题陈述与取证

brief 现状：输入只有选题标题 + 角度 + 风格块，六字段（读者画像/真实问题/核心判断/反方观点/边界/主张）全部由 LLM 单次推断（`src/lib/runtime/skills/radar-write.ts:113-124`——`briefMessages` 仅拼 title/angle/style_block）。用户最了解的三件事——写给谁、边界在哪、手头有什么证据——在入口处无表达通道：

| 缺口 | 证据 | 后果 |
| --- | --- | --- |
| 受众凭空猜 | `wewrite-brief/SKILL.md` 六字段无受众输入位 | targetReader 画像与用户真实读者错位（「入门科普」写成「行业深评」） |
| 边界凭空猜 | 同上 | boundary 字段与用户真实边界脱钩，写出去界外内容 |
| 证据可得性无声明 | claims 的 fact 型「将逐条联网取证」发生在任务书之后 | 用户明知拿不到的证据（如内部数据）被写成待核主张，核验步全红 |

「三方向选择前」的字面核对（frontier 事实 F1）：三方向只存在于视频线（`radar-rewrite.ts:219-224` 硬编码 + blocked 态等选）；文章线向导三步（选题→人格→确认，`wizard.tsx:35-39`）无任何 HITL 追问。选题卡三字段与 brief 六字段精确对应（受众→targetReader、边界→boundary、证据可得性→claims 取证策略），落点因此取文章线（§5 D1）。

## 2. 背景与研究

- **上游 grilling 技能**（`repos/mattpocock-skills/skills/productivity/grilling/SKILL.md`）：frontier 轮次纪律——一次一轮、整轮发问、每问带推荐答案、事实类 agent 自查、决策类用户拍板。本特性把该纪律产品化到创作入口。
- **本仓先例**：
  - 条件块注入：`style_block`（`radar-write.ts:115` ts 组装帧 + SKILL.md 持 `{{style_block}}` 占位符，无值渲染空串）——选题卡块照此模式（D5）；
  - LLM JSON 路由：`/api/ideas/refresh`（chatRetry + extractJson + 温度重试 + 429 人话化，`route.ts:1-80`）——采访路由照此（D6）；
  - 停用语义：`src/lib/skills/state.ts`（SettingKV `skills:disabled`；`renderSkillPrompt` 不查停用态，候选池才查）——采访路由自行查停用（D4）；
  - E2E 与 eval：`with-server.sh` + `b1-e2e-tier.mjs` 模式（POST→轮询终态→断言 artifacts）；`eval-set.mjs --score-only <runId>` 可对带卡 run 单独评分（D8）。
- **架构不变量**（ADR-0007）：ts 模块永不持 prompt 文案——采访器人格、问题协议、完成判据全部住新 SKILL.md；ts 只持数据组装（卡块帧沿 style_block 先例，见 §5 D5 降级说明）。

## 3. 方案设计

**数据流**（四段，全链可留痕）：

```
向导第 1 步 ──「AI 补全选题卡」──▶ POST /api/topic-interview {ideaTitle, ideaAngle}
                                      │ chatRetry(interviewerMessages) 温度 0.4→0.2 两档
                                      ▼
                                 {questions:[{id,dimension,question,recommended}]}（5~8 问三维度）
用户逐问作答（预填推荐，可改）──▶ distillIdeaCard(qa) → {audience, boundary, evidence}（纯函数，双端共用）
                                      │ 随 POST /api/runs body.ideaCard 透传
                                      ▼
                 createArticleRun: artifacts 预置 {ideaCard:{...qa 截断留痕}}
                                      │ executeArticleRun 起始继承（现空对象起步会抹掉预置键 → 改为解析 run.artifacts 起始）
                                      ▼
                 brief 步：briefMessages(..., ideaCard?) → {{idea_card_block}} 注入
                 （SKILL.md 只加占位符一行；无卡渲染空串 → 提示词字节级不变）
```

**模块切分**（单一职责 + 客户端安全）：

| 模块 | 职责 | 消费方 |
| --- | --- | --- |
| `src/lib/content/idea-card.ts`（新，纯函数零依赖） | 类型（IdeaCard/InterviewQuestion）、`validateIdeaCard`（trim/非空/钳长）、`distillIdeaCard(qa)`（按维度归并答案）、`ideaCardBlock(card)`（brief 注入帧）、`parseInterviewQuestions`（协议校验：5~8 问、三维度覆盖、推荐非空） | 客户端（向导）+ 服务端（路由/run-manager）——先例：`settings-panel.tsx:20` 直引 `@/lib/runtime/length-tier` |
| `src/lib/runtime/skills/topic-interview.ts`（新，服务端） | `interviewerMessages(ideaTitle, ideaAngle)`：renderSkillPrompt("topic-interviewer") 组装 | 采访路由 |
| `db/skills/topic-interviewer/SKILL.md`（新） | 采访器人格 + 问题协议 + 完成判据（唯一事实源） | renderSkillPrompt 两级加载 |
| `src/lib/runtime/skills/radar-write.ts`（改） | `briefMessages` 增第四参 `ideaCard?`，经 `ideaCardBlock` 注入 `{{idea_card_block}}` | run-manager brief 步 |
| `src/lib/runtime/run-manager.ts`（改） | createArticleRun 预置 artifacts.ideaCard；executeArticleRun 起始继承；brief 步传卡 | 管线 |

**停用降级链**（诚实降级，非断线）：采访路由先查 `getDisabledSkills()`——停用 → 409 `{error}`；前端对 409/失败一律收起采访入口，向导回到现状（标题+角度直发），流水线零感知。

## 4. 分批落地

| 批 | 范围 | 文件清单 | 预估量 |
| --- | --- | --- | --- |
| 票 01 | 事实源 + 纯函数层（含离线断言先红后绿） | `db/skills/topic-interviewer/SKILL.md`、`src/lib/content/idea-card.ts`、`src/lib/runtime/skills/topic-interview.ts`、`scripts/test-b2-offline.ts`（新增 ⑥ 节） | ~90 行 + 断言 ~20 |
| 票 02 | API 面：采访路由 + 卡透传 + 管线消费 | `src/app/api/topic-interview/route.ts`（新）、`src/app/api/runs/route.ts`、`src/lib/runtime/run-manager.ts`、`src/lib/runtime/skills/radar-write.ts`、`db/skills/wewrite-brief/SKILL.md`（占位符一行） | ~120 行 |
| 票 03 | 前端 + 聚焦 E2E + eval 抽样 | `src/components/wizard.tsx`、`scripts/tmp/s4-interview-e2e.mjs`（新） | ~150 行前端 + E2E 脚本 |

批间依赖：01 → 02 → 03 线性（01 的纯函数被 02/03 消费；02 的 API 被 03 的 E2E 打）。

## 5. 决策点（九项，frontier 轮次产出）

| # | 决策 | 选项 A（推荐） | 选项 B | 推荐理由 |
| --- | --- | --- | --- | --- |
| D1 | 落点 | 文章线向导第 1 步（run 创建前采访） | 视频线三方向提案前 / run 内 blocked 步骤 0 | 选题卡三字段=brief 输入缺口（§1 取证）；视频线已有自己的 HITL 且字段不对应；blocked 为后台无人在场设计，向导场景用户在场无需轮询机 |
| D2 | 交互形态 | 同步一轮问答（5~8 问一次出齐带推荐） | 多轮 blocked 采访 / 纯前端模板问题 | frontier 纪律=一次一轮；用户在场即时作答；模板问题无选题特异性 |
| D3 | 卡落位 | `AgentRun.artifacts.ideaCard`（创建时预置） | Idea 表新列 / 独立表 | 向导支持自由选题（不经池），卡是 run 级输入；`input` 列被纯图线/UI 按字符串消费（F3）不能塞 JSON；无 schema 迁移 |
| D4 | 事实源归属 | 新 SKILL.md，**不入** PIPELINE_SKILL_IDS | ts 硬编码 / 入 PIPELINE | ADR-0007 唯一事实源；采访是入口增强非产线必需——停用=入口隐藏、流水线照跑（诚实降级）；入 PIPELINE 反而把可降级功能钉成不可降级 |
| D5 | brief 消费方式 | `{{idea_card_block}}` 占位符（ts 组装帧） | 硬拼 user 消息 / SKILL.md 分节条件渲染 | style_block 先例（F7）；模板引擎无条件渲染，分节法会让帧骨架常驻（破坏无卡字节级不变）；ts 侧只持数据组装帧（4 行脚手架），句子级文案仍在 SKILL.md/卡数据内 |
| D6 | 问题协议 | 纯 JSON questions 数组，5~8 问三维度各带推荐；温度 0.4→0.2 两档 | 三档温度 / 无推荐答案 | ideas/refresh 已验证模式（F9）；出题比九步管线轻，两档够；推荐答案是 frontier 纪律本体不可省 |
| D7 | 前端形态 | 第 1 步按钮+逐问作答面板+第 3 步卡摘要；改题即作废卡 | 高级模式同步加 / 单独采访页 | 范围最小闭环；onTitleChange 已有解绑先例（`wizard.tsx:106-109`）顺势扩展；高级模式=范围外 |
| D8 | 测试缝 | 离线 b2 新节（无卡字节不变断言+解析器+协议校验）+ with-server 聚焦 E2E（真调用/带卡全链/停用 409）+ eval 1 题带卡 `--score-only` | 只跑冒烟 / 全量 eval | S3 纪律（改产线 SKILL.md 须聚焦 E2E+eval 抽样）；无卡路径字节级不变已被断言钉死，eval 1 题带卡给新能力立 after 基线即可，全量属过度 |
| D9 | 文档回写 | ADR-0009（三决策+两不变量）+ GLOSSARY 2 条（选题卡/选题采访器）+ 方案 §5 拍板记录 + worklog | 只改 README | 拍板过程可追溯是 S2 纪律本体；README 快速开始已有创作入口描述不涉内部机制，不动 |

> **拍板记录（2026-11-10）**：依据开工令「继续推进」+ 用户既有「按推荐建议来」模式（先例：S4 首项密钥重灌向导全按 A 采纳、方案 §5 可翻案），D1~D9 均采用选项 A。事实类前置自查证（F1~F10）见 §1/§2/§3 取证锚点。

## 6. 验收与度量

| 批 | 度量 | 目标值 | 采集方式 |
| --- | --- | --- | --- |
| 01 | 离线断言新增 | b2 新节 ≥12 断言全绿（含无卡字节级不变断言） | `node --experimental-strip-types scripts/test-b2-offline.ts` |
| 02 | 采访路由 | 200 出题 5~8 问三维度覆盖；停用→409；429 人话化 | with-server E2E |
| 02 | 卡透传 | 带卡创建 run → `artifacts.ideaCard` 持久 + brief 步 detail 正常 + 无卡 run 的 brief system 提示词与改前字节一致 | E2E + 离线断言 |
| 03 | 带卡全链 | run 终态 done；成稿字数落带（b1 判据复用） | `scripts/tmp/s4-interview-e2e.mjs` |
| 03 | eval 抽样 | 带卡 1 题五维均分 ≥ S3 after 基线 8.38 - 0.5（新能力 after 基线，宽门） | `eval-set.mjs --score-only` |
| 全程 | 回归门 | tsc 零错 + 离线 68/42(+12)/81 + c3 冒烟 10/10 不回退 | 既有回归体系 |

## 7. 风险与权衡

1. **改产线 SKILL.md（wewrite-brief 加占位符）**：控制——占位符无卡渲染空串 + 3+ 空行收敛，无卡路径字节级不变由离线断言钉死；带卡路径由聚焦 E2E 全链验证。
2. **artifacts 预置被抹**（executeArticleRun 空对象起步）：控制——起始改为解析 `run.artifacts` 继承已有键；失败按空对象（不阻断管线）；E2E 断言带卡 run 终态 artifacts 仍含 ideaCard。
3. **采访问题质量漂移**（LLM 出题空泛）：控制——SKILL.md 完成判据钉协议（5~8 问、三维度、推荐非空、问句具体到可答）+ 解析层校验拒收；出题失败向导照常可跳过（非阻断）。
4. **配额成本**：一次采访=1 次 LLM 调用（≈brief 同量级），仅在用户显式点击时发生；429 人话化提示重试。
5. **范围蔓延**（采访演变成问卷系统/多轮记忆）：控制——范围外显式声明；一轮=frontier 纪律上限，多轮留待真实需求。

## 范围外

- 视频线选题采访（视频入口已有 blocked HITL，字段不对应；待真实需求再评估）
- 高级模式（直达表单）的采访入口——老手动线不加
- 多轮采访/追问（frontier 纪律=一次一轮；下一轮等真实需求）
- Idea 选题池条目的卡回填（卡是 run 级输入，不反写池）
- 采访问答的持久独立表（artifacts 留痕已够，不引 schema 迁移）
