# 密钥重灌向导（agnes-key-wizard）方案

> 状态：已拍板（决策点见 §5，拍板记录同节末）
> 日期：2026-11-09 · 作者：主 Agent（Z.ai）
> 姊妹篇：`docs/mattpocock-skills-adoption-plan.md`（S4 批次首项；本特性同时作为 S2 流程接管的首次首演载体）

## 0. 结论摘要

把「沙箱回收后 Agnes 密钥手工重灌」从一条三段嵌套引号的长命令变成一条命令的 bash 向导 `scripts/agnes-key-wizard.sh`：密钥获取（环境变量优先，TTY 隐藏输入兜底）→ 校验与脱敏预览（`--dry-run` 可零副作用干跑）→ 调 `with-server.sh` 完成落库（PUT）→ 探活 → 池状态汇总，退出码即成败。密钥全程零落盘（只经环境变量与 `db/custom.db` 的 SettingKV），输出全程脱敏。配套把 `scripts/tmp/agnes-pool-setup.mjs` 晋升为常驻 `scripts/agnes-pool-setup.mjs`，AGENTS.md 铁律 4 的重灌命令同步替换。本特性按 S2 纪律全流程留痕（frontier 轮次 → 本方案 → `.scratch/` 票 → 双轴评审 → retro），作为 S2 首演。

## 1. 问题陈述与取证

现状重灌一次密钥要走的链（取证自 `worklog.md:1086` 与 `AGENTS.md:29`）：

| 步骤 | 现状 | 证据 |
| --- | --- | --- |
| 记住命令形态 | `AGNES_KEYS="k1,k2,..." bash scripts/with-server.sh "node scripts/tmp/agnes-pool-setup.mjs"` 三段嵌套引号 | AGENTS.md 铁律 4 |
| 脚本位置在临时区 | `scripts/tmp/` 惯例是「一次性探针」位置，重灌却是每次回收后的常驻需求 | AGENTS.md 豁免规则第 4 条 |
| 坑位靠记忆 | PUT 非 POST（405 空响应）、sk- 前缀过滤、脱敏格式，散在脚本注释与 worklog | `scripts/tmp/agnes-pool-setup.mjs` 头注释 |
| 失败无前置判别 | 环境变量缺失/格式错要到 node 腿才报错，无前置校验与掩码预览 | `scripts/tmp/agnes-pool-setup.mjs:46-50` |

根因：重灌流程是人肉编排——agent 每次重读 AGENTS.md 复原命令，未固化为工具。本方案目标：一条命令 + 每步可判定。

## 2. 背景与研究

- 上游 wizard 技能（`repos/mattpocock-skills/skills/engineering/wizard/SKILL.md`）：bash 向导方法论——库区（stage/pause/confirm/ask_secret 等）自 `template.sh` 原样复用、只写 STAGES 区；「Done when」判据；步骤禁止凭空发明（本向导不引用任何控制台 URL，密钥来源由操作者自知）。
- 本仓先例：`scripts/with-server.sh`（编排器：boot-restore 自愈 → 清旧 server → 起 next dev → 跑命令 → 退出）；`scripts/tmp/agnes-pool-setup.mjs`（PUT/回读/池状态/探活四腿判据）；ADR-0004（账号池与密钥存放：密钥只进 SettingKV）。
- 本地化适配差异（决策见 §5 D3/D9）：上游模板面向 `.env`/GitHub secrets 目标，本仓铁律 4 禁密钥落盘 → 库区保留但不调用 `write_env`/`set_secret`；上游假设人类 TTY，本仓主用例是 IM 代理非交互跑 → 双模式（非 TTY：env 输入 + 免确认门 + 进度照样打印）。

## 3. 方案设计

向导三阶段（`TOTAL_STAGES=3`，库区自 template.sh 逐字拷贝）：

