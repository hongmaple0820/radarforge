# 02-API 面：采访路由 + 卡透传 + 管线消费 + brief 占位符

Status: done
Blocked by: 01

## 目标

票后可验证：`POST /api/topic-interview` 出题（真 LLM 调用，协议校验拒收重试）；`POST /api/runs` 接收 `ideaCard` 并预置 `artifacts.ideaCard`；executeArticleRun 起始继承预置键；brief 步在有卡时注入卡块、无卡时字节不变。

## 验收
- [x] `POST /api/topic-interview {ideaTitle, ideaAngle}`：空 title→400；chatRetry 温度 [0.4, 0.2] 两档；`parseInterviewQuestions` 拒收后重试，两档仍败→503 人话错误（含 429 语义）；成功→200 `{questions}`
- [x] 停用链：`getDisabledSkills()` 含 topic-interviewer 时→409；前端收到 409 收起入口（诚实降级，E2E ②相实证）
- [x] `POST /api/runs` body 接收 `ideaCard`：`validateIdeaCard` 不过→忽略卡照常创建（非阻断）；过→createArticleRun 预置 `artifacts: {"ideaCard": {...}}`（E2E ③⑤相实证）
- [x] executeArticleRun 起始解析 `run.artifacts` 继承已有键（JSON 损坏按空对象，不阻断）；终态落库 artifacts 仍含 ideaCard（error 终态亦不抹——两次 429 截断 run 实证）
- [x] brief 步：`briefMessages` 增第四参；run-manager 从 `artifacts.ideaCard` 取卡传入（重新校验防坏行）；detail 增「｜选题卡已注入」留痕
- [x] `db/skills/wewrite-brief/SKILL.md` 仅增占位符 `{{idea_card_block}}`（与 style_block 同线；无卡字节级不变由票 01 断言钉死）
- [x] 红线命令（先红后绿）：E2E 快相首跑采访 API 404（红 1）→实现后 200（绿）；503 包裹解析缺口（红 2：单测喂裸数组未暴露 LLM 实际输出形态）→解包裹修复+补测（绿）
- [x] tsc 零错

## Comments
- 2026-11-10 实现：红线两次先红后绿均有留痕（快相 7/7 失败 → 14/14 全绿；503 → 200）。
- 2026-11-10 取证：E2E 全跑两次被 429 截断的 run，反而实证了「error 终态 artifacts.ideaCard 不被抹」+ brief 注入在管线早期已完成（detail 已带「选题卡已注入」）。
