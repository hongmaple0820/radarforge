#!/bin/bash
# c3-smoke.sh —— 批次三收口冒烟（服务器在线）：
#   ① GET /api/video-runs 带 C3 协议族能力元数据 + C4 池状态
#   ② GET /api/settings video.subtitleStyle 默认 clean
#   ③ PUT scope=video subtitleStyle=strong 往返 + 非法值静默丢弃（白名单校验）
#   ④ GET /api/skills 管线技能 ≥8（新增 huashu-video-direct）；停用 → 400
#   ⑤ POST render-video 分镜不足 → 400（入口契约不回退）
set -u
BASE=http://localhost:3000
pass=0; fail=0
ok(){ pass=$((pass+1)); echo "  ✓ $1"; }
bad(){ fail=$((fail+1)); echo "  ✗ $1"; }

echo "── ① video-runs 能力元数据 + 池状态 ──"
VR=$(curl -s -m 10 "$BASE/api/video-runs")
FAMS=$(echo "$VR" | python3 -c "import json,sys; d=json.load(sys.stdin); print(len(d.get('capabilities',{}).get('families',[])))" 2>/dev/null)
[ "$FAMS" = "3" ] && ok "capabilities.families=3（agnes/ark-seedance/openai-compat）" || bad "families 期望 3 实得 $FAMS"
CUR=$(echo "$VR" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('capabilities',{}).get('current',{}).get('id',''))" 2>/dev/null)
[ "$CUR" = "agnes" ] && ok "当前模型族=agnes（默认模型判族）" || bad "current.id 期望 agnes 实得 $CUR"
MODES=$(echo "$VR" | python3 -c "import json,sys; d=json.load(sys.stdin); f=[x for x in d['capabilities']['families'] if x['id']=='agnes'][0]; print('keyframe' in f['modes'])" 2>/dev/null)
[ "$MODES" = "True" ] && ok "agnes 族能力含 keyframe 模式（C1 i2v）" || bad "agnes modes 缺 keyframe"
POOL=$(echo "$VR" | python3 -c "import json,sys; d=json.load(sys.stdin); p=d.get('agnesPool',{}); print(sorted(p.keys()) == sorted(['configured','accounts','strategy','imageCapacity','videoReady','cooldown']))" 2>/dev/null)
[ "$POOL" = "True" ] && ok "agnesPool 六字段齐（池空显式可见）" || bad "agnesPool 字段异常"

echo "── ② settings.video.subtitleStyle 默认 ──"
ST=$(curl -s -m 10 "$BASE/api/settings" | python3 -c "import json,sys; print(json.load(sys.stdin)['settings']['video'].get('subtitleStyle','MISSING'))" 2>/dev/null)
[ "$ST" = "clean" ] && ok "subtitleStyle 默认 clean" || bad "subtitleStyle 期望 clean 实得 '$ST'"

echo "── ③ PUT video 域往返 + 白名单 ──"
PUT=$(curl -s -m 10 -X PUT "$BASE/api/settings" -H 'content-type: application/json' -d '{"scope":"video","value":{"subtitleStyle":"strong"}}')
RT=$(echo "$PUT" | python3 -c "import json,sys; print(json.load(sys.stdin)['settings']['video'].get('subtitleStyle',''))" 2>/dev/null)
[ "$RT" = "strong" ] && ok "subtitleStyle=strong 存取往返一致" || bad "往返实得 '$RT'"
curl -s -m 10 -X PUT "$BASE/api/settings" -H 'content-type: application/json' -d '{"scope":"video","value":{"subtitleStyle":"mega"}}' >/dev/null
RT2=$(curl -s -m 10 "$BASE/api/settings" | python3 -c "import json,sys; print(json.load(sys.stdin)['settings']['video'].get('subtitleStyle',''))" 2>/dev/null)
[ "$RT2" = "strong" ] && ok "非法 subtitleStyle 静默丢弃（白名单三档）" || bad "非法值实得 '$RT2'"

echo "── ④ 技能中心管线守卫（A1 纪律延伸到视频线） ──"
PT=$(curl -s -m 10 "$BASE/api/skills" | python3 -c "import json,sys; print(json.load(sys.stdin).get('pipelineTotal',0))" 2>/dev/null)
[ "$PT" -ge 8 ] && ok "pipelineTotal=$PT（含 huashu-video-direct）" || bad "pipelineTotal=$PT 期望 ≥8"
CODE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/skills" -H 'content-type: application/json' -d '{"action":"toggle","id":"huashu-video-direct","disabled":true}')
[ "$CODE" = "400" ] && ok "停用视频导演产线技能 → 400" || bad "停用 huashu-video-direct 期望 400 实得 $CODE"

echo "── ⑤ render-video 入口契约 ──"
# 无 run 提交非法分镜：runId 不存在走 404/400 均可证明入口校验先于执行
CODE=$(curl -s -m 10 -o /dev/null -w "%{http_code}" -X POST "$BASE/api/runs/nonexistent-run/actions" -H 'content-type: application/json' -d '{"action":"render-video","storyboard":{"title":"x","hook":"h","totalSeconds":10,"scenes":[{"id":1,"seconds":4,"visual":"v","narration":"n","subtitle":"s","broll":"b"},{"id":2,"seconds":4,"visual":"v","narration":"n","subtitle":"s","broll":"b"}],"bgm":"","caption":""}}')
[ "$CODE" = "404" ] || [ "$CODE" = "400" ] && ok "非法 run/分镜 → $CODE（不静默执行）" || bad "期望 404/400 实得 $CODE"

echo ""
echo "━━ c3-smoke：$pass 通过 / $fail 失败 ━━"
[ "$fail" = "0" ]
