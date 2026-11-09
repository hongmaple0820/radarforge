# Issue tracker: 本地 Markdown 票制

> 采纳决策：方案决策点②（2026-11-09 用户拍板「按推荐项」）——本地 `.scratch/` 而非 GitHub Issues。
> 理由：匹配沙箱节奏（gh 配置随回收丢失、IM 指令流无 issue 交互界面）；票文件随仓库推送 GitHub，已获远端持久性，两头兼顾。

## 约定

- 一个特性一个目录：`.scratch/<feature-slug>/`
- 规范落 `.scratch/<feature-slug>/spec.md`（也可直接引用 `docs/<feature>-plan.md`，二选一后在票里注明）
- 实现票一票一文件：`.scratch/<feature-slug>/issues/NN-<slug>.md`，编号从 `01` 起，**永不**合并成单个大票文件
- 票头近顶处一行 `Status:` 记分诊态（标签词汇见 `triage-labels.md`）
- 一行 `Blocked by: NN, NN` 声明阻塞边；所列票全部 resolved 才解锁
- 讨论与过程记录追加在文件底部 `## Comments` 标题下
- 票体含**验收 checkbox**（`- [ ]`），闭环 = 全部勾选或显式作废并注明理由

## 票的写法（to-tickets 纪律）

- **tracer-bullet 垂直切片**：每票贯穿「改码 → 测试 → 留痕」全栈可验证，不按层拆（不出现「先改完所有 ts 再补测试」票）
- 每票自包含：一个 fresh context window 装得下（上游判据，超出即拆）
- 编号即依赖序：阻塞边用小编号指向先决票

## 模板

```markdown
# NN-slug：一句话目标

Status: ready-for-agent
Blocked by: （无 / NN, NN）

## 目标
（这票做完后什么变得可验证）

## 验收
- [ ] 判据一（可判定，不写「工作正常」）
- [ ] 判据二
- [ ] 回归门：tsc 零错 + 离线三套全绿

## Comments
```

## 「发布到 tracker」= 建文件

任何技能/流程说「publish to the issue tracker」时：在 `.scratch/<feature-slug>/` 下新建文件（目录不存在则先建）。

## 「取相关票」= 读文件

用户会直接给路径或票号；按路径读文件即可。

## 现状说明

本仓暂无外部 issue 流入，tracker 主要承接规范拆票产物；triage 全流程未启用，仅保留标签词汇。
