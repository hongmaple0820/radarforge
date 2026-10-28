# Worklog

---
Task ID: 1
Agent: 主 Agent (Z.ai)
Task: 腾讯元宝搜索 × CSDN 征文参赛作品——开发「AI 资讯雷达」Web 应用并撰写征文

Work Log:
- 调研元宝搜索征文活动与 SearchPro API 文档（cloud.tencent.com/product/1806），确认接入方式、参数、错误码
- AskUserQuestion 确认方向：资讯追踪 / Web 应用 / 已有 Key / 项目复盘型 / ~5500字 / Markdown / 四类配图
- fullstack-dev skill 初始化 Next.js 16 项目环境
- 开发应用：Prisma+SQLite 话题持久化、/api/search 服务端 Key 代理（真实/演示双模式）、/api/topics CRUD、/api/briefing LLM 早报（z-ai-web-dev-sdk）
- 前端：话题栏、控制面板（Freshness/Mode/Industry/Cnt 四参数联动）、资讯卡片流、信源统计、AI 早报面板；teal 配色、响应式、骨架屏
- 修复：SQLite createMany 不支持 skipDuplicates；话题删除按钮 className 笔误
- agent-browser 端到端验证：话题切换、早报生成、模式过滤、添加话题、移动端布局、footer 贴底——全部通过
- VLM 检查截图质量：主界面/移动端/架构图/数据图表/封面均验收通过
- charts skill 生成架构流程图（Playwright+CSS Layout C 分层纵向、蓝灰同色系）
- 收集参数行为数据（scripts/collect_data.py），matplotlib 生成 Freshness/Mode 两张实验图表（Sarasa Mono SC 中文字体、低饱和配色、防重叠）
- image-generation 生成封面题图（雷达扫描主题，1344x768）
- 撰写 CSDN 征文 Markdown（9 章、~6800 字正文、6 图、4 代码块、2 表格），标题符合「【元宝搜索征文】」规范

Stage Summary:
- 交付物：
  1. 可运行 Web 应用：/home/z/my-project（Next.js 16，演示模式开箱即用，.env 填 WSA_API_KEY 即切换真实调用）
  2. 征文：/home/z/my-project/download/元宝搜索征文-AI资讯雷达.md
  3. 配图素材：/home/z/my-project/download/assets/（cover、architecture、app-main、app-full、app-mobile、chart-freshness、chart-mode）
  4. 可复用脚本：/home/z/my-project/scripts/（arch-flow.html、render_arch.py、collect_data.py、gen_charts.py）
- 关键决策：服务端代理保 Key 安全；无 Key 演示模式保证开箱可用；早报 prompt 强制信源编号实现可溯源闭环
- 待用户操作：将 API KEY 填入 .env → 发布征文到 CSDN（上传 assets 图片）→ 回报名表提交链接

---
Task ID: 2
Agent: 主 Agent (Z.ai)
Task: 用户提供 ***REDACTED-TENCENT-SECRETID***，配置并切换真实数据模式

Work Log:
- curl 直接测试 SearchPro（Bearer / X-Api-Key / Token / body 四种鉴权变体）：全部返回 UnauthorizedOperation
- 查官方文档确认：元宝搜索服务 API KEY 为 sk- 开头（示例 sk-209b****e23d），在「元宝搜索控制台 → 概览 → 服务 API KEY 方式」创建
- 诊断结论：用户提供的 AKID 开头字符串是腾讯云访问管理(CAM)的 SecretId，非元宝搜索专用 Key，无法用于 Bearer 鉴权
- 决策：不将无效 Key 写入 .env（避免应用从演示模式变成报错模式），仅更新 .env 注释指明正确 Key 格式与获取路径
- 官方 Key 创建特性：仅创建时弹窗显示一次明文，需立即复制或下载 CSV；每个 subuin 最多 3 个；子账号需主账号授予 WSA 全读写权限

