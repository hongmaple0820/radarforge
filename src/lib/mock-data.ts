/**
 * 元宝搜索演示数据（高保真模拟）
 *
 * 用途: 未配置 WSA_API_KEY 时，让应用以演示模式跑通「搜索 → 结果」全链路。
 * 结构完全对齐 SearchPro 真实返回（Pages 内单条字段: title/url/date/passage/site/score/favicon）。
 * 日期按「相对今天」动态生成，保证任何时候打开都像刚抓取的资讯。
 */
import type { WsaPage, WsaSearchParams } from './wsa'

interface MockArticle {
  daysAgo: number
  hour: number
  minute: number
  title: string
  url: string
  site: string
  passage: string
  score: number
  /** 权威垂类信源（Mode=1 时优先返回） */
  authority?: boolean
}

function pad(n: number): string {
  return n.toString().padStart(2, '0')
}

/** 相对当前时间生成 date 字符串，与真实接口格式一致 */
function formatDate(a: MockArticle): string {
  const d = new Date(Date.now() - a.daysAgo * 86400000)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(a.hour)}:${pad(a.minute)}:${pad(
    Math.floor(Math.random() * 60)
  )}`
}

/** 话题 → 文章池 */
const POOLS: Record<string, MockArticle[]> = {
  // 大模型 / LLM
  大模型: [
    {
      daysAgo: 0, hour: 9, minute: 32, site: '腾讯科技', score: 0.9621,
      title: '国产大模型推理成本再降 60%：多家厂商宣布长上下文定价下调',
      url: 'https://news.qq.com/rain/a/demo-llm-01',
      passage:
        '多家国产大模型厂商今日同步宣布降价，长上下文场景的推理成本最高下调 60%。业内分析认为，推理框架优化与国产算力供给改善是本轮降价的直接推手，Agent 类应用将成为最大受益方，单次任务的多轮检索成本显著下降。',
    },
    {
      daysAgo: 0, hour: 8, minute: 15, site: '机器之心', score: 0.9417,
      title: '多模态大模型评测报告发布：图表理解与长视频推理成新分水岭',
      url: 'https://www.jiqizhixin.com/articles/demo-llm-02',
      passage:
        '最新一期多模态大模型横评结果公布，在图表理解、长视频时序推理两类任务上，头部模型差距明显拉大。报告指出，原生多模态架构相较「视觉编码器+LLM」的拼接路线，在细粒度文档场景平均高出 11 个百分点。',
    },
    {
      daysAgo: 1, hour: 19, minute: 40, site: '36氪', score: 0.9284,
      title: '大模型进厂记：制造业质检场景的落地账本',
      url: 'https://www.36kr.com/p/demo-llm-03',
      passage:
        '在多家制造企业的实地调研中发现，大模型质检方案正从「试点」走向「复制」：单条产线的误检率下降至传统机器视觉的三分之一，而部署成本一年内下降了 40%。行业客户最看重的不再是参数规模，而是可追溯的信源与稳定的召回。',
    },
    {
      daysAgo: 1, hour: 14, minute: 22, site: '量子位', score: 0.9053,
      title: '开源社区再上新：百亿级 MoE 基座模型权重开放下载',
      url: 'https://www.qbitai.com/demo-llm-04',
      passage:
        '某开源基金会正式放出一款百亿参数混合专家基座模型，允许商用。社区当天即出现多个微调版本，覆盖代码、法律文书与医疗问答方向。维护者称后续将开放配套的数据清洗管线与评测脚本。',
    },
    {
      daysAgo: 2, hour: 11, minute: 5, site: '财联社', score: 0.8892,
      title: '算力租赁价格企稳，大模型训练需求转向推理侧',
      url: 'https://www.cls.cn/demo-llm-05',
      passage:
        '多家算力服务商披露，训练侧租赁订单增速放缓，而推理侧需求同比增长超过 180%。分析人士称，随着基座模型格局趋稳，行业投入正从「训一个模型」转向「把模型用起来」，带动推理集群扩容。',
    },
    {
      daysAgo: 3, hour: 16, minute: 48, site: '新华网', score: 0.9315, authority: true,
      title: '多地发布人工智能行动方案，前瞻布局大模型产业生态',
      url: 'https://www.xinhuanet.com/demo-llm-06',
      passage:
        '多个省市本周陆续印发人工智能相关行动方案，围绕大模型创新平台、行业语料库与算力调度提出具体目标。方案普遍强调「以用促研」，要求在政务、医疗、教育等领域率先开放应用场景，形成可复制的标杆案例。',
    },
    {
      daysAgo: 5, hour: 10, minute: 12, site: 'InfoQ', score: 0.8710,
      title: 'RAG 还是长上下文？企业知识问答的工程选型复盘',
      url: 'https://www.infoq.cn/article/demo-llm-07',
      passage:
        '一篇来自一线团队的复盘文章引发讨论：在千万字级企业知识库上，检索增强与长上下文各有边界。作者实测发现，配好权威信源过滤的 RAG 方案在时效性要求高的场景仍不可替代，并给出了混合架构的落地清单。',
    },
  ],

  // AI 芯片
  'AI芯片': [
    {
      daysAgo: 0, hour: 10, minute: 5, site: '财联社', score: 0.9583,
      title: '国产 AI 芯片新增订单放量，推理卡出货量单季翻倍',
      url: 'https://www.cls.cn/demo-chip-01',
      passage:
        '多家国产 AI 芯片厂商披露近期订单情况，面向推理场景的加速卡出货量环比接近翻倍。产业链人士称，互联网大厂的推理集群扩容是主要拉动因素，下一代芯片将普遍支持更大显存与更高互联带宽。',
    },
    {
      daysAgo: 1, hour: 15, minute: 30, site: '腾讯科技', score: 0.9336,
      title: '存算一体架构新进展：能效比提升 3 倍的工程样片流片',
      url: 'https://news.qq.com/rain/a/demo-chip-02',
      passage:
        '国内某研究机构的存算一体工程样片完成流片，在特定卷积负载下能效比达到传统架构的 3 倍。团队负责人表示，该路线首先将落地边缘侧的视觉推理场景，云端大负载仍以主流架构为主。',
    },
    {
      daysAgo: 1, hour: 9, minute: 18, site: '机器之心', score: 0.9204,
      title: 'Chiplet 拼装大算力：先进封装产能成为新的卡位点',
      url: 'https://www.jiqizhixin.com/articles/demo-chip-03',
      passage:
        '随着单颗芯片逼近制程极限，Chiplet 正成为大算力扩展的主流方案。行业报告显示，先进封装产能利用率已连续三个季度超过 90%，封装环节在 AI 芯片成本结构中的占比持续上升。',
    },
    {
      daysAgo: 2, hour: 13, minute: 45, site: '界面新闻', score: 0.8961,
      title: '车载智能芯片上新：单芯片支撑城市 NOA 全栈算力',
      url: 'https://www.jiemian.com/article/demo-chip-04',
      passage:
        '一家车载芯片厂商发布新一代智能驾驶芯片，单颗算力宣称可覆盖城市领航辅助的全栈需求。多家车企已确认将基于该平台开发下一代车型，量产时间指向明年下半年。',
    },
    {
      daysAgo: 4, hour: 17, minute: 2, site: '证券时报', score: 0.9127, authority: true,
      title: 'AI 芯片产业链公司三季报前瞻：设计端分化，制造端满产',
      url: 'https://www.stcn.com/article/demo-chip-05',
      passage:
        '机构调研纪要显示，AI 芯片产业链业绩分化明显：设计公司因产品代际差异表现不一，晶圆代工与封装测试环节则普遍满产。分析师建议关注推理侧放量带来的结构性机会。',
    },
    {
      daysAgo: 6, hour: 11, minute: 20, site: '雷峰网', score: 0.8642,
      title: '一万卡集群的工程细节：互联、供电与故障率',
      url: 'https://www.leiphone.com/demo-chip-06',
      passage:
        '一篇关于万卡集群建设的长文披露了大量工程细节：高带宽互联的布线损耗、机柜供电密度，以及单日硬盘故障数。作者认为，大规模训练的瓶颈正在从算力总量转向系统级稳定性。',
    },
  ],

  // 自动驾驶
  自动驾驶: [
    {
      daysAgo: 0, hour: 8, minute: 50, site: '澎湃新闻', score: 0.9512,
      title: '多城扩容智能网联汽车测试区域，Robotaxi 运营时段延长',
      url: 'https://www.thepaper.cn/newsDetail_forward_demo-ad-01',
      passage:
        '多个城市宣布扩大智能网联汽车测试范围，部分城市将 Robotaxi 示范运营时段延长至早晚高峰全覆盖。主管部门强调将同步完善事故责任认定与数据上报机制，保障乘客与道路安全。',
    },
    {
      daysAgo: 1, hour: 16, minute: 12, site: '36氪', score: 0.9287,
      title: '端到端自动驾驶进入量产周期，车企数据闭环竞争白热化',
      url: 'https://www.36kr.com/p/demo-ad-02',
      passage:
        '至少三家车企确认新一代智驾系统将切换至端到端架构，量产车型明年陆续交付。行业观察者指出，架构切换背后真正比拼的是数据闭环：影子模式的车队规模、corner case 的挖掘效率决定了系统迭代速度。',
    },
    {
      daysAgo: 1, hour: 10, minute: 35, site: '腾讯汽车', score: 0.9013,
      title: 'L3 事故责任划分迎来地方立法探索，保险公司推出配套产品',
      url: 'https://auto.qq.com/demo-ad-03',
      passage:
        '随着 L3 级有条件自动驾驶的准入讨论升温，多地启动相关立法调研。一家头部保险公司同步推出智驾专属附加险，按系统接管比例动态定价，为责任划分提供理赔样本。',
    },
    {
      daysAgo: 3, hour: 14, minute: 8, site: '新华网', score: 0.9405, authority: true,
      title: '智能网联汽车准入试点深化，车路云一体化标准加快落地',
      url: 'https://www.xinhuanet.com/demo-ad-04',
      passage:
        '主管部门表示将深化智能网联汽车准入和上路通行试点，加快车路云一体化标准体系建设。业内认为，路侧感知与云端调度的加入，将显著降低单车智能的感知负担，是规模化落地的关键变量。',
    },
    {
      daysAgo: 4, hour: 9, minute: 44, site: '量子位', score: 0.8852,
      title: '世界模型上车：用生成式仿真补齐极端场景训练数据',
      url: 'https://www.qbitai.com/demo-ad-05',
      passage:
        '多家智驾团队开始将世界模型用于训练数据生产：输入一段真实路况，模型可生成天气、光照与交通流各异的长尾场景。实测显示，极端场景数据获取成本下降了一个数量级。',
    },
    {
      daysAgo: 7, hour: 15, minute: 20, site: ' InfoQ', score: 0.8519,
      title: '自动驾驶中间件复盘：为什么车企开始自研车载 OS',
      url: 'https://www.infoq.cn/article/demo-ad-06',
      passage:
        '随着智驾系统成为整车差异化核心，越来越多车企选择自研车载操作系统与中间件，以摆脱对单一供应商的依赖。文章复盘了三家车企的自研路径，认为调度确定性与OTA 一致性是首要目标。',
    },
  ],

  // AI Agent / 智能体
  'AI Agent': [
    {
      daysAgo: 0, hour: 11, minute: 18, site: '腾讯科技', score: 0.9668,
      title: 'Agent 应用爆发前夜：工具调用准确率成为新基准',
      url: 'https://news.qq.com/rain/a/demo-agent-01',
      passage:
        '多家评测机构将「工具调用准确率」纳入大模型能力基准，Agent 时代对模型的考验正从「会不会答」转向「会不会做」。首批结果显示，头部模型在多步任务编排上的差距高达 20 个百分点。',
    },
    {
      daysAgo: 0, hour: 7, minute: 55, site: '机器之心', score: 0.9431,
      title: '检索即基础设施：Agent 平均搜索次数从 8 次降到 5 次',
      url: 'https://www.jiqizhixin.com/articles/demo-agent-02',
      passage:
        '一项联合评测显示，接入升级后的元宝搜索，Agent 完成任务的平均搜索调用次数从约 8 次降至 5 次，搜索满意度提升 10%—20%。高质量信源与毫秒级响应被认为是关键变量，搜索正成为 Agent 的「水电煤」。',
    },
    {
      daysAgo: 2, hour: 18, minute: 26, site: '新智元', score: 0.9175,
      title: '多智能体协作框架对比：编排、通信与成本',
      url: 'https://www.zhiyuan.com/demo-agent-03',
      passage:
        '一篇横向对比主流多智能体框架的文章走红：在同一个客服工单任务上，不同框架的 token 成本相差 4 倍。作者建议按任务复杂度选择编排粒度，并给出了通信协议的选型决策树。',
    },
    {
      daysAgo: 3, hour: 13, minute: 52, site: '36氪', score: 0.8946,
      title: '企业 Agent 落地清单：从知识问答到跨系统执行',
      url: 'https://www.36kr.com/p/demo-agent-04',
      passage:
        '调研了数十家企业后，一份 Agent 落地路径清单开始流传：第一阶段做可信问答，第二阶段接入工单与 ERP 执行链路，第三阶段才尝试跨部门流程编排。绝大多数企业仍处于第一到第二阶段之间。',
    },
    {
      daysAgo: 5, hour: 10, minute: 40, site: '财联社', score: 0.8823,
      title: 'Agent 创业公司融资升温，搜索类 API 调用量同步放大',
      url: 'https://www.cls.cn/demo-agent-05',
      passage:
        '本季度 Agent 方向融资事件数量创阶段新高，工具链与垂直场景成为资本偏好。与之呼应的是，多家搜索 API 服务商披露企业客户调用量环比翻倍，检索正成为 Agent 应用的刚性支出。',
    },
    {
      daysAgo: 8, hour: 9, minute: 15, site: 'CSDN', score: 0.8590,
      title: '手写一个最小 Agent 内核：循环、工具与记忆',
      url: 'https://blog.csdn.net/demo-agent-06',
      passage:
        '一篇高热度教程用 300 行代码实现了最小可用的 Agent 内核，覆盖规划循环、工具注册与短期记忆。评论区的高赞补充指出，生产环境真正难的是工具的幂等设计与失败重试策略。',
    },
  ],

  // 具身智能 / 机器人
  具身智能: [
    {
      daysAgo: 0, hour: 14, minute: 33, site: '量子位', score: 0.9555,
      title: '人形机器人进厂实训：3 个月学会的分拣，成本降七成',
      url: 'https://www.qbitai.com/demo-emb-01',
      passage:
        '某工厂公布的实训数据显示，人形机器人在物流分拣岗完成 3 个月实训后，综合用工成本较初期下降约七成。团队称关键突破在触觉反馈与操作泛化，同一套策略可迁移到十余类 SKU。',
    },
    {
      daysAgo: 1, hour: 10, minute: 8, site: '机器之心', score: 0.9318,
      title: 'VLA 模型新基准发布：长程操作任务成功率仍不足四成',
      url: 'https://www.jiqizhixin.com/articles/demo-emb-02',
      passage:
        '最新视觉-语言-动作（VLA）模型基准公布，在超过 50 步的长程操作任务上，最好成绩仅为 38%。研究者指出，数据稀缺是首要瓶颈，仿真到现实的迁移损耗仍是学界主攻方向。',
    },
    {
      daysAgo: 2, hour: 16, minute: 21, site: '界面新闻', score: 0.9007,
      title: '机器人零部件国产化提速，谐波减速器报价再降两成',
      url: 'https://www.jiemian.com/article/demo-emb-03',
      passage:
        '随着人形机器人订单放量，核心零部件国产化率快速提升，谐波减速器、空心杯电机报价年内两度下调。供应链人士称，整机 BOM 成本有望在两年内进入十万元区间。',
    },
    {
      daysAgo: 4, hour: 11, minute: 47, site: '新华网', score: 0.9262, authority: true,
      title: '多地布局具身智能产业基金，首期规模合计超百亿',
      url: 'https://www.xinhuanet.com/demo-emb-04',
      passage:
        '多个城市相继设立具身智能产业基金，重点投向整机研制、核心零部件与数据服务。地方政府同步开放了工厂、政务与养老等场景，要求「真场景、真数据、真验收」。',
    },
    {
      daysAgo: 6, hour: 15, minute: 5, site: '雷峰网', score: 0.8736,
      title: '仿真到现实：数据工厂如何给机器人「刷题」',
      url: 'https://www.leiphone.com/demo-emb-05',
      passage:
        '一批「机器人数据工厂」开始向行业出售演示数据：遥操作采集、仿真合成与视频学习三条路线并行。买家最关心的是数据的动作标签质量，以及能否覆盖真实产线的扰动分布。',
    },
  ],

  // AI 搜索（元宝搜索相关，便于体验与征文呼应）
  AI搜索: [
    {
      daysAgo: 0, hour: 9, minute: 12, site: '腾讯云开发者社区', score: 0.9713,
      title: '元宝搜索正式对外开放：千亿索引、日均数亿次调用的搜索基座',
      url: 'https://cloud.tencent.com/developer/article/demo-wsa-01',
      passage:
        '腾讯将元宝 App 背后的搜索能力通过腾讯云对外开放，构建千亿级索引规模，接入 13 个垂直行业 157 个权威信源，日均调用量达数亿次。开发者可通过 Skill、MCP、API 三种方式接入，平均检索耗时仅 8 毫秒。',
    },
    {
      daysAgo: 0, hour: 8, minute: 30, site: '智东西', score: 0.9478,
      title: '实测元宝搜索 API：毫秒级返回，Agent 的可信外脑',
      url: 'https://www.zhidx.com/demo-wsa-02',
      passage:
        '媒体实测显示，连续调用 5 次，API 单次耗时 345—485 毫秒，平均约 0.42 秒。在政策查询、学术整理等任务中，结果主要来自工信部等权威机构站点；天气、股价等垂类查询可直接返回结构化 VR 卡片。',
    },
    {
      daysAgo: 1, hour: 17, minute: 44, site: '顶端新闻', score: 0.9225,
      title: '给 Agent 装上可信外脑：元宝搜索的信源治理逻辑',
      url: 'https://www.topnews.cn/news/demo-wsa-03',
      passage:
        '元宝搜索从站点、账号、页面三个层级评估内容质量，对频繁发布 AI 生成低质内容的站点直接「拉黑」。对医学、金融类问题会优先筛出权威来源，从源头减少大模型被低质信息带偏的可能。',
    },
    {
      daysAgo: 2, hour: 12, minute: 19, site: '雪球', score: 0.8904,
      title: '搜索 API 之争：模型内置搜索 vs 独立检索服务',
      url: 'https://xueqiu.com/demo-wsa-04',
      passage:
        'OpenAI 与谷歌将搜索整合进模型 API，腾讯元宝搜索则走独立服务路线，把模型选择权与流程控制权留给开发者。分析认为，两条路线的差异在于：前者省编排，后者给灵活性，Agent 开发者正按场景各取所需。',
    },
    {
      daysAgo: 3, hour: 10, minute: 55, site: 'CSDN', score: 0.9137,
      title: '从零接入元宝搜索：一条 curl 命令跑通联网检索',
      url: 'https://blog.csdn.net/demo-wsa-05',
      passage:
        '教程实测：注册腾讯云、开通服务、创建 API KEY 后，一条 curl 命令即可完成首次调用。SearchPro 支持 Mode（网页/垂类/混合）、Industry（gov/news/acad/finance）、Freshness（d7 最近七天）等参数组合。',
    },
    {
      daysAgo: 5, hour: 14, minute: 7, site: ' InfoQ', score: 0.8649,
      title: 'RAG 工程复盘：检索质量决定回答上限',
      url: 'https://www.infoq.cn/article/demo-wsa-06',
      passage:
        '多家企业复盘 RAG 落地经验后得出一致结论：检索质量决定生成上限。自建检索链路需要在信源采集、清洗、索引与排序上持续投入，接入成熟搜索 API 可将团队精力聚焦于业务编排与交付。',
    },
  ],
}

/** 关键词 → 话题池映射（用于 query 匹配） */
const TOPIC_KEYWORDS: Record<string, string[]> = {
  大模型: ['大模型', 'llm', '语言模型', 'gpt', '多模态', '基座模型', '训练'],
  'AI芯片': ['芯片', 'gpu', '算力', 'npu', '显卡', 'chiplet', '存算'],
  自动驾驶: ['自动驾驶', '智驾', 'robotaxi', 'noa', '智能网联', 'l3', 'l4', '车辆'],
  'AI Agent': ['agent', '智能体', '工作流', '编排', '工具调用', 'mcp', 'ai agent'],
  具身智能: ['具身智能', '机器人', '人形机器人', 'vla', '机械臂', 'embodied'],
  AI搜索: ['搜索', '元宝', 'rag', '检索', '联网', '搜索api', '搜索引擎'],
}

/** 未命中任何话题时的通用池（取自各话题头部文章 + 泛 AI 资讯） */
const GENERIC_POOL: MockArticle[] = [
  ...POOLS['大模型'].slice(0, 2),
  ...POOLS['AI Agent'].slice(0, 2),
  ...POOLS['AI搜索'].slice(0, 2),
  ...POOLS['AI芯片'].slice(0, 1),
  ...POOLS['具身智能'].slice(0, 1),
]

function matchPool(query: string): MockArticle[] {
  const q = query.toLowerCase()
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((k) => q.includes(k)) || q.includes(topic.toLowerCase())) {
      return POOLS[topic]
    }
  }
  return GENERIC_POOL
}

/** 解析 Freshness 参数为天数上限 */
function freshnessToDays(freshness?: string): number {
  if (!freshness) return 3650
  const m = /^d(\d+)$/.exec(freshness)
  if (m) return parseInt(m[1], 10)
  const mm = /^m(\d+)$/.exec(freshness)
  if (mm) return parseInt(mm[1], 10) * 30
  const y = /^y(\d+)$/.exec(freshness)
  if (y) return parseInt(y[1], 10) * 365
  return 3650
}

/**
 * 生成演示搜索结果
 * 行为对齐真实接口: Freshness 过滤时效 / Mode 切换信源类型 / Cnt 控制条数 / 按 score 排序
 */
export function generateMockPages(params: WsaSearchParams): WsaPage[] {
  const pool = matchPool(params.query)
  const daysLimit = freshnessToDays(params.freshness)

  let candidates = pool.filter((a) => a.daysAgo <= daysLimit)

  // Mode=1 只返回优质权威垂类信源；Mode=2 混合（权威优先）
  if (params.mode === 1) {
    const authority = candidates.filter((a) => a.authority)
    candidates = authority.length > 0 ? authority : candidates.slice(0, 2)
  } else if (params.mode === 2) {
    candidates = [...candidates].sort((a, b) => Number(b.authority ?? false) - Number(a.authority ?? false))
  }

  // 按 score 降序，模拟搜索引擎排序
  const sorted = [...candidates].sort((a, b) => b.score - a.score)

  // Industry 过滤: news 偏新闻源, gov 偏政府源, acad 偏技术源, finance 偏财经源
  const industrySites: Record<string, string[]> = {
    gov: ['新华网', '澎湃新闻'],
    news: ['腾讯科技', '腾讯新闻', '澎湃新闻', '界面新闻', '顶端新闻'],
    acad: ['机器之心', '量子位', 'InfoQ', '新智元'],
    finance: ['财联社', '证券时报', '雪球', '界面新闻'],
  }
  let final = sorted
  if (params.industry && industrySites[params.industry]) {
    const preferred = sorted.filter((a) => industrySites[params.industry].includes(a.site))
    if (preferred.length >= 3) final = preferred
  }

  const cnt = Math.min(Math.max(params.cnt ?? 10, 10), 50)
  return final.slice(0, cnt).map((a) => ({
    title: a.title,
    url: a.url,
    date: formatDate(a),
    passage: a.passage,
    site: a.site.trim(),
    favicon: '',
    score: a.score,
  }))
}
