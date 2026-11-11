# 0012 — AIHOT 热点参考注入：brief / 采访器提示词的 `{{aihot_block}}` 占位符

> 状态：已接受（2026-11-11，aihot-access 05 增强票，spec 见 `docs/aihot-access-plan.md` §9；上会话 P1 收口时方案 §8 点名「列为后续独立增强票，须走 S3 同款纪律」）
> 溯源：`src/lib/content/aihot-block.ts`（帧组装纯函数）；`src/lib/sources/aihot-context.ts`（查询读路径）；`db/skills/wewrite-brief/SKILL.md`、`db/skills/topic-interviewer/SKILL.md`（占位符）；`src/lib/runtime/skills/radar-write.ts`、`src/lib/runtime/skills/topic-interview.ts`（消息组装参数）；`src/lib/runtime/run-manager.ts`、`src/app/api/topic-interview/route.ts`（调用点）；先例 ADR-0009（`{{idea_card_block}}`）

## 背景

AIHOT 接入 P1（ADR-0011）把 18 源种为默认采集，AIHOT 条目入选题池后走人工 promote 转选题。方案 §8 留了后续增强票：「在 wewrite-brief / topic-interviewer 提示词中告知 `mcp__AIHOT__*` 工具可用」。开工先证伪（P1 retro 纪律）：两步执行路径均为纯 chat 补全（`run-manager.ts` Step1 与 `topic-interview/route.ts` 均走 `chatRetry`，LLM 请求不带 tools 参数）——「告知工具可用」不产生任何行为。正确形态是**数据注入**（P2 候选「早报参考输入」式），复用 S4 余项① 选题卡的成熟先例：SKILL.md 持占位符、调用方查传、无数据零字节。

## 决策

- **D1 形态（证伪驱动）**：放弃「告知工具可用」，改为 `{{aihot_block}}` 占位符 + 热点参考帧注入。证据：纯 chat 路径无工具面；AIHOT MCP 工具（`mcp__AIHOT__*`）在产线这两个步骤不可达。
- **D2 注入形态**：调用方查传（`briefMessages` 第 5 参 / `interviewerMessages` 第 3 参，均为可选字符串参数）——消息组装层不 import db，b2 直读零依赖口径不变（mcp-seeds 同款纪律）。
- **D3 数据口径**：`site==="aihot.news"` + `status==="new"` + 近 7 天 + `publishedAt desc, createdAt desc` + 取 5 条；帧内 title 截 80 / summary 截 120（块上限约 1KB，防热点洪水）。
- **D4 容错**：查询失败 → `console.warn` 留痕 + 空数组降级（增强层缺席不拖垮产线；降级不静默，日志在）。
- **D5 注入面只开两步**：brief（Step1 任务书）与采访器出题——claims 组织与 evidence 出题获得真实热点视野；draft / outline 不注（证据链已闭环，热点不进正文事实）。

## 不变量

- **IN1 无数据字节级不变**：库无 AIHOT 条目（或查询降级）时，渲染结果 === 剔占位符渲染（b2 ⑨ 三占位符全空态断言钉死）；`briefMessages` / `interviewerMessages` 默认参数 = SKILL.md 直渲染逐字节相等（b2 ⑥ 节旧断言零改动继续成立）。
- **IN2 注入是增强不是依赖**：查询失败 / 库空不产生 error 终态、不改 run 语义（D4 容错层保证；Step1 失败语义不变）。

## 后果

- brief 步 detail 新增「｜AIHOT 热点已注入」条件留痕（产品级确定性断言点：E2E 不拆 system 即可证注入发生与否）。
- 帧内纪律句钉住「热点仅作视野参考，不作为事实依据——正文事实仍须逐条走证据链核证」，与 AIHOT 免费条款「保留机器来源信息」（帧头署名）双满足。
- 帧头含「近 7 天精选」窗口声明：与查询口径（D3）一致，读者可据此判断新鲜度。
- eval 与回归面：m01 同题同配置（无卡口径）宽门 ≥7.88 不回退；字数越界偶发（S3 m02 4023 / S4 4756 / 本批 5087 三证同族）为大纲裁量已知现象，非本票引入，记观察项。
