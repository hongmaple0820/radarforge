# 0008 — 密钥重灌向导：一条命令与零落盘边界

> 状态：已接受（2026-11-09，S4 批次首项 + S2 流程首演，方案 `docs/agnes-key-wizard-plan.md`）
> 溯源：`scripts/agnes-key-wizard.sh`；`scripts/agnes-pool-setup.mjs`（server 腿，自 `scripts/tmp/` 晋升）；`scripts/with-server.sh`；ADR-0004（密钥存放）

## 背景

沙箱回收重置 `db/custom.db`（ADR-0004 的 SettingKV 随之丢失），每次恢复都要人肉复原一条三段嵌套引号的长命令（`AGNES_KEYS="..." bash scripts/with-server.sh "node scripts/tmp/agnes-pool-setup.mjs"`），坑位（PUT 非 POST 405、sk- 前缀过滤、脱敏格式）全靠记忆与重读 AGENTS.md。上游 wizard 技能提供了 bash 向导方法论，但默认落点（`.env` / GitHub secrets）与本仓铁律 4 冲突。

## 决策

- **一条命令**：`AGNES_KEYS="sk-...,sk-..." bash scripts/agnes-key-wizard.sh`，三阶段（密钥获取 → 校验与脱敏预览 → 重灌执行），退出码透传 server 腿结果
- **零落盘边界（本地化核心）**：库区的 `write_env`/`set_secret` 保留但不调用——密钥只走环境变量 → PUT → SettingKV（`db/custom.db`，gitignored）；输出全程脱敏（前 6 位…后 4 位），与 pool-setup 同格式
- **非 TTY 代理模式**：stdin 非 TTY 时 `exec < /dev/null`（防常开管道悬挂库区 read）+ 免确认门（代理跑 = 显式意图）；TTY 人类走 `ask_secret` 隐藏输入 + `confirm` 门（PUT 整池覆盖语义）
- **库区逐字复用**上游 `template.sh`（一致性即价值），本仓适配只出现在文件头注释与 STAGES 区
- **测试缝**：`--dry-run`（停在阶段②零副作用）；`AGNES_WIZARD_SERVER_CMD`（server 腿桩注入）

## 后果

- 重灌从「背命令」变成「跑命令」；输入归一化（trim/过滤/去重）后回写 `AGNES_KEYS` 再导出，预览即落库内容（单一事实源）
- 探活失败/网络抖动等通过退出码与显式输出暴露，诚实降级不静默
- 后续同类 HITL 流程（换密钥、换库、迁移）沿用本向导形态与测试缝约定

## 不变量

- 向导永不调用 `write_env`/`set_secret` 写密钥材料（发现即违反铁律 4 与本 ADR）
- 库区与上游模板的 diff 保持为零；适配只在 STAGES 区演进
