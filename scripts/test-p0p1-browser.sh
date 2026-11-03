#!/usr/bin/env bash
# =============================================================
# P0/P1 批次浏览器实测：七问整固后的新 UI 全链路验证
# ① 设置中心：网络代理卡 / 视频通道全套参数（模型/分辨率/画幅）/
#    渲染依赖自检按钮 / AI 模型探活按钮（拆分后语义）
# ② 插件中心：工具测试台（重定位改名+诊断标注）/ MCP 双传输表单 /
#    导入导出同步三按钮 / 已接入工具徽章
# ③ 情报中心：RSS 源铅笔编辑按钮 / 按源代理输入框
# ④ 控制台零错误
# 用法：bash scripts/with-server.sh "bash scripts/test-p0p1-browser.sh"
# =============================================================
set -u
PASS=0; FAIL=0
ck() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "✅ $2"; else FAIL=$((FAIL+1)); echo "❌ $2${3:+｜$3}"; fi }
HAS() { agent-browser eval "document.body.innerText.includes('$1') ? 'y' : 'n'" | tr -d '"' ; }

agent-browser open http://localhost:3000 > /dev/null 2>&1
sleep 15
HTML=$(agent-browser eval "document.querySelector('[role=tablist]') ? 'tabs-ok' : 'no-tabs'")
ck $([ "$HTML" != "no-tabs" ] && echo 0 || echo 1) "首页加载与 hydration（$HTML）"

# ---------- ① 设置中心（第 4 个 tab：intel/studio/eco/settings） ----------
agent-browser click "[role=tab]:nth-child(4)" > /dev/null 2>&1
sleep 8
NET=$(HAS "网络代理")
ck $([ "$NET" = "y" ] && echo 0 || echo 1) "设置中心：网络代理卡渲染（P0-2 全局代理）"
VID=$(agent-browser eval "(()=>{const el=[...document.querySelectorAll('*')].find(x=>x.textContent.trim().startsWith('生成参数')&&x.textContent.includes('分辨率'));return el?'y':'n'})()" | tr -d '"')
ck $([ "$VID" = "y" ] && echo 0 || echo 1 ) "设置中心：视频生成参数区块（模型/分辨率/画幅，P1-5）" "$VID"
DEP=$(HAS "渲染依赖自检")
ck $([ "$DEP" = "y" ] && echo 0 || echo 1) "设置中心：渲染依赖自检按钮（P0-1 拆分）"
PROBE=$(HAS "AI 模型探活")
ck $([ "$PROBE" = "y" ] && echo 0 || echo 1) "设置中心：AI 模型探活按钮（P0-1 拆分）"
MODEL_INPUT=$(agent-browser eval "(()=>{const inp=document.querySelector('input[list=video-model-options]');return inp?'y':'n'})()" | tr -d '"')
ck $([ "$MODEL_INPUT" = "y" ] && echo 0 || echo 1) "视频模型可编辑输入（datalist 预置 + 手填，P1-5）"

#  渲染依赖自检点击 → 人话结果（不透出 ENOENT）
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('渲染依赖自检'));if(b){b.click();return 'ok'}return 'none'})()" > /dev/null 2>&1
sleep 8
DEP_RESULT=$(agent-browser eval "document.body.innerText.includes('/usr/bin/ffmpeg')||document.body.innerText.includes('ffmpeg version') ? 'y' : 'n'" | tr -d '"')
ck $([ "$DEP_RESULT" = "y" ] && echo 0 || echo 1) "依赖自检点击后展示解析路径（含 /usr/bin/ffmpeg）"

# ---------- ② 插件中心（第 3 个主 tab：eco → 内含子 tab「插件中心」） ----------
agent-browser click "[role=tab]:nth-child(3)" > /dev/null 2>&1
sleep 6
# 点 eco 面板内的「插件中心」子 tab（active panel 内第 2 个 tab）
agent-browser click "[role=tabpanel][data-state=active] [role=tab]:nth-child(2)" > /dev/null 2>&1
sleep 12
BENCH=$(HAS "工具测试台")
ck $([ "$BENCH" = "y" ] && echo 0 || echo 1) "插件中心：工具测试台（P1-6 重定位改名）"
DIAG=$(HAS "诊断用途")
ck $([ "$DIAG" = "y" ] && echo 0 || echo 1) "测试台带诊断用途标注（P1-6 心智）"
MCPBTN=$(HAS "导入 mcpServers JSON")
ck $([ "$MCPBTN" = "y" ] && echo 0 || echo 1) "MCP 卡：导入按钮（P1-4）"
EXPBTN=$(HAS "导出（Cursor 可用）")
ck $([ "$EXPBTN" = "y" ] && echo 0 || echo 1) "MCP 卡：导出按钮（P1-4）"
SYNCBTN=$(HAS "同步到注册表")
ck $([ "$SYNCBTN" = "y" ] && echo 0 || echo 1) "MCP 卡：同步注册表按钮（P1-4）"
# 打开导入面板 → 双传输表单
agent-browser eval "(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('导入 mcpServers JSON'));if(b){b.click();return 'ok'}return 'none'})()" > /dev/null 2>&1
sleep 3
IMPORTBOX=$(agent-browser eval "document.querySelector('textarea[placeholder*=\"mcpServers\"]') ? 'y' : 'n'" | tr -d '"')
ck $([ "$IMPORTBOX" = "y" ] && echo 0 || echo 1) "导入面板展开（textarea 就位）"
STDIO_FORM=$(HAS "本地 stdio")
ck $([ "$STDIO_FORM" = "y" ] && echo 0 || echo 1) "MCP 新增表单：stdio 传输选项（P0-4）"

# ---------- ③ 情报中心 RSS 编辑（第 1 个 tab：intel） ----------
agent-browser click "[role=tab]:nth-child(1)" > /dev/null 2>&1
sleep 6
PENCIL=$(agent-browser eval "(()=>{const t=[...document.querySelectorAll('button[title*=编辑]')];return t.length>0?t.length:0})()" | tr -d '"')
ck $([ "${PENCIL:-0}" -ge 1 ] 2>/dev/null; echo $? ) "RSS 源铅笔编辑按钮存在（P0-2）" "count=${PENCIL}"
# 点击铅笔 → 编辑表单展开（含按源代理输入）
agent-browser eval "(()=>{const b=document.querySelector('button[title*=编辑]');if(b){b.click();return 'ok'}return 'none'})()" > /dev/null 2>&1
sleep 3
EDITFORM=$(agent-browser eval "document.querySelector('input[placeholder*=\"按源代理\"]') ? 'y' : 'n'" | tr -d '"')
ck $([ "$EDITFORM" = "y" ] && echo 0 || echo 1) "编辑态展开含按源代理输入框（P0-2）"
HISTKEEP=$(HAS "历史条目全部保留")
ck $([ "$HISTKEEP" = "y" ] && echo 0 || echo 1) "编辑表单明示历史保留（对比删除重建）"

# ---------- ④ 控制台错误 ----------
sleep 3
ERRS=$(agent-browser errors 2>/dev/null | head -5)
ck $([ -z "$ERRS" ] && echo 0 || echo 1) "控制台零错误" "$(echo "$ERRS" | head -2)"

echo ""
echo "━━━ 浏览器实测：$PASS 过 / $FAIL 挂 ━━━"
exit $([ "$FAIL" = "0" ] && echo 0 || echo 1)
