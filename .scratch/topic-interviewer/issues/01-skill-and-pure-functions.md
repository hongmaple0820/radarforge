# 01-事实源与纯函数层：topic-interviewer SKILL.md + idea-card 模块 + 离线断言

Status: done
Blocked by: （无）

## 目标

票后可验证：采访器提示词有唯一事实源（SKILL.md，两级加载可命中）；选题卡的校验/蒸馏/注入帧/问题协议校验四个纯函数零依赖可离线测；`briefMessages` 无卡路径的 system 提示词与改前字节级一致（占位符渲染空串）。

## 验收
- [x] `db/skills/topic-interviewer/SKILL.md` 存在且 frontmatter 完备（name=topic-interviewer；origin-pack 注明 grilling 来源；非 pipeline）
- [x] `loadSkillPrompt("topic-interviewer")` 命中产品库（两级加载）且正文含 frontier 纪律要素（一次一轮/每问带推荐答案/完成判据）
- [x] `src/lib/content/idea-card.ts` 零依赖（客户端可安全引入），导出 validateIdeaCard / distillIdeaCard / ideaCardBlock / parseInterviewQuestions 四函数与类型
- [x] `validateIdeaCard`：空字段拒收（返回 null）、超长钳制（audience/boundary/evidence 各 500）、qa 数组 ≤8 条每条 question/recommended/answer 各截 200
- [x] `distillIdeaCard`：同维度多问答案按「；」归并；空答案跳过；无有效维度返回 null
- [x] `ideaCardBlock(card)`：含【选题卡（用户采访确认）】帧与三字段行；brief 约束语义在帧内（卡优先于自行推断）
- [x] `parseInterviewQuestions`：5~8 问、三维度全覆盖、每问 id/question/recommended 非空——违反任一返回 null（拒收不硬凑）
- [x] `briefMessages(title, angle)`（无卡）system 不含「选题卡」字样与 `{{` 残留（字节级不变断言：渲染结果 === 剔除占位符后的渲染结果）
- [x] b2 离线新增 ⑥ 节 ≥12 断言全绿（先红后绿：MODULE_NOT_FOUND 红 → 实现绿；实收 38 条，80/80）

## Comments
- 2026-11-10 实现：红线先行（test-b2 ⑥ 节 → ERR_MODULE_NOT_FOUND 红）；SKILL.md 协议按 writing-for-agents 风格（正向指令 + 完成判据）；占位符与 style_block 同线相邻放置保无卡字节不变（ADR-0009 D5）。
- 2026-11-10 补丁：parseInterviewQuestions 增包裹对象解包（{"questions":[...]}，LLM 按协议示形输出——票 02 E2E 首跑 503 实证后补单测钉住）；qa 清洗抽 cleanQaItem 共用（Standards 轴 duplicated code 自查修复），复验 80/80。
