#!/usr/bin/env bash
# verify-p6-browser3.sh —— Phase 6 浏览器端到端（可靠版：role=tab 文本匹配点击）
set -u
cd /home/z/my-project

B() { agent-browser "$@"; }

# 点击 role=tab 且含指定文本的触发器，返回命中与否
CLICKTAB() {
  B eval "const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('$1')); if(t){t.click(); 'hit'}else{'miss'}" 2>/dev/null | tail -1
}
# 点击普通按钮（含文本），返回 hit/miss
CLICKBTN() {
  B eval "const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('$1')); if(b){b.click(); 'hit'}else{'miss'}" 2>/dev/null | tail -1
}

echo "== 打开平台 =="
B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null 2>&1 || true
sleep 2

echo "== 1. 创作台（文风校准） =="
echo "   tab: $(CLICKTAB 创作台)"
sleep 4
B screenshot download/assets/p6-studio-exemplar.png >/dev/null
echo "   学习新文风按钮: $(CLICKBTN 学习新文风)"
sleep 2
B screenshot download/assets/p6-studio-learn-form.png >/dev/null

echo "== 2. 视频线 =="
echo "   tab: $(CLICKTAB 视频线)"
sleep 4
B screenshot download/assets/p6-video-panel.png >/dev/null
echo "   导演三方向: $(CLICKBTN 导演三方向)"
sleep 55
B screenshot download/assets/p6-directions.png >/dev/null

echo "== 3. 按方向生成分镜 =="
echo "   按钮: $(CLICKBTN 生成分镜)"
sleep 50
B screenshot download/assets/p6-storyboard-direction.png >/dev/null

echo "== 4. 成片 + 指着改浮层 =="
B eval "window.scrollTo(0, 500)" >/dev/null 2>&1 || true
sleep 1
B screenshot download/assets/p6-video-final.png >/dev/null
echo "   指着改这镜: $(CLICKBTN 指着改这镜)"
sleep 2
B screenshot download/assets/p6-revise-modal.png >/dev/null

echo "== 5. 插件生态 → 插件中心 → dsh 卡 =="
echo "   tab: $(CLICKTAB 插件生态)"
sleep 3
echo "   tab: $(CLICKTAB 插件中心)"
sleep 3
B eval "const t=[...document.querySelectorAll('div,h3')].find(x=>x.textContent.trim().startsWith('dsh 插件形态')); if(t){t.scrollIntoView({block:'center'}); 'hit'}else{'miss'}" 2>/dev/null | tail -1
sleep 1
B screenshot download/assets/p6-eco-dsh-plugin.png >/dev/null

echo "== 6. 375px 无溢出 =="
B set viewport 375 812 >/dev/null
sleep 2
W=$(B eval "document.documentElement.scrollWidth" 2>/dev/null | tail -1)
echo "   scrollWidth @375px = $W"
B screenshot download/assets/p6-mobile-375.png >/dev/null

echo "== 7. 页面错误 =="
B errors 2>/dev/null | head -5
echo "BROWSER3-DONE"
