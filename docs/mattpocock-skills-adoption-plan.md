# RadarForge × mattpocock/skills：工作流引入与项目优化方案

> 状态：待拍板（六个决策点见 §5）
> 日期：2026-11-09 · 作者：主 Agent（Z.ai）
> 源库：https://github.com/mattpocock/skills （MIT，Matt Pocock）· 已 vendor 至 `repos/mattpocock-skills/`（上游 commit `4ae2317`，见其 NOTICE.md）
> 姊妹篇：`docs/content-quality-upgrade-plan.md`（产品内容质量，已三批落地收口）；本方案针对**开发工作流与技能工程质量**，两者互补不重叠

---

## 0. 结论摘要

**是什么**：mattpocock/skills 是 Matt Pocock（TypeScript 社区知名教育者）公开的 26 个 agent 工程技能（工程 18 + 生产力 8），核心理念是「小而可改、可组合」，直接对抗 AI 辅助开发的四大失败模式——代理做错方向、话太多、代码不工作、系统变乱。

**为何值得引入**：RadarForge 过去六批次的开发史，几乎每一条痛点都能在这套技能里找到对症的纪律。我们已经在**自发地、部分地**实践其中约一半（worklog约retro、方案文档约to-spec、批次拆分约to-tickets、diag 取证约diagnosing-bugs、research-external-survey.md约research），但缺三样关键东西：**成文的结构**（frontier 轮次/blocking edges/双轴评审）、**沉淀的位置**（GLOSSARY/ADR/AGENTS.md——目前只活在 worklog 与提交消息里）、**可判定的完成判据**（红线命令、每步 completion criterion）。

**引入什么**：三层落位——
- **L0 源库参考层**（已完成）：vendor 快照入库，任何 harness 任何会话可读；
- **L1 开发工作流层**（批次 S1+S2）：仓库脚手架（AGENTS.md / GLOSSARY.md / docs/agents/ / docs/adr/ / .scratch/ 票制）+ 12 个精选技能的流程接管；
- **L2 平台运行时层**（批次 S3）：用其 `writing-for-agents` 技能工程技法反哺 db/skills 八个管线 SKILL.md（与 A1「SKILL.md 唯一事实源」纪律同线，是本方案对**产品本身**的最大增量）。

**不引入什么**：wayfinder（多会话大雾规划，本仓节奏用不上）、triage 全套（无外部 issue 流入，保留标签词汇即可）、teach/to-questionnaire（无对应场景）、pr 技能（直推 main 无 PR 流）。理由见 §3.3 适用性评级。

**预期收益**（量化验收见 §6）：下个特性周期全链走通五技能流程；八技能 SKILL.md 平均 token -20% 而产出质量不回退；关键决策全部有 ADR 可追溯；「沙箱铁律」等隐性知识成文进 AGENTS.md，摆脱对单会话记忆的依赖。

---

## 1. 源仓库调研

### 1.1 仓库概览

| 维度 | 内容 |
| --- | --- |
| 组织 | `skills/{engineering,productivity,misc,in-progress,deprecated}` 五桶，promoted = engineering + productivity（26 个） |
| 纪律 | promoted 技能必须在顶层 README 与 plugin 清单双登记；`ask-matt` 是路由技能（技能地图），新增/改名技能必须同步路由，否则「路由器说谎」 |
| 文风铁律 | 全仓禁用 em-dash；每个技能注明 user-invoked（`disable-model-invocation: true`）或 model-invoked |
| 采纳门槛 | SCOPE.md：issue 必须同时满足「真实会话中观察到的失败」+「符合哲学」；假想优化直接出局 |
| 安装形态 | plugin（自更新）或 skills.sh（可编辑副本）——作者明确反对 GSD/BMAD 式「接管整个流程夺走控制权」的设计 |

### 1.2 技能清单（26 个 promoted，附本仓适用性速评）

**工程（engineering/，18 个）**

