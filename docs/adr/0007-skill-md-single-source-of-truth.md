# 0007 — SKILL.md 是产线提示词的唯一事实源

> 状态：已接受（2026-11-05，内容质量升级批次一 A1，commit `4825f55`）
> 溯源：`src/lib/runtime/skill-prompt.ts`；`db/skills/<id>/SKILL.md`；`docs/mattpocock-skills-adoption-plan.md` §4-S3

## 背景

升级前的根因取证：产线 system prompt 主体散落在 ts 模块字符串里，「skills 未接管主产线」（19 个技能文件只有 1 个真正在产线生效）——用户在技能中心看到/编辑的内容与实际运行的提示词是两套东西，改了不生效。

## 决策

- **提示词主体下沉 `db/skills/<id>/SKILL.md`**；ts 模块退化为「编排 + 变量注入 + 解析」三件事，不再持有 prompt 文案
- 解析优先级：`~/.radarforge/skills/<id>`（用户覆盖）> `db/skills/<id>`（产品库）
- 两级都没有 → 抛 `SkillPromptMissingError` **显式报错，拒绝静默回退**（拒绝「找不到就用旧硬编码」的退路）
- 占位符协议：`{{var}}`；多 prompt 技能用 `<!-- prompt: name -->` 分节
- `PIPELINE_SKILL_IDS` 八技能（wewrite-brief/outline/draft/review/fact-check/illustrate/art-direct + huashu-video-direct）是**产品基础设施，不可在技能中心停用**（停用即断产线）

## 后果

- 用户改 SKILL.md 即改行为——「单一事实源」从纪律变成机制
- 提示词工程与代码工程解耦：S3 批次将以 writing-for-agents 六技法（leading words / 正向指令 / 完成判据 / no-op 剪枝 / 渐进披露 / 单一事实源去重）反哺这八个文件，目标平均 token -20% 且 eval 不回退
- 改 SKILL.md = 改产线：任何此类改动必须跑聚焦 E2E + eval 抽样（coding-standards 第 6 条）

## 不变量

- ts 模块永不重新持有 prompt 文案（发现即违反本 ADR）
- 缺 SKILL.md 永远显式报错，永不静默回退
