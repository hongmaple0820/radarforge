# 0009 — 选题采访器：选题卡落 artifacts、非产线停用语义、占位符注入

> 状态：已接受（2026-11-10，mattpocock/skills 采纳 S4 余项①，commit 见 `docs/topic-interviewer-plan.md` §5）
> 溯源：`db/skills/topic-interviewer/SKILL.md`；`src/lib/content/idea-card.ts`；`src/app/api/topic-interview/route.ts`；`docs/topic-interviewer-plan.md`

## 背景

brief 步的取证（方案 §1）：输入只有选题标题+角度+风格块，六字段全靠 LLM 单次凭空推断——用户最了解的受众/边界/证据可得性在入口无表达通道。上游 grilling 技能的 frontier 轮次纪律（一次一轮、每问带推荐答案、事实自查、决策用户拍）给出产品化路径：入口采访补全选题卡。

## 决策

- **卡落位：`AgentRun.artifacts.ideaCard`（创建时预置，执行侧起始继承）**。不引 schema 迁移；`input` 列被纯图线与 UI 按字符串消费（取证：`run-manager.ts` 纯图线 `run.input || run.ideaTitle`），不能塞 JSON。执行侧原「空对象起步、终态整体落库」会抹掉预置键 → 起始改为解析 `run.artifacts` 继承（损坏按空对象，不阻断管线）。
- **非产线停用语义：topic-interviewer 不入 `PIPELINE_SKILL_IDS`**。采访是入口增强而非产线必需——技能中心停用 → 采访路由 409 → 前端收起入口，向导回到现状（标题+角度直发），流水线零感知。与 ADR-0007 的「停用即断产线」守卫形成对照：**可降级的能力不钉成不可降级**。
- **brief 消费：`{{idea_card_block}}` 占位符（与 `{{style_block}}` 同线相邻放置）**。无卡渲染空串、占位符行落为空行——与改前字节级一致（离线断言钉死：渲染结果 === 剔除占位符后的渲染结果）；有卡时 ts 侧 `ideaCardBlock()` 组装注入帧。

## 不变量

- **无卡路径字节级不变**：`wewrite-brief/SKILL.md` 只允许占位符级的加法改动；任何让无卡 prompt 语义变化的改动须先红后绿重建断言（`scripts/test-b2-offline.ts` ⑥ 节）。
- **句子级纪律文案的例外边界**：`ideaCardBlock()` 帧内的约束句（「以选题卡表述为准…」）沿 `style_block` 既存先例由 ts 持有——它是条件块脚手架（模板引擎无条件渲染，帧文案无法整个住 SKILL.md 而不污染无卡路径）；除 `style_block`/`idea_card_block` 两处既存先例外，ts 模块仍不持 prompt 文案（ADR-0007 主不变量）。

## 后果

- 采访器问题协议（5~8 问、三维度、每问带推荐）住 SKILL.md，改协议=改 SKILL.md，经两级加载用户可覆盖。
- `parseInterviewQuestions` 同时接受裸数组与 `{"questions":[...]}` 包裹（SKILL.md 协议示形即包裹形态——首跑实证 LLM 按示形输出，单测补钉）。
- 卡三字段蒸馏逻辑（`distillIdeaCard`）双端共用单一实现（客户端预览=服务端入参），零依赖纯模块 `src/lib/content/idea-card.ts`。
- eval 基线：带卡路径为新能力，无 before 对应物——验收取 after 基线宽门（≥ S3 after 均分 8.38 - 0.5），不与无卡路径混算。