Stage Summary:
- 应用仍处于演示模式开箱可用状态，等正确的 sk- Key 即可切换
- 用户需要重新获取：元宝搜索控制台 → 概览 → 服务 API KEY 方式 → 创建 API KEY → 复制 sk- 开头明文
- 收到正确 Key 后计划：写入 .env → 重启 dev server → 验证真实数据 → 真实数据重截图 → 更新征文素材

---
Task ID: 3
Agent: 主 Agent (Z.ai)
Task: 基于五个标杆项目（wewrite / huashu×2 / dsh×2 / pi-agent）的研究，产出「AI 搜索驱动的自媒体工作流平台」详案级方案；本地安装相关 skills 并验证

Work Log:
- AskUserQuestion 确认 8 项决策：Markdown / 详案级 / 渐进演进 / 图文+视频双线 / 研究+装+方案 / 深读仓库再定 / 多供应商抽象 / 个人创作者；备注关键：**不融合 dsh 而是借鉴学习，打造自己的 agent**
- 研究 wewrite v4.2.1（三层解耦 Prompt/Runtime/State、9 模块流水线、brief/claims 留痕、编辑飞轮、18 主题、一稿多发）
- 研究 huashu-motion（视频即 index.html、导演规则实测方法论、om studio 指着画面改 + inbox.jsonl 协议、ABC 记谱作曲、QA 门禁）与 huashu-art-motion（36 风格 53 配方卡、9 解说语法、8 参数化片段）
- 深读 dsh-imagegen-video（无限画布节点体系、协议族适配器、导演规划降级链、身份锚定、node:vm 代码渲染路径）与 dsh-agnes-multimodal（账号池=RPM 槽位、GET /models 探活、附件 offload）
- 调研 pi-agent 1.4.0（pi-ai 统一多供应商 API、pi-agent-core、四模式 TUI/print/RPC/SDK、Agent Skills 标准）
- 安装验证：wewrite CLI 4.2.1（uv 装自本地源，官方 PyPI 直连）+ 10 skills 符号链接到 ~/.claude/skills 与 ~/.agents/skills；huashu-motion 0.3.1 与 huashu-art-motion 1.2.0（codeload tarball + 手动链接）；pi 1.4.0（npm 全局）——共 12 skills + 1 CLI 全部验证通过
- 踩坑：GitHub git 直连 GnuTLS 中断 → codeload tarball 兜底；清华镜像 wheel 403 → 官方源；npx skills add 超时 → tarball 手动链接
- charts skill（已读 SKILL.md + playwright-css.md + _rules.md 全链）生成两张配图：platform-architecture.png（五层架构 + 外部服务虚线边界，Scheme B 蓝灰渐进）、content-pipeline.png（Layout C 双轨流水线，元宝搜索 4 处接入点徽章标注）；VLM 验收双双通过（零重叠/零截断/对齐良好）
- 撰写详案级方案（6295 中文字 / 9 章 / 2 图 / 4 代码块 / 6 表格）：含五标杆借鉴要点、五层架构、模型网关 TS 接口、Agent 运行时设计、图文/视频双流水线、inbox 协议 JSON、Prisma 九表扩展、元宝搜索四层集成参数表、Phase 1-5 路线图、风险对策、安装实录

Stage Summary:
- 交付物：/home/z/my-project/download/自媒体工作流平台方案-AI资讯雷达2.0.md + assets/platform-architecture.png + assets/content-pipeline.png
- 本地环境就位：~/.claude/skills 与 ~/.agents/skills 各 12 个 skill（wewrite 十件套 + huashu 双件），pi CLI 1.4.0，wewrite CLI 4.2.1；仓库源码存于 /home/z/my-project/skill-pool/
- 核心设计决策：借鉴而非依赖（dsh 协议族模式折进自研网关；pi 四模式之 SDK 思路对应 Next.js API 路由）；A 代码绘制零成本 / B 模型生成双渲染路径；claims 来源账本与雷达 [n] 引用同构复用
- 待办衔接：元宝搜索 sk- Key 仍待用户提供（AKID 串不可用）；方案 Phase 1（模型网关 v1 + 选题池 + write/review skill）可随时启动
