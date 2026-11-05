# 图像提示词模板库（B4 资产入库）

**3774 条中英双语专业生图提示词范例**，检索式使用：配图导演（`src/lib/runtime/illustration-director.ts`）
按「选题 + 小节锚点 + 配图概念」实时检索最相关的少数范例，作为 few-shot 参考注入导演
prompt（学结构学用词，不照抄内容）——不整库塞上下文。

## 来源与版本

- npm 包：`@q253595422/dsh-imagegen-video@1.22.2`（2026-11-05 拉取）
- 上游仓库：https://github.com/q253595422/dsh-imagegen-video
- 每个快照文件自含元数据（`repository` / `sourceUrl` / `fetchedAt` / `totalCases` / `categories`），
  条目字段：`title` / `prompt`（中英双语）/ `category` / `categoryZh` / `styles` / `scenes` / `featured` 等。
  `image` / `githubUrl` 等外链按上游设计不随包分发，本库仅消费文本字段。

## 文件清单（8 文件 · 3774 条）

| 文件 | 条数 | 上游 |
|---|---|---|
| canghe-cases.json | 541 | 仓河 |
| cases.json | 441 | freestylefly/awesome-gpt-image-2 |
| evolink-cases.json | 967 | EvoLinkAI/awesome-gpt-image-2-prompts |
| handraw-cases.json | 441 | yang0/handraw-style |
| itgoyo-cases.json | 602 | itgoyo |
| prompt-signal-cases.json | 577 | andy7076/image_prompt 等 |
| songtianlun-cases.json | 55 | songtianlun |
| youart-cases.json | 150 | youart |

（精确上游以各文件顶层 `repository` 字段与 `THIRD_PARTY_NOTICES.md` 为准。）

## 许可与署名

- 本目录 `LICENSE` = 上游 Apache-2.0；`NOTICE` 与 `THIRD_PARTY_NOTICES.md` 原样保留
  （模板快照的上游含 MIT / CC0 1.0 等多种许可，署名链完整记录于该文件）。
- 引入决策：内容质量升级方案批次二 B4「模板库全量 3774 条带署名引入」（用户拍板）。

## 检索入口

`src/lib/runtime/prompt-library.ts`：

```ts
const hits = retrieveTemplates("大模型 推理成本 下降 曲线 数据可视化", { limit: 3 })
// → [{ title, prompt, categoryZh, styles, sourceFile }, ...]
```

CJK 无空格分词 → 二元组（bigram）匹配计分；查询词同时命中
title/categoryZh/styles/prompt 多字段加权求和。首次调用惰性加载全库并缓存于模块内。
