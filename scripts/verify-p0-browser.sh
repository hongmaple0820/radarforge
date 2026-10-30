#!/usr/bin/env bash
# verify-p0-browser.sh —— P0 UI 浏览器端到端：九步步骤条 + 大纲卡 + 视频选题直出
set -u
cd /home/z/my-project

B() { agent-browser "$@"; }

echo "== 打开平台（等编译+hydrate） =="
B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null 2>&1 || true
sleep 15

echo "== 1. 创作台 → 图文线九步文案 =="
B find role tab click --name "创作台" >/dev/null 2>&1 && echo "   创作台 tab ✓"
sleep 8
B eval "document.body.textContent.includes('图文线 · 九步流水线') ? 'nine-step-title ✓' : 'nine-step-title ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('大纲先行') && document.body.textContent.includes('原子断言核验') ? 'pipeline-copy ✓' : 'pipeline-copy ✗'" 2>/dev/null | tail -1

echo "== 2. 打开一个已完成 run（九步骤条 + 大纲卡） =="
B eval "const c=[...document.querySelectorAll('button,div[class*=motion]')].find(x=>(x.textContent||'').includes('开门见山')||false); 'skip'" >/dev/null 2>&1 || true
# 点击看板第一张 run 卡（.grid 内第一个 motion.button）
B eval "const card=document.querySelector('.grid button[class*=rounded-lg], .grid [class*=hover\\\\:border-amber-300]'); if(card){card.click(); 'clicked'}else{'miss'}" 2>/dev/null | tail -1
sleep 6
B eval "document.body.textContent.includes('大纲（') ? 'outline-card ✓' : 'outline-card ✗（可能该 run 无大纲）'" 2>/dev/null | tail -1
B eval "[...document.querySelectorAll('.grid > div')].length >= 8 ? 'steps-grid(9) ✓' : 'steps-grid ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('跨家族审稿') ? 'review-step ✓' : 'review-step ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('发布（质量门禁 + 三级降级）') ? 'gate-publish-btn ✓' : 'gate-publish-btn ✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-run-detail-9steps.png >/dev/null 2>&1 && echo "   截图 ✓"

echo "== 3. 视频线 → 选题直出模式 =="
B find role tab click --name "视频线" >/dev/null 2>&1 && echo "   视频线 tab ✓"
sleep 6
B eval "document.body.textContent.includes('选题直出（新）') ? 'direct-toggle ✓' : 'direct-toggle ✗'" 2>/dev/null | tail -1
B eval "const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('选题直出')); if(b){b.click(); 'switched'}else{'miss'}" 2>/dev/null | tail -1
sleep 3
B eval "const i=[...document.querySelectorAll('input')].find(x=>(x.placeholder||'').includes('视频选题')); i ? 'topic-input ✓' : 'topic-input ✗'" 2>/dev/null | tail -1
B eval "document.body.textContent.includes('检索 + 三方向') ? 'direct-start-btn ✓' : 'direct-start-btn ✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-video-direct-mode.png >/dev/null 2>&1 && echo "   截图 ✓"

echo "== 4. 直出真实跑一条（检索 → 三方向） =="
B eval "const i=[...document.querySelectorAll('input')].find(x=>(x.placeholder||'').includes('视频选题')); if(i){const s=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set; s.call(i,'浏览器验证：AI 搜索正在吃掉搜索引擎吗'); i.dispatchEvent(new Event('input',{bubbles:true})); 'typed'}else{'miss'}" 2>/dev/null | tail -1
sleep 1
B eval "const b=[...document.querySelectorAll('button')].find(x=>(x.textContent||'').includes('检索 + 三方向')); if(b){b.click(); 'started'}else{'miss'}" 2>/dev/null | tail -1
echo "   等待检索+三方向（约 40s）…"
sleep 40
B eval "document.body.textContent.includes('等待选方向') || document.body.textContent.includes('检索/提案中') ? 'direct-run-progress ✓' : 'direct-run-progress ✗'" 2>/dev/null | tail -1
B screenshot download/assets/p0-video-direct-progress.png >/dev/null 2>&1 && echo "   截图 ✓"
echo "== 完成 =="
