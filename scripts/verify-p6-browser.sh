#!/usr/bin/env bash
# verify-p6-browser.sh —— Phase 6 浏览器端到端 + 截图（与 server 同调用存活）
set -u
cd /home/z/my-project
mkdir -p download/assets

B() { agent-browser "$@"; }

echo "== 打开平台 =="
B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null || true
sleep 2

echo "== 1. 创作台 · 文风校准 UI =="
B find text "创作台" click >/dev/null 2>&1 || B eval "document.querySelector('[data-value=studio]')?.click()" >/dev/null
sleep 2
B screenshot download/assets/p6-studio-exemplar.png >/dev/null
# 展开学习表单
B find text "学习新文风" click >/dev/null 2>&1 && sleep 1
B screenshot download/assets/p6-studio-learn-form.png >/dev/null
echo "   截图: p6-studio-exemplar / p6-studio-learn-form"

echo "== 2. 视频线 · 三方向卡 =="
B find text "视频线" click >/dev/null 2>&1 || B eval "document.querySelectorAll('[data-value=video]')[0]?.click()" >/dev/null
sleep 3
B screenshot download/assets/p6-video-panel.png >/dev/null
# 点「导演三方向」（LLM 生成，等待）
B find text "导演三方向" click >/dev/null 2>&1
sleep 45
B screenshot download/assets/p6-directions.png >/dev/null
echo "   截图: p6-video-panel / p6-directions"

echo "== 3. 按选定方向生成分镜 =="
B find text "生成分镜" click >/dev/null 2>&1 || B find role button click --name "按方向生成分镜" >/dev/null 2>&1
sleep 40
B screenshot download/assets/p6-storyboard-direction.png >/dev/null
echo "   截图: p6-storyboard-direction"

echo "== 4. 成片卡（版本树 v2/v3/v4 已在库）+ 指着改 =="
B eval "window.scrollTo(0, 400)" >/dev/null 2>&1 || true
sleep 1
B screenshot download/assets/p6-video-final.png >/dev/null
# 点分镜卡的「指着改这镜」按钮（打开浮层）
B find text "指着改这镜" click >/dev/null 2>&1 && sleep 1
B screenshot download/assets/p6-revise-modal.png >/dev/null
echo "   截图: p6-video-final / p6-revise-modal"

echo "== 5. 插件中心 · dsh 插件卡 =="
B find text "插件生态" click >/dev/null 2>&1 || B eval "document.querySelector('[data-value=eco]')?.click()" >/dev/null
sleep 2
B find text "插件中心" click >/dev/null 2>&1
sleep 2
B eval "document.querySelector('.radar-card')?.scrollIntoView(); const cards=[...document.querySelectorAll('h3,h2,[class*=CardTitle]')]; const t=cards.find(c=>c.textContent.includes('dsh 插件形态')); t?.scrollIntoView({block:'center'})" >/dev/null 2>&1 || true
sleep 1
B screenshot download/assets/p6-eco-dsh-plugin.png >/dev/null
echo "   截图: p6-eco-dsh-plugin"

echo "== 6. 375px 移动端无溢出 =="
B set viewport 375 812 >/dev/null
sleep 2
W=$(B eval "document.documentElement.scrollWidth" 2>/dev/null | tail -1)
echo "   scrollWidth @375px = $W"
B screenshot download/assets/p6-mobile-375.png >/dev/null

echo "== 7. console / errors =="
B errors 2>/dev/null | head -5 || true
echo "   （无输出=零错误）"

echo "BROWSER-P6-DONE"
