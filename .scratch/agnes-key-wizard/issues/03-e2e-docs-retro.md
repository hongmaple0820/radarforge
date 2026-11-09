# 03-端到端与回写：真密钥一条命令 + 文档 + ADR + retro

Status: ready-for-agent
Blocked by: 02

## 目标

重灌从「背三段嵌套命令」变成「跑一条命令」的完整证据链：真密钥端到端留痕、AGENTS.md/GLOSSARY/README 回写、ADR-0008 记录本地化适配决策、retro 环境改进小节收口 S2 首演。

## 验收

- [ ] 真密钥端到端（**待补**，降级证据已留）：本会话密钥不可得（沙箱回收，密钥零落盘的代价，AGNES_KEYS unset）→ 按方案风险 6 降级：假格式密钥走**真实默认链路**全通——向导 → with-server → boot-restore（全新库自愈）→ next dev → PUT 保存✓ → 回读一致✓（accounts=2 enabled=true）→ agnesPool.configured=true✓（imageCapacity=40RPM videoReady=2）→ 探活✗（401 密钥无效，预期红，实证出站连通）→ 向导 rc=1 透传✓；真密钥可用时跑同一条命令即收口（预期四腿全绿）
- [x] 端到端输出 grep 断言：完整明文 0 次命中（两份日志 /tmp/wizard-e2e.log、/tmp/wizard-e2e2.log 均验证）
- [x] AGENTS.md 铁律 4 重灌命令替换为向导一条命令（票 01 已换路径、本票换形态）；GLOSSARY 工作流分区补「密钥重灌向导」词条（带锚点，42→43 条）
- [x] README.md 快速开始节加向导一行（紧邻 SettingKV 密钥说明）
- [x] `docs/adr/0008-key-reinjection-wizard.md`：零落盘边界 + 非 TTY 代理模式 + 库区原样复用三决策（含不变量两象）
- [x] worklog.md 追加任务记录 + 「环境改进」小节；可执行项已回写 AGENTS.md（铁律 1/2/3 三处）
- [x] 回归门：tsc 零错 + 离线三套 68/42/81 + c3 冒烟 10/10 全绿

## Comments

- 2026-11-09 端到端环境插曲（诚实记录）：首跑挂在 prisma 引擎下载网络抖（boot-restore 两轮重试+镜像兜底均败，/tmp 镜像回收后为空）；手动第三次直跑 `npx prisma generate`（121ms 成功，wasm 本地解析）+ `npx prisma db push`（14ms 建库）后重跑向导即全链通——实证「沙箱回收后重跑一次向导即可自愈」的叙事成立，且 prisma 恢复序已回写铁律 3。
- 留存状态：db/custom.db 现含 2 个 401 假键（探活红实证）；首次真密钥重灌时 PUT 整池替换自动清理，无需手工干预。
- 真密钥收口路径：密钥可用时执行 `AGNES_KEYS="<真实密钥>" bash scripts/agnes-key-wizard.sh`，四腿全绿即勾选首项。（with-server 传参陷阱：.sh 须裸路径，已回写铁律 1）
