#!/bin/bash
# ============================================================
# verify-p13-browser.sh —— p13 交互三件套浏览器端到端验证
# 前置：node scripts/seed-p13-run.mjs 注入合成 run（脚本内完成）
# 断言：向导三步 / 高级模式切换 / ⌘K 面板 / 稿优先重排 /
#       为什么这样写抽屉 / 指着改 hover+面板 / 版本树 / console 零错误
# 运行：bash scripts/with-server.sh scripts/verify-p13-browser.sh
# 注：文本存在性断言用 read（快照 -i 只含交互元素，标签/正文不可见）
# ============================================================
set -u
cd /home/z/my-project

export AGENT_BROWSER_SESSION="p13-verify"
PASS=0; FAIL=0
ok() { if [ "$1" = "0" ]; then PASS=$((PASS+1)); echo "  ✅ $2"; else FAIL=$((FAIL+1)); echo "  ❌ $2"; fi }
txt() { agent-browser read 2>/dev/null; }

# ---------- 0) 注入合成 run ----------
RUN_ID=$(node scripts/seed-p13-run.mjs 2>/dev/null | tail -1)
[ -n "$RUN_ID" ] ; ok $? "合成 run 注入（$RUN_ID）"

agent-browser open http://localhost:3000 >/dev/null 2>&1
agent-browser wait --load load >/dev/null 2>&1
sleep 2

# ---------- 1) 三步向导（新手动线）：切创作台 → 图文线 ----------
agent-browser find role tab click --name "创作台" >/dev/null 2>&1
sleep 3
T=$(txt)
echo "$T" | grep -q "三步向导" ; ok $? "向导/高级模式切换器渲染"
echo "$T" | grep -q "高级模式" ; ok $? "高级模式入口（老手动线保留）"
echo "$T" | grep -q "选题标题" ; ok $? "向导第 1 步：选题输入（label 渲染）"
# 走三步：填选题 → 下一步 → 人格风格 → 下一步 → 确认页
agent-browser find placeholder "一句话说清要写什么，如：具身智能融资观察" fill "浏览器验证选题" >/dev/null 2>&1
agent-browser find role button click --name "下一步" >/dev/null 2>&1
sleep 1.5
T2=$(txt)
echo "$T2" | grep -q "写作人格" ; ok $? "向导第 2 步：人格可视化卡片"
echo "$T2" | grep -q "冷面分析师" ; ok $? "人格卡片含标题（冷面分析师）"
echo "$T2" | grep -q "数据驱动、结论前置" ; ok $? "人格卡片含 desc 说明"
echo "$T2" | grep -q "排版主题" ; ok $? "向导第 2 步：主题选择"
agent-browser find role button click --name "下一步" >/dev/null 2>&1
sleep 1.5
T3=$(txt)
echo "$T3" | grep -q "任务书（brief）将这样写" ; ok $? "向导第 3 步：brief 预览"
echo "$T3" | grep -q "流水线将依次执行" ; ok $? "向导第 3 步：九步预告（下一秒会发生什么）"
# 回到第 1 步（不实际启动，省 LLM 配额）
agent-browser find role button click --name "上一步" >/dev/null 2>&1; sleep 0.5
agent-browser find role button click --name "上一步" >/dev/null 2>&1; sleep 0.5

# ---------- 2) 高级模式切换（老手动线直达表单） ----------
agent-browser find role button click --name "高级模式" >/dev/null 2>&1
sleep 1.5
T4=$(txt)
echo "$T4" | grep -q "启动流水线" ; ok $? "高级模式：直达表单（启动按钮）"
echo "$T4" | grep -q "图文线 · 九步流水线" ; ok $? "高级模式：原表单字段保留"
agent-browser find role button click --name "三步向导" >/dev/null 2>&1
sleep 1

# ---------- 3) ⌘K 命令面板 ----------
agent-browser press Control+k >/dev/null 2>&1
sleep 1.5
T5=$(txt)
echo "$T5" | grep -q "新图文 · 九步流水线" ; ok $? "⌘K 面板：新图文动作"
echo "$T5" | grep -q "新视频" ; ok $? "⌘K 面板：新视频动作"
echo "$T5" | grep -q "新图组" ; ok $? "⌘K 面板：新图组动作"
echo "$T5" | grep -q "最近 Run" ; ok $? "⌘K 面板：最近 Run 直达"
echo "$T5" | grep -q "评测集是 prompt 调优的地基" ; ok $? "⌘K 面板：注入 run 出现在最近列表"
# 点最近 Run → 跳详情（cmdk 项 role=option；看板同名卡片会被对话框遮挡，须用 role 精确定位）
agent-browser find role option click --name "评测集是 prompt 调优的地基" >/dev/null 2>&1
FOUND=0
for i in $(seq 20); do
  if txt | grep -q "成稿（v1"; then FOUND=1; break; fi
  sleep 2
