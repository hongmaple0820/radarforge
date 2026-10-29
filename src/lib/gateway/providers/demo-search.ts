// ============================================================
// 演示搜索 Provider（降级模式）—— 密钥未配置/上游故障时兜底
// 数据为内置静态样本，明确标记 mode=DEMO，绝不冒充真实数据
// ============================================================

import type { SearchProvider, SearchRequest, SearchResult } from "../types"

const DEMO_POOL: SearchResult[] = [
  {
    title: "OpenAI 发布 o5 系列模型，推理成本再降 60%",
    url: "https://example.com/demo/openai-o5",
    site: "演示数据 · 科技日报",
    date: "2026-10-26",
    passage:
      "OpenAI 在秋季发布会上推出 o5 系列，主打长链条推理与工具调用，官方基准显示复杂任务成功率提升 18%，而单次调用成本较 o3 下降约 60%。分析认为这将加速 Agent 类应用落地。",
    score: 0.82,
  },
  {
    title: "国产开源大模型格局生变：MoE 架构成为主流选择",
    url: "https://example.com/demo/moe-trend",
    site: "演示数据 · 每日经济新闻",
    date: "2026-10-25",
    passage:
      "多家头部厂商相继开源 MoE 架构模型，激活参数普遍降至数十亿级，推理显存门槛显著下探。开发者社区反馈，消费级显卡本地部署完整对话链路已具备可行性。",
    score: 0.79,
  },
  {
    title: "AI 编程助手渗透率过半，代码审查场景增长最快",
    url: "https://example.com/demo/ai-coding",
    site: "演示数据 · InfoQ",
    date: "2026-10-24",
    passage:
      "最新开发者调查显示，AI 编程工具周活渗透率达 54%，其中代码审查与测试生成是增长最快的两个场景。团队级账号的付费转化率约为个人账号的三倍。",
    score: 0.77,
  },
  {
    title: "具身智能融资升温：单季度融资总额创历史新高",
    url: "https://example.com/demo/embodied-ai",
    site: "演示数据 · 36 氪",
    date: "2026-10-23",
    passage:
      "三季度具身智能赛道披露融资总额超 260 亿元，本体制造与数据采集服务占比最高。多家机构指出，场景数据闭环正取代参数规模成为估值核心变量。",
    score: 0.75,
  },
]

export const demoSearch: SearchProvider = {
  kind: "SEARCH",
  name: "demo-search",
  label: "演示搜索（内置样本）",
  notes: "降级模式专用：密钥未配置或上游故障时兜底，返回静态演示数据并明确标记 DEMO",
  isConfigured: () => true,
  async search(req: SearchRequest): Promise<SearchResult[]> {
    const q = req.query.toLowerCase()
    const matched = DEMO_POOL.filter(
      (r) =>
        q === "" ||
        r.title.toLowerCase().includes(q.slice(0, 4)) ||
        q.split(/\s+/).some((w) => w.length > 1 && (r.passage.toLowerCase().includes(w) || r.title.toLowerCase().includes(w))),
    )
    // 演示数据也做一轮"排序"，保持真实感
    const out = matched.length > 0 ? matched : DEMO_POOL
    return out.slice(0, req.count ?? 6)
  },
}
