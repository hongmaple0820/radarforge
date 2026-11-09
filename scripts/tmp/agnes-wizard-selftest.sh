#!/bin/bash
# agnes-wizard-selftest.sh —— 向导核心红线自测（S2 首演 · 票 02 判据，先红后绿）
# 用法：bash scripts/tmp/agnes-wizard-selftest.sh（须在仓库根目录跑）
# 纪律：全程假格式密钥（sk- 前缀测试串）——不写库、不落盘、不起真 server（C 段注入桩）
WIZ="scripts/agnes-key-wizard.sh"
STUB="scripts/tmp/agnes-wizard-stub.sh"
MARKER="scripts/tmp/.wizard-stub-marker"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); echo "  ✓ $1"; }
bad() { FAIL=$((FAIL+1)); echo "  ✗ $1"; }

echo "━━ 段 A：输入校验腿（非 TTY） ━━"
# A1 缺 env → rc=1 + 提示含 AGNES_KEYS（补救命令）
OUT=$(env -u AGNES_KEYS bash "$WIZ" 2>&1); RC=$?
if [ "$RC" = "1" ] && echo "$OUT" | grep -q "AGNES_KEYS"; then ok "A1 缺 env 退出1+提示"; else bad "A1 缺 env 退出1+提示（rc=$RC）"; fi
# A2 坏格式（0 个有效 sk-）→ rc=1 + 明确报「没有有效」
OUT=$(AGNES_KEYS="badkey,alsobad" bash "$WIZ" 2>&1); RC=$?
if [ "$RC" = "1" ] && echo "$OUT" | grep -q "没有有效"; then ok "A2 坏格式0有效退出1"; else bad "A2 坏格式0有效退出1（rc=$RC）"; fi

echo "━━ 段 B：脱敏腿（--dry-run，假密钥零副作用） ━━"
FAKE1="sk-aaaa1111bbbb2222cccc"   # 22 字符测试串
FAKE2="sk-dddd3333eeee4444ffff"
OUT=$(AGNES_KEYS="$FAKE1,$FAKE2" bash "$WIZ" --dry-run 2>&1); RC=$?
# B1 输出含掩码样式（前6位…后4位，与 pool-setup 同格式）且 rc=0
if [ "$RC" = "0" ] && echo "$OUT" | grep -qF "sk-aaa…cccc"; then ok "B1 dry-run 掩码样式+rc0"; else bad "B1 dry-run 掩码样式+rc0（rc=$RC）"; fi
# B2 输出无完整明文（两个键各自断言）
if echo "$OUT" | grep -qF "$FAKE1"; then bad "B2 明文泄漏（FAKE1 出现在输出）"; else ok "B2 输出无 FAKE1 明文"; fi
if echo "$OUT" | grep -qF "$FAKE2"; then bad "B2 明文泄漏（FAKE2 出现在输出）"; else ok "B2 输出无 FAKE2 明文"; fi

echo "━━ 段 C：server 腿缝（桩注入） ━━"
rm -f "$MARKER"
# C1 桩以非空 AGNES_KEYS 被调用 + marker 落盘 + rc=0
OUT=$(AGNES_WIZARD_SERVER_CMD="bash $STUB" AGNES_KEYS="sk-stub-test-key-000001" bash "$WIZ" 2>&1); RC=$?
if [ "$RC" = "0" ] && [ -f "$MARKER" ]; then ok "C1 桩被调用+env传播+marker"; else bad "C1 桩被调用+env传播+marker（rc=$RC, marker=$([ -f "$MARKER" ] && echo 有 || echo 无)）"; fi
# C2 桩 rc=3 → 向导 rc 透传 3
rm -f "$MARKER"
OUT=$(AGNES_WIZARD_STUB_RC=3 AGNES_WIZARD_SERVER_CMD="bash $STUB" AGNES_KEYS="sk-stub-test-key-000001" bash "$WIZ" 2>&1); RC=$?
if [ "$RC" = "3" ]; then ok "C2 桩 rc=3 透传"; else bad "C2 桩 rc 透传（rc=$RC）"; fi
rm -f "$MARKER"

echo ""
echo "━━ selftest：$PASS 通过 / $FAIL 失败 ━━"
[ "$FAIL" = "0" ]
