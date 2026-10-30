# RadarForge 升级方案外部调研报告（竞品 + 论文 + 视频 API）

> 调研范围：开源项目 / 论文方法 / 视频生成 API 商用现状 / 竞品产品 / 内容质量工程实践。
> 所有 URL 均为本次调研实际搜索/打开过的链接；星数、价格、论文名均为调研时实际核对值（GitHub 星数经 GitHub API 核对）。
> 调研方法：z-ai web_search（搜索）+ page_reader（抓取正文）+ GitHub API/raw（核对星数与 README）。

---

## A. 开源项目

### A1. MoneyPrinterTurbo（harry0703）
- **URL**：https://github.com/harry0703/MoneyPrinterTurbo
- **数据**：★ 136,391（fork 21,711，Python）——「AI 一键生成短视频」品类全球第一流量位。
- **要点**：主题/关键词 → LLM 脚本 → 素材匹配 → 字幕 → 配音 → 合成；提供 **AI Agent / WebUI / API / CLI 四种入口**；工程上已从 Streamlit 演进为 `app/`（FastAPI：controllers + services + router + models）+ 独立 WebUI；输出 9:16 / 16:9 / 1:1 三画幅；支持一键发布 TikTok / Instagram / YouTube Shorts。
- **素材获取策略（重点）**：三层来源——①免费库存素材 API（Pexels、Pixabay、Coverr）+ 本地上传；②多家文生视频 API 直连（火山 Seedance、秘塔 MiniMax H3 768P 0.09 元/秒・2K 0.15 元/秒、WaveSpeed、OFox、MuAPI 异步 3-12s）；③ OpenAI 兼容文生图→图片转动态片段。TTS 阵容 10+（免费 Edge TTS 无需 Key、Azure、ElevenLabs、硅基流动、MiniMax 等），LLM 网关兼容 10+ 厂商 + OpenRouter/Ollama/LiteLLM。
- **对 RadarForge 的启示**：把「LLM/TTS/T2V/素材源」全部做成 provider 抽象 + 统一网关（我们 `src/lib/gateway/` 已有雏形，可对齐其 provider 列表宽度）；「每个环节允许用户覆盖 AI 产物」（换脚本、换素材、换配音）是其易用性核心；批量生成多条成片 + 任务历史 = 生产力工具标配。

### A2. NarratoAI（linyqh）
- **URL**：https://github.com/linyqh/NarratoAI（云端版 narratoai.cn）
- **数据**：★ 11,634（fork 1,603，Python；webui.py + webui/ + app/ + config.example.toml，Streamlit 风格）。
- **要点**：AI 影视解说 + 自动剪辑一站式：**VLM 理解视频**（阿里 Qwen2-VL，可选 TwelveLabs Pegasus 整段理解）→ LLM 写解说文案 → MoviePy 自动剪辑 → TTS（豆包/腾讯云/IndexTTS-2 语音克隆）→ 字幕（Fun-ASR 一键转录）。版本迭代到 v0.8.6，支持短剧解说混剪、一键合并素材、**导出剪映草稿**。
- **对 RadarForge 的启示**：①「导出剪映草稿」= 自动成片的质量兜底（用户可在专业工具精修），我们的视频导出应补此能力；②用 VLM 做「高光片段挑选」与我们可用 z-ai VLM 的能力同构——资讯文章选配图/选视频片段都可复用「VLM 打分→排序→截取」管线。

### A3. ShortGPT（RayVentura）
- **URL**：https://github.com/RayVentura/ShortGPT ；文档 https://docs.shortgpt.ai
- **数据**：★ 8,090（fork 1,169，Python，PyPI 可装 `shortgpt`）。
- **要点**：YouTube Shorts/TikTok 频道自动化实验框架，三大卖点：**LLM-oriented video editing language**（把剪辑抽象成 LLM 可生成的动作序列：素材 sourcing→配音→字幕→拼接）、**Asset Sourcing**（自动从互联网搜图/搜视频素材，DynamicHTML 引擎自动化网页操作）、多语言配音合成。
- **对 RadarForge 的启示**：其「LLM 产出结构化剪辑意图 → 确定性渲染器执行」与我们 `public/engine/art-motion/clip_schema.json`（t1-t3/y1-y5 clips）思路同源且互相印证；值得补抄的是 **auto asset sourcing**：按脚本段落关键词自动检索库存素材（Pexels/Pixabay 免费 API）作为「代码动画之外的第二素材轨道」。

