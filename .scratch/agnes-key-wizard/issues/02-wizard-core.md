# 02-向导核心：三阶段 bash 向导 + 双模式 + 测试缝

Status: ready-for-agent
Blocked by: 01

## 目标

`AGNES_KEYS="..." bash scripts/agnes-key-wizard.sh [--dry-run]` 一条命令完成密钥获取 → 校验脱敏预览 → 重灌执行三阶段；TTY 人类与非 TTY 代理双模式；密钥零落盘、输出零明文，判据全部由 selftest 自动断言。

## 验收

- [x] selftest 六断言全绿（实跑 7/7：A1/A2/B1/B2 双键各一/C1/C2）——`scripts/tmp/agnes-wizard-selftest.sh`
- [x] `bash -n scripts/agnes-key-wizard.sh` 零错；shellcheck 实证不可用（`command -v shellcheck` 空，沙箱未装）——如实记录，未假装跑过
- [x] 库区与上游 template.sh 逐字一致：`awk` 提取两文件库区 diff 零差异（曾手抄引入 set_var 两处漂移，已回正后复验 LIB-IDENTICAL）
- [x] 非 TTY 模式不依赖 read 交互：实证——首次跑 selftest 曾悬挂 120s 超时（沙箱 stdin 为常开管道，库区 pause 的 read 不返回），修复=STAGES 区开头 `[[ ! -t 0 ]] && exec < /dev/null`（非交互契约 D2/D9：非 TTY 只认 AGNES_KEYS），库区未动；修复后 timeout 60 内全绿
- [x] `--dry-run` 零副作用实证：rc=0、marker 未落盘、无 server 腿执行、密钥未导出到子进程
- [x] 回归门：tsc 零错 + 离线三套 68/42/81 全绿

## Comments

- 2026-11-09 实现：库区逐字复用上游；STAGES 区三阶段（密钥获取/校验脱敏预览/重灌执行）+ 双模式 + 归一化回写（去重/过滤后 export，预览=落库内容，与 pool-setup 过滤语义一致）
- 额外发现：沙箱 stdin 常开管道会悬挂上游模板的 pause——票 03 retro 回写 AGENTS.md 铁律
