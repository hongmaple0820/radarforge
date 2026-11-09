#!/bin/bash
# agnes-wizard-stub.sh —— 向导 server 腿测试桩（selftest C 段专用，一次性探针）
# 断言 AGNES_KEYS 已传播到 server 腿子进程；marker 只写常量字符串（不写任何密钥材料，铁律 4）
# 退出码由 AGNES_WIZARD_STUB_RC 控制（默认 0），用于断定向导的退出码透传
set -u
if [ -z "${AGNES_KEYS:-}" ]; then
  echo "STUB-FAIL: AGNES_KEYS 未传播到 server 腿"
  exit 9
fi
echo "STUB-OK: AGNES_KEYS 已传播（长度 ${#AGNES_KEYS} 字符，内容不打印）"
echo "stub-ran" > scripts/tmp/.wizard-stub-marker
exit "${AGNES_WIZARD_STUB_RC:-0}"