done
[ "$FOUND" = "1" ] ; ok $? "⌘K 跳转详情成功 + 成稿可见"

# ---------- 4) Run 详情：稿优先重排 ----------
PAGE_TEXT=$(txt)
POS_DRAFT=$(echo "$PAGE_TEXT" | grep -n "成稿（v1" | head -1 | cut -d: -f1)
POS_WHY=$(echo "$PAGE_TEXT" | grep -n "为什么这样写" | head -1 | cut -d: -f1)
[ -n "$POS_DRAFT" ] && [ -n "$POS_WHY" ] && [ "$POS_DRAFT" -lt "$POS_WHY" ] ; ok $? "稿优先：正文在证据链抽屉之前（行 $POS_DRAFT < $POS_WHY）"
echo "$PAGE_TEXT" | grep -q "文章任务书（brief）" ; RC=$?
[ "$RC" != "0" ] ; ok $? "证据链默认折叠（brief 卡不渲染）"
echo "$PAGE_TEXT" | grep -q "版本" ; ok $? "版本树选择器渲染（v0/v1）"

# ---------- 5) 为什么这样写抽屉展开 ----------
agent-browser find text "为什么这样写" click >/dev/null 2>&1
sleep 1.5
PAGE_TEXT2=$(txt)
echo "$PAGE_TEXT2" | grep -q "文章任务书（brief）" ; ok $? "抽屉展开：brief 卡可见"
echo "$PAGE_TEXT2" | grep -q "大纲（3 节）" ; ok $? "抽屉展开：大纲卡可见"
echo "$PAGE_TEXT2" | grep -q "原子断言核验" ; ok $? "抽屉展开：断言卡可见"
echo "$PAGE_TEXT2" | grep -q "claims 来源账本" ; ok $? "抽屉展开：claims 账本可见"
echo "$PAGE_TEXT2" | grep -q "五维审稿" ; ok $? "抽屉展开：审稿卡可见"

# ---------- 6) 指着改（hover → 按钮 → 面板 → 取消） ----------
agent-browser find text "五维量表怎么定锚" hover >/dev/null 2>&1
sleep 1
BTN=$(agent-browser snapshot -i 2>/dev/null | grep -c 'button "指着改"')
[ "$BTN" -ge 1 ] ; ok $? "指着改按钮存在（hover 后可见，$BTN 个分节）"
# hover 的是第 3 节（五维量表怎么定锚，index 2）→ 对应第 3 个按钮（未 hover 分节的按钮 opacity-0 不可点）
BTN_REF=$(agent-browser snapshot -i 2>/dev/null | grep 'button "指着改"' | sed -E 's/.*\[ref=([^]]+)\].*/\1/' | sed -n '3p')
agent-browser click "@$BTN_REF" >/dev/null 2>&1
sleep 1.5
T6=$(txt)
echo "$T6" | grep -q "AI 重写本节" ; ok $? "指着改面板打开（反馈输入 + 重写按钮）"
echo "$T6" | grep -q "指着改 · 第 3 节「五维量表怎么定锚」" ; ok $? "指着改面板：选中节标识正确"
echo "$T6" | grep -q "只动这一节" ; ok $? "指着改面板：范围契约说明"
agent-browser find role button click --name "取消" >/dev/null 2>&1
sleep 0.5

# ---------- 7) 版本树：切历史版本只读 ----------
agent-browser select "select[aria-label='文章版本树']" "0" >/dev/null 2>&1
sleep 1.5
T7=$(txt)
echo "$T7" | grep -q "正在查看历史版本" ; ok $? "版本树：历史版本只读提示"
echo "$T7" | grep -q "成稿（v0" ; ok $? "版本树：切到 v0 成功"
echo "$T7" | grep -q "指着改与改稿始终作用于最新版" ; ok $? "版本树：最新版作用域说明"

# ---------- 8) console 零错误 ----------
CONSOLE=$(agent-browser console 2>/dev/null)
ERR_COUNT=$(echo "$CONSOLE" | grep -ci "error" || true)
[ "$ERR_COUNT" = "0" ] ; ok $? "console 零错误（$ERR_COUNT 条）"

# ---------- 9) 收尾：清理合成 run ----------
node -e "
const { PrismaClient } = require('@prisma/client');
const db = new PrismaClient();
(async () => {
  await db.claim.deleteMany({ where: { runId: '$RUN_ID' } });
  await db.reviewRecord.deleteMany({ where: { runId: '$RUN_ID' } });
  await db.article.deleteMany({ where: { runId: '$RUN_ID' } });
  await db.agentRun.delete({ where: { id: '$RUN_ID' } });
  await db.\$disconnect();
})();
" >/dev/null 2>&1
echo ""
echo "━━━ p13 浏览器验证：$PASS 通过 / $FAIL 失败 ━━━"
agent-browser close >/dev/null 2>&1
[ "$FAIL" = "0" ]