### A4. STORM（stanford-oval/storm）
- **URL**：https://github.com/stanford-oval/storm ；在线版 https://storm.genie.stanford.edu ；PyPI 包 `knowledge-storm`
- **数据**：★ 31,748（fork 2,997，Python）。
- **要点**：LLM 知识策展系统：**预写作阶段工程化**——①perspective discovery（发现多视角）→ ②模拟「持不同视角的 writer 向 topic expert 提问」的对话（基于可信网络源检索）→ ③信息策展成大纲 → ④成文带引用。支持 You.com/Bing/VectorRM（自有文档）三种检索源，litellm 集成任意模型；Co-STORM（人机协作版）被 EMNLP 2024 主会收录。
- **对 RadarForge 的启示**：写作质量方法论的最佳公开实现。「多视角提问→大纲→再写作」可直接移植为日报长文的 skill 管线（选题→多视角提问（技术派/商业派/用户派）→大纲→分节写作→引用回链），替代一步成文。

### A5. doocs/md（微信公众号 markdown 编辑器）
- **URL**：https://github.com/doocs/md ；在线版 https://md.doocs.org
- **数据**：★ 13,487（fork 2,251，TypeScript，Vue3 + Vite + TailwindCSS）。
- **要点**：Markdown **自动即时渲染为公众号图文**（内联样式转换 + 可自定义主题 CSS）；支持 KaTeX 数学公式、Mermaid/PlantUML 图表、Ruby 注音；**多图床**（GitHub/阿里云/腾讯云/七牛/MinIO/S3/Cloudflare R2）；本地草稿 + 云同步；已集成 AI 助手（DeepSeek/OpenAI/通义/混元/火山方舟/302.AI）；另有配套浏览器扩展 doocs/cose（一键把编辑结果发到公众号）。
- **对 RadarForge 的启示**：公众号导出的「内联样式 + 多主题 + 图床管理」成熟方案就在眼前——我们 `src/lib/publish/`（wechat.ts / themes.ts / wewrite-containers.ts）可对标其主题化 CSS 体系与 7 家图床抽象；「浏览器扩展一键粘贴进公众号后台」是绕开公众号无 API 限制的最短路径。

### A6. RSSHub / Jina Reader（资讯源聚合）
- **RSSHub**：https://github.com/DIYgod/RSSHub — ★ 46,727（fork 10,293，TypeScript）。「万物皆可 RSS」：微博/B站/知乎/公众号/Twitter/YouTube 等 100+ 站点转 RSS 路由；自部署 Docker + 公共实例 rsshub.app；**路由即插件**的社区贡献模型。
- **Jina Reader**：https://jina.ai/reader/ — `r.jina.ai/<URL>` 一行把网页转成 LLM 友好的 markdown 正文；免 key 20 RPM、免费 key 最高数百 RPM 量级 + 新 key 赠送额度；`s.jina.ai` 附带联网搜索。另有 Firecrawl 等同类（对比文：https://blog.apify.com/jina-ai-vs-firecrawl ）。
- **对 RadarForge 的启示**：抓取层 = RSSHub 路由（解决国内平台无 RSS）+ 自建 readability 正文抽取 + Jina Reader 兜底（JS 重页面）；把「源路由」做成可配置/可扩展资产（对齐其路由插件化），`src/app/api/inbox` + morning-report 的源配置可升级为 RSSHub 兼容格式。

