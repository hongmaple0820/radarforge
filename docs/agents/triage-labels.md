# Triage Labels（分诊标签词汇）

技能体系用五个规范分诊角色。本表把角色映射到本仓实际使用的标签字符串。

| 技能里的角色 | 本仓标签 | 含义 |
| --- | --- | --- |
| `needs-triage` | `needs-triage` | 待维护者评估 |
| `needs-info` | `needs-info` | 等报告方补充信息 |
| `ready-for-agent` | `ready-for-agent` | 已完整规约，可交给 agent 独立执行 |
| `ready-for-human` | `ready-for-human` | 需要人工实现（或人工才能完成的步骤） |
| `wontfix` | `wontfix` | 明确不处理 |

## 使用说明

- 标签字符串与规范名**保持一致，不改写**（本仓 tracker 是本地 markdown，`Status:` 行直接写标签字符串）
- 技能提到某个角色（如「打上 AFK-ready 标签」）时，查本表用对应字符串
- 本仓暂无外部 issue 流入：**triage 全流程未启用**，此表先立词汇，等首个外部 issue 出现再考虑启用源技能 `repos/mattpocock-skills/skills/engineering/triage/`

## 判定基准

外部 issue 的取舍对照 `repos/mattpocock-skills/SCOPE.md` 的精神：只接「真实会话中观察到的失败」，假想优化直接出局。
