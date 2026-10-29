#!/bin/bash
# with-server.sh —— 沙箱内 dev server 与测试必须同一调用存活（跨调用后台进程被清理）
# 用法：bash scripts/with-server.sh <测试脚本.sh|测试脚本.py>
# 行为：清理旧 server → 启动 next dev（Turbopack 缓存复用，秒级）→ 等 ready → 执行测试 → 退出
set -u
cd /home/z/my-project

TEST="$1"
shift || true

# 1) 清理可能残留的 server
pkill -f "next dev" 2>/dev/null
pkill -f "next-server" 2>/dev/null
sleep 1

# 2) 启动（直接 node 跳过 npm 父进程；堆上限防 OOM）
NODE_OPTIONS="--max-old-space-size=1536" setsid node node_modules/next/dist/bin/next dev > dev.log 2>&1 < /dev/null &
SRV=$!

# 3) 等 ready（最长 90s）
READY=0
for i in $(seq 45); do
  code=$(curl -s -m 3 -o /dev/null -w "%{http_code}" http://localhost:3000/api/runs 2>/dev/null)
  if [ "$code" = "200" ]; then READY=1; break; fi
  sleep 2
done
if [ "$READY" != "1" ]; then
  echo "[with-server] server 启动失败（90s 未 ready），dev.log 尾部："
  tail -20 dev.log
  kill $SRV 2>/dev/null
  exit 1
fi
echo "[with-server] server ready (pid $SRV)"

# 4) 执行测试
case "$TEST" in
  *.py) python3 "$TEST" "$@" ;;
  *.sh) bash "$TEST" "$@" ;;
  *) bash -c "$TEST" ;;
esac
RC=$?

# 5) 收尾（此调用结束后沙箱也会清理，这里显式 kill 保险）
kill $SRV 2>/dev/null
pkill -f "next-server" 2>/dev/null
exit $RC
