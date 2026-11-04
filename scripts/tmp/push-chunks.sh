#!/usr/bin/env bash
# =============================================================
# 增量分块推送（远端已在 cbcb0c3，本地领先 12 提交的定向版）
# 用法：GHP=<token> bash scripts/tmp/push-chunks.sh
# 分块：#1 体检轮 → #2 P0大块(含13.7MB gif) → #7 P1收尾 → HEAD 全量+upstream
# 幂等可重跑：已推块 git 判 up-to-date 直接跳过
# =============================================================
set -uo pipefail
cd /home/z/my-project
TOKEN="${GHP:?需要 GHP 环境变量传入令牌}"
CRED="!f(){ echo username=hongmaple0820; echo password=${TOKEN}; }; f"
LOG=.push-chunk.log

push_target() { # $1=目标SHA $2=单次限时秒 $3=重试次数 $4=附加push参数(可选)
  local TARGET=$1 TMO=$2 TRIES=$3 EXTRA=${4:-}
  for i in $(seq 1 "$TRIES"); do
    echo ">>> 推送 ${TARGET:0:7} … 第 $i/$TRIES 次（限时 ${TMO}s）"
    if timeout "$TMO" git -c http.version=HTTP/1.1 \
        -c http.postBuffer=$(( (i % 2) ? 524288000 : 8388608 )) \
        -c credential.helper= -c credential.helper="$CRED" \
        push origin "${TARGET}:refs/heads/main" $EXTRA --progress > "$LOG" 2>&1; then
      echo "    ✓ 成功"
      sed -E 's/ghp_[A-Za-z0-9]+/ghp_***/g' "$LOG" | tail -3
      return 0
    fi
    echo "    ✗ 失败，日志尾部："
    sed -E 's/ghp_[A-Za-z0-9]+/ghp_***/g' "$LOG" | tail -2
    sleep 4
  done
  echo "!!! 块 ${TARGET:0:7} 重试耗尽"
  return 1
}

push_target 2149d47 120 3 || exit 1   # 块A：七问体检轮
push_target de2154c 240 3 || exit 1   # 块B：P0 四项（含 13.7MB gif）
push_target 94a63bd 180 3 || exit 1   # 块C：P1 全量收尾
push_target "$(git rev-parse HEAD)" 200 3 -u || exit 1  # 块D：P2 三项+锁，设 upstream

echo "===远端 main 现状==="
timeout 30 git ls-remote "https://hongmaple0820:${TOKEN}@github.com/hongmaple0820/radarforge.git" refs/heads/main | awk '{print "refs/heads/main ->", substr($1,1,7)}'
echo "本地 HEAD            -> $(git rev-parse --short HEAD)"
