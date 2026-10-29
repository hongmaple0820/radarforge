#!/usr/bin/env bash
# verify-p6-browser2.sh —— Phase 6 浏览器端到端（修正版：eval 直点 Radix trigger）
set -u
cd /home/z/my-project

B() { agent-browser "$@"; }

echo "== 打开平台 =="
B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null 2>&1 || true
sleep 2

TAB() { # TAB <data-value>
  B eval "document.querySelector('[data-value=$1]')?.click(); 'ok'" 2>/dev/null | tail -1
}

echo "== 1. 创作台 · 文风校准 =="
TAB studio
sleep 3
B screenshot download/assets/p6-studio-exemplar.png >/dev/null
B eval "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('学习新文风')); b?.click(); b?'clicked':'not-found'" 2>/dev/null | tail -1
sleep 2
B screenshot download/assets/p6-studio-learn-form.png >/dev/null

echo "== 2. 视频线 =="
TAB video
sleep 3
B screenshot download/assets/p6-video-panel.png >/dev/null
echo "   面板截图完成，点「导演三方向」…"
B eval "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('导演三方向')); b?.click(); b?'clicked':'not-found'" 2>/dev/null | tail -1
sleep 50
B screenshot download/assets/p6-directions.png >/dev/null

echo "== 3. 按方向生成分镜 =="
B eval "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('生成分镜')); b?.click(); b?'clicked':'not-found'" 2>/dev/null | tail -1
sleep 45
B screenshot download/assets/p6-storyboard-direction.png >/dev/null

echo "== 4. 成片卡 + 指着改浮层 =="
B eval "window.scrollTo(0, 600)" >/dev/null 2>&1 || true
sleep 1
B screenshot download/assets/p6-video-final.png >/dev/null
B eval "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('指着改这镜')); b?.click(); b?'clicked':'not-found'" 2>/dev/null | tail -1
sleep 2
B screenshot download/assets/p6-revise-modal.png >/dev/null

echo "== 5. 插件生态 · dsh 卡 =="
TAB eco
sleep 2
B eval "document.querySelector('[data-value=plugins]')?.click(); 'ok'" 2>/dev/null | tail -1
sleep 3
B eval "const t=[...document.querySelectorAll('h3')].find(x=>x.textContent.includes('dsh 插件形态')); t?.scrollIntoView({block:'center'}); t?'found':'not-found'" 2>/dev/null | tail -1
sleep 1
B screenshot download/assets/p6-eco-dsh-plugin.png >/dev/null

echo "== 6. 375px =="
B set viewport 375 812 >/dev/null
sleep 2
W=$(B eval "document.documentElement.scrollWidth" 2>/dev/null | tail -1)
echo "   scrollWidth @375px = $W"
B screenshot download/assets/p6-mobile-375.png >/dev/null

echo "== 7. errors =="
B errors 2>/dev/null | head -5
echo "BROWSER2-DONE"