### A7. 「AI 日报 / 自媒体自动化」高星开源项目（GitHub 搜索 "AI日报" / "AI news automation"）
| 项目 | URL | 星数 | 要点 |
|---|---|---|---|
| CloudFlare-AI-Insight-Daily | https://github.com/justlovemaki/CloudFlare-AI-Insight-Daily | 1,815 | CF Workers 定时聚合（行业新闻/GitHub trending/论文/大V言论）→ Gemini 摘要 → 自动发布 GitHub Pages；后端已演进为 PrismFlowAgent（docker 化、原生支持 AI 操作）、前端 Hugo+Hextra；被阮一峰周刊 352 期推荐 |
| newsnow | https://github.com/newsnext/newsnow | 22,189 | 实时热点聚合阅读（Next.js），多源热榜、极简 UI |
| WeWe RSS | https://github.com/cooderl/wewe-rss | 9,634 | 基于微信读书的**公众号订阅转 RSS**，私有化部署——公众号源采集的现成方案 |
| DailyHotApi | https://github.com/imsyy/DailyHotApi | 4,100 | 今日热榜聚合 API（60+ 平台），支持 RSS 模式与 Vercel 部署，配套前端 DailyHot |
| Freelander/AI-Daily | https://github.com/Freelancer/AI-Daily | 64 | GitHub Actions 全自动 AI 日报（纯 CI 形态） |
| Alan-Houxj/ai-news-follow | https://github.com/Alan-Houxj/ai-news-follow | 58 | 「每天自动送达的 AI 日报 Agent Skill：12 源采集 + LLM 筛选摘要 → 飞书表格/机器人/云文档」——与 RadarForge 的 skill 形态最接近的微型实现 |
- **对 RadarForge 的启示**：日报自动化 = **定时任务 + 源配置化 + LLM 筛选摘要 + 多渠道推送**四件套；WeWe RSS/DailyHotApi 可直接作为上游源接入；「源配置 YAML 化 + 用户可自建源」是差异化入口。

---

## B. 论文 / 技术方法（2023-2025 为主）

### B1. STORM：Assisting in Writing Wikipedia-like Articles From Scratch with Large Language Models
- **URL**：https://arxiv.org/abs/2402.14207 （NAACL 2024 主会：https://aclanthology.org/2024.naacl-long.347 ）
- **方法**：Synthesis of Topic Outlines through Retrieval and Multi-perspective Question Asking——多视角发现 + 模拟 writer/expert 对话式提问 + 信息策展出大纲；用 FreshWiki（近期高质量维基文章）数据集与大纲级评测。
- **一句话结论**：相对 outline-driven RAG 基线，STORM 文章「组织性 +25%、覆盖广度 +10%」，同时指出 source bias transfer、无关事实过度关联等长文新风险。
- **对 RadarForge 的启示**：大纲驱动 + 多视角提问应成为日报长文 skill 的骨架；评测也可学它做「大纲级」评估而非只看成文。

### B2. Co-STORM（人机协作版）
- **URL**：https://arxiv.org/abs/2408.15232 （EMNLP 2024 主会，已并入 knowledge-storm v1.0.0）
- **方法**：协作式知识策展，用户以「观察者/协作者」身份介入 multi-agent 讨论圆桌，系统维护动态 mind graph。
- **一句话结论**：人机协同策展比纯自动产出更全面且更贴合用户意图。
- **对 RadarForge 的启示**：交互上支持「编辑中途插入观点→系统重跑检索与大纲」的轻量人机协同。

### B3. Self-Refine: Iterative Refinement with Self-Feedback
- **URL**：https://arxiv.org/abs/2303.17651 （NeurIPS 2023，selfrefine.info）
- **方法**：同一 LLM「生成→自我反馈→修订」迭代循环，零额外训练。
- **一句话结论**：7 类任务平均 ~20% 的输出质量提升，证明自评-修订闭环是免费的精度放大器。
- **对 RadarForge 的启示**：radar-write/radar-rewrite 内置 1-2 轮 self-refine（自评维度显式写在 feedback prompt 里），成本可控收益确定。

### B4. Reflexion: Language Agents with Verbal Reinforcement Learning
- **URL**：https://arxiv.org/abs/2303.11366 （NeurIPS 2023）
- **方法**：任务失败后生成语言化「反思」写入 episodic memory，指导下轮尝试（语言反馈替代梯度更新）。
- **一句话结论**：HumanEval 达 91%（当时超过 GPT-4 的 80%）。
- **对 RadarForge 的启示**：把「上次被用户改稿的差异、review 不通过的原因」沉淀为逐项目的反思库（Prisma 中做 reflection 表），下次同主题写作前注入——内容工作流的「记忆化改稿」。

### B5. Tree of Thoughts (ToT)
- **URL**：https://arxiv.org/abs/2305.10601 （NeurIPS 2023；官方实现 https://github.com/princeton-nlp/tree-of-thought-llm ）
- **方法**：推理建模为搜索树，LLM 自我评估节点 + 回溯（BFS/DFS + value prompting）。
- **一句话结论**：Game of 24 从 GPT-4 CoT 的 4% 提升到 74%。
- **对 RadarForge 的启示**：标题/选题/大纲三个「高杠杆短决策点」适合 ToT 式分支生成 + 打分择优（每次只有 3-8 个候选，token 开销小）。

