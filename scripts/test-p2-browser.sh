#!/usr/bin/env bash
# ============================================================
# P2 浏览器实测：转选题后选题池立即刷新（用户报障原始场景）+
# 设置中心自动化卡渲染 + 控制台零错误
# 用法：bash scripts/with-server.sh "bash scripts/test-p2-browser.sh"
# ============================================================
set -u
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "✅ $2"; else FAIL=$((FAIL+1)); echo "❌ $2${3:+｜$3}"; fi }

# 首页加载（hydration 等待）
agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 15
HTML=$(agent-browser eval "document.querySelector('[role=tablist]') ? 'tabs-ok' : 'no-tabs'")
ck $([ "$HTML" != "no-tabs" ] && echo 0 || echo 1) "首页加载与 hydration（$HTML）"

# ---------- 场景 1：情报中心 → RSS 转选题 → 选题池立即出现 ----------
agent-browser click "[role=tab]:first-child" > /dev/null 2>&1  # 情报中心
sleep 3
BEFORE=$(agent-browser eval "document.body.innerText.includes('池子为空') ? 'empty' : 'has'" | tr -d '"')
echo "初始选题池状态：$BEFORE"

# 找到 RSS 最近条目的「转选题」按钮并点击
BTN=$(agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button')];const b=btns.find(x=>x.textContent.trim()==='转选题'&&x.closest('.max-h-56'));return b?'found':'none'})()" | tr -d '"')
ck $([ "$BTN" = "found" ] && echo 0 || echo 1) "RSS 条目「转选题」按钮存在"
agent-browser eval "(()=>{const btns=[...document.querySelectorAll('button')];const b=btns.find(x=>x.textContent.trim()==='转选题'&&x.closest('.max-h-56'));if(b){b.click();return 'clicked'}return 'none'})()" > /dev/null 2>&1
sleep 5
# 关键验证：不刷新页面，选题池卡片里出现新选题（.group.rounded-lg.border = 选题卡；话题用 rounded-md，不冲突）
AFTER=$(agent-browser eval "document.querySelectorAll('.group.rounded-lg.border').length" | tr -d '"')
ck $([ "${AFTER:-0}" -ge 1 ] 2>/dev/null; echo $? ) "转选题后选题池立即出现条目（未刷新页面）" "cards=${AFTER}"
RSSBADGE=$(agent-browser eval "document.querySelector('.group.rounded-lg.border')?.innerText.includes('RSS') ? 'rss-badge-ok' : 'no-badge'" | tr -d '"')
ck $([ "$RSSBADGE" = "rss-badge-ok" ] && echo 0 || echo 1) "选题卡显示 RSS 来源徽章" "$RSSBADGE"
FILTERTABS=$(agent-browser eval "document.body.innerText.includes('新选题') && document.body.innerText.includes('已采纳') && document.body.innerText.includes('已完成') ? 'filter-ok' : 'no-filter'" | tr -d '"')
ck $([ "$FILTERTABS" = "filter-ok" ] && echo 0 || echo 1) "选题池状态筛选 tabs 渲染" "$FILTERTABS"
# placeholder 不在 innerText → 查 input 属性
DIRHINT=$(agent-browser eval "document.querySelector('input[placeholder*=AI]') ? 'hint-ok' : 'no-hint'" | tr -d '"')
ck $([ "$DIRHINT" = "hint-ok" ] && echo 0 || echo 1) "早报/AI刷新方向可选提示渲染" "$DIRHINT"
REFDIR=$(agent-browser eval "document.querySelectorAll('input[placeholder*=方向]').length >= 2 ? 'ok' : 'no'" | tr -d '"')
ck $([ "$REFDIR" = "ok" ] && echo 0 || echo 1) "早报+AI 刷新双方向输入渲染"
NOOVERWRITE=$(agent-browser eval "document.body.innerText.includes('只新增不覆盖') ? 'ok' : 'no'" | tr -d '"')
ck $([ "$NOOVERWRITE" = "ok" ] && echo 0 || echo 1) "「只新增不覆盖」说明渲染（回答用户疑虑）"

# ---------- 场景 2：设置中心 → 自动化任务卡（首次激活懒编译，等足） ----------
agent-browser click "[role=tab]:nth-child(4)" > /dev/null 2>&1
sleep 12
AUTOCARD=$(agent-browser eval "document.body.innerText.includes('自动化任务') && document.body.innerText.includes('每日 AI 早报') && document.body.innerText.includes('立即出一份早报') ? 'auto-ok' : 'no-auto'" | tr -d '"')
ck $([ "$AUTOCARD" = "auto-ok" ] && echo 0 || echo 1) "设置中心「自动化任务」卡渲染" "$AUTOCARD"
RSSAUTO=$(agent-browser eval "document.body.innerText.includes('RSS 信源定时刷新') && document.body.innerText.includes('每日 AI 灵感刷新') ? 'ok' : 'no'" | tr -d '"')
ck $([ "$RSSAUTO" = "ok" ] && echo 0 || echo 1) "RSS 定时刷新 + 灵感刷新配置块渲染"

# ---------- 场景 3：控制台错误 ----------
ERRORS=$(agent-browser errors 2>/dev/null | head -20)
ERRCOUNT=$(echo "$ERRORS" | rg -c "error|Error" 2>/dev/null || echo 0)
ck $([ "${ERRCOUNT:-0}" = "0" ] && echo 0 || echo 1) "控制台零错误" "errors=${ERRCOUNT:-0}"

# 截图留证
agent-browser screenshot /tmp/render/p2-intel.png > /dev/null 2>&1 || true

echo ""
echo "━━━ 浏览器实测：$PASS 通过 / $FAIL 失败 ━━━"
exit $([ "$FAIL" = "0" ] && echo 0 || echo 1)