| 技能 | 触发方式 | 一句话职责 | 本仓适用性 |
| --- | --- | --- | --- |
| ask-matt | 用户 | 技能路由器：主流程「想法→发布」的完整地图 | **B**（并入 AGENTS.md 流程图） |
| grill-with-docs | 用户 | 采访式磨利想法 + 沉淀 GLOSSARY/ADR（有仓库时用这个） | **A** |
| to-spec | 用户 | 会话→规范发布到 tracker（不采访，纯合成） | **A** |
| to-tickets | 用户 | 规范→tracer-bullet 票，每票声明 blocking edges | **A** |
| implement | 用户 | 按票实现：驱动 tdd + 结尾 code-review + 提交 | **A** |
| implement-spec | 用户 | 整规范单跑：任务图 + 并行 implementer 子代理 + 集成分支 | C（子代理并行在 IM 节奏下暂不划算） |
| tdd | 模型 | 红-绿循环参考：好测试标准/seam 反模式/循环规则 | **A** |
| code-review | 模型 | 双轴评审（Standards/Spec）+ Fowler 12 smell 基线 | **A** |
| diagnosing-bugs | 模型 | 六阶段诊断：先建「红线反馈环」再谈假设 | **A** |
| prototype | 模型 | 一次性原型回答设计问题（逻辑 HTML / UI 变体） | **B**（UI 实验时用） |
| research | 模型 | 后台代理查一手来源，产出带引用 md 入库 | **A**（已有先例，保持） |
| domain-modeling | 模型 | 锐化领域语言：挑战模糊术语/一词多义/ADR | **A** |
| codebase-design | 模型 | 深模块词汇表（module/interface/depth/seam） | **B**（tdd/improve 引用时读） |
| improve-codebase-architecture | 用户 | 扫描深模块化机会，产出可视化报告 | C（闲时维护，暂缓） |
| wayfinder | 用户 | 大雾工程决策地图（decision tickets） | D（本仓单会话可控） |
| triage | 用户 | 外来 issue 状态机分诊 | C（无流入，仅留标签词汇） |
| wizard | 模型 | 生成 HITL bash 向导（人类才能做的步骤） | **B**（密钥重灌痛点，S4） |
| retro | 用户 | 会话后回看：改**环境**不改代码 | **A** |
| setup-matt-pocock-skills | 用户 | 一次性仓库脚手架配置 | **A**（S1 仿其输出物） |
| pr | 模型 | PR 正文格式（最小视觉证据 + 前后对比 + 单/双向门） | D（无 PR 流） |

**生产力（productivity/，8 个）**

| 技能 | 触发方式 | 一句话职责 | 本仓适用性 |
| --- | --- | --- | --- |
| grilling | 模型 | 采访原语：design tree / frontier 轮次 / 事实我查、决策你拍 | **A** |
| grill-me | 用户 | 无仓库时的 stateless 版 | D（总有仓库） |
| handoff | 用户 | 会话压缩成交接文档给下一个代理 | **A**（本会话开头那份摘要就是它的野生形态） |
| writing-for-agents | 模型 | 写 agent 消费文档的技法大全 | **A**（S3 核心引擎） |
| wait-what | 用户 | 消息没接住→用 GLOSSARY 词汇重述 | B |
| teach | 用户 | 多会话教学 | D |
| to-questionnaire | 用户 | 给**别人**的问卷 | D（无外部干系人） |

适用性评级：**A**=直接接管进流程；**B**=改造后按需用；**C**=暂缓（保留词汇与知识）；**D**=不引入。A 级共 **12 个**，即本方案的接管集。

### 1.3 四大失败模式 vs 本仓历史病例对照

| 失败模式 | 上游对策 | RadarForge 真实病例 |
| --- | --- | --- |
| 代理做错方向 | grill 采访（frontier 轮次） | 内容质量方案六决策点靠用户口头拍板，无成文轮次结构；批次三「Agnes 密钥丢失」若事先 grill 到「密钥如何持久」这个问题，可省一轮实测 |
| 代理话太多 | 领域语言共享（GLOSSARY） | 术语中英混排散落 17 个技能文件（分镜/storyboard、首帧/keyframe、骨架/skeleton…），每代重解释一遍 |
| 代码不工作 | 反馈环优先（TDD/诊断） | 槽位记账 bug：直觉走了对的路（diag 实证 avgMs=132ms 才定位自锁），但若先有「红线命令」判据会更快；WAF 405 调查同理 |
| 系统变乱 | 深模块/评审/retro | worklog 1147 行承载了本该是 ADR/AGENTS.md 的内容；编码规范零成文（无 CONTRIBUTING/CODING_STANDARDS） |