### B6. Plan-and-Write（大纲先行长文生成谱系）
- **Plan-and-Write: Towards Better Automatic Storytelling** — https://ojs.aaai.org/index.php/AAAI/article/view/4726 （AAAI 2022）：先产 plan（标题+人物+大纲）再分节写作，人类评测更连贯、更少重复。
- **Re3: Generating Longer Stories With Recursive Reprompting** — https://arxiv.org/abs/2210.06774 ：递归重提示生成数千词长故事。
- **DOC: Improving Long Story Coherence With Detailed Outline Control** — https://arxiv.org/abs/2212.10077 ：详细大纲（实体/事件状态）控制长篇一致性。
- **对 RadarForge 的启示**：长文 = plan（结构化大纲 JSON）→ 分节生成 → 全文润色，而非一次生成；大纲里显式带「实体/事实清单」可防长文前后矛盾。

### B7. LLM-as-a-Judge（内容质量评估）
- **URL**：https://arxiv.org/abs/2306.05685 （NeurIPS 2023，MT-Bench/Chatbot Arena）
- **方法**：强 LLM 作裁判（成对比较/单点打分/参考制），输出分数 + 可读理由。
- **一句话结论**：GPT-4 级裁判与人类偏好一致性 >80% 且成本远低于人工，但需处理 position bias / verbosity bias。
- **对 RadarForge 的启示**：radar-review 升级为多维 rubric 打分门禁（事实引用、结构、风格、平台适配 4 维 0-5 分），低于阈值自动触发重写或转人工。

### B8. 多 Agent 写作协作
- **MetaGPT: Meta Programming for A Multi-Agent Collaborative Framework** — https://arxiv.org/abs/2308.00352 （ICLR 2024 Oral）：把 SOP 编码进 prompt 序列，角色分工 + **结构化中间制品**（文档/图）传递，assembly-line 式生产。
- **AgentVerse: Facilitating Multi-Agent Collaboration** — https://arxiv.org/abs/2308.10848 （ICLR 2024）：动态招募专家 agent + 双向递归讨论 + 人类介入。
- **一句话结论**：两者共同证明——多 agent 的增益主要来自「结构化制品 + 角色分工」而非对话轮数本身。
- **对 RadarForge 的启示**：skill 引擎里的多角色（采集员/编辑/审校/美术/发布）应以 JSON 制品（选题池、大纲、分镜、排版树）传递，而不是自由聊天记录；这与我们自研 skill 引擎的 run-manager 结构天然契合。

### B9. 长文配图 / 插图选择研究
- **TIPS: A Framework for Text Summarising with Illustrative Pictures** — https://www.mdpi.com/1099-4300/23/12/1614 （Entropy 2021, 23(12):1614）：摘要句级「句→图」相似度匹配选插图；结论：带插图摘要显著提升信息获取效率——插图选择本质是句级图文匹配。
- **AR-LDM（Synthesizing Coherent Story with Auto-Regressive Latent Diffusion Model）** — https://arxiv.org/abs/2211.10950 （CVPR 2023）：自回归扩散以前文+前图为条件生成故事插图流；结论：跨帧角色/场景一致性显著优于逐图独立生成。
- **RIDGE（Relation-Rich Visual Document Generator）** — https://arxiv.org/abs/2504.10659 ：内容生成→布局生成两阶段产关系丰富的视觉文档（可参考其「先内容后排版」两阶段思想做图文排版自动化）。
- **对 RadarForge 的启示**：配图 = ①句级图文匹配选库存图（CLIP 式打分，VLM 可做）+ ②系列插图「首图锚定 + 参考图约束」（文生图用 seed/reference 保持全篇风格统一，z-ai 图生图天然适合）。

---

## C. 视频生成模型 API 现状（2025 商用 + 大陆可访问性）

