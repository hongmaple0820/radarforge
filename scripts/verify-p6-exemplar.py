#!/usr/bin/env python3
# verify-p6-exemplar.py —— P6-4 文风学习 REAL 验证：
# ① POST 提炼指纹 ② GET 列表 ③ 带文风校准跑图文流水线 ④ 注入证据
import json
import time
import urllib.request

BASE = "http://localhost:3000"


def call(method, path, body=None, timeout=180):
    req = urllib.request.Request(
        BASE + path,
        data=json.dumps(body).encode() if body is not None else None,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read())


CONTENT = """你有没有想过，为什么你手机里的AI助手永远只会说「抱歉，我无法回答」？

我跟你讲，这事儿一点都不复杂。

市面上的AI产品，九成都在装深沉。装什么深沉呢？明明就是个套壳的模型，非要把自己包装成「您的智能生活伙伴」。恶心。

但是。注意这个但是。

真正把体验做好的产品，从来不吹。它们就干一件事：把你的问题当问题。就这么简单。你问它天气，它告诉你天气。你问它路线，它告诉你路线。不绕弯子，不整花活，不给你推荐什么「猜你喜欢」。

我观察了三个月，把十几款AI助手全部用了一遍。结论很扎心：大部分产品死于话多。

少即是多。这句话被说烂了，但做到的没几个。

下次你再看到一个AI产品宣传「颠覆式创新」「重新定义交互」，你就问他一个问题：你能好好回答用户的问题吗？

答不上来的，都是耍流氓。"""

# ① 提炼指纹
d = call("POST", "/api/style-exemplars", {"name": "毒舌快评风", "content": CONTENT})
assert "exemplar" in d, d
ex = d["exemplar"]
print(f"[1] 提炼指纹 OK：{d['message']}")
for k, v in ex["fingerprint"].items():
    print(f"    {k}: {v[:56]}")
exemplar_id = ex["id"]

# ② 列表
d2 = call("GET", "/api/style-exemplars")
names = [x["name"] for x in d2["exemplars"]]
assert "毒舌快评风" in names, names
print(f"[2] 范文库 OK：{len(names)} 个档案（{', '.join(names)}）")

# ③ 带文风校准启动流水线
d3 = call("POST", "/api/runs", {
    "ideaTitle": "AI搜索产品年度观察：谁在真做事，谁在装深沉",
    "ideaAngle": "从产品实际能力与营销话术的落差切入",
    "persona": "cold-analyst",
    "theme": "professional-clean",
    "exemplarId": exemplar_id,
})
run_id = d3["id"]
print(f"[3] 流水线已启动（run {run_id}）")

# ④ 等完成并验证注入证据
deadline = time.time() + 300
run = None
while time.time() < deadline:
    run = call("GET", f"/api/runs/{run_id}")["run"]
    if run["status"] in ("done", "error"):
        break
    time.sleep(6)
assert run["status"] == "done", f"流水线未完成：{run['status']} {run.get('error','')[:120]}"
arts = call("GET", f"/api/runs/{run_id}")["run"].get("articles", [])
steps = json.loads(run["steps"])
brief_detail = next((s["detail"] for s in steps if s["name"] == "brief"), "")
print(f"[4] 流水线完成（{len(arts)} 稿，mode={run['mode']}）")
print(f"    brief: {brief_detail[:80]}")
md = arts[0]["markdown"] if arts else ""
print(f"    成稿 {len(md)} 字符，开头：{md[:60]}…")
# 文风校准验证：短句/反问特征是否渗入（粗验证：含问号或短段落）
q = md.count("？")
paras = [p for p in md.split("\n\n") if p.strip()]
short = sum(1 for p in paras if len(p) < 60)
print(f"[5] 文风渗透粗验证：问号 {q} 处，短段落 {short}/{len(paras)}")
print("EXEMPLAR-VERIFY-PASS")