---

## 2. 与 RadarForge 现状逐项对照（差距→动作）

| 上游概念 | 本仓既有实践（证据） | 差距 | 引入动作 |
| --- | --- | --- | --- |
| grilling（frontier 轮次） | 六决策点拍板（content-quality 方案） | 无轮次结构、无「事实我查决策你拍」分工成文 | S2：开工令前跑 grill-with-docs，frontier 一次一轮 |
| to-spec（模板） | docs/*.md 四份方案文档 | 模板各异，无 User Stories/Testing Decisions 节 | S2：固化 spec 模板入 docs/agents/spec-template.md |
| to-tickets（blocking edges） | 批次 A1/A2/B1/B2…（方案内表格） | 无逐票文件、无依赖边、无验收 checkbox | S2：.scratch/<feature>/issues/NN-slug.md 票制 |
| tdd（seam 约定） | 离线 81/68/42 + E2E + 冒烟（体系已强） | seam 不前置声明；修 bug 不强制先红后绿 | S2：修 bug 必须先给红线命令（见 diagnosing-bugs） |
| diagnosing-bugs（Phase 1 红线） | 槽位 bug 用 diag 数据定位；WAF 405 用直连诊断脚本 | 纪律是直觉不是规则；无 [DEBUG-xxxx] 标记清理法 | S2：诊断纪律成文入 AGENTS.md，六阶段 checklist |
| code-review（双轴） | 提交前 tsc+离线+冒烟自测 | 无 Standards/Spec 双轴；无 Fowler smell 基线 | S2：push 前双轴评审（standards 源=docs/agents/coding-standards.md 新建） |
| retro（环境改进） | worklog.md 每任务分节（1147 行） | 产出只进 worklog 不回写环境（无 AGENTS.md 可回写） | S2：retro 收尾显式产出「环境改进清单」并落 AGENTS.md/检查项 |
| handoff（交接文档） | 会话延续摘要（chat 侧生成） | 不落仓库、无脱敏纪律成文 | S2：跨会话交接落 .scratch/handoff/（引用不复制） |
| research（引用 md） | docs/research-external-survey.md（天然符合） | 无差距，天然符合 | 保持，S1 在 AGENTS.md 指针化 |
| domain-modeling（GLOSSARY/ADR） | 无 GLOSSARY.md、无 docs/adr/ | 决策只活在 worklog 与 commit message | S1：建 GLOSSARY + 追溯 7 篇 ADR |
| writing-for-agents（六技法） | A1 纪律：SKILL.md 唯一事实源（强） | 缺 leading words/正向指令/完成判据/no-op 剪枝技法 | S3：反哺 db/skills 八技能 |
| setup（脚手架） | 无 AGENTS.md/CLAUDE.md/docs/agents/ | 沙箱铁律（with-server/密钥回收/LLM 配额）未成文，靠会话记忆传承 | S1：全套路手架 + 铁律成文 |

---

## 3. 安装设计

### 3.1 已完成（本次提交）

- `repos/mattpocock-skills/`：vendor 快照（1.7MB，125 个 md，上游 commit `4ae2317`，含原 LICENSE 与本地 NOTICE.md）——跟随 `repos/dsh-*` 既有先例（精选文件 + 署名入库）。**这是 L0 参考层的完整安装**：MIT 允许，任何会话/任何 harness 直接可读原文。

### 3.2 三层落位矩阵

| 层 | 载体 | 状态 | 说明 |
| --- | --- | --- | --- |
| L0 源库参考 | repos/mattpocock-skills/ | 已完成 | 只读快照，不在此目录内改写（NOTICE 声明） |
| L1 开发工作流 | AGENTS.md + docs/agents/ + GLOSSARY.md + docs/adr/ + .scratch/ | S1 落地 | 仓库自有约定，版本化、可推送 GitHub，跨 harness 可读——正是上游「可编辑副本」哲学 |
| L2 平台运行时 | db/skills/*/SKILL.md 编写质量 | S3 落地 | 用 writing-for-agents 六技法重审八管线技能 |
| L3 harness 镜像（可选） | /home/z/my-project/skills/<name>/ | 决策点外注 | 该目录已 gitignore（不污染仓库）；把 12 技能镜像进去或让未来会话可经 Skill 工具发现。**列为实验项不推荐现在做**：发现机制未证实，且 AGENTS.md 指针已足够让任何会话找到 repos/ 原文 |

