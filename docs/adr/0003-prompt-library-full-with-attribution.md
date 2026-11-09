# 0003 — 模板库全量带署名引入

> 状态：已接受（用户拍板 2026-11-05，内容质量方案决策②）
> 溯源：commit `80d8fe0`（B4 落地）；`db/asset/image-prompt-library/`（含 THIRD_PARTY_NOTICES.md）；`src/lib/runtime/prompt-library.ts`

## 背景

生图提示词需要结构化范例。选项 A：8 源 3774 条全量引入带署名（检索式使用，资产完整）；选项 B：精选约 500 条改写（轻但丢长尾检索价值）。

## 决策

- **全量 3774 条**入库 `db/asset/image-prompt-library/`，按原包 `THIRD_PARTY_NOTICES.md` 逐源署名（Apache-2.0 等）
- **不修改原文**，保持署名干净；衍生改写单独标注（导演 few-shot 范例「学结构不照抄」）
- 检索式使用：bigram/拉丁双通道四字段加权检索，命中才注入

## 后果与不变量

- 检索质量依赖全量长尾覆盖，精选版会塌缩命中空间——这是选 A 的核心理由
- 不变量：原文永不修改；任何衍生品带独立标注；NOTICES 随库走
- 检索算法可演进（加权参数可调），数据面不动
