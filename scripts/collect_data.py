"""调用本应用的 /api/search 收集参数行为数据（Freshness / Mode），输出 JSON 供绘图使用"""
import json
import urllib.request

BASE = 'http://localhost:3000/api/search'

TOPICS = ['人工智能 大模型', 'AI Agent 智能体', '具身智能 机器人']
FRESHNESS = ['d1', 'd3', 'd7', 'd30']
MODES = [0, 1, 2]
CNT = 30


def search(query, **params):
    body = {'query': query, 'cnt': CNT, **params}
    req = urllib.request.Request(
        BASE,
        data=json.dumps(body).encode('utf-8'),
        headers={'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode('utf-8'))


result = {'freshness': {}, 'mode': {}}

# 实验 1: Freshness 对结果条数的影响（mode=0 固定）
for topic in TOPICS:
    result['freshness'][topic] = []
    for f in FRESHNESS:
        d = search(topic, freshness=f, mode=0)
        result['freshness'][topic].append({'freshness': f, 'count': len(d['pages'])})

# 实验 2: Mode 对结果条数与平均相关度的影响（freshness=d30 固定）
for topic in TOPICS:
    result['mode'][topic] = []
    for m in MODES:
        d = search(topic, mode=m, freshness='d30')
        pages = d['pages']
        avg = sum(p['score'] for p in pages) / len(pages) if pages else 0
        result['mode'][topic].append({'mode': m, 'count': len(pages), 'avg_score': round(avg, 4)})

out = '/home/z/my-project/scripts/chart-data.json'
with open(out, 'w', encoding='utf-8') as fp:
    json.dump(result, fp, ensure_ascii=False, indent=2)
print(json.dumps(result, ensure_ascii=False, indent=2))
print(f'saved -> {out}')