### 3.3 为什么接管 12 个而不是全量 26

- 上游自己的哲学：small / composable / hack around；SCOPE.md 拒绝「为新技能而新技能」——若行为可由既有技能组合出，不新增。
- 本仓实际工作模式：单 agent + IM 指令节奏 + 沙箱单调用 10 分钟硬约束。implement-spec（并行子代理编排）、wayfinder（多会话决策地图）、triage 全流程（无 issue 流入）在这个节奏里是流程税不是增益。
- C 级技能的知识价值仍保留：vendor 全量原文在库，AGENTS.md 的流程图会标注「何时去读 wayfinder/triage」。

---

## 4. 分批落地方案

### 批次 S1：仓库脚手架（半天，无代码改动）

新增文件（全部一次提交）：

1. **AGENTS.md**（仓库根，agent 中立约定文件；本仓无 CLAUDE.md，从零创建）
   - `## Agent skills` 块：指向 docs/agents/{issue-tracker,domain,triage-labels}.md（仿 setup-matt-pocock-skills 输出格式）
   - `## 沙箱铁律`：进程不跨调用存活（with-server.sh 用法）、/tmp 不持久、LLM 配额窗口、密钥只入 db/custom.db 与环境变量、git 推送凭证重配流程——**把六批次以来用血换的隐性知识成文**
   - `## 工作流地图`：仿 ask-matt 的主流程图（想法→grill→spec→tickets→implement(tdd)→review→retro），C/D 级技能标注何时查阅
   - `## 豁免规则`：单文件微改/文案修正/凭证重配类任务免票免评审（流程税控制，决策点⑤相关）
