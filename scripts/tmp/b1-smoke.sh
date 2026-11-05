#!/bin/bash
# b1-smoke.sh —— 批次一收口冒烟（服务器在线）：
#   ① GET /api/runs 返回 tiers 三档（A2 UI 数据源）
#   ② POST /api/runs 非法档位 → 400（A2 入口校验）
#   ③ POST /api/runs 合法档位 deep → 受理落库回读一致（不入产线，路由层即止）
#   ④ GET /api/skills 管线技能标记 + 停用产线技能 → 400（A1 守卫）
#   ⑤ GET /api/settings 默认档位 medium；PUT scope=article 存取往返 + 非法值 400
set -u
BASE=http://localhost:3000
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ fail=$((fail+1)); echo "  ✗ $1"; }

echo "── ① GET /api/runs tiers ──"
TIERS=$(curl -s -m 10 "$BASE/api/runs" | python3 -c "import json,sys; d=json.load(sys.stdin); print('|'.join(t['id'] for t in d.get('tiers',[])))" 2>/dev/null)
[ "$TIERS" = "short|medium|deep" ] && ok "tiers=short|medium|deep（实际 $TIERS）" || bad "tiers 异常：$TIERS"

echo "── ② 非法档位 400 ──"
CODE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/runs" -H 'content-type: application/json' -d '{"ideaTitle":"冒烟-非法档位","lengthTier":"gigantic"}')
[ "$CODE" = "400" ] && ok "非法 lengthTier → 400" || bad "非法档位期望 400 实得 $CODE"

echo "── ③ 合法档位受理 ──"
RESP=$(curl -s -m 10 -X POST "$BASE/api/runs" -H 'content-type: application/json' -d '{"ideaTitle":"冒烟-b1-合法deep档","lengthTier":"deep","persona":"cold-analyst"}')
RID=$(echo "$RESP" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('id',d.get('run',{}).get('id','')))" 2>/dev/null)
RUN=$(curl -s -m 10 "$BASE/api/runs" | python3 -c "
import json,sys
runs=json.load(sys.stdin)['runs']
r=[x for x in runs if x['id']=='$RID']
print(r[0]['lengthTier'] if r else 'NOT_FOUND')" 2>/dev/null)
[ "$RUN" = "deep" ] && ok "run.lengthTier=deep 落库回读一致" || bad "run.lengthTier 期望 deep 实得 $RUN"
# 冒烟 run 直接标 error 终止，避免后台占用 LLM 配额跑产线
curl -s -m 10 -X PATCH "$BASE/api/runs/$RID" -H 'content-type: application/json' -d '{"status":"error"}' >/dev/null 2>&1 || true

echo "── ④ 技能中心管线守卫（A1） ──"
SKJSON=$(curl -s -m 10 "$BASE/api/skills")
PT=$(echo "$SKJSON" | python3 -c "import json,sys; print(json.load(sys.stdin).get('pipelineTotal',0))" 2>/dev/null)
[ "$PT" -ge 7 ] && ok "pipelineTotal=$PT（七个产线技能已标记）" || bad "pipelineTotal=$PT 期望 ≥7"
CODE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/skills" -H 'content-type: application/json' -d '{"action":"toggle","id":"wewrite-draft","disabled":true}')
[ "$CODE" = "400" ] && ok "停用产线技能 wewrite-draft → 400（拒绝静默断产线）" || bad "停用产线技能期望 400 实得 $CODE"

echo "── ⑤ settings article 域 ──"
ST=$(curl -s -m 10 "$BASE/api/settings" | python3 -c "import json,sys; print(json.load(sys.stdin)['settings']['article']['lengthTier'])" 2>/dev/null)
[ "$ST" = "medium" ] && ok "settings.article.lengthTier 默认 medium" || bad "settings 默认档位实得 '$ST'"
CODE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -X PUT "$BASE/api/settings" -H 'content-type: application/json' -d '{"scope":"article","value":{"lengthTier":"mega"}}')
[ "$CODE" = "400" ] && ok "PUT article 非法档位 → 400" || bad "PUT 非法档位期望 400 实得 $CODE"
PUT=$(curl -s -m 10 -X PUT "$BASE/api/settings" -H 'content-type: application/json' -d '{"scope":"article","value":{"lengthTier":"deep","imageStyleId":"tech-data"}}')
BACK=$(echo "$PUT" | python3 -c "import json,sys; d=json.load(sys.stdin)['settings']['article']; print(d['lengthTier'],d['imageStyleId'])" 2>/dev/null)
[ "$BACK" = "deep tech-data" ] && ok "PUT article(deep/tech-data) → 回读一致" || bad "PUT 往返实得 '$BACK'"
# 还原默认（不污染用户设置态）
curl -s -m 10 -X PUT "$BASE/api/settings" -H 'content-type: application/json' -d '{"scope":"article","value":{"lengthTier":"medium","imageStyleId":"modern-flat"}}' >/dev/null 2>&1
REST=$(curl -s -m 10 "$BASE/api/settings" | python3 -c "import json,sys; d=json.load(sys.stdin)['settings']['article']; print(d['lengthTier'],d['imageStyleId'])" 2>/dev/null)
[ "$REST" = "medium modern-flat" ] && ok "已还原默认 medium/modern-flat" || bad "还原失败实得 '$REST'"

echo "━━━ b1-smoke：$pass 通过 / $fail 失败 ━━━"
[ "$fail" = "0" ]
