set -u
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "✅ $2"; else FAIL=$((FAIL+1)); echo "❌ $2${3:+｜$3}"; fi }
HAS() { agent-browser eval "document.body.innerText.includes('$1') ? 'y' : 'n'" | tr -d '"' ; }

agent-browser console --clear > /dev/null 2>&1
agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 12
agent-browser click "[role=tab]:nth-child(3)" > /dev/null 2>&1
sleep 6
SKILLS=$(HAS "Skills 目录")
ck $([ "$SKILLS" = "y" ] && echo 0 || echo 1) "生态页-社区技能：Skills 目录卡渲染"
INSTALL=$(HAS "安装技能")
ck $([ "$INSTALL" = "y" ] && echo 0 || echo 1) "安装盒渲染（URL + 上传 zip 双通道）"
PRODUCT=$(HAS "产品库")
ck $([ "$PRODUCT" = "y" ] && echo 0 || echo 1) "来源徽标（产品库）"
COUNT=$(agent-browser eval "document.body.innerText.includes('候选池 12 个') ? 'y' : 'n'" | tr -d '"')
ck $([ "$COUNT" = "y" ] && echo 0 || echo 1) "候选池计数动态渲染（12 个）"
INFO=$(agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button[title*=详情]')];if(btns.length===0)return 'no-btn';btns[0].click();return 'clicked'})()" | tr -d '"')
sleep 3
DRAWER=$(HAS "SKILL.md 全文")
ck $([ "$DRAWER" = "y" ] && echo 0 || echo 1) "详情抽屉打开（SKILL.md 全文）" "$INFO"
TREE=$(HAS "目录结构")
ck $([ "$TREE" = "y" ] && echo 0 || echo 1) "详情抽屉：目录结构"
COMP=$(agent-browser eval "document.body.innerText.includes('agentskills.io') ? 'y' : 'n'" | tr -d '"')
ck $([ "$COMP" = "y" ] && echo 0 || echo 1) "详情抽屉：合规标注"
agent-browser press Escape > /dev/null 2>&1
sleep 1
TOGGLE=$(agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button[title*=停用]')];if(btns.length===0)return 'no-btn';btns[0].click();return 'clicked'})()" | tr -d '"')
sleep 3
DISABLED=$(HAS "停用")
ck $([ "$DISABLED" = "y" ] && echo 0 || echo 1) "停用徽标出现" "$TOGGLE"
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button[title*=启用]')];if(btns.length){btns[0].click();return 're'}})()" > /dev/null 2>&1
sleep 3
ERR=$(agent-browser console 2>/dev/null | rg -ci "error" || echo 0)
ck $([ "$ERR" = "0" ] && echo 0 || echo 1) "控制台零错误" "$ERR 条"
echo "── P2-1 冒烟：$PASS 通过 / $FAIL 失败"
[ "$FAIL" = "0" ]
