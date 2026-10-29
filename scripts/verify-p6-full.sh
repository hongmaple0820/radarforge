#!/usr/bin/env bash
# verify-p6-full.sh —— Phase 6 全量 API 回归（新能力 + 关键老面）
# 覆盖：style-exemplars CRUD / storyboard-directions / storyboard(direction) /
# revise-scene 边界 / render-video(bgm) / 版本树 meta 断言 / settings exemplars / 老面冒烟
set -u
cd /home/z/my-project

python3 - << 'EOF'
import json
import time
import urllib.request
import urllib.error

BASE = "http://localhost:3000"
PASS, FAIL = 0, 0


def check(name, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        print(f"  ✗ {name}  {detail}")


def call(method, path, body=None, timeout=240):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.loads(e.read())
        except Exception:
            return e.code, {}


print("== 1. 基础面 ==")
for path in ["/api/runs", "/api/settings", "/api/style-exemplars", "/api/gateway/providers", "/api/agent/tools", "/api/ideas", "/api/topics", "/api/morning-report", "/api/inbox"]:
    code, d = call("GET", path)
    check(f"GET {path}", code == 200, f"HTTP {code}")

code, d = call("GET", "/api/settings")
check("settings 含 exemplars 块", isinstance(d.get("settings", {}).get("exemplars", {}).get("items"), list))

print("== 2. style-exemplars CRUD ==")
code, d = call("POST", "/api/style-exemplars", {"name": "", "content": "x" * 300})
check("POST 空名 400", code == 400, f"HTTP {code}")
code, d = call("POST", "/api/style-exemplars", {"name": "短文", "content": "太短"})
check("POST 范文过短 400", code == 400, f"HTTP {code}")
code, d = call("GET", "/api/style-exemplars")
items = d.get("exemplars", [])
check(f"范文库列表（{len(items)} 个）", code == 200 and len(items) >= 1)
if items:
    code, d = call("DELETE", f"/api/style-exemplars?id=not-exist")
    check("DELETE 不存在 404", code == 404, f"HTTP {code}")

print("== 3. 视频线新能力 ==")
# 找有成稿的 run
code, d = call("GET", "/api/runs")
runs = [r for r in d["runs"] if r.get("_count", {}).get("articles", 0) > 0]
check("有成稿 run", len(runs) > 0)
run_id = runs[0]["id"]

# 三方向
code, d = call("POST", f"/api/runs/{run_id}/actions", {"action": "storyboard-directions", "platform": "douyin"}, timeout=240)
dirs = d.get("directions", [])
check(f"storyboard-directions 三方向（{len(dirs)}）", code == 200 and len(dirs) == 3)
if len(dirs) == 3:
    kinds = {x["kind"] for x in dirs}
    check("三方向 kind 齐全（fit/amplify/unexpected）", kinds == {"fit", "amplify", "unexpected"}, str(kinds))
    check("恰好一个 depth 方向", sum(1 for x in dirs if x.get("depth")) == 1)
    check("palette hex 合法", all(x["palette"]["accent"].startswith("#") and len(x["palette"]["accent"]) == 7 for x in dirs))

# 带方向分镜
B = [x for x in dirs if x["kind"] == "amplify"][0]
direction = {"key": B["key"], "kind": B["kind"], "name": B["name"], "language": B["language"], "accent": B["palette"]["accent"], "base": B["palette"]["base"], "feel": B["feel"]}
code, d = call("POST", f"/api/runs/{run_id}/actions", {"action": "storyboard", "platform": "douyin", "direction": direction}, timeout=240)
sb = d.get("storyboard", {})
check(f"带方向分镜（{len(sb.get('scenes', []))} 镜）", code == 200 and len(sb.get("scenes", [])) >= 3)
check("分镜携带 direction", sb.get("direction", {}).get("name") == B["name"])

# render-video with bgm（本地 motion，后台）
code, d = call("POST", f"/api/runs/{run_id}/actions", {"action": "render-video", "storyboard": sb, "voice": "xiaochen", "aspect": "9:16", "style": "motion", "bgm": "calm"}, timeout=120)
check("render-video(bgm=calm) 受理", code == 200 and "assetId" in d)

# revise-scene 边界
code, d = call("POST", f"/api/runs/{run_id}/actions", {"action": "revise-scene", "sceneId": 1}, )
check("revise-scene 缺 feedback 400", code == 400, f"HTTP {code}")
code, d = call("POST", f"/api/runs/{run_id}/actions", {"action": "revise-scene", "sceneId": 1, "feedback": "x" * 400, "storyboard": sb})
check("revise-scene 意见过长 400", code == 400, f"HTTP {code}")

print("== 4. 等渲染完成 + 版本树断言 ==")
deadline = time.time() + 300
meta = None
path = None
while time.time() < deadline:
    code, d = call("GET", f"/api/runs/{run_id}")
    finals = [a for a in d["run"]["assets"] if a["role"] == "video-final"]
    if finals:
        try:
            meta = json.loads(finals[-1]["meta"])
            path = finals[-1]["path"]
        except Exception:
            meta = None
        if meta and meta.get("stage") in ("done", "error"):
            break
    time.sleep(5)
check(f"渲染完成（stage={meta.get('stage') if meta else 'None'}）", meta and meta["stage"] == "done", (meta or {}).get("error", "")[:80])
if meta and meta.get("stage") == "done":
    check("meta.version 留痕", isinstance(meta.get("version"), int) and meta["version"] >= 1)
    check("meta.durations 长度=分镜数", isinstance(meta.get("durations"), list) and len(meta["durations"]) == len(sb["scenes"]))
    check("meta.bgm=calm 留痕", meta.get("bgm") == "calm")
    check("bgmNote 留痕", "混音" in meta.get("bgmNote", ""))
    check("storyboard.direction 回存", (meta.get("storyboard") or {}).get("direction", {}).get("name") == B["name"])
    check("成片路径版本化", "-v" in path or "video-" in path, path)

print("== 5. revise-scene REAL（指着改 → 新版本） ==")
code, d = call("GET", f"/api/runs/{run_id}")
finals = [a for a in d["run"]["assets"] if a["role"] == "video-final"]
base_asset = finals[-1]
code, d = call("POST", f"/api/runs/{run_id}/actions", {
    "action": "revise-scene", "sceneId": sb["scenes"][1]["id"],
    "feedback": "口播再凝练一点，字幕缩短",
    "storyboard": sb, "voice": "xiaochen", "aspect": "9:16", "style": "motion", "bgm": "calm",
    "baseAssetId": base_asset["id"],
}, timeout=120)
check("revise-scene 受理", code == 200 and "assetId" in d, json.dumps(d, ensure_ascii=False)[:100])

deadline = time.time() + 240
meta2 = None
path2 = None
while time.time() < deadline:
    code, d = call("GET", f"/api/runs/{run_id}")
    finals = [a for a in d["run"]["assets"] if a["role"] == "video-final"]
    try:
        meta2 = json.loads(finals[-1]["meta"])
        path2 = finals[-1]["path"]
    except Exception:
        meta2 = None
    if meta2 and meta2.get("stage") in ("done", "error"):
        break
    time.sleep(5)
check(f"指着改完成（stage={meta2.get('stage') if meta2 else 'None'}）", meta2 and meta2["stage"] == "done", (meta2 or {}).get("error", "")[:120])
if meta2 and meta2.get("stage") == "done":
    check(f"版本号递增（v{meta2.get('version')}）", meta2.get("version") == (meta.get("version") or 0) + 1)
    check("revisions 留痕", isinstance(meta2.get("revisions"), list) and len(meta2["revisions"]) >= 1)
    check("成片路径 -v 版本化", "-v" in path2, path2)

print(f"\n== 汇总：{PASS} 通过 / {FAIL} 失败 ==")
exit(0 if FAIL == 0 else 1)
EOF
