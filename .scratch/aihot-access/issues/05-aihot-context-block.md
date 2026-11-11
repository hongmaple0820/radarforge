# 05-aihot-context-block：AIHOT 热点参考注入（brief / 采访器）

Status: resolved（2026-11-11）
Blocked by: 04（resolved）

## 目标

方案 §8 点名的后续独立增强票：把 AIHOT 采集数据（P1 的 42 源）反哺内容产线——`wewrite-brief`（任务书）与 `topic-interviewer`（出题）两步注入「AIHOT 热点参考」块，让任务书的 claims 与采访器的 evidence 问题获得真实热点视野。走 S3 同款纪律：token 基线（占位符行增量）+ 聚焦 E2E + eval 不回退。

## 决策（→ ADR-0012）

- D1 形态证伪：原设想「提示词告知 `mcp__AIHOT__*` 工具可用」被证伪——两步均纯 chat（`run-manager.ts` Step1 / `topic-interview/route.ts` 走 `chatRetry`，LLM 收不到 tools 参数），告知不产生行为。正确形态 = 数据注入（ADR-0009 `{{idea_card_block}}` 先例延伸）。
- D2 注入形态：SKILL.md 持 `{{aihot_block}}` 占位符；**调用方查传**（消息组装函数持字符串参数，不在组装层内查 db）——b2 直读零依赖口径不变。
- D3 数据口径：`site==="aihot.news"` + `status==="new"` + 近 7 天 + `publishedAt desc, createdAt desc` + 取 5 条；title 截 80 / summary 截 120（块上限约 1KB，避免热点洪水）。
- D4 容错：查询失败 → `console.warn` 留痕 + 空数组降级（增强层缺席不拖垮产线，error 终态语义不变）。
- D5 注入面只开两步：brief（Step1）与采访器出题；draft/outline 不注（证据链已闭环，热点不进正文事实）。

## 改动

- 新 `src/lib/content/aihot-block.ts`：零依赖纯函数 `aihotBlock(items)` + `AihotTopic` 类型（帧组装 + 截断纪律；b2 直读可达）。
- 新 `src/lib/sources/aihot-context.ts`：`aihotContext()` 读路径（prisma 查询 + D4 容错；服务端专用）。
- `db/skills/wewrite-brief/SKILL.md` / `db/skills/topic-interviewer/SKILL.md`：各加一行占位符（与 style/idea_card 同线相邻）。
- `src/lib/runtime/skills/radar-write.ts`：`briefMessages` 第 5 参 `aihotBlockText?: string`。
- `src/lib/runtime/skills/topic-interview.ts`：`interviewerMessages` 第 3 参。
- `src/lib/runtime/run-manager.ts` Step1 / `src/app/api/topic-interview/route.ts`：两调用点 `aihotBlock(await aihotContext())` 查传；brief 步 detail 增「｜AIHOT 热点已注入」条件留痕。

## 验收

- [x] b2 ⑨ 节先红：`aihot-block` 模块 MODULE_NOT_FOUND → 帧头断言子串对齐 → 实现后全绿（127 → 145，+18 断言：帧纪律 4 / 截断 3 / 占位符 3 / IN1 2 / 注入 6）
- [x] 帧纪律：空数组 → `""`；含帧头【AIHOT 热点参考（近 7 天精选）】/ 条目行 / 「仅作视野参考」纪律句；title 80 / summary 120 截断（无超长残留 + 边界内容完整双断言）
- [x] IN1 无数据字节级不变：三占位符全空渲染 === 剔占位符渲染；`briefMessages` 默认参数 = SKILL.md 直渲染（⑥ 节旧断言零改动继续成立）
- [x] 注入生效：两消息组装函数传入非空块 → system 含帧头与条目值
- [x] E2E（with-server，三相 15/16）：A 查询层 live（5 条真实热点，首条 WSJ Anthropic IPO；条数钳 5；帧头/纪律句/无占位符残留）；B 出题管道 live（200 + 7 问三维度全覆盖 + 每问带推荐答案）；C run 全链留痕（done 132s + brief 步「AIHOT 热点已注入」确定性命中）——唯一红=成稿 5087 字超容差带（观察项，见 Comments）
- [x] eval 不回退：m01 同题同配置（无卡口径）**均分 8.4，宽门 7.88 PASS + 门禁 PASS**（S3 after 基线 8.38，不回退；两轮外部扰动后收口，见 Comments）
- [x] 文档四件：ADR-0012 / GLOSSARY 50→51（+AIHOT 热点参考）/ 方案 §9 注记 / worklog+retro；双轴评审两报告（`review/05-*-axis.md`）
- [x] 回归门：tsc 零错 + 离线 b1 68 / b2 145 / c 81 + c3 冒烟 SMOKE-PASS

## Comments

（实施留痕，2026-11-11）
- **形态证伪先于设计**（D1 证据链）：开工先核两步执行路径——均为 `chatRetry` 纯 chat 补全无 tools 面，「告知工具可用」不产生行为；P1 retro「预判型红线先证伪」纪律再应用，ADR-0012 D1 记录。
- **b2 红两次**：红1 MODULE_NOT_FOUND（预期）；红2 帧头断言子串写错（断言写「【AIHOT 热点参考】」而实现帧头含「（近 7 天精选）」后缀）——断言对齐子串后绿；另修正截断断言的行宽误算（行格式 `- 标题：摘要`，改用「81 字不残留 / 80 字保留」双断言）。
- **E2E 唯一红（观察项）**：成稿 5087 字超 medium 容差带（4000×1.2=4800）——与 S3 m02 4023 / S4 4756 三证同族（大纲裁量阶段超写，LLM 概率行为）；本票注入 ~1KB 热点参考理论上可能轻微放大（不可分离归因）；不放宽断言，记观察项。
- **eval 两轮外部扰动后收口**：首跑 run 终态 error（429——E2E demo 全链 run 刚收尾即跑 eval，双管线突发自撞，P1 教训重犯一次）；冷却约 15 分钟后复跑 run done 132s（热点注入留痕命中、字数 4843 同族越界），评分腿 G-Eval 输出格式偶发不合一次，单独重评即过：**均分 8.4（accuracy8.5/viewpoint8.2/usefulness8.8/voice8.3/readability8）宽门 PASS**。
- **环境教训回写**：管线类脚本串行收尾的「间隔」要显式（demo 后接 eval 至少隔一个冷却窗），不是「先后跑」就等于「串行」。
