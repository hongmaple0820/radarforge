# AGENTS.md — RadarForge 代理工作约定

> 任何 agent（Claude Code / Codex / Z.ai / 人工）在本仓工作前先读本文件。
> 本文件只放铁律与地图，细则全部指针化；全文保持 ≤150 行（上下文常驻成本约束）。

## 仓库是什么

RadarForge：AI 资讯内容生产平台（情报 → 选题 → 文章 → 配图 → 视频 → 发布）。Next.js 16 + Prisma + SQLite，单仓单包，直推 main。术语见根目录 `GLOSSARY.md`。

## Agent skills

### Issue tracker

本地 markdown 票制：`.scratch/<feature>/issues/NN-<slug>.md`，一票一文件，随仓库推送获得远端持久性。见 `docs/agents/issue-tracker.md`。

### Triage labels

五标签词汇沿用规范名（needs-triage / needs-info / ready-for-agent / ready-for-human / wontfix），词汇先立住、全流程暂不启用。见 `docs/agents/triage-labels.md`。

### Domain docs

单语境布局：根 `GLOSSARY.md` + `docs/adr/`。消费规则见 `docs/agents/domain.md`。

## 沙箱铁律（六批次实测换来的约束，违反即返工）

1. **进程不跨 Bash 调用存活**：dev server 与测试必须在同一次调用内完成，一律 `bash scripts/with-server.sh "<测试命令>"`（自动：boot-restore 自愈 → 清旧 server → 起 next dev → 跑测试 → 退出）。
2. **Bash 单调用 10 分钟硬上限**：超窗任务拆腿跑或换非交互环境（实证：3 镜串行 i2v 需 20-30min 被截断 → 改用「1 model + 2 code」hybrid 最小验证法）。
3. **沙箱回收重置运行时**：`db/custom.db`（SettingKV 密钥/调优态）、prisma client、git 推送凭证都会丢。恢复顺序：`node scripts/boot-restore.mjs --quiet`（幂等）→ Agnes 密钥重灌（见第 4 条）→ prisma client 丢失时 `node scripts/tmp/gen-prisma-inline.mjs`。
4. **密钥零落盘**：密钥只进 `db/custom.db`（gitignored）与环境变量，绝不写仓库文件/日志/提交。Agnes 重灌：`AGNES_KEYS="k1,k2,..." bash scripts/with-server.sh "node scripts/tmp/agnes-pool-setup.mjs"`（写 SettingKV 用 **PUT**，POST 会 405）。
5. **git 推送凭证重配**：凭证随沙箱丢失时，`git remote set-url` 临时带令牌推送，推完立即还原 URL，令牌不回显不入库。
6. **/tmp 与仓库外路径不持久**：外部仓库先 clone 到 /tmp 阅读，需要保留的文件必须转移入库（`repos/` 先例：精选 + NOTICE.md 署名）。
7. **LLM/生图/视频配额是共享稀缺资源**：离线契约测试优先；真实远端调用做最小验证；白天跑批警惕 429/日池耗尽（诚实报错不静默重试轰炸）。

## 工作流地图（主流程：想法 → 上线）

适配自 ask-matt（源：`repos/mattpocock-skills/skills/engineering/ask-matt/`），按本仓单代理 + IM 指令节奏裁剪：

1. **磨利想法**：开工令后先跑 frontier 轮次采访——事实类问题 agent 查证后给推荐答案，决策类问题用户拍板，一次一轮。源技能：`skills/productivity/grilling/`
2. **落规范**：拍板完按 `docs/agents/spec-template.md` 写 `docs/<feature>-plan.md`（先例：content-quality / q7 / mattpocock-skills 三份方案）。
3. **拆票**：规范 → `.scratch/<feature>/issues/` 票，tracer-bullet 垂直切片 + blocking edges + 验收 checkbox。
4. **实现**：逐票做，票间清上下文；修 bug 必须先立**红线命令**（一条能在本 bug 上变红的命令）再动手，修完转绿。
5. **双轴评审**：push 前两轴分开报——Standards 轴对照 `docs/agents/coding-standards.md` + Fowler 12 smell 基线；Spec 轴对照规范/票。
6. **收尾回看**：worklog.md 追加任务记录 + 「环境改进」小节，可执行项回写本文件或 coding-standards（机械错误 → 确定性检查；判断题 → 编码标准）。

**上匝道**：东西坏了 → 六阶段诊断，Phase 1 先建红线反馈环（判据四项：红线能力/确定性/秒级/agent 可跑），[DEBUG-xxxx] 标记法（源：`skills/engineering/diagnosing-bugs/`）。多会话大雾工程 → 先读 `skills/engineering/wayfinder/` 原文再决定是否启用（默认不用）。
**词汇底层**：domain-modeling（挑战模糊术语 → GLOSSARY）；codebase-design（深模块词汇，tdd/improve 引用时读）。

## 豁免规则（流程税控制）

以下任务免票、免双轴评审（回归门不豁免）：

- 单文件微改、文案与样式修正
- 凭证重配、环境恢复、沙箱自愈类操作
- 纯文档新增或修订
- 一次性诊断/探针脚本（`scripts/tmp/` 是惯例位置）

票的最小尺寸判据：一个 fresh context window 装得下（上游判据直接采用）。

## 语言与文风

- 文档、提交信息、代码注释、对话：中文。代码标识符与枚举值：英文（中英混排是既成事实，`GLOSSARY.md` 双语对齐）。
- em-dash 禁令**豁免**：中文排版破折号合法（与上游规则不同，此处明确豁免）。
- 正式文档不用 emoji 与未验证符号。

## 回归门（push 前最低要求）

```
npx tsc --noEmit                                          # 零错
node --experimental-strip-types scripts/test-b1-offline.ts   # 68
node --experimental-strip-types scripts/test-b2-offline.ts   # 42
node --experimental-strip-types scripts/test-c-offline.ts    # 81
bash scripts/with-server.sh "node scripts/full-regression.mjs"  # 需 server 的全量回归
```

涉及 db/skills SKILL.md 或产线提示词的改动，另跑聚焦 E2E 并抽 eval 样本对比（见 ADR-0007 与方案 S3 纪律）。
