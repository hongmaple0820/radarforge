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

---
Task ID: 4
Agent: 主 Agent (Z.ai)
Task: 用户三点回复：①方案满意 ②提供真实 sk- Key ③希望学 dsh 支持插件/skills/MCP——执行「Key 切真实数据 + 扩展体系落地 + Phase 1 开工」

Work Log:
- 真实 Key sk-9aae…写入 .env 并 curl 直连 SearchPro 验证：鉴权通过，10 条真实结果（RequestId 54336d36…）
- fullstack-dev 技能加载 + init 脚本初始化，dev server 后台就绪
- Phase 1 模型网关 v1 落地：src/lib/gateway/（types 四类 Provider 接口 / registry 运行时注册表 + healthAll 并发探活 / bootstrap 幂等装配）+ providers/wsa-search.ts（包 1.0 wsa.ts，代码零废弃）+ providers/zai-llm.ts（收口 z-ai-web-dev-sdk）
- Skills 加载器：src/lib/skills/loader.ts 双目录扫描（~/.claude/skills + 项目 skills）+ 手写 frontmatter 解析（修复 indexOf 行定位隐患改为下标驱动）；实测 81 个技能（用户级 12 + 项目级 69 个系统技能池）
- MCP 客户端：src/lib/mcp/client.ts 完整 JSON-RPC 2.0/stdio（initialize 握手/tools list+call/超时/进程退出批量 reject）+ config.ts 配置读取 + scripts/echo-mcp-server.mjs 样板服务器 + config/mcp.json
- 选题池：Prisma IdeaCandidate 表（db:push + db:generate）+ /api/ideas CRUD 路由（状态流转/去重）+ workbench/ideas-panel.tsx
- UI 工作台：主页改造为三 Tab（资讯雷达/选题池/扩展体系）+ extensions-panel.tsx 三面板（网关探活/技能卡片/MCP 工具）+ news-card 加「加选题」按钮（一键入池闭环）
- 踩坑修复：Prisma client 未重新 generate 导致 db.ideaCandidate undefined → bun run db:generate + 重启 dev server；node strip-types 不支持 TS parameter property → MCP 直连测试改用 bun
- 端到端验证 8 项 API + Agent Browser UI 4 项全通过；lint src 零错误；截图 workbench-extensions.png / workbench-radar-real.png 存档
- 方案文档更新：第九章行动项标注完成、新增第十章「扩展体系：插件、Skills 与 MCP（学 dsh）」6 小节 + 附录 A 落地实录

Stage Summary:
- 雷达已切换真实数据模式（mock: false，延迟 220~520ms）
- Phase 1 交付 10 新文件 + 3 改造：模型网关（2 Provider 探活健康）/ Skills（81 个可发现）/ MCP（echo tools/call 回显成功）/ 选题池（CRUD+去重+UI 闭环）
- 对用户「学 dsh 支持插件/skills/MCP」的答复落地为三层扩展体系：Provider 插件层 + Agent Skills 层 + MCP 工具层，文档第十章详述协同与 Phase 4 插件包契约
- 下一步建议：Phase 2 Agent 运行时（skill 注入 + run 记录）；CSDN 征文可用真实数据重截图后发布

---
Task ID: 5
Agent: 主 Agent (Z.ai)
Task: Phase 2 开工并交付——「发布与飞轮 v1」：Agent 运行时（Run 状态机+六步流水线）+ write/review/rewrite/learn 四 skill + 微信兼容排版引擎 + 生图 Provider + 三级降级发布 + 编辑飞轮

