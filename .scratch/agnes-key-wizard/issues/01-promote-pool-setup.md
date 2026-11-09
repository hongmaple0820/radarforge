# 01-pool-setup 晋升：重灌脚本从 tmp 到常驻路径

Status: ready-for-agent
Blocked by: （无，可立即开工）

## 目标

`scripts/agnes-pool-setup.mjs` 成为常驻基础设施：新路径行为不变，全部活引用指向新位置，AGENTS.md 铁律 4 命令复制即可执行。

## 验收

- [x] 红线命令 `node scripts/agnes-pool-setup.mjs` 先红（MODULE_NOT_FOUND，rc=1）后绿：退出码 1 且输出含「AGNES_KEYS」提示（缺失 env 的标准行为）
- [x] `scripts/tmp/agnes-pool-setup.mjs` 不再存在（git mv，无副本残留）
- [x] AGENTS.md 铁律 4 命令路径更新：直跑命令换新路径，另提前写入向导一条命令（向导在票 02 落地）
- [x] `docs/adr/0004-agnes-account-pool.md` 溯源行追加晋升注记（不重写历史正文）
- [x] 回归门：tsc 零错 + 离线三套 68/42/81 全绿

## Comments

- 2026-11-09 实现：`git mv scripts/tmp/agnes-pool-setup.mjs scripts/agnes-pool-setup.mjs`；头注释同步（推荐入口指向向导）；AGENTS.md 铁律 4 同批改写；ADR-0004 加注记行。
- 红绿证据：红线先红（`Cannot find module '/home/z/my-project/scripts/agnes-pool-setup.mjs'`）→ 晋升后同命令输出「AGNES_KEYS 环境变量缺失或格式不对」rc=1（预期行为）。
