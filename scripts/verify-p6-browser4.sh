#!/usr/bin/env bash
# verify-p6-browser4.sh —— Phase 6 浏览器端到端（稳定版：轮询等待编译+重试）
set -u
cd /home/z/my-project

B() { agent-browser "$@"; }

# eval 带 3 次重试（页面编译/navigate 时 eval 会暂时失败）
EVAL() {
  local expr="$1" out=""
  for i in 1 2 3; do
    out=$(B eval "$expr" 2>/dev/null | tail -1)
    if [ -n "$out" ]; then echo "$out"; return 0; fi
    sleep 4
  done
  echo "(eval-failed)"
}

# 轮询等按钮出现并点击（最长 ~N 秒）
WAITCLICK() {
  local txt="$1" max="${2:-30}"
  for i in $(seq "$max"); do
    local out
    out=$(B eval "const b=[...document.querySelectorAll('button,[role=tab]')].find(x=>x.textContent.includes('$txt')); if(b){b.click(); 'hit'}else{'miss'}" 2>/dev/null | tail -1 | tr -d '"')
    if [ "$out" = "hit" ]; then echo "hit(${i})"; return 0; fi
    sleep 1
  done
  echo "miss"
  return 1
}

echo "== 打开平台 =="
B open http://localhost:3000 >/dev/null
B wait --load networkidle >/dev/null 2>&1 || true
# Turbopack 首次编译 ~9s + hydration：充分等待再交互
sleep 15

echo "== 1. 创作台（文风校准） =="
echo "   tab: $(WAITCLICK 创作台 25)"
sleep 10
B screenshot download/assets/p6-studio-exemplar.png >/dev/null
echo "   学习新文风: $(WAITCLICK 学习新文风 15)"
sleep 2
B screenshot download/assets/p6-studio-learn-form.png >/dev/null

echo "== 2. 视频线 =="
echo "   tab: $(WAITCLICK 视频线 25)"
sleep 10
B screenshot download/assets/p6-video-panel.png >/dev/null
echo "   导演三方向: $(WAITCLICK 导演三方向 15)"
echo "   等 LLM 出三方向卡（50s）…"
sleep 50
B screenshot download/assets/p6-directions.png >/dev/null

echo "== 3. 按方向生成分镜 =="
echo "   按钮: $(WAITCLICK 生成分镜 15)"
echo "   等 LLM 分镜（50s）…"
sleep 50
B screenshot download/assets/p6-storyboard-direction.png >/dev/null

echo "== 4. 成片 + 指着改浮层 =="
EVAL "window.scrollTo(0, 500)" >/dev/null
sleep 1
B screenshot download/assets/p6-video-final.png >/dev/null
echo "   指着改这镜: $(WAITCLICK 指着改这镜 15)"
sleep 2
B screenshot download/assets/p6-revise-modal.png >/dev/null

echo "== 5. 插件生态 → 插件中心 → dsh 卡 =="
echo "   tab: $(WAITCLICK 插件生态 20)"
sleep 4
echo "   tab: $(WAITCLICK 插件中心 15)"
sleep 4
EVAL "const t=[...document.querySelectorAll('div')].find(x=>x.textContent.trim().startsWith('dsh 插件形态')); if(t){t.scrollIntoView({block:'center'}); 'hit'}else{'miss'}"
sleep 1
B screenshot download/assets/p6-eco-dsh-plugin.png >/dev/null

echo "== 6. 375px 无溢出 =="
B set viewport 375 812 >/dev/null
sleep 3
echo "   scrollWidth: $(EVAL "String(document.documentElement.scrollWidth)")"
B screenshot download/assets/p6-mobile-375.png >/dev/null

echo "== 7. 页面错误 =="
B errors 2>/dev/null | head -5
echo "BROWSER4-DONE"