| 阶段 | 行为 | 完成判据 |
| --- | --- | --- |
| ① 密钥获取 | `AGNES_KEYS` 环境变量优先；TTY 且缺失 → `ask_secret` 隐藏输入；非 TTY 且缺失 → 退出码 1 + 补救提示行 | 变量非空，或以码 1 显式失败并打印提示 |
| ② 校验与脱敏预览 | 逗号分隔 → trim → `sk-` 前缀过滤 → 去重；逐个脱敏展示（前 6 位…后 4 位（N 字符），与 pool-setup 同格式——单一事实源）；`--dry-run` 到此为止；TTY `confirm` 门（PUT 覆盖池语义） | 有效数 ≥1 才继续；输出可 grep 验证无明文 |
| ③ 重灌执行 | `bash -c "$AGNES_WIZARD_SERVER_CMD"`（默认 `bash scripts/with-server.sh "node scripts/agnes-pool-setup.mjs"`）；`AGNES_KEYS` export 给子进程；退出码透传 | 子命令 rc 即向导 rc；finish 汇总 |

测试缝（seam，前置声明）：
- `--dry-run` 旗标——停在阶段②，零副作用（不起 server、不写库）。
- `AGNES_WIZARD_SERVER_CMD` 环境变量——server 腿可注入桩命令，断言 env 传播与退出码透传。

概念 × 既有实践 × 差距 × 动作：

| 概念 | 既有实践 | 差距 | 动作 |
| --- | --- | --- | --- |
| 输入通道 | env 直传 node 腿 | 无前置校验、无人类输入通道 | 阶段①② |
| 恢复序 | 铁律 3：boot-restore → 重灌，两步人肉 | 一步 | with-server 内嵌 boot-restore，向导只调它 |
| 落库/探活/池状态 | pool-setup 四腿全绿判据 | 位置在 tmp（一次性语义） | 晋升 `scripts/` |
| 重灌命令记载 | AGENTS.md 三段嵌套命令 | 易错难背 | 换成 `bash scripts/agnes-key-wizard.sh` |
| 词汇 | GLOSSARY 无对应词条 | — | 补「密钥重灌向导」词条（带锚点） |

## 4. 分批落地

| 批次 | 范围 | 文件 | 预估 |
| --- | --- | --- | --- |
| 01 晋升（prefactor） | git mv 脚本到常驻路径 + 引用同步 | `scripts/agnes-pool-setup.mjs`、`AGENTS.md`、`docs/adr/0004` 注记 | ~15 行改动 |
| 02 向导核心 | 库区拷贝 + 三阶段 + 双模式 + 测试缝 + selftest | `scripts/agnes-key-wizard.sh`、`scripts/tmp/agnes-wizard-selftest.sh`、`scripts/tmp/agnes-wizard-stub.sh` | ~300 / 60 / 15 行 |
| 03 端到端与回写 | 真密钥一条命令跑通留痕 + 文档回写 + ADR-0008 + retro | `.scratch/` 票勾选与 Comments、`GLOSSARY.md`、`README.md`（快速开始一行，若合）、`docs/adr/0008-*` | ~80 行 |

依赖：01→02→03 线性（02 的默认命令引用 01 的新路径；03 需 02 成品做端到端）。

## 5. 决策点