Work Log:
- Prisma 扩表 7 张：Run / Claim / Article / ReviewRecord / Asset / LearningRule / PublishRecord（db:push + generate）
- 网关新增 zai-image Provider（首个 ImageProvider，SDK 同步生图落盘 public/runs/）并注册 bootstrap；探活零成本（SDK init 不真实生图），detail 诚实注明环境限制
- Agent 运行时 src/lib/runtime/：run-manager（六步流水线 fire-and-forget 后台执行 + 步骤流水账 + 失败留痕）+ render.ts（微信兼容排版引擎：3 主题 classic/ink/warm、全内联样式、section 粘贴加固、CJK-Latin 自动空格、外链转脚注、[n] 上标引用 + 参考来源区 + AIGC 声明）+ relayout.ts（人工编辑后重排版）
- 四个 skill：radar-write（7 人格库 + brief 任务书 + claims 注入初稿 + 审稿修订）、radar-review（五维审稿 JSON）、radar-rewrite（CSDN/小红书一稿多发）、radar-learn（diff→规则提炼，宁缺毋滥）
- API：/api/runs（列表+创建+meta）、/api/runs/[id]（详情+删除）、/api/runs/[id]/actions（edit 集成飞轮 / rewrite / publish）、/api/learn（规则 CRUD+状态流转）
- 发布链路 src/lib/publish/wechat.ts：三级降级（草稿箱 API 占位完整实现→粘贴加固→下载），PublishRecord 留痕降级原因（绝不静默降级）
- UI：主页改四 Tab，新增创作台 studio-panel（新建运行表单+Run 看板轮询+编辑飞轮面板）与 run-detail（步骤时间线/claims 表/五维分数条/微信预览 iframe 手机模拟/改稿喂飞轮/复制加固 HTML/下载/一稿多发/发布）
- 端到端验证两条真实 Run：①sharp-editor 2812 字 revise 自动修订一轮 ②cold-analyst 2050 字 pass 直接通过；research 修复后 4/5 主张找到真实来源（今日头条/腾讯新闻，Cnt=3 非法值改 10，静默 catch 改逐条留痕）
- 排版质量七项全过：section 加固/无 class/CJK 空格/[n] 上标/参考来源/AIGC 声明/主题底色；rewrite CSDN 版 2391 字（速览引用块+参考列表）；publish 微信 local-paste 降级 7639 字符 HTML + CSDN 人工复制路径
- 编辑飞轮 API+UI 双验证：改稿保存 v3 落库+重排版+3 条规则 proposed 落库→1 条确认 active（hits 计数）→无差异时正确跳过提炼
- Agent Browser 验证：四 Tab 切换、Run 详情、iframe 预览内容渲染、改稿交互、移动端 390px；VLM 三张桌面截图+移动端验收全部通过；eslint src 零错误
- 踩坑：①Prisma Client 需重启 dev server 才加载新表（kill 后用 .zscripts/dev.sh 守护重启：重跑 init-fullstack.sh 触发）②SDK 图像端点被环境网关 405 拦截（沙箱网络策略，封面降级为无封面并留痕）③agent-browser 点击嵌套 Dialog 按钮 outside viewport → eval JS click 兜底

Stage Summary:
- Phase 2 验收标准全部达成：端到端从选题到微信兼容 HTML 成稿（真实数据+可溯源 [n] 引用）✅；「学习我的修改」规则落库（proposed→active，注入后续写作）✅；生图渠道 Provider 就位（环境受限诚实降级）✅；一稿多发（CSDN/小红书）✅；发布三级降级留痕 ✅
- 交付：13 新文件（runtime 5 + skills 4 + gateway 1 + publish 1 + API 4 + UI 3）+ schema 7 表 + 主页四 Tab 改造；截图 4 张存 assets/（phase2-studio-main/studio/run-detail/studio-mobile）
- 已知边界（诚实记录）：SDK 生图端点在当前沙箱被 405 网络策略拦截（代码就绪，环境恢复即出图）；微信草稿箱 API 需认证服务号（三级降级默认走粘贴加固）；learn 规则目前仅注入 draft 步骤
- 下一步建议：Phase 3 视频线 A（代码绘制引擎+节奏单 skill+studio 编辑器+inbox 协议）；CSDN 征文可继续用 2.0 素材发布