| 模型 | 开放 API | 价格量级（实测核对） | 时长 / 分辨率 | 图生视频 i2v | 中国大陆可用 |
|---|---|---|---|---|---|
| **可灵 Kling**（快手） | ✅ https://klingai.com/document-api/pricing/base/video （国内 klingai.kuaishou.com 控制台） | Kling 2.5 Turbo 0.3~0.5 积分/秒；Kling 2.6 动作控制 0.5（标准）/0.8（高品质）积分/秒（积分约 $0.09-0.14/个，量大更便宜） | 5s / 10s（电商方案宣传单次最长 30s 原生直出）；720P / 1080P / 4K | ✅ 首帧+尾帧+特征参考 | ✅ |
| **即梦 Jimeng / 火山 Seedance**（字节） | ✅ 2025-09-03 上线火山引擎企业 API（图片/视频/数字人三类）：https://news.aibase.com/zh/news/21035 ；调用文档 https://www.volcengine.com/docs/82379/1366799 | Seedance 1.0 pro：0.015 元/千 token，**5s 1080P ≈ 3.67 元**（行业最低价位，https://www.time-weekly.com/post/321742 ）；Seedance 2.0：28 元/百万 token（含视频输入）/46 元（不含）：https://www.oschina.net/news/407785 | 5s / 10s，480P-1080P（2.0 支持更高分辨率与音画） | ✅ 首尾帧/参考视频 | ✅ |
| **Vidu**（生数科技） | ✅ 国内 https://platform.vidu.cn/product-pricing 、国际 https://platform.vidu.com/docs/pricing | Vidu 2.0 720P ≈ **0.258 元/秒**（行业均价约 0.6 元/秒，https://m.zhidx.com ）；Vidu Q1 经 together.ai $0.22/条 | 4s / 8s，720P / 1080P | ✅ 首尾帧 + 参考生视频 | ✅ |
| **MiniMax 海螺** | ✅ https://www.minimax.io/news/video-generation-api （video-01 起全系开放）；腾讯云亦集成：https://intl.cloud.tencent.com/zh/document/product/1300/83715 | video-01：6s 720p ≈ $0.5/条（fal.ai 托管价）；Hailuo/H3 i2v：768P ≈ $0.08/秒、2K ≈ $0.13/秒（dev.pika.art ）；国内聚合渠道 768P 0.09 元/秒、2K 0.15 元/秒 | video-01 6s → Hailuo 02/03：5-15s、最高 2K、24fps | ✅ 首帧/首尾帧/多模态参考 | ✅（原生平台 + 腾讯云渠道） |
| **智谱 CogVideoX** | ✅ https://docs.bigmodel.cn （CogVideoX-3：https://docs.bigmodel.cn/cn/guide/models/video-generation/cogvideox-3 ） | **CogVideoX-3：1 元/次**（5s/10s、最高 4K）；CogVideoX-Flash **免费**（限速，https://docs.bigmodel.cn/cn/guide/models/free/cogvideox-flash ） | 5s / 10s，720P-4K | ✅（输入含图像/文本/首尾帧） | ✅ |
| **PixVerse**（爱诗科技） | ✅ https://pixverse.ai/en + https://docs.platform.pixverse.ai | 标准生成 ≈ 5 credits/条；Essential $100/月=15,000 credits 起，Business $6,000/月（100 万+ credits）（https://www.somake.ai/blog/pixverse-ai-pricing ） | 5s / 8s，540P-1080P | ✅（t2v/i2v/特效/口型同步） | ✅（国内版 pixverse.cn） |
| **Runway** | ✅ https://docs.dev.runwayml.com/guides/using-the-api | Gen-4 Turbo ≈ 5 credits/秒；5s 视频典型 25-60 credits（$0.25-0.6）；高档模型 12-40 credits/秒（https://blog.segmind.com/runway-ml-pricing-plans-features 、https://magichour.ai ） | 5s / 10s，720P / 1080P | ✅ | ❌ 需海外网络与支付 |
| **Luma Dream Machine** | ✅ https://lumalabs.ai/pricing （API 文档 lumalabs.ai/api） | Ray3.2/Ray3.14：360p 20 credits/5s、540p 50、**720p 100 credits/5s（≈$0.30）**、1080p 400/5s（≈$1.2）；v2v 36-144 credits/秒 | 5s / 10s，360p-4K | ✅ | ❌ |
| **Sora API（OpenAI）** | ⚠️ 2025-10 随 Sora 2 开放入 API（sora-2 / sora-2-pro），**2026-09-24 已关闭**（https://www.eesel.ai/blog/sora-2-in-the-api-pricing 、https://costgoat.com ） | sora-2 $0.10/秒（720p）/$0.30/秒（1080p）；sora-2-pro $0.30-0.70/秒 | 最长 10s | ✅ | ❌ |
- **对 RadarForge 的启示**：
  1. **国内可商用四强 = 可灵 / 即梦(Seedance) / Vidu / CogVideoX**（+ 腾讯云渠道的 MiniMax），全部支持 i2v，全部按 秒/积分/次 计费——「首帧用文章配图（文生图产出）→ i2v 出动态镜头」是资讯视频最低成本路径：5s 720P 单镜头预算可压到 **0.5-3.7 元**。
  2. **CogVideoX-Flash 免费档 + CogVideoX-3 1 元/次**适合做渲染失败的兜底与低成本草稿预览（先 1 元草稿确认分镜再上可灵高品质）。
  3. 海外 API（Runway/Luma/Sora）在国内均不可直连且 Sora API 已关停，**不建议纳入主链路**，只做可选 provider。
  4. 对比我们现有 agnes-video provider：应把「Kling / Seedance / Vidu / CogVideoX」四个官方直连 provider 补进 gateway registry，并统一「积分→人民币」成本核算字段，方便按预算自动选型。

