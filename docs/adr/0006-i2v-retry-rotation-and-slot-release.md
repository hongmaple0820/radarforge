# 0006 — i2v 换号重试与槽位释放（含槽位自锁事故）

> 状态：已接受（补强①② 2026-11-06 `d18ab8b`；槽位释放修复 2026-11-07 `f0eb3c9`）
> 溯源：`src/lib/gateway/providers/agnes/agnes-video.ts` submitVideo；`pool.ts` acquireVideoSlot/releaseVideoSlot；`src/lib/gateway/types.ts` VideoTask.accountRef

## 背景

i2v 提交（POST /videos）在免费档频繁遇 429/503 queue_full，且**队列按账号隔离**——A 账号满载不代表 B 账号满载，这给换号重试提供了协议依据。但换号重试引入后暴露一个自锁 bug（本次事故的全部价值所在）：

**槽位自锁事故**：`acquireVideoSlot` 取号即预记 busy 60s（防同一账号视频 1 任务/分钟超限），但 503 失败的提交**不占服务端任务位**——我方却把账记上了。分镜 1 换号 4 连败后 4 账号全部标 busy，分镜 2/3 被「全部账号占用中」秒拒。诊断实证：submit 分腿 3 错误 avgMs=132ms——连 HTTP 都没发出去，证明是本地记账自锁而非远端拒绝。

## 决策

submitVideo 重构三件套：

1. **换号重试**：429/503/5xx 按账号隔离换号，≤活跃账号数/轮 × 3 轮，轮间节流 8s（防轰炸免费档）；401/403 认证类直报不重试
2. **失败即释放**：`releaseVideoSlot` 在 401/403/无 taskId/fetch failed 全路径释放预记 busy——**失败提交不占槽位**是本 ADR 的核心不变量
3. **占用等待**：全部占用时不秒拒，waitMs 在 2min 预算内等释放；全败带错峰指引（诚实降级）

配套：`VideoTask.accountRef` 轮询绑定提交账号（此前固定第一账号，跨账号查任务 404 死等）。

## 实证（三轮）

- 周六 11:2x 队列半满：分镜 1/2 诚实兜底、分镜 3 真实提交 → poll ~7min → 入片 `#3:i2v 8s`，13/13 全绿
- 周末两采样点（上午/傍晚）：3 镜 × 3 轮 × 4 账号全 503，节流+换号按设计工作，每镜约 20s 诚实兜底
- 工作日上午：分镜 1 次提交即成功（`#1:i2v 3.4s`），diag errors=0 首次全零——队列时段规律（周末满载/工作日空闲）成为排程输入

## 不变量

- 失败提交绝不留槽位账（任何新失败路径必须接 releaseVideoSlot）
- 诊断先于假设：槽位自锁若先立红线命令（分腿 avgMs 可判定），定位会更快——此教训已成 coding-standards 第 5 条
