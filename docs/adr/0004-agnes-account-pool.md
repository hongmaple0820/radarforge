# 0004 — Agnes 多账号池化与密钥存放

> 状态：已接受（池化引入 2026-10-29；四密钥扩容 2026-11-06，commit `d18ab8b`）
> 溯源：`src/lib/gateway/providers/agnes/pool.ts`（移植自 dsh-agnes-multimodal 调度设计）；`scripts/tmp/agnes-pool-setup.mjs`

## 背景

Agnes 免费档限额紧：图片约 20 RPM、视频 1 任务每分钟，且**按账号隔离**。单账号既撑不起图文线批量生图，也撑不起视频线多镜 i2v。扩容只有池化一条路（同账号多 Key 不叠加限额）。

## 决策

- 多账号池：round-robin / least-loaded 选号 + 滑动窗口 RPM 限频 + 连续 429/401 熔断 30s + 失败换号重试（调用方驱动，见 ADR-0006）
- **密钥只存 SettingKV**（键 `provider:agnes`）于 `db/custom.db`（gitignored）——零落盘铁律；脚本经环境变量 `AGNES_KEYS` 传入，**PUT** `/api/settings` 写入（POST 会 405）
- 池状态透出：GET `/api/video-runs` 的 agnesPool 字段；探活走 GET /models（零成本）
- 当前规模：4 密钥（2026-11-06 重配，探活 4/4）

## 实证

- 密钥重灌流程在沙箱回收后跑通 4 次（每次约 1 分钟，探活 63~194ms）
- 沙箱回收会重置 `db/custom.db`：密钥丢失是**预期行为**，靠重灌命令恢复（AGENTS.md 沙箱铁律 3/4）

## 后果与不变量

- 不可变量：密钥永不入仓库/日志/提交；发现落盘即事故
- 换号重试与槽位记账的完整纪律见 ADR-0006（本 ADR 只管池化与存放）