---

## D. 竞品产品（内容创作台交互流重点）

### D1. Jasper — https://www.jasper.ai
从 AI 文案工具转型为「营销 AI agent 编排平台」：用 agent 跑端到端营销工作流（campaign 资产批量生成），企业级 Brand Voice/Brand Knowledge 管理与权限。交互流亮点：**Brief 一次输入 → 多渠道资产矩阵批量产出 → 品牌一致性校验**。
**启示**：RadarForge 应把「风格/品牌声音」做成持久资产（现有 style-exemplars 的强化），选题→成文→多平台变体收进同一个 campaign/run 视图。

### D2. Copy.ai — https://www.copy.ai
转型「GTM AI Platform」：可视化 workflow builder（触发器→LLM 步骤→webhook）+ Infobase 企业知识库，覆盖内容、prospecting、ABM、翻译本地化、deal coaching。交互流亮点：**非程序员也能拖拽搭建内容流水线**。
**启示**：我们的自研 skill 引擎可向前端暴露成可视化 workflow（抓取→筛选→写作→渲染→发布节点编排），这是「平台化」与「工具化」的分水岭。

### D3. 讯飞绘文 — https://turbodesk.xfyun.cn （介绍：https://ai-bot.cn 、百科：https://baike.baidu.com/item/讯飞绘文 ）
科大讯飞一站式 AIGC 内容运营平台（原「星火内容运营大师」，2024-06 更名）：**选题台（热点追踪/话题挖掘/灵感发散）→ AI 写作 → AI 配图 → 排版润色 → 小红书/视频号/公众号/抖音/百家号/头条号六平台一键发布 → 数据回溯**；宣传「通用稿件 30 分钟生成」。交互流亮点：选题卡片→一键成稿→平台化排版预览→批量发布。
**启示**：与 RadarForge 定位最接近的国内正面对手。其把「选题→成稿→多平台发布」做成一条 Loom 式直线流；我们的差异化必须打在：**代码动画视频渲染 + VLM 质检 + 可解释 skill 管线**这三件它没有的事上。

### D4. 讯飞智作 — https://www.xfzhizuo.cn
一站式智能配音 + 虚拟数字人视频制作：选数字人形象→贴文案→口型合成→模板化成片；多音色多语种 TTS。交互流亮点：**模板化口播视频产线**（选人→贴稿→合成，三步完成）。
**启示**：资讯播报类视频可增加「虚拟主播/数字人口播」clip 类型，交互动线抄它（音色试听 + 完整预览再合成，MPT 也有同款交互）。

### D5. 即梦 AI（剪映团队）— https://jimeng.jianying.com
字节一站式 AI 创作平台：文生图、图生视频（Seedance 同源）、**智能画布**（局部重绘/一键扩图/图像消除/抠图/多元素无缝拼接）、**故事创作模式**（分镜式叙事）、首尾帧/对口型/运镜控制、数字人；与剪映生态互通；2025-09 起经火山引擎开放企业 API。
**启示**：「故事模式」= 分镜驱动创作流，与我们 storyboard（scripts/last-storyboard.json）思路一致；「与剪映互通」再次验证导出剪映草稿的价值；智能画布的「局部重绘/扩图」可作为配图精修的进阶功能。