| # | 决策 | 选项 A（推荐） | 选项 B | 推荐理由 |
| --- | --- | --- | --- | --- |
| D1 | 向导形态 | bash 向导（wizard 模板库 + TTY/非 TTY 双模式） | 扩展现有 node 脚本 | wizard 技法价值在 HITL UX 库；node 腿复用不动 |
| D2 | 输入通道 | env 优先 + TTY `ask_secret` 兜底 | 纯交互逐个输入 | IM 代理代跑是主用例 |
| D3 | 落盘边界 | 零落盘：不调用 `write_env`/`set_secret`，密钥只走 env → PUT → SettingKV | 写 `.env` 复用 | 铁律 4 明文禁令 |
| D4 | server 编排 | 向导内嵌 with-server（自动含 boot-restore 自愈） | 要求先起 server | 铁律 1 进程不跨 Bash 调用 |
| D5 | 脚本位置 | tmp → `scripts/` 晋升 | 留 tmp | tmp = 一次性探针惯例；重灌是常驻基础设施 |
| D6 | 验收判据 | 五判据：bash -n / 缺 env 退出 1 + 提示 / 坏格式 0 有效退出 1 / 输出无明文（grep 断言）/ 端到端四腿 ok | 只做端到端 | 可判定、红绿可先立 |
| D7 | 测试落位 | selftest + 桩落 `scripts/tmp/`（一次性探针惯例） | 并入离线三套 | bash 腿不属 ts 套件；不扰动 68/42/81 基线 |
| D8 | 文档回写 | AGENTS.md 铁律 4 + GLOSSARY 词条 + README 视结构 | 仅 AGENTS.md | wizard 技能 step 4 要求可发现性；词汇同步是 domain-modeling 纪律 |
| D9 | 非交互确认语义 | 非 TTY 免门 + 打印覆盖语义说明；TTY `confirm` 门 | 一律免门 / 一律要门 | 代理跑 = 显式意图；人类跑 = 护门 |
| D10 | 留痕范围 | docs/ 方案 + 3 票 + 双轴评审 2 份 + ADR-0008 | 精简只留票 | S2 首演要全链证据 |

> **拍板记录（2026-11-09）**：开工令「继续推进」（本 continuation 无交互窗口）+ 用户既有「按你的推荐建议来」拍板模式（方案 §5 先例）→ D1~D10 全按选项 A 采纳，全部留痕可翻案；下个交互窗口可复议任一项，翻案成本 = 单点改动 + 回归门。

## 6. 验收与度量

| 批次 | 度量 | 目标 | 采集方式 |
| --- | --- | --- | --- |
| 01 | 新路径行为不变 | `node scripts/agnes-pool-setup.mjs`（无 env）退出 1 且提示含「AGNES_KEYS」 | 红线命令（先红后绿） |
| 02 | selftest 全绿 | 6 断言全过（A1/A2/B1/B2/C1/C2）+ `bash -n` 零错；shellcheck 缺失如实记录 | `scripts/tmp/agnes-wizard-selftest.sh` |
| 03 | 端到端一条命令 | 真密钥四腿 ok（保存/回读/池状态/探活 N/N）+ 输出 grep 无明文 + 留痕票 Comments | 票内命令输出摘录 |
| 全批 | 回归门 | tsc 零错 + 离线 68/42/81 + c3 冒烟 | AGENTS.md 回归门命令块 |

## 7. 风险与权衡

1. env 传密钥在同 uid 进程环境可读 → 沙箱单用户可接受；与现状同路径，不新增暴露面；输出与落盘零明文双断言兜底。
2. 非 TTY 免确认门的误覆盖 → PUT 语义 = 整池覆盖（`src/app/api/settings/route.ts` accounts 数组整体替换）；TTY 门 + AGENTS.md 记载语义 + 同键重放幂等。
3. 库区与上游模板漂移 → 库区逐字拷贝零改动（一致性即价值）；本仓适配只出现在 STAGES 区与文件头注释。
4. shellcheck 不可用（实证 `command -v shellcheck` 为空）→ `bash -n` + selftest 断言 + dry-run 路径覆盖；如实记录，不假装跑过。
5. 测试桩写盘污染 → 桩 marker 只写常量字符串；selftest 用假格式密钥（`sk-` 前缀的测试串），全程不入盘不写库。
6. 真密钥端到端依赖外部密钥时效 → 批次 03 允许「本会话密钥仍有效」前提；失效则降级为桩端到端 + 显式留痕待补，不静默假装。

## 范围外

- SEARCH_KEY 等其他 scope 重灌（`scripts/boot-restore.mjs` 已覆盖，见 §2）
- Agnes 模型/rpm/strategy 配置（settings UI 已有）
- `.env` / GitHub secrets 写入路径（铁律 4 禁）
- S4 其余两项（选题采访器、引用留痕）：另行排期
- m02 字数边界观察项（S3 遗留，与本批无关）
