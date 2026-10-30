#!/usr/bin/env bash
# verify-p0-browser4.sh —— P0 视频直出 UI 完整链（启动 → blocked → 方向卡 → 生成分镜）
set -u
cd /home/z/my-project

B() { agent-browser "$@"; }

B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null 2>&1 || true
sleep 12
B find role tab click --name "创作台" >/dev/null 2>&1; sleep 6
B find role tab click --name "视频线" >/dev/null 2>&1; sleep 6
B find text "选题直出（新）" click >/dev/null 2>&1 && echo "① 切直出模式 ✓"; sleep 3

SNAP=$(B snapshot -i 2>/dev/null | grep -i "视频选题" | head -1)
REF=$(echo "$SNAP" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/^ref=/@/')
B fill "$REF" "浏览器验证：开源模型追赶商业模型的最后一段路" >/dev/null 2>&1 && echo "② 填选题 ✓"
sleep 1
BTN=$(B snapshot -i 2>/dev/null | grep "检索 + 三方向" | head -1)
BREF=$(echo "$BTN" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/^ref=/@/')
B click "$BREF" >/dev/null 2>&1 && echo "③ 启动直出 ✓"

echo "④ 等检索+三方向（40s）…"
sleep 40
B eval "document.body.textContent.includes('等待选方向') ? 'blocked ✓' : 'blocked ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('research:done') && document.body.textContent.includes('directions:done') ? 'steps ✓' : 'steps ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('导演三方向 · 选一个再分镜') ? 'direction-cards ✓' : 'direction-cards ✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-direct-directions.png >/dev/null 2>&1 && echo "   方向卡截图 ✓"

echo "⑤ 点「按方向生成分镜」（同步 LLM，等 40s）…"
GEN=$(B snapshot -i 2>/dev/null | grep "按方向「" | head -1)
GENREF=$(echo "$GEN" | grep -o 'ref=e[0-9]*' | head -1 | sed 's/^ref=/@/')
echo "   gen-btn: ${GEN:0:60} → $GENREF"
if [ -n "$GENREF" ]; then B click "$GENREF" >/dev/null 2>&1 && echo "   点击生成分镜 ✓"; fi
sleep 40
B eval "document.body.textContent.includes('分镜 · 《') ? 'storyboard-card ✓' : 'storyboard-card ✗（可能仍在生成）'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('渲染通道 · 音色 · 画幅 · BGM') ? 'render-controls ✓' : 'render-controls ✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-direct-storyboard.png >/dev/null 2>&1 && echo "   分镜截图 ✓"

echo "== console errors =="
B errors 2>/dev/null | head -4
echo "== 完成 =="
