// ============================================================
// eval-topics.ts —— 固定评测集（P0 质量管线 L5 度量层的「题库」）
// 50 篇选题 · 10 大类 × 5 篇；persona/theme 固定 → 同一题每次
// 跑同一配置，评分可比、可回归、可归因（先建度量，再动刀）。
// 选题均为分析型命题（prompt），不预设任何待核事实——
// 事实由流水线的 claims/断言层自行取证与核验。
// ============================================================

export interface EvalTopic {
  id: string // e.g. "m01"
  category: string
  title: string
  angle: string
  persona: string
  theme: string
}

export const EVAL_CATEGORIES = [
  "模型发布",
  "开源生态",
  "工具链",
  "行业动态",
  "资本动向",
  "政策监管",
  "研究前沿",
  "开发者生态",
  "应用落地",
  "职业与技能",
] as const

export const EVAL_TOPICS: EvalTopic[] = [
  // ---------- 模型发布 ----------
  { id: "m01", category: "模型发布", title: "旗舰模型与轻量模型的差距正在拉大还是缩小", angle: "从推理成本与任务成功率两条曲线看分层定价背后的能力格局", persona: "cold-analyst", theme: "tech-modern" },
  { id: "m02", category: "模型发布", title: "多模态模型开始「看懂」工业图纸了吗", angle: "以图纸理解与缺陷检测两个企业场景，评估多模态落地的真实水位", persona: "tech-coder", theme: "professional-clean" },
  { id: "m03", category: "模型发布", title: "开源模型追赶到商业模型的最后一段路有多难", angle: "对齐、安全与长链条推理三个维度的差距拆解", persona: "sharp-editor", theme: "sspai" },
  { id: "m04", category: "模型发布", title: "模型「推理模式」值得为它多付十倍价钱吗", angle: "按任务类型算一笔账：哪些任务收益覆盖成本，哪些是智商税", persona: "cold-analyst", theme: "tech-modern" },
  { id: "m05", category: "模型发布", title: "上下文窗口军竞赛跑到了实用边界之外吗", angle: "长上下文的召回率衰减与成本曲线，兼论「大海捞针」测试的局限", persona: "tech-coder", theme: "professional-clean" },

  // ---------- 开源生态 ----------
  { id: "o01", category: "开源生态", title: "开源大模型的公司少了，生态却更热闹了——为什么", angle: "从模型开源转向工具与数据开源的接力逻辑", persona: "sharp-editor", theme: "sspai" },
  { id: "o02", category: "开源生态", title: "MoE 架构为什么成了开源社区的默认选择", angle: "显存门槛、推理成本与社区微调生态三重推力", persona: "tech-coder", theme: "tech-modern" },
  { id: "o03", category: "开源生态", title: "开源许可证之争正在改变 AI 开源的玩法吗", angle: "「可用不可商用」条款对下游应用与二次开发的影响", persona: "cold-analyst", theme: "professional-clean" },
  { id: "o04", category: "开源生态", title: "小团队该不该基于开源模型做产品", angle: "成本、可控性与能力天花板的三角权衡，给出决策清单", persona: "warm-mentor", theme: "sspai" },
  { id: "o05", category: "开源生态", title: "开源模型微调的「配方」正在标准化吗", angle: "训练脚手架、数据配比与评测协议的开源化程度盘点", persona: "tech-coder", theme: "tech-modern" },

  // ---------- 工具链 ----------
  { id: "t01", category: "工具链", title: "Agent 框架大爆发一年后，留下的赢家是谁", angle: "从多阶段编排、可观测性到成本控制，看框架竞争的本质", persona: "sharp-editor", theme: "tech-modern" },
  { id: "t02", category: "工具链", title: "本地优先的 AI 工具栈正在成为新的默认吗", angle: "隐私、延迟与离线场景三重需求驱动下的工具链重组", persona: "tech-coder", theme: "sspai" },
  { id: "t03", category: "工具链", title: "向量数据库的护城河被通用搜索引擎追平了吗", angle: "混合检索与重排序普及后，专用向量库的差异化空间", persona: "cold-analyst", theme: "professional-clean" },
  { id: "t04", category: "工具链", title: "评测工具是被低估的 AI 基建吗", angle: "没有度量的迭代都是玄学——评测层创业机会拆解", persona: "sharp-editor", theme: "tech-modern" },
  { id: "t05", category: "工具链", title: "Prompt 管理正在从手艺活变成工程学科", angle: "版本化、回归测试与灰度发布的 prompt 工程化实践", persona: "warm-mentor", theme: "sspai" },

  // ---------- 行业动态 ----------
  { id: "i01", category: "行业动态", title: "AI 搜索正在吃掉传统搜索引擎的哪块蛋糕", angle: "从查询意图分布变化看搜索广告与订阅模式的此消彼长", persona: "cold-analyst", theme: "tech-modern" },
  { id: "i02", category: "行业动态", title: "芯片供给宽松了吗：AI 算力市场的拐点观察", angle: "训练集群与推理边缘两侧的供需信号对读", persona: "news-anchor", theme: "professional-clean" },
  { id: "i03", category: "行业动态", title: "大模型 API 降价潮的尽头是什么", angle: "边际成本、规模效应与「以免费换生态」的商业逻辑", persona: "cold-analyst", theme: "tech-modern" },
  { id: "i04", category: "行业动态", title: "AI 硬件终端元年又双叒来了吗", angle: "从眼镜、胸针到桌面机器人：交互成熟度与杀手级应用的距离", persona: "sharp-editor", theme: "sspai" },
  { id: "i05", category: "行业动态", title: "「AI 原生应用」和「加了 AI 的应用」差在哪", angle: "用四个产品判断标准拆解真原生与贴壳的本质差异", persona: "warm-mentor", theme: "professional-clean" },

  // ---------- 资本动向 ----------
  { id: "c01", category: "资本动向", title: "具身智能的融资热度能撑到产品落地吗", angle: "融资节奏与技术里程碑的错位分析，识别泡沫与实进", persona: "cold-analyst", theme: "tech-modern" },
  { id: "c02", category: "资本动向", title: "AI 应用层终于开始赚钱了吗", angle: "订阅、 seats 与用量计费三种模式的收入质量对比", persona: "news-anchor", theme: "professional-clean" },
  { id: "c03", category: "资本动向", title: "基础模型公司的估值逻辑变了", angle: "从「能力溢价」到「入口溢价」的叙事迁移及其风险", persona: "sharp-editor", theme: "sspai" },
  { id: "c04", category: "资本动向", title: "开源 AI 公司靠什么赚钱", angle: "服务、托管与企业版三件套的商业闭环盘点", persona: "cold-analyst", theme: "tech-modern" },
  { id: "c05", category: "资本动向", title: "算力投资潮里的「卖铲人」生意还好做吗", angle: "云厂商资本开支与上游器件商的利润传导链", persona: "news-anchor", theme: "professional-clean" },

  // ---------- 政策监管 ----------
  { id: "p01", category: "政策监管", title: "生成式内容标识新规对自媒体意味着什么", angle: "从标注义务、平台责任到流量分发的连锁影响与合规清单", persona: "cold-analyst", theme: "professional-clean" },
  { id: "p02", category: "政策监管", title: "训练数据的版权诉讼正在改写 AI 行业规则吗", angle: "从判例走向看数据授权市场的形成与成本转移", persona: "news-anchor", theme: "tech-modern" },
  { id: "p03", category: "政策监管", title: "AI 安全评估制度化：企业要准备什么", angle: "红队测试、能力披露与事故报告的操作层解读", persona: "warm-mentor", theme: "professional-clean" },
  { id: "p04", category: "政策监管", title: "跨境 AI 服务的合规墙越筑越高了吗", angle: "数据本地化与模型审计要求对产品架构的反向塑造", persona: "cold-analyst", theme: "sspai" },
  { id: "p05", category: "政策监管", title: "开源模型出口管制：技术无国界还成立吗", angle: "权重管控、算力配额与开源社区的应对策略", persona: "sharp-editor", theme: "tech-modern" },

  // ---------- 研究前沿 ----------
  { id: "r01", category: "研究前沿", title: "模型自我纠错能力走到哪一步了", angle: "从后验修订到推理期自检：可信度提升与成本代价", persona: "tech-coder", theme: "tech-modern" },
  { id: "r02", category: "研究前沿", title: "小模型逼近大模型的三条路线", angle: "蒸馏、强化学习与合成数据的进展与天花板", persona: "cold-analyst", theme: "professional-clean" },
  { id: "r03", category: "研究前沿", title: "世界模型是不是具身智能的必经之路", angle: "端到端学习与模型化先验两条技术路线的赌注对比", persona: "sharp-editor", theme: "sspai" },
  { id: "r04", category: "研究前沿", title: "AI 科研助手真的开始产出真发现了", angle: "从文献综合到假设生成：可验证成果的案例盘点", persona: "news-anchor", theme: "tech-modern" },
  { id: "r05", category: "研究前沿", title: "推理时计算扩展的收益还剩多少", angle: "按任务难度分层看「想更久」的边际回报递减点", persona: "cold-analyst", theme: "professional-clean" },

  // ---------- 开发者生态 ----------
  { id: "d01", category: "开发者生态", title: "AI 编程助手渗透过半之后，工程师的活儿变了吗", angle: "从写代码到审代码：职责重心迁移与技能清单更新", persona: "tech-coder", theme: "tech-modern" },
  { id: "d02", category: "开发者生态", title: "自然语言编程的边界在哪里", angle: "意图表达精度与验证成本：三类任务的可行性分级", persona: "cold-analyst", theme: "sspai" },
  { id: "d03", category: "开发者生态", title: "开发者该为 AI 工具付多少钱", angle: "个人订阅的性价比公式与团队采购的隐性成本", persona: "warm-mentor", theme: "professional-clean" },
  { id: "d04", category: "开发者生态", title: "「氛围编程」三个月后的工程债谁来还", angle: "速度与可维护性的权衡，给出防债实践清单", persona: "sharp-editor", theme: "tech-modern" },
  { id: "d05", category: "开发者生态", title: "开源贡献者正在被 AI 重新定义吗", angle: "从代码提交到问题定义：贡献形态的迁移与新价值点", persona: "tech-coder", theme: "sspai" },

  // ---------- 应用落地 ----------
  { id: "a01", category: "应用落地", title: "企业 AI 落地的「最后一公里」卡在哪", angle: "流程改造、数据治理与责任划分三重阻力拆解", persona: "cold-analyst", theme: "professional-clean" },
  { id: "a02", category: "应用落地", title: "客服场景的 AI 替代率为什么低于预期", angle: "从满意度曲线看人机协作的最优切分点", persona: "warm-mentor", theme: "sspai" },
  { id: "a03", category: "应用落地", title: "教育行业的 AI 应用从噱头走向刚需了吗", angle: "作业批改、个性化练习与教研三条线的留存数据说话", persona: "news-anchor", theme: "tech-modern" },
  { id: "a04", category: "应用落地", title: "医疗 AI 审批加速之后，买单的为什么还是不多", angle: "责任认定与付费主体错配的经济学分析", persona: "cold-analyst", theme: "professional-clean" },
  { id: "a05", category: "应用落地", title: "制造业的 AI 质检规模化的前提是什么", angle: "数据闭环、产线节拍与误检成本的三重约束", persona: "tech-coder", theme: "tech-modern" },

  // ---------- 职业与技能 ----------
  { id: "j01", category: "职业与技能", title: "提示词工程师这个岗位两年后会消失吗", angle: "从手艺到基建：岗位消解与技能沉淀到哪里", persona: "sharp-editor", theme: "sspai" },
  { id: "j02", category: "职业与技能", title: "普通人现在最值得投资的 AI 技能是什么", angle: "按职业类型分层的技能收益排序与学习路径", persona: "warm-mentor", theme: "professional-clean" },
  { id: "j03", category: "职业与技能", title: "内容创作者如何与生成模型共存", angle: "从产能竞争转向判断力竞争的生存策略", persona: "midnight-friend", theme: "midnight" },
  { id: "j04", category: "职业与技能", title: "AI 时代的团队配置：全栈好还是专才好", angle: "用沟通成本与迭代速度两个变量推演最优结构", persona: "cold-analyst", theme: "tech-modern" },
  { id: "j05", category: "职业与技能", title: "自由职业者的 AI 杠杆：一个人能做多大的生意", angle: "从交付能力、获客半径到质量兜底的三级杠杆", persona: "warm-mentor", theme: "professional-clean" },
]

/** 评测集元信息（GET /api/eval 用） */
export function evalTopicsMeta() {
  const byCat = new Map<string, number>()
  for (const t of EVAL_TOPICS) byCat.set(t.category, (byCat.get(t.category) ?? 0) + 1)
  return {
    total: EVAL_TOPICS.length,
    categories: [...byCat.entries()].map(([name, count]) => ({ name, count })),
    targetAverage: 8.0,
    note: "固定评测集：同题同配置可回归；评分走 G-Eval 式五维量表（裁判尽量跨家族）",
  }
}
