# 双轴评审 · Standards 轴（agnes-key-wizard）

> 评审人：主 Agent（Z.ai）· 2026-11-09 · 基线：`docs/agents/coding-standards.md` 14 条 + Fowler 12 smell
> 与 Spec 轴分开报告，不合并排序（双轴纪律）。

## 对照 14 条标准

| # | 标准 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | tsc 零错 | ✓ | 本批零 ts 改动；门重跑 rc=0 |
| 2 | 语言分层 | ✓ | bash 注释/输出中文、标识符英文（AGNES_WIZARD_SERVER_CMD 等自述命名） |
| 3 | em-dash 豁免 | ✓ | 中文破折号，无违规 |
| 4 | 分层测试 | ✓ | 离线 68/42/81 → c3 冒烟 10/10 → selftest（scripts/tmp 一次性探针，D7） |
| 5 | 红先绿后 | ✓ | 票 01（MODULE_NOT_FOUND→标准提示）；票 02（selftest 5 红→7 绿），票内留痕 |
| 6 | SKILL.md 改动门 | ✓ 不适用 | db/skills 未动，无聚焦 E2E 义务 |
| 7 | 诚实降级 | ✓ | 探活 401 显式红；prisma 网络抖显式报错；真密钥降级+待补留痕 |
| 8 | 职责分离 | ✓ | 向导=输入/校验/编排；server 腿=node（PUT/探活）；掩码格式注释互指 |
| 9 | 沙箱适配 | ✓ | 无常驻进程；单次 <10min（timeout 套用）；with-server 内嵌自愈 |
| 10 | 密钥零落盘 | ✓ | write_env/set_secret 不调用；明文 grep 0 命中（两日志）；dry-run 假键零副作用实证 |
| 11 | .env 无新写入 | ✓ | 本批未触碰 .env |
| 12 | 推送凭证还原 | ✓ | 收口 push 时执行并验证（remote 还原后确认） |
| 13 | 文档规范 | ✓ | spec 全节；正式文档无 emoji。注：bash 终端 UI 的 ✓/⚠/▸ 来自上游库区逐字复用（ADR-0008 不变量），非正式文档，归类接受 |
| 14 | 提交信息惯例 | ✓ | 一段式事实陈述（收口提交落地） |

## Fowler 12 smell 对照

- **duplicated code（低危，接受）**：掩码格式「前6…后4（N 字符）」在 bash（向导）与 JS（pool-setup）两处实现——跨语言无法共享单一实现；对冲=格式约定一致 + 注释互指（单一事实源的精神落地为「同格式约定」）。不构成修改项。
- **long function（低危，接受）**：`run_wizard` STAGES 区 ~150 行三阶段——上游模板形态即扁平顺序结构，拆函数破坏模板一致性（ADR-0008）。不构成修改项。
- 其余十一种（mystery name / global data / data clumps / …）：未见或不适用（`local`/`declare -A` 限定作用域；环境变量 AGNES_KEYS 为契约性全局，设计内）。

## 发现（含对冲）

1. 【中·已知妥协】server 腿失败时 `finish()` 仍打印 "✓ Setup complete"（库区函数，ADR-0008 不变量禁改）——视觉语义有歧义。对冲已落地：失败路径先打 `⚠ server 腿退出码 N`，末行显式「向导退出码：N（透传）」，退出码为本义。判定：可接受，不改库区。
2. 【低】selftest B2 在 B1 红阶段属空洞通过（空输出无明文）——B1 转绿后 B2 才有判别力；已在票 02 Comments 留痕。
3. 【低】TTY 路径（ask_secret 隐藏输入/confirm 门）未经真终端测试（沙箱无法模拟 TTY）——静态审查 + `bash -n` 通过；库区函数为上游已验证代码。留待人类首次使用时实证。

## 结论

**Standards 轴：零阻塞项。** 2 项已知妥协均有显式对冲且留痕；可随批合并。