### D6. 度加创作工具（百度）— https://aigc.baidu.com/
百家号体系 AIGC 创作平台：AI 成片（**图文一键转视频**）、AI 笔记、AI 数字人、AI 作画等「AI 工具六大件」，面向泛知识创作者（介绍：https://gongke.net 、36 氪 AI 测评 https://ai.36kr.com ）。交互流亮点：成片入口内嵌在图文编辑完成之后——**「写完即可成片」**。
**启示**：图文→视频的转化按钮应放在文章定稿页而非单独模块，降低用户心智切换成本。

### D7. 新媒体管家 / 壹伴（公众号多平台插件）
- **新媒体管家**：官网 xmt.cn（Edge 商店页佐证：https://microsoftedge.microsoft.com/addons/detail/新媒体管家/afljpghollbanbohmmonkjgjfakaabih ；百科：https://baike.baidu.com/item/新媒体管家/18198240 ）：浏览器插件，12 个新媒体平台账号同步绑定、免扫码切换、一键排版/样式中心、多平台同步发布；约 200 万用户。
- **壹伴**：https://yiban.io ：400 万用户级公众号助手插件，AI 写作 + 一键排版 + 素材管理 + 多平台同步 + 数据诊断的「全流程工作台」（评测：https://yiban.io/blog/37441 ）。
**启示**：浏览器插件嵌入公众号后台是「最后一公里」的最成熟形态；若 RadarForge 走 Web 端，应提供「复制为公众号内联 HTML（doocs/md 方案）+ 官方配套扩展一键粘贴」，而不是追求脆弱的逆向 API。

### D8. 秘塔写作猫 — https://xiezuocat.com
AI Native 内容创作平台：纠错校对（错字/语病/成语）、改写润色、**自动配图**、多人协作、续写；有 Word 插件与 App（App Store）。交互流亮点：**左右分栏实时校对 + 逐条建议一键采纳**（而非整体重写）。
**启示**：review 环节的交互应学它：把 LLM-as-Judge 的发现渲染成「逐条可采纳/忽略的建议列表」，保留用户对最终文本的控制权。

---

## E. 内容质量方法论（工程实践文章）

### E1. 《AI Prompt 工程化设计最佳实践（Harness Engineering）》
- **URL**：https://www.cnblogs.com/ms27946/p/20373173 （博客园，约 1.5 万字）
- **要点**：九大原则——①Plan-and-Prompt 分离；②多阶段流水线（每阶段独立、可替换、可单测）；③**Schema 即约束**（JSON Schema 有什么字段，LLM 就思考什么）；④Prompt 模块化组装（Section 化、可 A/B）；⑤代码覆写 LLM 输出（LLM 建议、代码裁决安全合规字段）；⑥输入分类 + 模板路由（分类器用纯代码）；⑦约束排序与密度控制（重要约束放 prompt 前 25%）；⑧防御性降级（重试→降级→兜底）；⑨可观测性（阶段边界结构化日志）。
- **对 RadarForge 的启示**：skill 引擎升级的直接蓝本：每个 skill 应拆成「多阶段管道 + Schema 约束 + 模板路由 + 结构化日志」，而不是单个巨型 prompt；这正好补齐我们 run-manager 的可观测性短板。

### E2. 《How To Reduce Hallucinations in RAG Applications》（Splunk）
- **URL**：https://www.splunk.com/en_us/blog/artificial-intelligence/rag-hallucination-reduction.html
- **要点**：先诊断六类幻觉模式，再在**检索层**修复：query rewriting（检索前改写查询词）、两段式检索（宽向量召回 + reranker 精排）、chunk 级相关性追踪（区分「检索噪声」与「模型推理错」）、guardrails 兜底。
- **对 RadarForge 的启示**：资讯写作的事实性管线 = 引用原文片段编号 → 逐句回链校验 → 检索质量单独打分；rerank 可直接用 z-ai VLM/LLM 做相关性重排（对应我们 radar-learn 的采集→筛选环节）。

