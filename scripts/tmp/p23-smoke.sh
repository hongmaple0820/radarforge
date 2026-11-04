set -u
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "✅ $2"; else FAIL=$((FAIL+1)); echo "❌ $2${3:+｜$3}"; fi }
HAS() { agent-browser eval "document.body.innerText.includes('$1') ? 'y' : 'n'" | tr -d '"' ; }
CLICK_TAB() { agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('$1'));if(!t)return 'no-tab';t.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return 'ok'})()" | tr -d '"'; }

agent-browser console --clear > /dev/null 2>&1
agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 12
# 顶级 tab：插件生态（第3个）→ 内层：插件中心（第2个）
agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('插件生态'));t.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return 'ok'})()" > /dev/null
sleep 5
agent-browser eval "(()=>{const t=[...document.querySelectorAll('[role=tab]')].find(x=>x.textContent.includes('插件中心'));t.dispatchEvent(new MouseEvent('mousedown',{bubbles:true,button:0}));return 'ok'})()" > /dev/null
sleep 6

CARD=$(HAS "MCP 服务端开放")
ck $([ "$CARD" = "y" ] && echo 0 || echo 1) "MCP 服务端开放卡渲染"
EP=$(agent-browser eval "document.body.innerText.includes('/api/mcp-server') ? 'y' : 'n'" | tr -d '"')
ck $([ "$EP" = "y" ] && echo 0 || echo 1) "接入端点展示"
BADGE=$(HAS "对外提供服务")
ck $([ "$BADGE" = "y" ] && echo 0 || echo 1) "启用徽标（对外提供服务）"
TOOLS=$(agent-browser eval "document.body.innerText.includes('对外工具 8 个') ? 'y' : 'n'" | tr -d '"')
ck $([ "$TOOLS" = "y" ] && echo 0 || echo 1) "对外工具计数（8 个）"
PING=$(agent-browser eval "document.body.innerText.includes('radar_ping') ? 'y' : 'n'" | tr -d '"')
ck $([ "$PING" = "y" ] && echo 0 || echo 1) "radar_ping 工具徽标可见"
COPY=$(agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('复制接入 JSON'));return btns.length>0?'y':'n'})()" | tr -d '"')
ck $([ "$COPY" = "y" ] && echo 0 || echo 1) "复制接入 JSON 按钮存在"
TOKEN=$(agent-browser eval "(()=>{const el=[...document.querySelectorAll('input[placeholder*=令牌]')];return el.length>0?'y':'n'})()" | tr -d '"')
ck $([ "$TOKEN" = "y" ] && echo 0 || echo 1) "令牌输入框存在"
DIV=$(HAS "双向 MCP")
ck $([ "$DIV" = "y" ] && echo 0 || echo 1) "双向 MCP 说明（与 dsh 出口分工）"

# 停用 → 徽标变化 → 恢复
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('停用服务端'));if(btns.length){btns[0].click();return 'clicked'}return 'no-btn'})()" | tr -d '"' > /tmp/t1
sleep 3
OFF=$(HAS "已停用")
ck $([ "$OFF" = "y" ] && echo 0 || echo 1) "停用徽标出现"
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button')].filter(b=>b.textContent.includes('启用服务端'));if(btns.length){btns[0].click();return 're'}})()" > /dev/null 2>&1
sleep 3
ON=$(HAS "对外提供服务")
ck $([ "$ON" = "y" ] && echo 0 || echo 1) "恢复启用徽标"

ERR=$(agent-browser console 2>/dev/null | rg -ci "error" || echo 0)
ck $([ "$ERR" = "0" ] && echo 0 || echo 1) "控制台零错误" "$ERR 条"
echo "── P2-3 冒烟：$PASS 通过 / $FAIL 失败"
[ "$FAIL" = "0" ]