2. **GLOSSARY.md**（仓库根，双语）：Run/Asset/AgentRun/选题 Idea/方向 Direction/分镜 Storyboard/首帧 Keyframe/i2v/篇幅三档 Length Tier/叙事骨架 Skeleton/三通道回退链/诊断分腿 diag legs/向导…约 25~35 条，每条「中文名 | English | 一句定义 | 首用位置」
3. **docs/agents/issue-tracker.md**：本地 markdown tracker 约定（.scratch/<feature>/issues/，一票一文件，编号即依赖序）（决策点②）
4. **docs/agents/triage-labels.md**：五标签词汇（needs-triage/needs-info/ready-for-agent/ready-for-human/wontfix）——即使暂不用 triage 全流程，标签词汇先立住
5. **docs/agents/domain.md**：GLOSSARY 与 ADR 的消费规则（技能运行时先读哪个）
6. **docs/agents/coding-standards.md**：从既有实践提炼（TypeScript strict、离线测试先行、诚实降级不静默、密钥零落盘、中文文档与提交信息、em-dash 禁令可不抄——中文排版需要破折号，明确豁免）
7. **docs/agents/spec-template.md**：to-spec 模板中文化（问题陈述/方案/User Stories/实现决策/测试决策/范围外）
8. **docs/adr/**：追溯 7 篇（决策点⑥）——ADR-0001 篇幅三档默认 medium；0002 视频通道默认 auto；0003 模板库全量带署名；0004 Agnes 池方案与四密钥；0005 批次顺序文章→配图→视频；0006 i2v 换号重试与槽位释放（含三轮实证数据）；0007 SKILL.md 唯一事实源（A1）

**验收**：`ls` 清单齐全；AGENTS.md 内指针全部可达（脚本校验相对路径）；GLOSSARY 术语与代码标识符抽样一致率 ≥90%（抽 20 条比对 src/ 命名）；离线测试不受影响（纯文档新增）。

### 批次 S2：流程接管（下一个特性周期起，随用随检）

- **grill-with-docs**：开工令后先跑 frontier 轮次（每轮编号+推荐答案，事实类问题我自己派子代理查，决策类等拍板）；会话中同步维护 GLOSSARY/ADR
- **to-spec + to-tickets**：拍板完 → spec 按 docs/agents/spec-template.md 落 docs/ → 票落 .scratch/<feature>/issues/（tracer-bullet 垂直切片 + blocking edges + 验收 checkbox）
- **implement + tdd**：逐票实现，票间清上下文；seam 在 spec 的「测试决策」节前置声明；新 bug 修复遵循红-绿（先红线命令后修）
- **diagnosing-bugs**：六阶段纪律，Phase 1 完成判据四项（红线能力/确定性/秒级/代理可跑）；[DEBUG-xxxx] 标记法；3~5 个可证伪假设先排序再测
- **code-review**：push 前双轴——Standards 轴对 docs/agents/coding-standards.md + Fowler 12 smell 基线；Spec 轴对 spec/票；两轴分开报不合并排序
- **retro**：每批收尾在 worklog 追加「环境改进」小节，可执行项回写 AGENTS.md（机械错误→确定性检查，判断题→编码标准）

**验收**：一个完整特性周期五技能链全走通留痕（.scratch/ 票全闭环：全部 checkbox 勾选或显式作废）；修 bug 类提交含「红线命令输出 + 被证伪/证实假设」；双轴评审报告至少 2 份存 .scratch/<feature>/review/。

### 批次 S3：平台反哺（writing-for-agents 六技法 → db/skills 八技能）

| 技法 | 上游定义 | 应用到管线 SKILL.md |
| --- | --- | --- |
| Leading words | 用预训练已带的紧凑词锚定行为区 | 把「不注水/不跑题/诚实降级」类反复叮嘱收拢为术语锚（如「证据锚点」「飞轮」已是雏形），顶层一次定义全文复用 |
| 正向指令 | 否定禁令会激活被禁行为（别想大象） | 把「不要写空洞总结」「不得编造数据」改写为「每段以可验证事实收尾」「数据只来自 metrics 字段」 |
| 步骤完成判据 | 每步以可判定完成条件收尾 | 「写好这一节」→「本节含 ≥2 个证据锚点、字数落在节预算 ±容差、衔接上节结尾钩子」 |
| No-op 剪枝 | 模型默认就会的指令删整句 | 逐句审八技能，删「认真思考」「确保质量」类空载 |
| 渐进披露 | 分支才需要的材料推到指针后 | SKILL.md 顶层只留主干，分节（section/single/expand）保持既有指针结构并复核触发词 |
| 单一事实源去重 | 一个意思只在一处权威定义 | 篇幅三档定义/风格包清单/骨架清单等跨技能重复处收拢到一处 + 指针 |

**验收**（量化）：八技能 SKILL.md 平均 token 数 before/after（目标 -20%±5%，用 tiktoken 或 char/4 估）；eval 抽样 10 篇对比篇幅落带率、骨架符合度、证据锚点密度**不回退**；离线 81/68/42 + 冒烟全绿；db/skills 元数据 `metadata.rebuilt-at` 更新并注明技法批次。

### 批次 S4（可选，低优先，产品灵感——单列不并入主线）

- **wizard → 密钥重灌向导**：本会话已手工重灌 4 次 Agnes 密钥（沙箱回收丢 SettingKV）；生成交互式 bash 向导（读环境变量→PUT→探活→输出池状态），把这段流程变成一条命令
- **grilling → 选题采访器**：入口三方向选择前跑 frontier 轮次，补全选题卡（受众/边界/证据可得性）
- **research 引用纪律 → 文章引用留痕**：对齐遗留的 A4 研究缺口（引用来源落 artifacts，正文标注）

---

## 5. 决策点（六项，请拍板）

| # | 决策 | 选项 A（推荐） | 选项 B | 推荐理由 |
| --- | --- | --- | --- | --- |
| ① | 接管范围 | **12 个 A 级技能**（§1.2 表） | 全量 26 个接管 | 上游哲学=小而可组；C/D 级在本仓节奏是流程税；原文 vendor 已全量在库随时可查 |
| ② | Issue tracker | **本地 .scratch/ markdown** | GitHub Issues（gh 令牌可用） | 匹配沙箱节奏（gh 配置随回收丢失、IM 指令流无 issue 交互界面）；票文件随仓库推送 GitHub 已获远端持久性，两头兼顾 |
| ③ | 根约定文件 | **创建 AGENTS.md** | 创建 CLAUDE.md | 本仓不绑定 Claude Code；AGENTS.md 是 harness 中立标准，vendor 的上游两份都在可对照 |
| ④ | GLOSSARY 形态 | **根级单语境双语** | GLOSSARY-MAP 多语境 | 无 monorepo 信号（上游 setup 的判据）；双语因代码中英混排是既成事实 |
| ⑤ | 批次 S3（平台反哺）时机 | **本期做**（S1→S2→S3 顺序） | 缓到下期 | 与 A1 纪律同线、收益最大且不依赖 S2 实战数据；S2 需等下个特性周期才有验收场景，S3 不用等 |
| ⑥ | 追溯 ADR 范围 | **7 篇里程碑**（§4-S1 清单） | 挖掘全部 64 提交 | 7 篇覆盖所有影响今日行为的决策；全量挖掘是考古不是工程，增量 ADR 随 S2 起常态化补 |

---

## 6. 验收与度量总表

| 批次 | 度量 | 目标值 | 采集方式 |
| --- | --- | --- | --- |
| S1 | 脚手架文件齐备 | 13 个新文件全在 | ls + AGENTS.md 指针可达性脚本 |
| S1 | GLOSSARY 命名一致性 | ≥90%（抽 20 条） | 人工+rg 抽样比对 src/ 标识符 |
| S2 | 五技能链周期闭环 | ≥1 个完整特性全链留痕 | .scratch/ 票 checkbox 全勾/显式作废 |
| S2 | 红线纪律 | bug 修复类提交 100% 附红线命令输出 | git log 抽查 + worklog |
| S3 | SKILL.md token 缩减 | 平均 -20%±5% | before/after 计数脚本 |
| S3 | 产出质量不回退 | 篇幅落带率/骨架符合度/锚点密度 三指标 ≥ 基线 | eval 抽样 10 篇 |
| 全程 | 回归零破坏 | tsc 零错 + 离线 81/68/42 + 冒烟全绿 | 既有回归体系 |

## 7. 风险与权衡

1. **上下文常驻成本**：AGENTS.md 每会话常驻。控制：全文 ≤150 行，沙箱铁律与流程图为主，细则全部指针化到 docs/agents/（上游「context pointer」技法本身就会用在 AGENTS.md 的写法上）。
2. **流程税 vs 采纳纪律**：小任务走全链是负收益。豁免规则（S1 内容）显式列免票场景；票的最小尺寸=一个 fresh context window 能装下（上游判据直接采用）。
3. **vendor 副本漂移**：上游活跃（issues 184）。策略：NOTICE 记录上游 commit；每次使用前看上游 CHANGELOG 是否动了被接管技能；动了才重拉快照，被动漂移不影响我们已接管的流程（流程已落仓库自有文件）。
4. **双轨维护风险**：L1 流程文件（我们的）与 L0 原文（上游的）语义漂移。策略：AGENTS.md 流程图每处标注「源技能：repos/mattpocock-skills/skills/<name>」，retro 时抽查一致性。
5. **S3 的提示词回归风险**：SKILL.md 改动直接影响产线。策略：S3 落地时逐技能改+跑 eval，不用一次性全改；元数据 rebuilt-at 留痕可回滚。

## 8. 上游致谢与许可

- mattpocock/skills by Matt Pocock, MIT License (c) 2026 —— vendor 快照含原 LICENSE 与本地 NOTICE.md（provenance：上游 commit `4ae2317`）
- 本方案采纳其流程纪律与文档技法，适配为 RadarForge 仓库自有约定；产品管线（db/skills）的改编同样遵循 MIT 义务（wewrite 系技能本就带 `license: MIT` 元数据与 origin-pack 署名惯例，S3 沿用）
- 引入不含其 .claude-plugin/安装器（我们的落点是仓库文件而非插件市场）；上游品牌（aihero.dev/newsletter）不出现在产品任何用户可见面