### E3. 风格微调参考：《如何用 LoRA 微调大模型学习角色说话风格》 + IBM LoRA 说明
- **URL**：https://zhuanlan.zhihu.com/p/2052873757547669414 ；https://www.ibm.com/cn-zh/think/topics/lora
- **要点**：风格迁移式 LoRA（学「腔调」而非注入知识），少量样本即可；训练参数常 <1%，成本远低于全参微调。
- **对 RadarForge 的启示**：短期用 style-exemplars few-shot（零训练）；中期给重度用户提供「风格微调」进阶档（品牌声音固化）。

### E4. Self-RAG（检索增强 + 自我反思）
- **URL**：https://www.promptingguide.ai （检索增强生成方法综述页，含 Self-RAG 框架）
- **要点**：模型动态决定何时检索，并对检索结果与自身输出做反思评分，显著提升事实性。
- **对 RadarForge 的启示**：写作 skill 内嵌「按需检索 + 事实性自评」二步，比「全量塞上下文」更省 token 也更准。

---

## 调研结论：Top 10 可迁移技术（按投入产出排序）

1. **STORM 预写作管线**（多视角发现 → 模拟提问 → 大纲策展 → 分节成文 + 引用）：日报长文质量的公开最优解（+25% 组织性 / +10% 覆盖度，NAACL 2024）。落地：radar-write 改三段式 skill 管线。
2. **LLM-as-a-Judge 多维 rubric 门禁**（事实引用/结构/风格/平台适配，0-5 分 + 理由 + 阈值触发重写）：把 radar-review 从「改稿器」升级为「质检器」，交互上学秘塔写作猫的逐条建议。
3. **Self-Refine / Reflexion 反馈闭环**（1-2 轮自评修订 + 项目级反思记忆库）：免费精度放大器；用户改稿差异自动沉淀为下次的 reflection 注入。
4. **结构化制品传递的多角色协作**（MetaGPT 思想）：选题池/大纲/分镜/排版树全部 JSON 化流转，agent 角色分工只是「读上游制品、写下游制品」——与现有 skill 引擎 + Prisma 数据模型零成本对接。
5. **剪辑 DSL + 自动素材 sourcing**（ShortGPT editing language + MPT 素材三层策略）：clip_schema 已有，补「按脚本段落自动检索 Pexels/Pixabay 免费素材」的第二轨道 + LLM 可生成的动作序列。
6. **句级图文匹配选图 + 首图锚定的系列配图**（TIPS + AR-LDM）：VLM 给「段落↔候选图」打分选图；文生图首图做 reference，图生图保持全篇风格统一（z-ai 能力闭环）。
7. **国内视频 API 四强直连 + 成本感知路由**：Kling（0.3-0.8 积分/秒）/ Seedance（5s 1080P ≈3.67 元）/ Vidu（720P 0.258 元/秒）/ CogVideoX-3（1 元/次、Flash 免费）全部支持 i2v；「文生图首帧 → i2v」单镜头 0.5-3.7 元，按预算自动降级（可灵高品质→CogVideoX）。
8. **公众号导出 = doocs/md 内联样式方案 + 多图床 + 浏览器扩展一键粘贴**（doocs/cose / 壹伴 / 新媒体管家形态）：避开逆向 API 的脆弱性，把「复制即所见」做到极致。
9. **多平台一键发布矩阵**（讯飞绘文六平台 / MPT 三平台 / 新媒体管家 12 平台）：以「同一制品的多平台变体渲染」实现（platforms.ts 扩展），加上各平台预览（宽高比/字数/标签规范）。
10. **Prompt 工程化九原则 + RAG 事实校验**（Harness Engineering + Splunk 六类幻觉修复）：多阶段流水线、Schema 即约束、模板路由、防御性降级、阶段日志；资讯场景必须配 query rewriting + 两段检索 + chunk 相关性追踪，把幻觉拦在采编层。

### 附：三条「慎做」结论（来自反面证据）
- **不要**把 Runway/Luma/Sora 纳入主链路（大陆不可直连；Sora API 已于 2026-09 关停，见 https://www.eesel.ai/blog/sora-2-in-the-api-pricing ）。
- **不要**追求公众号逆向发布 API：全部头部竞品（壹伴/新媒体管家/doocs）都走「插件 + 内联 HTML 粘贴」，合规且稳定。
- **不要**一步成文：STORM/Plan-and-Write/DOC/Re3 四篇论文一致证明大纲先行 + 递归/分节生成在连贯性上显著占优，一步式长文是质量天花板。
