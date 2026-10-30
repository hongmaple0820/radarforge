#!/usr/bin/env bash
# verify-p0-browser3.sh —— P0 UI 浏览器端到端 v3（修正 ref 提取；只验视频直出交互链）
set -u
cd /home/z/my-project

B() { agent-browser "$@"; }

echo "== 打开平台 → 视频线 =="
B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null 2>&1 || true
sleep 12
B find role tab click --name "创作台" >/dev/null 2>&1; sleep 6; B find role tab click --name "视频线" >/dev/null 2>&1
sleep 6
B find text "选题直出（新）" click >/dev/null 2>&1 && echo "   切直出模式 ✓"
sleep 3

# 从 snapshot 提取输入框 ref（格式 [ref=eN] → @eN）
SNAP=$(B snapshot -i 2>/dev/null | grep -i "视频选题" | head -1)
REF=$(echo "$SNAP" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/^ref=/@/')
echo "   输入框 ref: $REF"
if [ -n "$REF" ]; then
  B fill "$REF" "浏览器验证：AI 搜索正在吃掉搜索引擎的哪块蛋糕" >/dev/null 2>&1 && echo "   fill ✓"
  sleep 1
  B eval "document.querySelector('input[placeholder*=视频选题]').value.length > 5 ? 'value-set ✓' : 'value-empty ✗'" 2>/dev/null | tail -1
  B eval "const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('检索 + 三方向')); b && !b.disabled ? 'start-btn-enabled ✓' : 'start-btn ✗'" 2>/dev/null | tail -1
  B find text "检索 + 三方向" click >/dev/null 2>&1 && echo "   启动直出 ✓"
else
  echo "   ref 提取失败"
fi

echo "== 等待检索+三方向（45s）=="
sleep 45
B eval "document.body.textContent.includes('等待选方向') ? 'blocked-state ✓' : (document.body.textContent.includes('检索/提案中') ? 'running-state ✓' : (document.body.textContent.includes('排队中') ? 'queued-state ✓' : 'state ✗'))" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('research:') && document.body.textContent.includes('directions:') ? 'steps-chips ✓' : 'steps-chips ✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-video-direct-progress3.png >/dev/null 2>&1 && echo "   进度截图 ✓"

echo "== 再等 25s 看方向卡 =="
sleep 25
B eval "document.body.textContent.includes('导演三方向 · 选一个再分镜') ? 'direction-cards ✓' : 'direction-cards ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('按方向「') && document.body.textContent.includes('跳过方向直接分镜') ? 'storyboard-buttons ✓' : '✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-video-directions3.png >/dev/null 2>&1 && echo "   方向卡截图 ✓"

echo "== console errors =="
B errors 2>/dev/null | head -4
echo "== 完成 =="
