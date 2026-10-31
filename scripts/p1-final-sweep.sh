#!/usr/bin/env bash
# =============================================================
# p1-final-sweep.sh —— P1 收官 sweep 编排（后台长任务）
# DB 重建后历史 v0 基线丢失 → 先补 v0 基线（3 题）→ 限流探针
# → 变体 sweep（v1/v2/v3 × m01/m02/m03，9 轮九步管线）
# → 聚合推荐落库 + 报告 download/tune-report-*.json
# 日志：/tmp/sweep-v0.log、/tmp/sweep-tune.log、编排输出本文件重定向
# =============================================================
set -u
cd /home/z/my-project

echo "=== [$(date +%H:%M:%S)] 阶段 1/3：v0 基线（m01,m02,m03，pace 90s）==="
bash scripts/with-server.sh "node scripts/eval-set.mjs --ids m01,m02,m03 --pace 90" > /tmp/sweep-v0.log 2>&1
RC1=$?
echo "v0 基线 exit=$RC1；日志尾部："
tail -6 /tmp/sweep-v0.log

echo "=== [$(date +%H:%M:%S)] 阶段 2/3：限流窗口探针（最多 9 分钟）==="
node scripts/quota-wait.mjs 9 || echo "（探针仍受限，继续——各脚本自带 429 重试）"

echo "=== [$(date +%H:%M:%S)] 阶段 3/3：变体 sweep（v1,v2,v3 × m01,m02,m03）==="
bash scripts/with-server.sh "node scripts/tune-prompts.mjs --variants v1,v2,v3 --ids m01,m02,m03 --pace 90" > /tmp/sweep-tune.log 2>&1
RC2=$?
echo "变体 sweep exit=$RC2；日志尾部："
tail -10 /tmp/sweep-tune.log

echo "=== [$(date +%H:%M:%S)] sweep 全部完成（v0=$RC1 tune=$RC2）==="
