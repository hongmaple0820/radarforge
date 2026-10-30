#!/usr/bin/env bash
# verify-p0-browser2.sh —— P0 UI 浏览器端到端 v2（精确定位：m01 卡 / snapshot 填表 / console 无错）
set -u
cd /home/z/my-project

B() { agent-browser "$@"; }

echo "== 打开平台 =="
B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null 2>&1 || true
sleep 12
B find role tab click --name "创作台" >/dev/null 2>&1
sleep 8

echo "== 1. 打开 m01 评测 run（有大纲/文章/审稿） =="
B eval "const cards=[...document.querySelectorAll('button')].filter(x=>(x.textContent||'').includes('旗舰模型与轻量模型的差距')); if(cards.length){cards[0].click(); 'clicked-m01'}else{'miss-m01'}" 2>/dev/null | tail -1
sleep 8
B eval "document.body.textContent.includes('大纲（') ? 'outline-card ✓' : 'outline-card ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('跨家族审稿') ? 'review-step-label ✓' : '✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('原子断言') ? 'verify-step-label ✓' : '✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('发布（质量门禁 + 三级降级）') ? 'gate-publish-btn ✓' : 'gate-publish-btn ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('门禁规则：审稿均分 ≥7.0') ? 'gate-rule-hint ✓' : '✗'" 2>/dev/null | tail -1
B eval "const g=[...document.querySelectorAll('.grid')].find(x=>x.className.includes('xl:grid-cols-9')); g ? 'nine-col-grid ✓' : 'nine-col-grid ✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-run-detail-m01.png >/dev/null 2>&1 && echo "   run-detail 截图 ✓"

echo "== 2. 视频线 → 选题直出（snapshot 定位填表） =="
B find role tab click --name "视频线" >/dev/null 2>&1
sleep 6
B find text "选题直出（新）" click >/dev/null 2>&1 && echo "   切直出模式 ✓"
sleep 3
# snapshot 找输入框 ref
SNAP=$(B snapshot -i 2>/dev/null | grep -i "视频选题" | head -1)
echo "   snapshot 输入框行: ${SNAP:0:80}"
REF=$(echo "$SNAP" | grep -o '@e[0-9]*' | head -1)
if [ -n "$REF" ]; then
  B fill "$REF" "浏览器验证：AI 搜索正在吃掉搜索引擎的哪块蛋糕" >/dev/null 2>&1 && echo "   fill $REF ✓"
else
  B eval "const i=[...document.querySelectorAll('input')].find(x=>(x.placeholder||'').includes('视频选题')); const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'浏览器验证：AI 搜索正在吃掉搜索引擎的哪块蛋糕'); i.dispatchEvent(new Event('input',{bubbles:true})); 'typed-fallback'" 2>/dev/null | tail -1
fi
sleep 1
B find text "检索 + 三方向" click >/dev/null 2>&1 && echo "   启动直出 ✓（等 45s）"
sleep 45
B eval "document.body.textContent.includes('等待选方向') ? 'blocked-state ✓' : (document.body.textContent.includes('检索/提案中') ? 'running-state ✓（还没到 blocked）' : 'state ✗')" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('research:') ? 'steps-chips ✓' : '✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-video-direct-progress2.png >/dev/null 2>&1 && echo "   进度截图 ✓"

echo "== 3. 等分镜就绪 → 三方向卡 =="
sleep 20
B eval "document.body.textContent.includes('导演三方向 · 选一个再分镜') ? 'direction-cards ✓' : 'direction-cards ✗（可能仍在跑）'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('按方向「') ? 'storyboard-btn ✓' : '✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-video-directions.png >/dev/null 2>&1 && echo "   方向卡截图 ✓"

echo "== 4. console 错误检查 =="
B errors 2>/dev/null | head -5
echo "== 完成 =="
