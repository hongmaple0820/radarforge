#!/usr/bin/env bash
# =============================================================
# 分块可靠推送（对付间歇性 TLS 中断的网络）
# 用法：GHP=<token> bash scripts/push-retry.sh <chunk1|chunk2|final>
# 幂等：已推送的块会被 git 判定 up-to-date 直接跳过，可重复执行
# 原理：按提交前缀分块推送，每块独立连接 + 限时重试；
#       远端 main 分支被逐步 fast-forward，最后一块补齐并设 upstream
# =============================================================
set -uo pipefail
cd /home/z/my-project
TOKEN="${GHP:?需要 GHP 环境变量传入令牌}"
PHASE="${1:?用法: GHP=<token> bash scripts/push-retry.sh chunk1|chunk2|final}"
CRED="!f(){ echo username=hongmaple0820; echo password=${TOKEN}; }; f"
LOG=.push-chunk.log

HASHES=()
while IFS= read -r line; do HASHES+=("$line"); done < <(git rev-list --reverse HEAD)
TOTAL=${#HASHES[@]}
echo "本地共 $TOTAL 个提交；阶段：$PHASE"

push_target() { # $1=目标SHA $2=单次限时秒 $3=重试次数 $4=附加push参数(可选)
  local TARGET=$1 TMO=$2 TRIES=$3 EXTRA=${4:-}
  for i in $(seq 1 "$TRIES"); do
    echo ">>> 推送 ${TARGET:0:7} … 第 $i/$TRIES 次尝试（单次限时 ${TMO}s）"
    if timeout "$TMO" git -c http.version=HTTP/1.1 \
        -c http.postBuffer=$(( (i % 2) ? 524288000 : 8388608 )) \
        -c credential.helper= -c credential.helper="$CRED" \
        push origin "${TARGET}:refs/heads/main" $EXTRA --progress > "$LOG" 2>&1; then
      echo "    ✓ 本块推送成功"
      sed -E 's/ghp_[A-Za-z0-9]+/ghp_***/g' "$LOG" | tail -3
      return 0
    fi
    echo "    ✗ 失败（超时/TLS中断），日志尾部："
    sed -E 's/ghp_[A-Za-z0-9]+/ghp_***/g' "$LOG" | tail -2
    sleep 4
  done
  echo "!!! 本块重试耗尽"
  return 1
}

case "$PHASE" in
  chunk1)  # 提交 #1~#6（约 5 MiB，小包快速落地建立远端分支）
    [ "$TOTAL" -lt 6 ] && { echo "提交数异常"; exit 1; }
    push_target "${HASHES[5]}" 120 4 || exit 1 ;;
  chunk2)  # 提交 #7（33 MiB 大块，独立连接攻坚）
    [ "$TOTAL" -lt 7 ] && { echo "提交数异常"; exit 1; }
    push_target "${HASHES[6]}" 240 2 || exit 1 ;;
  final)   # 其余全部 + 设置 upstream
    push_target "$(git rev-parse HEAD)" 200 2 -u || exit 1 ;;
  *) echo "未知阶段：$PHASE"; exit 1 ;;
esac

echo "===远端 main 现状==="
timeout 30 git ls-remote "https://hongmaple0820:${TOKEN}@github.com/hongmaple0820/radarforge.git" refs/heads/main | awk '{print "refs/heads/main ->", substr($1,1,7)}'
echo "本地 HEAD            -> $(git rev-parse --short HEAD)"
