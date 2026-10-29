#!/usr/bin/env bash
# verify-p6-browser5.sh —— Phase 6 浏览器端到端（最终版：Playwright 真实点击）
set -u
cd /home/z/my-project

B() { agent-browser "$@"; }

echo "== 打开平台（等编译+hydrate） =="
B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null 2>&1 || true
sleep 15

echo "== 1. 创作台（文风校准） =="
B find role tab click --name "创作台" >/dev/null 2>&1 && echo "   tab ✓"
sleep 8
B screenshot download/assets/p6-studio-exemplar.png >/dev/null
B eval "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('学习新文风')); b?.scrollIntoView({block:'center'}); b?'vis':'none'" 2>/dev/null | tail -1
sleep 1
B find text "学习新文风" click >/dev/null 2>&1 && echo "   学习表单 ✓" || echo "   学习表单 ✗"
sleep 2
B screenshot download/assets/p6-studio-learn-form.png >/dev/null

echo "== 2. 视频线 =="
B find role tab click --name "视频线" >/dev/null 2>&1 && echo "   tab ✓"
sleep 6
B screenshot download/assets/p6-video-panel.png >/dev/null
B find text "导演三方向" click >/dev/null 2>&1 && echo "   导演三方向 ✓（等 LLM 50s）"
sleep 50
B screenshot download/assets/p6-directions.png >/dev/null

echo "== 3. 按方向生成分镜 =="
B eval "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('生成分镜')); b?.scrollIntoView({block:'center'}); b?'vis':'none'" 2>/dev/null | tail -1
B find text "生成分镜" click >/dev/null 2>&1 && echo "   分镜 ✓（等 LLM 50s）"
sleep 50
B screenshot download/assets/p6-storyboard-direction.png >/dev/null

echo "== 4. 成片 + 指着改浮层 =="
B eval "window.scrollTo(0, 500)" >/dev/null 2>&1 || true
sleep 1
B screenshot download/assets/p6-video-final.png >/dev/null
B find text "指着改这镜" click >/dev/null 2>&1 && echo "   浮层 ✓" || echo "   浮层 ✗（可能需滚动到可见）"
sleep 2
B screenshot download/assets/p6-revise-modal.png >/dev/null

echo "== 5. 插件生态 → 插件中心 → dsh 卡 =="
B find role tab click --name "插件生态" >/dev/null 2>&1 && echo "   tab ✓"
sleep 5
B find role tab click --name "插件中心" >/dev/null 2>&1 && echo "   tab ✓"
sleep 4
B eval "const t=[...document.querySelectorAll('div')].find(x=>x.textContent.trim().startsWith('dsh 插件形态')); if(t){t.scrollIntoView({block:'center'}); 'hit'}else{'miss'}" 2>/dev/null | tail -1
sleep 1
B screenshot download/assets/p6-eco-dsh-plugin.png >/dev/null

echo "== 6. 375px 无溢出 =="
B set viewport 375 812 >/dev/null
sleep 3
W=$(B eval "String(document.documentElement.scrollWidth)" 2>/dev/null | tail -1 | tr -d '"')
echo "   scrollWidth @375px = $W"
B screenshot download/assets/p6-mobile-375.png >/dev/null

echo "== 7. 页面错误 =="
B errors 2>/dev/null | head -5
echo "BROWSER5-DONE"
