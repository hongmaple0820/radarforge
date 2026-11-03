set -u
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "✅ $2"; else FAIL=$((FAIL+1)); echo "❌ $2${3:+｜$3}"; fi }
HAS() { agent-browser eval "document.body.innerText.includes('$1') ? 'y' : 'n'" | tr -d '"' ; }
# Radix TabsTrigger 在 mousedown 激活（真实点击含 mousedown；eval .click() 不触发）
CLICK_TAB() { agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('$1'));if(!t)return 'no-tab';t.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return 'ok'})()" | tr -d '"'; }

agent-browser console --clear > /dev/null 2>&1
agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 12
# ① 健康条首屏渲染（默认情报中心 tab 下即可见）
HB=$(HAS "健康中心")
ck $([ "$HB" = "y" ] && echo 0 || echo 1) "健康中心首屏状态条渲染"
SEARCH=$(HAS "搜索密钥")
ck $([ "$SEARCH" = "y" ] && echo 0 || echo 1) "四项之一：搜索密钥"
LLM=$(HAS "LLM 通道")
ck $([ "$LLM" = "y" ] && echo 0 || echo 1) "四项之一：LLM 通道"
VDEP=$(HAS "视频依赖")
ck $([ "$VDEP" = "y" ] && echo 0 || echo 1) "四项之一：视频依赖"
FEED=$(HAS "信源健康")
ck $([ "$FEED" = "y" ] && echo 0 || echo 1) "四项之一：信源健康"

# ② 点击「视频依赖」→ 跳设置 runtime 分区 + deps 卡
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button[title*=视频依赖]')];if(btns.length){btns[0].click();return 'clicked'}return 'no-btn'})()" > /dev/null
sleep 5
TAB=$(agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('设置中心'));return t&&t.getAttribute('aria-selected')==='true'?'y':'n'})()" | tr -d '"')
ck $([ "$TAB" = "y" ] && echo 0 || echo 1) "跳转到设置中心 tab"
DEPS=$(HAS "渲染依赖自检")
ck $([ "$DEPS" = "y" ] && echo 0 || echo 1) "runtime 分区渲染（渲染依赖自检卡）"
FFMPEG=$(agent-browser eval "document.body.innerText.includes('ffmpeg') && document.body.innerText.includes('就绪') ? 'y' : 'n'" | tr -d '"')
ck $([ "$FFMPEG" = "y" ] && echo 0 || echo 1) "依赖项就绪态展示"
NET=$(HAS "网络代理")
ck $([ "$NET" = "y" ] && echo 0 || echo 1) "runtime 分区：网络代理卡"

# ③ 三分区切换（mousedown 激活 Radix trigger）
M=$(CLICK_TAB "模型与密钥")
sleep 3
MODELS=$(agent-browser eval "document.getElementById('settings-card-llm') ? 'y' : 'n'" | tr -d '"')
ck $([ "$MODELS" = "y" ] && echo 0 || echo 1) "分区①：模型与密钥（LLM 卡渲染）" "$M"
C=$(CLICK_TAB "内容策略")
sleep 3
CONTENT=$(agent-browser eval "document.getElementById('settings-card-style') && document.getElementById('settings-card-automation') ? 'y' : 'n'" | tr -d '"')
ck $([ "$CONTENT" = "y" ] && echo 0 || echo 1) "分区③：内容策略（风格定位+自动化卡）" "$C"

# ④ 点击「搜索密钥」健康项 → 模型分区 + 搜索卡锚点滚动
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button[title*=搜索密钥]')];if(btns.length){btns[0].click();return 'clicked'}return 'no-btn'})()" > /dev/null
sleep 5
SEARCHCARD=$(agent-browser eval "(()=>{const el=document.getElementById('settings-card-search');if(!el)return 'no-el';const r=el.getBoundingClientRect();return r.top>=-80&&r.top<600?'visible':'off-'+Math.round(r.top)})()" | tr -d '"')
ck $([ "$SEARCHCARD" = "visible" ] && echo 0 || echo 1) "健康项跳转：搜索卡锚点滚动到位" "$SEARCHCARD"

# ⑤ 信源健康 → 跳回情报中心
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button[title*=信源健康]')];if(btns.length){btns[0].click();return 'clicked'}return 'no-btn'})()" > /dev/null
sleep 3
INTEL=$(agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('情报中心'));return t&&t.getAttribute('aria-selected')==='true'?'y':'n'})()" | tr -d '"')
ck $([ "$INTEL" = "y" ] && echo 0 || echo 1) "信源健康 → 跳回情报中心"

ERR=$(agent-browser console 2>/dev/null | rg -ci "error" || echo 0)
ck $([ "$ERR" = "0" ] && echo 0 || echo 1) "控制台零错误" "$ERR 条"
echo "── P2-2 冒烟：$PASS 通过 / $FAIL 失败"
[ "$FAIL" = "0" ]
