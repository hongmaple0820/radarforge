# 项目工作日志（多 Agent 共享）

> 注：原 worklog 因沙箱环境重置丢失（2026-10-28 发现 /home/z/my-project 被清空，
> 此前的资讯雷达 1.0 代码、方案 2.0 文档、skill-pool 均不在）。本日志自 Phase 2 重建起记录。

---
Task ID: P2-rebuild
Agent: 主 Agent（Z.ai）
Task: 环境重置后一次性重建「AI 资讯雷达 · 自媒体工作流平台」= 1.0 核心功能 + Phase 2 Agent 运行时（用户指令：开工 Phase 2）

Work Log:
- 确认环境重置：旧项目文件全部丢失，仅 .env(DATABASE_URL)/skills/(69 个系统 skill)/git 空仓残留
- 写入 WSA_API_KEY=sk-9aae... 到 .env，curl 验证 SearchPro 真实返回成功（关键发现：参数为 PascalCase Query/Count；Pages 元素为字符串化 JSON 需二次解析）
- 初始化 fullstack 脚手架（Next.js 16 + TS + Tailwind 4 + shadcn/ui + Prisma/SQLite）
- Prisma schema 2.0：Topic/Report/Claim/AgentRun/InboxItem/Idea/ProviderRecord/McpServer（db push 成功）
- 模型网关层 src/lib/gateway/：types(四类 Provider 接口+GatewayError) / registry(插件化注册表,register/unregister/byKind) / providers(yuanbao-search 真实, demo-search 降级, zai-llm) / index(降级链 searchWithFallback + 调用统计落库 + healthCheckAll 巡检)
- Agent 运行时 src/lib/agent/：skill-loader(SKILL.md YAML frontmatter 热加载,30s 缓存) / tool-registry(web_search,read_skill,create_idea,add_inbox_item,list_topics 五个内置工具) / context-engine(检索注入+[n]证据块渲染+审稿消息) / run-manager(五步编排:load-skill→context→generate→review→finalize,后台执行+前端轮询) / mcp-client(JSON-RPC initialize+tools/list 握手,未识别明确报错)
- API 路由：/api/search /api/topics /api/morning-report(早报+claims 落账) /api/ideas /api/inbox /api/gateway/providers /api/agent/skills /api/agent/runs(+/[id]) /api/agent/tools /api/agent/mcp(CRUD+test)
- 前端单页四区(src/app/page.tsx + 4 组件)：雷达(话题+早报+[n]溯源侧栏) / Agent 运行时(skills 网格+run 五步进度+inbox) / 插件中心(Provider 卡片巡检+工具即时执行+MCP CRUD) / 选题池；MdView 组件渲染 [n] 为可点击徽标
- 修复：Pages 字符串二次解析（此前导致早报证据为空）；MCP 预置示例从 mcp.z.ai(不可达)换成 mcp.deepwiki.com(真实可连)；lint 全过
- agent-browser 端到端验证全绿：早报 REAL+8 引用(光明网/新华网/央视网真实溯源)；blog-writer Run 五步 done+审稿真实发现数据冲突(260亿vs333亿vs540亿)；MCP 握手 DeepWiki v2.14.3 发现 3 工具；选题池 UI+工具双链路入池；移动端 390px 响应式正常；dev.log 无错误

Stage Summary:
- 交付物：可运行的完整平台（1.0 雷达核心 + Phase 2 Agent 运行时），预览 https://preview-<bot-id>.space-z.ai/
- 关键资产：6 张验证截图于 download/assets/phase2-*.png
- 架构决策落实：插件化 Provider 注册表（学 dsh）、SKILL.md 开放标准热加载（学 pi-agent，69 个真实技能即装即用）、MCP JSON-RPC 客户端（真实握手）、降级链 REAL→DEMO 显式标记、claims 来源账本与 [n] 同构
- 待办（后续 Phase）：LLM 工具调用循环（ReAct）、视频生产线（huashu 借鉴）、IMAGE/VIDEO Provider 落地、d30 回访、微信草稿箱

---
Task ID: P2-full（图文六步流水线完整版）
Agent: 主 Agent（Z.ai）
Task: 用户反馈「离预期很远」——按方案 2.0 附录 B 补齐完整图文生产线（此前只交付了骨架版）

Work Log:
- SearchPro 高级参数实测通过：Industry=news / Freshness=d30 / Mode=2 全部生效（PascalCase）
- Prisma 升级：Claim 扩展（claimType/text/verified/runId，reportId 可空化）+ AgentRun 扩展（kind/ideaTitle/persona/theme/artifacts）+ 新增 Article / ReviewRecord / Asset / LearningRule / PublishRecord 五张表
- src/lib/runtime/json.ts：LLM JSON 稳健解析（代码块剥离/尾逗号修复/截断修复）
- 四自研 skill：radar-write（7 人格库+brief 任务书+初稿注入）/ radar-review（五维审稿+revise 修订）/ radar-rewrite（CSDN/小红书/口播稿）/ radar-learn（diff 提炼规则）
- zai-image Provider 注册（1344x768 生图落盘 public/assets，失败降级留痕）——实测沙箱可真实出图（110KB）
- render.ts 排版引擎：3 主题（雷达蓝灰/墨黑高对比/暖白夜读）、全内联样式、section 粘贴加固、CJK-Latin 空格、[n] 上标、参考来源区、AIGC 声明
- run-manager 六步流水线：brief(5.4s)→claims(Industry=news·d30 逐条取证)→draft(人格+飞轮规则注入)→review(均分<7.5 触发修订)→cover→layout
- wechat.ts 三级降级发布：L1 草稿箱 API（实现就绪待服务号）→ L2 粘贴加固（默认）→ 降级原因诚实落 PublishRecord
- API：/api/runs（列表+新建）、/api/runs/[id]、/api/runs/[id]/actions（edit 含 relayout/rewrite/publish）、/api/learn（规则确认）
- UI：主页五 Tab（雷达/创作台/社区技能/插件中心/选题池）+ studio-panel（新建+看板）+ run-detail（六步进度/brief/claims 账本/审稿评分条/封面/飞轮/成稿/iframe 排版预览/动作栏）
- 修复：studio-panel Textarea 导入错（500）；Prisma client 缓存旧 schema（重 generate+重启 dev）；改稿后未重排版（edit action 补 relayout）

端到端实测（全部通过）：
- 六步流水线真实跑通：brief 5.4s → claims 2/2 找到真实来源 → 初稿 1825 字（犀利主笔）→ 审稿 7.8 通过（accuracy 8.5）→ 封面真实生成 110KB → 排版 6768 字符 HTML
- 排版 7 质量点：17 section / 51 内联 style / sup 上标 / 参考来源区 / AIGC 声明 / CJK-Latin 空格 / 3 主题
- 发布 Level 2 粘贴加固 + 降级原因留痕
- 改稿喂飞轮：3 处修改 → diff 2 处 → 提炼 3 条 proposed → 确认 1 条 active（UI 激活交互通）
- 一稿多发：CSDN 版 2512 字（含速览引用块，基于用户改稿后的最新版）
- relayout：改稿保存后 formatted 自动重生成（v2 = 6967 字符）
- agent-browser：五 Tab / Run 详情 / iframe 预览（7172 字符 srcdoc）/ 改稿编辑器 / 发布降级卡片 / 移动端 390px / errors 零
- VLM 复核截图：排版卡片完整、六步全绿、无布局破损
- ESLint 零错误零警告

已知边界（诚实记录）：
- 初稿年份等细节仍可能被 LLM 编造（如把 260 亿写成 2023 年）——claims 只核对主张不反向约束正文数字，后续可在 draft prompt 加「年份不确定时用近期/据证据」
- 草稿箱 API 需认证服务号（WECHAT_APP_ID/SECRET 未配置时永远 L2）
- learn-theme（排版学习）按路线图属 Phase 5

## 2026-10-29 · Phase 2 收尾：断点续作补全 + 闭环复验

背景：上一会话在端到端验证中途断点（六步流水线已跑通、飞轮已确认 active，但规则注入闭环未验证）。本会话以方案附录 B 为验收标准完成收尾。

补全与增强：
- relayout.ts 独立模块（文档规定的 runtime 四件套补齐）：改稿后自动重排版，与流水线第 6 步共用渲染引擎；actions/route.ts edit 复用
- 飞轮去重守卫：radar-learn.ts 新增字符 bigram Jaccard 相似度 + findSimilar；/api/learn confirm 时与既有 active 高相似（≥0.55）返回 409 并指认重复源（宁缺毋滥，防规则稀释）；run-detail.tsx 处理 409 toast
- 修复：bigrams 正则裸换行导致的 Parsing ecmascript source code failed（learn 路由 500→HTML 兜底）
- 清理：上会话遗留的语义重复 active 规则（结尾总结句×2 → 保留 1 条）

闭环复验（全部通过）：
- 第二条流水线（ink 主题 · 极客工程师 · 「AI 编程助手横评」）：六步全绿 REAL，brief 5.2s → claims 2/2 真实来源（搜狐/观察者网）→ 初稿 1782 字注入飞轮规则 2 条 → 审稿 7.5 → 封面 405 诚实降级留痕 → 排版 9033 字符 ink 主题
- 飞轮注入闭环：draft 步「注入飞轮规则 2 条」+ active 规则 hits 0→1 递增（学习→注入→计数全链路）
- relayout 实战：UI 改稿结论段（长句→短句节奏+记忆点）→ v1 保存 formatted=9240 字符自动重排
- 飞轮提炼质量：从真实 diff 提出 3 条具体规则（比喻本体喻体关系/对称结构表达/动词替代修饰短语）；「对称结构」经 UI 激活为 active
- 去重守卫确定性测试：插入近重复 proposed → confirm 返回 409 + duplicateOf 指认，清理通过
- 发布（浏览器 UI 点击）：Level 2 粘贴加固 + 降级原因 + 操作指南 + PublishRecord 留痕
- agent-browser 全量复验：五 Tab / run 看板 2 条 / 详情全卡片（brief/claims 链接/五维分数条/封面降级/飞轮）/ iframe 预览（28 section·4 sup·AIGC·参考来源·ink 高对比）/ 发布降级卡片 / 规则激活 / 移动端 375px 无溢出 / errors 零 / console 零告警
- ESLint 零错误；Prisma schema 与 DB 同步（13 表）

验收对照（方案附录 B）：
- 六步流水线实测（双主题 radar+ink，REAL 模式）✅
- 端到端发布真实文章（L2 粘贴加固 + 留痕）✅
- 「学习我的修改」规则落库（proposed→active→注入→hits 计数→去重守卫）✅

## 2026-10-29 · 工作台产品化补全（用户评审反馈落地）

背景：用户指出「核心引擎达标，但工作台产品感不足」——点名缺配置入口、复制 MD、AI 搜索可见性、灵感刷新、视频、主题切换。本轮全部补齐。

新增（对照用户点名清单）：
- 设置中心 Tab（第 6 个）：LLM（内置/自定义 OpenAI 兼容：DeepSeek/Moonshot/通义/Ollama）+ AI 搜索 key + 生图端点 + 创作方向风格定位；保存即生效（SettingKV + 5s 缓存 + 失效穿透），页面回显脱敏，每卡带真实连通性实测
- 风格定位真注入：run-manager 的 brief + 初稿 prompt 注入 styleProfilePrompt（实测第三条流水线 brief 读者=设置中心目标读者，审稿 voice 9 分）
- 创作台 AI 搜索卡：写前情报搜索 → 真实结果（带来源/日期）→ 一键转选题（角度携带信源摘要）
- 选题池「AI 刷新灵感」：雷达话题 + 近期早报 + 风格定位 → LLM 生成 6 条选题（与近 7 天池内自动去重）
- Run 详情动作栏：复制 MD / 复制公众号格式（富文本）/ 复制 HTML 源码 / 视频分镜 / 排版主题切换（retheme 秒级重排，不重跑流水线）
- 视频分镜工作流（视频线 MVP）：成稿 → LLM 结构化分镜 JSON（钩子/时长/画面/口播/字幕/B-roll/发布文案）→ 场景卡片 UI + 复制脚本；成片渲染诚实标注 Phase 3
- 网关增强：chat() 按设置路由自定义 LLM，失败自动回退内置引擎（假端点实测回退成功）；元宝搜索 key DB 优先 env 兜底；生图支持自定义 OpenAI 兼容端点（含 URL 返回型下载落盘）

关键修复：
- 运行中 dev server 持有旧 Prisma client（SettingKV undefined）：db push 重生成后需重启 dev；nohup/setsid 均被工具会话回收 → 双 fork 孤儿化（subshell 后台 + 立即退出，过继 PID 1）持久存活

验证（全部通过）：
- API：settings GET/PUT ✅、test llm/search ✅（真实返回「正常」/10 条真实结果）、ideas/refresh ✅（6 条贴风格）、retheme ink→cream ✅、storyboard 8 分镜 60s ✅、自定义 LLM 回退 ✅
- 浏览器：六 Tab ✅、设置中心回显+LLM 测试徽标 ✅、AI 搜索（真实联网徽标 + 10 卡 + 转选题入池 9 条）✅、AI 刷新灵感（9→15 条）✅、动作栏 5 新按钮 ✅、主题切换 iframe 即变 ink ✅、分镜卡 9 场景+发布文案 ✅、移动端 375px 六 tab 无溢出 ✅、errors 零 ✅
- 第三条流水线（cream 主题）：REAL 全绿，风格定位注入 brief，审稿 8.2（voice 9）
- ESLint 零错误；5xx 零

已知边界：
- 密钥经 PUT 保存后无法从 UI 清空（空值=不修改语义），换 key 直接覆盖即可
- 视频成片渲染（MP4 合成）属视频线 Phase 3
- 生图沙箱 405 降级依旧（自定义端点配置后可绕开）

## 2026-10-29 · Phase 3：视频成片落地 + 配置中心收尾（用户点名清单全闭环）

背景：用户质疑「做视频、生图重试、密钥清空」等产品化缺口。本轮把视频线从分镜 MVP 推进到真实成片，并补齐配置中心最后语义。

新增：
- 视频成片渲染引擎（src/lib/runtime/video.ts）：分镜 → SVG 场景卡（品牌化设计：品牌栏/大字字幕/口播字幕/进度圆点/装饰光晕，sharp 栅格化）→ 每分镜 TTS 口播 → ffmpeg 分段编码（淡入淡出·x264·统一参数）→ concat 合成 MP4 → /assets 可访问
- TTS 诚实降级：端点不可达（405）→ 静音+分镜计划时长出片，口播字幕烧录可读，meta 留痕（audioMode: tts/partial/muted）；实测后续渲染 TTS 恢复 → 59.4s 真人口播成片（mean -23.9dB 验证非静音）
- 渲染可配置：7 音色（小陈/彤彤/吹吹/卡兹/豆吉/罗多/Jam）× 两档画幅（竖屏 9:16 抖音/视频号、横屏 16:9 B 站）
- Asset 全程进度留痕（stage tts→frames→encode→concat→done + percent + sceneDone），UI 进度条轮询；storyboard 存入 video Asset meta（页面刷新后分镜卡恢复、可重渲染，合并保存不丢字段）
- 封面手动（重新）生成：cover 动作 + 封面卡按钮；生图降级后配好自定义端点可重试；多张留痕「共尝试 N 次」；UI 取最新成功封面
- 密钥清空：PUT clearApiKey 显式清空语义（空串仍=不修改）；三卡「清除密钥」按钮，清除即回退（搜索→env、LLM→内置、生图→SDK）并即时更新徽标

关键修复：
- shadcn ScrollArea 溢出遮罩 bug（通用）：Root 无 overflow-hidden 且 max-h-* 时 viewport height:100% 解析为 auto → 内容画出容器盖住下方控件（claims 账本/分镜卡中招）。修复：viewport 加 max-h-[inherit] + Root 加 overflow-hidden，一处组件修复全部生效（实测 viewport 670px→320px 钳制，内容内部滚动）
- run-detail 视频轮询 hook TDZ 风险：early-return 后才声明的 videoMeta 移入渲染前 IIFE 求值

验证（全部通过）：
- API：cover（405 诚实降级+Asset 留痕）、storyboard 7 分镜、render-video 后台渲染 9:16 与 16:9 双画幅出片（59s/60.5s，ffprobe h264+aac 校验）、settings 保存/留空不修改/清除三语义、密钥清除后 env 回退
- 成片质量：VLM 逐帧复核（首帧/中段帧）——文字清晰无溢出、布局层次分明、对比度佳；音频 volumedetect 确认真口播
- 浏览器：UI 点击「渲染成片」→ 进度卡实时（TTS 5/7·30% → 分段编码 → done 播放器+下载+重渲染）、封面按钮、设置中心清除按钮（徽标即时回退）、移动端 375px 无溢出、errors/console 零
- ESLint 全项目零错误；8 API 全 200

已知边界（诚实记录）：
- 生图端点沙箱仍 405（TTS 已恢复，生图未恢复）——自定义端点可绕开，UI 已留重试入口
- 重复渲染覆盖同一 MP4 文件路径（UI 只展示最新 video Asset，历史行留痕）
- BGM 仅分镜建议未合成（无版权曲库，不引入）

## 2026-10-29 · Phase 3 收官复验：类型清零 + 灵感刷新加固 + 全量回归

背景：接力会话对用户点名九项差距（复制 MD / 复制公众号格式 / 预览 / 主题切换 / 生图重试 / 视频 / AI 搜索 / 灵感刷新 / 配置中心）逐项复测。前两会话已全部落地，本轮清掉遗留硬伤并做端到端全绿复验。

修复：
- TS 类型错误 4 处清零（ESLint 不查类型，tsc --noEmit 才暴露）：run-manager.ts verifiedClaims 交叉类型补 claimType: string（3 处报错同根因）；settings.ts Object.assign 双重断言经 unknown（StyleProfile 无索引签名）
- /api/ideas/refresh 偶发 502（temperature 0.85 下 LLM 偶发整体非 JSON）：降温 0.7 首试 + 0.3 保守档自动重试一次，三连测全过

验证（全部通过，scripts/full-regression.mjs 留档可复跑）：
- API 26 调用全 200 零 5xx：9 基础面 + settings GET/PUT/test×3（LLM 0.4s 真实连通、搜索 0.8s 真实 10 条、生图 SDK 探活）+ search REAL 10 条 + ideas/refresh + run 六动作
- 六步流水线 REAL 全绿：回归 run cmvsvp2w…（4 claims / v0 成稿 5187 字符 HTML / retheme ink 秒级 5188 / storyboard 8 分镜 60s / cover 真实出图 79KB（沙箱生图端点本轮已恢复）/ render-video 9:16 成片 50.5s h264+aac 1.3MB TTS 真口播 / publish L2 留痕）
- 浏览器（agent-browser）：六 Tab、设置中心四卡回显（风格定位五字段注入态）、选题池「AI 刷新灵感」、创作台 AI 搜索卡 + 7 人格 + 3 主题下拉、Run 详情动作栏 10 按钮、复制 MD / 复制公众号格式 toast 实测（剪贴板读权限被浏览器安全策略拦截属正常，写入路径无异常）、视频播放器 + 重新渲染、iframe 预览 17 section、375px scrollWidth=375 无溢出、errors 零
- ESLint src/ 零错误零警告；tsc --noEmit src/ 零错误
- 截图留痕：download/assets/final-home / final-settings / final-ideas / final-studio / final-run-actions / final-mobile-375.png

已知边界（诚实记录）：
- 剪贴板读取（readText）在无头浏览器被权限策略拦截——复制功能本身走 write 路径正常（toast 确认）
- 生图端点本轮恢复真实出图；若沙箱再拦截仍有 405 降级留痕 + 设置中心自定义端点绕开路径

## 2026-10-29 · Phase 4/5 融合升级：五仓库生态接入 + IA 重构 + 双风格视频线（用户五点反馈全闭环）

背景：用户反馈五点——①雷达×灵感池冗余 ②AI搜索/图文/图片/视频交互堆叠 ③视频模型接入缺失、双风格未体现 ④pi-ai/Agnes 未以供应商接入 ⑤「图文生成根本没用 wewrite」。两棒接力完成（第一棒主体实施 + 本棒断点收尾复验）。研究结论与完整方案见 download/AI资讯雷达3.0-融合升级方案.md（23.7KB）+ download/融合方案-自媒体工作流平台.md（7.7KB）。

### 第一棒主体实施（worklog 断档补记，代码均已在库）

信息架构重构（6 Tab → 4 Tab 工作流）：
- 情报中心（雷达⊕灵感池融合）：AI 搜索顶栏（真实 10 条+一键转选题）→ 话题雷达 → 早报（claims 溯源+转选题）→ 选题池（AI 刷新/采纳/去创作）；「去创作」动线携带选题种子直达图文线表单
- 创作台双生产线内层切换：图文线（六步流水线+18 主题+动作栏）/ 视频线（三通道工作台）；视频相关动作全部从图文 Run 详情迁出，替换为快捷发起按钮
- 插件生态（社区技能+插件中心合并）；设置中心六卡（LLM 四模式/搜索/生图/Agnes 账号池/视频通道/风格定位）

wewrite 集成（MIT，纯增量吸收）：
- 18 套排版主题入库（6 分类：professional-clean/bauhaus/midnight/sspai/tech-modern/warm-editorial 等），YAML→TS 转换脚本 scripts/convert-wewrite-themes.py；旧 3 主题（radar/ink/cream）兼容映射
- 9 种容器语法（:::callout/timeline/steps/quote/pullquote/label/highlight/summary/dialogue）→ 渲染前置解析为内联样式 HTML
- 渲染管线 v2（17 步 TS 移植）：span leaf 粘贴加固 / 暗黑 data-darkmode / 真实 h2 / CJK-Latin 空格 / 外链脚注 / claims 账本正交叠加
- 主题画廊 UI：Run 详情 18 主题并排选择 → 「应用并重排」秒级重排（不重跑流水线）

双风格视频线（三通道）：
- A motion 商业片：品牌化场景卡 SVG + TTS + ffmpeg（原有线保留为快速档）
- B art 艺术动画：huashu-art-motion 引擎 vendored 于 public/engine/art-motion/（Canvas2D 确定性逐帧），8 解说语法 × 8 色板，本地 HTTP 静态服务 → Playwright Chromium 渲染 clip spec → ffmpeg；art-engine.ts 229 行
- C AI 视频模型：agnes-video provider（OpenAI 兼容提交→轮询→下载 MP4，学 dsh 协议族）；auto 通道自动降级本地
- 视频工作台 UI：源稿选择 → 分镜 → 三通道卡片（motion/art/Agnes，未配置诚实提示）→ 音色/画幅 → 渲染进度轮询（tts/spec/frames/submit/poll/download/encode/concat）→ 播放器+下载+重渲染

供应商体系（pi-ai + Agnes 多账号）：
- @mariozechner/pi-ai@0.73.1 真引入（30+ 供应商目录，含 zai/openai/anthropic/deepseek/kimi/minimax/openrouter/xai…），pi-ai-llm provider 动态 import；失败自动回退内置引擎
- Agnes 三 provider（llm/image/video）共享 AccountPool 单例：多账号轮询 + RPM 滑动窗口（图 20/60s/号、视频 1 任务/分/号）+ 429/401 熔断 30s + 失败换号；中国站/国际站/自定义三站点
- 设置中心 Agnes 账号池卡：账号增删/启停/密钥掩码/单号探活/全池探活（GET /models 零成本，实测假密钥真实 401 诚实显示）/策略与模型三选
- Provider 注册表 9 个：yuanbao-search / demo-search / zai-llm / custom-openai / agnes-llm / pi-ai-llm / zai-image / agnes-image / agnes-video

### 本棒断点收尾（构建修复 + 补缺 + 加固）

断点修复（上棒 context 耗尽遗留）：
- gateway/route.ts 旧 API（providerRegistry 小写 kind）重写适配新 registry；删除死代码：bootstrap.ts / wsa-search.ts / wsa.ts / mock-data.ts / api/briefing / ideas/[id] / workbench/ / radar/ 等 6 Tab 时代旧组件
- @mariozechner/pi-ai 安装（package.json 已声明未装）；Prisma client 重生成 + dev 重启

补齐缺失端点与防护：
- POST /api/settings/test（五卡真实连通性）：LLM 直测所选引擎+失败诚实标注回退链；搜索真实 10 条；生图端点探活；Agnes 单号/全池 GET /models 零成本探活（空池诚实失败不 5xx）；视频通道语义检查（local 零配置可用/agnes 需账号池）
- pi-ai getModel 目录外 id 返回 undefined 防护（否则 completeSimple 读 model.api 崩溃）+ 目录内宽松匹配（前缀/去日期后缀）+ 诚实报错列出目录样例
- models.json 协议互通（GET/POST /api/settings/models-json + 设置中心导出/导入按钮）：导出 agnes 账号池+自定义 LLM+搜索 key 为 pi-ai 协议 JSON；导入自动映射 agnes.accounts → 账号池、baseUrl+key → 自定义 LLM；实测往返闭环

稳定性加固（LLM 偶发失败双保险）：
- 4 处 JSON 步骤降温重试（brief 0.4→0.2 / review 0.2→0.1 / learn 0.3→0.15 / storyboard 0.6→0.3）
- 网关层 chatRetry：瞬时故障（fetch failed/timeout/ECONNRESET/5xx）指数退避重试 3 次；全项目 11 处长链路 chat 调用统一替换（流水线/分镜/早报/灵感/agent 运行时/video spec）

移动端 375px 溢出修复（三处根因）：
- 10 处 grid 缺 base grid-cols-1（隐式轨道被内容撑宽）→ 全部补齐
- Radix ScrollArea 内部 display:table 无 max-width（CSS2.1 对 table 行为未定义，Chrome 忽略 max-width）→ globals.css 全局覆写 display:block + min/max-width:100%
- agent-panel 启动 Run 按钮长文本 + shadcn Button whitespace-nowrap 隐性溢出 → whitespace-normal；运行卡 flex 子项补 min-w-0 flex-1

验证（全部通过，scripts/full-regression.mjs 三连跑全绿）：
- 32 项断言全绿：18 主题注册（6 分类）/ Agnes 账号池语义（保存/掩码/空池诚实失败/通道 auto↔local）/ pi-ai 模式+失败回退（诚实标注「失败→已回退内置引擎」）/ 搜索 REAL 10 条 / 六步流水线 REAL（7748 字符 HTML·33 处 span leaf·暗黑·真实 h2·claims 脚注）/ sspai 秒级重排+旧主题映射 / 8 分镜 60s / 封面 / art 成片 63.1s 1.3MB（t2_keynote_ui 语法）/ motion 成片 60s 1280×720 / 发布 L2 / 全部 API 无 5xx
- 浏览器端到端：情报中心 AI 搜索→转选题→去创作种子填入全动线、主题画廊 sspai 应用重排、视频工作台三通道卡、设置中心六卡（LLM 测试连通真实回复 OK 392ms / Agnes 账号池保存+掩码+全池探活 401 诚实 / 视频模型检查 / models.json 导出导入）、四 Tab 桌面+375px 全部 scrollWidth=375 零溢出、console/errors 零
- ESLint src/ 零错误零警告；tsc --noEmit 零错误（tsconfig 排除 repos/skills/skill-pool/tests 等非项目代码）
- 截图 11 张：download/assets/v4-{home,intel-final,intel-search,theme-gallery,retheme-sspai,video-panel,video-final,settings-agnes,settings-final,eco,mobile-375}.png

已知边界（诚实记录）：
- Agnes 免费为官方「阶段性优惠」；收费后账号池降级为普通供应商卡（限流语义保留）
- pi-ai 目录外 model id 走宽松匹配或自定义 baseUrl；带真实 key 的 pi-ai 各供应商以用户自配为准（沙箱只验证了回退链与目录 API）
- art 艺术动画为 8 语法×8 色板首批（36 风格全量与 A3 指着改编辑器列 Phase 6 路线图）
- dev server 一次静默退出（无错误日志，疑沙箱资源回收），重启后全绿；非代码缺陷

## 2026-10-29 · Phase 6 落地：dsh 融合 + 指着改编辑器 + 文风学习 + BGM 合成（方案既定路线全闭环）

背景：Phase 4/5 收官后用户授权「依次高标准严格执行落地，全部完成后通知我」，本棒执行方案文档既定的 Phase 6（远期项提前兑现）：A3 宣传片风三方向创作流 + 指着改编辑器 + learn-theme 文风学习 + dsh 插件壳 + 作曲配乐务实版。研究底料：skill-pool/ 留存的 huashu-motion 完整 skill 包（director.md §4 三方向规范 / studio 指着改协议）与 wewrite 仓库（wewrite-learn exemplar 语义），dsh 双仓库经 codeload tarball 补齐（dsh-agnes-multimodal 完整：cordis.patch.yml + ctx.tools.register 形态）。

### 交付一 · 导演三方向提案（学 huashu-motion director §4）
- radar-rewrite.ts 新增 directionsMessages/parseDirections：LLM 产 3 方向（A·Fit 贴合 / B·Amplify 放大 / C·Unexpected 意外），差异约束在「语言与材质」非配色；恰好一个 depth 空间纵深方向；palette（accent/base/note）+ logline/why/feel；recommended 导演推荐标记
- storyboardMessages 支持方向注入（分镜 prompt 贯彻方向语言与节奏）；sceneSvg 调色板化（paletteFor：accent 派生场景卡主色/进度点/glow；浅色 base 自动回退深色底保文字可读——hexLuma 判定）
- actions 新增 storyboard-directions；storyboard 接受 direction；video-panel 三方向卡 UI（kind 徽章 + palette 色带 + logline/语言/节奏/为何适合 + 推荐⭐ + 空间纵深标记）→「按方向生成分镜」/「跳过方向直接分镜」双路径
- REAL 实测：B·空间纵深方向（#f97316 橙）→ 9 镜分镜携带 direction → v2 成片橙色主色生效（抽帧 orange-ish px=18）、方向名烙进场景卡品牌行

### 交付二 · 指着改编辑器（学 huashu-motion studio，Web 版）
- 渲染留存场景分段：public/assets/video-segs/{runId}/s{i}.mp4（v3 起生效；旧版本诚实报错「请先整体重新渲染一次」）
- reviseSceneVideo：LLM 修订被指分镜（sceneReviseMessages，严格只动该镜）→ 只重做该场景（TTS+段，motion/art 双线）→ 与留存分段 concat → video-{runId}-v{N}.mp4 新版本
- 版本树：meta.version（v1 起）+ revisions[]（sceneId/feedback/reason/at 跨版本继承）+ durations[]（场景边界，UI 定位用）；Asset 链即版本链
- video-panel：时间轴点击定位分镜 / 分镜卡「指着改这镜」/ 播放头按钮三入口 → 意见浮层（≤300 字）→ 版本 chips（v1 整片/v2+ ✎指着改）切换 + 改动历史列表
- REAL 实测：v2（48.3s，8 镜 durations 留痕）→ 指着改分镜 #3「字幕太长改短、口播更口语更狠」→ v3（48.2s）：仅 durations[2] 6.0→5.9s 其余 7 镜分毫不动；字幕「知情同意成形式」→「知情同意成摆设」；revision 留痕「缩短字幕并使口播更口语化、更具批判性」
- 全量回归再证：v4 版本号递增 + revisions 链 + 路径 -v 版本化

### 交付三 · BGM 本地合成（作曲配乐务实版，huashu-motion OM.sound 思路）
- BGM_RECIPES 三预设（aevalsrc 正弦合成 + tremolo/aecho/afade 链）：uplift 大三和弦垫 4Hz 律动 / tech 低频脉冲 / calm 纯五度长音——零曲库依赖无版权问题
- mixBgm：amix normalize=0（ffmpeg 7.1.5 实测支持）口播为主 BGM 垫底（0.18-0.24）；静音降级片 BGM 音量×2.4 提为主角；失败诚实回退无配乐留痕
- 渲染参数 bgm 四选（默认 none）；meta.bgm/bgmNote 留痕；UI 渲染控制加 BGM 下拉
- REAL 实测：v2 uplift 混音 volumedetect mean -23.1dB / max -2.9dB（真实出声）；回归 calm 混音 bgmNote 留痕

### 交付四 · 文风学习（学 wewrite exemplar 范文库）
- radar-learn.ts 新增 exemplarMessages/parseExemplar/exemplarPrompt：范文 → 6 维指纹（结构骨架/句式节奏/词汇偏好/修辞密度/语气人称/收尾习惯）；安全条款内置（allowed_uses 仅 style+structure，观点/句子/比喻/个人经历禁止复用——对齐 wewrite 语义）
- 存储：SettingKV style:exemplars（settings.ts exemplars 块 + AgentRun.exemplarId 字段 db push）；API /api/style-exemplars GET/POST/DELETE（边界：空名 400 / <200 字 400 / 删除不存在 404；Asset 留痕 role=style-exemplar）
- run-manager：exemplarId → 指纹 → draftMessages 注入 exemplarPrompt；studio-panel 文风校准下拉 + 「学习新文风」内联表单（粘贴范文 → 提炼）+ 档案删除
- REAL 实测：346 字「毒舌快评风」范文 → 指纹准确捕捉（设问开头/「但是/明明/非要」转折强调词/第二人称/反问收尾）→ 带校准流水线 REAL 出稿 1273 字符（问号 6 处、短段落密集渗透；无范文句子复用）

### 交付五 · dsh 插件壳（学 dsh-agnes-multimodal cordis 协议）
- download/dsh-plugin-radar/（+tgz）：package.json（dsh.bundle.patch + dsh.client.inject 声明）/ cordis.patch.yml（loader entry）/ lib/index.js（ctx.tools.register 双工具：radar_article 六步出稿 + radar_video 三方向→分镜→成片；waitForRun 轮询；富产物不回传模型的纯文本约定）/ lib/client.js（RadarRunCard 进度卡 + RadarVideoCard 播放器）/ README（安装/RADAR_BASE 配置/API 契约表）
- plugins-panel 加「dsh 插件形态」卡：双工具说明 + 安装命令 + 零密钥架构说明 + 诚实边界
- REAL 冒烟（mock cordis ctx + 真实平台）：apply() 双工具注册 ✓ → API 契约端到端（POST /api/runs 出稿 1442 字符 REAL → storyboard 8 镜 → render-video 受理）全通

### 质量基线与修复
- 沙箱根因实锤两则（此前「静默退出」之谜破案）：① next-server anon-rss 2.3GB 触发 OOM kill（dmesg 留证）→ NODE_OPTIONS max-old-space-size=1536；② 跨 Bash 调用的后台进程被清理 → scripts/with-server.sh 封装（启动+测试+清理同调用存活），全套验证脚本改走此模式
- 浏览器自动化三坑修复：Radix TabsTrigger 不渲染 data-value（改 [role=tab]）；element.click() 在 hydration 完成前不触发 React 合成事件（初始等 15s + Playwright 真实点击 find role click）；agent-browser eval 返回带 JSON 引号（比较前 tr -d '"'）
- 375px 溢出修复（存量漏网，v4 只查了主 Tab）：plugins-panel「grid lg:grid-cols-2 缺 base grid-cols-1」（第 11 处隐式轨道撑宽）+ 长英文 token（toolRegistry.register()/JSON-RPC/dsh 命令行）break-words/break-all + textarea max-w-full；修后插件中心/社区技能双内层 Tab 均 375

验证（全部通过，scripts/verify-p6-*.sh|py 可复跑）：
- API 全量 36 项断言全绿（verify-p6-full.sh）：基础面 9 端点 + settings exemplars + exemplars CRUD 边界（400/404 诚实）+ 三方向（kind 齐全/恰好一个 depth/palette hex 合法）+ 带方向分镜携带 direction + render-video(bgm) meta 六项留痕 + revise-scene 边界 + 指着改 REAL v4 版本递增 + revisions 链
- 文风学习全链路（verify-p6-exemplar.py）：指纹提炼质量高 → 范文库 → 带校准流水线 REAL → 渗透粗验证
- dsh 插件冒烟（verify-p6-plugin.sh）：工具注册 + API 契约端到端
- 浏览器（agent-browser）：创作台文风校准（VLM 复核：下拉+档案+学习按钮齐全）、三方向三卡（VLM 复核：色带/徽章/logline/双按钮）、成片卡（播放器+版本 chips v1-v4+指着改浮层+改动历史）、dsh 插件卡（双工具+安装命令）、375px 全 Tab scrollWidth=375、errors 零
- ESLint src/ 零错误零警告；tsc --noEmit 零错误
- 截图 9 张：download/assets/p6-{studio-exemplar,studio-learn-form,video-panel,directions,storyboard-direction,video-final,revise-modal,eco-dsh-plugin,mobile-375}.png

已知边界（诚实记录）：
- dsh 插件为骨架完整 v0.1.0：沙箱无 dsh 宿主未做宿主内联调（README 已注明；cordis API 细节如有差异按 agnes 插件同模式微调）
- 指着改仅支持本地双风格线（motion/art）；Agnes 通道修订场景将走 motion 兜底语义未暴露 UI 入口（通道为 agnes 时建议整片重渲）
- 作曲配乐为三预设合成垫（方案中「ABC 记谱完整作曲」仍列远期，工作量大收益边际）
- art 艺术动画 36 风格全量维持首批 8 语法×8 色板（方案 9.3 明示不现实）
- 指着改分段物料自 v3 渲染起留存；此前的旧成片需整体重渲一次才可指着改（UI 诚实提示）

## 2026-10-29 · 预览启动运维记录

- 容器于 08:30 重启后，Prisma Client 生成产物丢失（`@prisma/client did not initialize yet`），11 个 API 500
- 修复：`bun run db:generate`（6.19.2 重生成，首次因瞬时网络抖动失败，重试成功）+ `bun run db:push` 同步确认
- 复验：首页 + 11 个 GET 端点全 200，dev.log 零错误；agent-browser 实测四 Tab（情报中心/创作台/插件生态/设置中心）渲染与切换正常，图文/视频双线、7 人格、导演三方向、Agnes/pi-ai 供应商卡片均在线
- 截图：download/preview-home.png、download/preview-settings.png

## 2026-10-29 · 「演示状态」根因排查与防御性修复

**用户质疑**：为何全部显示演示状态，底层能力是否真实？

**排查结论（当场实测证据）**：
- LLM（zai-llm）：真实 ✓（实测 chat 返回真实文本；注册表 96 次调用 healthy）
- 生图（zai-image）：真实 ✓（实测生成 154KB PNG 落盘 public/assets/）
- TTS：真实 ✓（实测 68KB WAV，RIFF 头完整）
- ffmpeg 7.1.5：真实 ✓（本地编码）
- 元宝搜索：**降级演示** ✗ —— 根因：WSA_API_KEY 只存在未提交的 .env 中，今晨 08:30 容器重启被平台重置（.env 仅剩 DATABASE_URL），密钥永久丢失（git 历史与 DB 均无备份）；搜索是所有流水线第一步，故全链路产物带「演示」徽章
- Agnes/视频大模型/自定义 OpenAI：架构真实、等待用户在设置中心配置账号池与密钥

**防御性修复**（settings.ts）：新增 seedEnvKeysToDb()——env 密钥首次读取时沉淀入 SettingKV 并打 env:seeded 标记，DB 优先、用户清空不被覆盖；假密钥注入→重启→验证入库→清理→复验全过；tsc/ESLint 双零，首页+API 全 200

**待用户操作**：设置中心 → 模型服务 → AI 搜索，重新填入元宝 SearchPro API KEY（此次将落库，重启不再丢失）

## 2026-10-29 · API KEY 配置与全链路 REAL 复验

**用户提供**：元宝搜索 API KEY（KeyName: maple）→ PUT /api/settings 落库（provider:search，容器重启不丢）

**排障过程**：
- 首调报「SearchPro UnauthorizedOperation 未授权」→ 系统性对照测试定位：同一密钥「AI」成功、「具身智能 融资」失败 → 疑似查询内容触发；10 分钟后全部查询（含原失败词）稳定成功，Version=standard
- 结论：密钥刚创建时腾讯云后台分片传播未完成 + 偶发限速误报为「未授权」，非密钥或代码问题

**代码加固（双 Provider 重试容错）**：
- yuanbao-search.ts：UnauthorizedOperation/RequestLimitExceeded 间隔 1.2s 重试 ×2，避免流水线轻易降级 DEMO
- zai-image.ts：沙箱出口 WAF 偶发 405 拦截（阿里云 WAF HTML 报错页），间隔 2.5s 重试 ×2——重试后封面真实出图 101KB JPEG
- tsc/ESLint 双零

**端到端 REAL 复验（run cmvtd4gp8000ok8h12innv3ww）**：
- 检索：REAL，10 条真实信源（央广网/新华网/经济日报）
- 取证：4 条主张，2 条事实类带真实 URL 引证（CSDN 实测文）
- 成稿：1376 字 markdown + 6860 字符微信排版 HTML
- 封面：101KB JPEG（1344×768）真实落盘
- 早报：REAL（国产大模型崛起，8 条引用）
- UI 徽章全部由「演示」转「真实」；截图 download/real-mode-home.png

**Provider 终态**：yuanbao-search healthy(50 calls) / zai-llm healthy(100 calls) / zai-image healthy；Agnes 三通道待用户配置账号池

## 2026-10-29 · 「Unexpected token '<', "<!DOCTYPE"」错误修复

**用户报错**：设置中心操作报 `Unexpected token '<', "<!DOCTYPE "...`

**根因**：`/api/settings/test` 路由缺失（目录下只有 route.ts 与 models-json）——设置中心「测试连通」按钮 POST 该路径，Next.js 404 返回 **HTML 错误页**，前端 `res.json()` 把 HTML 当 JSON 解析 → 抛出该错误。属回归脚本未覆盖的端点缺口。

**修复**：
1. 新增 `src/app/api/settings/test/route.ts`：五 scope 真实连通测试——search（SearchPro 实查 10 条）/ llm（按 mode 分派真实 chat）/ image（真实出图+即测即删）/ agnes（单账号 probeAccount 或池 health）/ video（ffmpeg 版本或 agnes-video health）；统一返回 {ok, latencyMs, detail?, error?}
2. settings-panel.tsx 前端防御：res.ok 与 content-type 检查，HTML/非 JSON 响应转为可读错误文案

**验证**：API 五 scope 实测（search 222ms 10 条真实结果 / llm 334ms 回复「正常」/ image 73s 真实出图 41KB 含 WAF 重试穿透 / video ffmpeg 7.1.5 / agnes 如实报未启用）；浏览器端到端「测试连通」「真实查询一条」按钮均正常弹 toast；tsc/ESLint 双零；截图 download/settings-test-fixed.png

## 2026-10-29 · Agnes 探活失败排查（「连接失败：Agnes 未启用或账号池为空」）

**用户报错**：设置中心 Agnes 池填了 2 个账号密钥，点「全池探活」报「连接失败：Agnes 未启用或账号池为空」。

**根因（双因叠加，探活逻辑本身如实报错）**：
1. **密钥只存在于表单草稿、从未落库**——DB 直查 `provider:agnes`：`enabled=false, accounts=[]`。用户填完密钥直接点「全池探活」，没有先点「保存账号池」+「启用 Agnes 池」；后端只能看到旧状态（空池）→ 如实报错
2. **交互陷阱**：旧流程「探活」不保存表单，用户心智模型是「我填了密钥，点测试就该测它」——UI 与后端状态错位

**历史隐患连带修复（本次最重要的发现）**：`.gitignore` 第 49 行裸 `test` 规则静默忽略 `src/app/api/settings/test/` 目录——上一会话写盘验证通过、声称已提交，但 `git add` 被忽略规则吞掉，**该路由从未进入版本库**（`git log --all -- 该路径` 为空）。容器一旦重置文件即丢失，「Unexpected token '<'」必然复发。已收窄为 `/test`（连同 `/prompt`、`/local-*` 一并收窄到根路径，`git ls-files` 复核无已跟踪文件受影响）。

**修复**：
1. `.gitignore`：`test|prompt|local-*` → `/test|/prompt|/local-*`，test 路由正式入库
2. 后端探活改造（route.ts agnes scope）：
   - 有可用账号但池开关未开 → **也逐号 probeAccount**（启用前即可验密钥），报「X/Y 个账号密钥有效——池开关未开，点『启用 Agnes 池』后生效」
   - 空池 → 可操作指引文案（区分「完全没账号」vs「有账号但无密钥/全停用」）
3. 前端「先落库再探活」模式（settings-panel.tsx）：
   - 新增 `probeAgnes`/`probeScope`：探活前静默保存表单（密钥草稿落库），杜绝「UI 填了密钥、探活却说池为空」的错位；保存失败则中止探测
   - 推广到全部五个测试按钮（llm/search/image/video/agnes），杜绝「改了配置没保存、测到的还是旧配置」同类陷阱
   - save/saveAgnes/saveVideo 加 silent 参数 + 布尔返回；保存成功后清空密钥草稿（防旧草稿覆盖后续修改）
   - 修复单号测试结果渲染：`keyTest.results?.[0]?.detail`（字段不存在恒空）→ `keyTest.detail`；账号开关 chip 改状态语义「● 启用中 / ○ 已停用」+ title 提示
4. zai-llm 补 429 退避重试（2.5s/6s ×2，与 yuanbao-search/zai-image 同款加固）：连续跑全量回归会打满沙箱 AI 网关配额，旧实现直接抛错导致整条 run status=error

**验证**：
- API 实测三态：空池 → 指引文案；未启用+假密钥 → 逐号探活「0/1 密钥无效（401）」（147ms，沙箱→api.agnes-ai.cn 可达）
- 浏览器端到端复现用户场景（agent-browser）：添加账号→填密钥→「全池探活」→ 自动落库（DB: hasKey=true）→ 真实探测 401 反馈；enabled 保持 false（探活不替用户做启用决定）；截图 download/agnes-probe-fix.png / agnes-probe-e2e.png
- 回归：Agnes/视频/设置/pi-ai/搜索断言全绿；LLM 相关项因当日配额耗尽（前序会话 ~100 调用 + 本次连跑 3 遍全量回归）报 429——上游配额问题非代码缺陷，配额窗口恢复后 `bun scripts/full-regression.mjs` 可复跑
- tsc 0 错误 / eslint src/ 0 问题

## 2026-10-30 · GitHub 发布准备：密钥全历史清洗（含 db 误删事故与恢复）

**背景**：用户要求推送 GitHub。推送前安全体检发现三类风险，全部处置完毕。

**识别的泄露风险（推送即泄露，幸而仓库从未有 remote）**：
1. `.env` 被 git 跟踪——历史两个提交含真实密钥 `sk-9aae...`（`.gitignore` 的 `.env*` 规则只对未跟踪文件生效，历史跟踪绕过了它）
2. `db/custom.db` 被跟踪——`SettingKV` 表存 4 个供应商密钥配置，历史 blob 含 `ey...` 密钥串
3. `skill-pool/`（910 文件第三方工作区，grep 确认无运行时引用）与 `tool-results/`（临时产物）令仓库臃肿

**清洗（scripts/github-secret-cleanup.sh 落盘可复用）**：
- `git filter-repo --invert-paths` 全历史移除四路径 + `reflog expire` + `gc --prune=now --aggressive` 物理回收旧 blob
- 15 commits 全部重写（旧 hash 全部失效，映射见 `.git/filter-repo/commit-map`；此前 worklog 中的 53f0dcb 等旧 hash 引用即对应新历史）
- 仓库从 1100+ 跟踪文件瘦身至 402 个（43.71 MiB）
- 双重验证全绿：`git log --all -- .env db/custom.db skill-pool tool-results` 零输出；全历史 `git grep sk-9aae` 零残留
- `.gitignore` 增补：`!.env.example` 白名单、`/db/*.db`、`/db/*.db-journal`、`*.pid`、`/skill-pool/`、`/tool-results/`

**⚠️ 事故：db 误删与恢复（如实留痕）**：
- 经过：filter-repo checkout 将 db/ 目录一并移除；脚本恢复步骤的 `cp ... || true` 因目录不存在静默失败，末尾又删除备份——`db/custom.db` 文件层面丢失
- 损失评估：真实 Agnes 密钥从未入库（用户尚未填写）；z-ai 系密钥为沙箱注入；业务数据均为测试期 AI 生成——**无不可再生的用户数据**
- 恢复：`prisma db push` 重建 14 张表；dev server 冷启动验证首页 200（42ms）、`/api/settings` 自动回落代码 DEFAULTS（builtin 模式 + 沙箱密钥）——平台功能零损失
- 脚本 bug 已修：恢复步骤前补 `mkdir -p` + 恢复失败显式报警（防后人复用踩坑）
- 待用户重配两处：风格写作范文（`style:exemplars` 空数组，设置中心 UI 重贴）；Agnes 真实密钥（本就待填）

**项目命名（占用核查后定稿）**：
- 排除 `ai-news-radar`：LearnPrompt 同名仓库 1.7K stars 且定位重叠（24h AI 资讯雷达），必被淹没
- 排除 `trendforge` 系（TrendForge-AI- / trend-forge / TrendForge Labs 全被占）与 `newsmith`（Roblox 同名游戏 27 万评分 + 英国公司商标噪音）
- **定稿 `radarforge`**：radar（元宝 SearchPro 情报雷达）+ forge（图文/视频双生产线锻造）；全网搜索无同名项目；仓库描述与 topics 见 README

**本次交付**：README.md（GitHub 门面）+ LICENSE（MIT）+ db/.gitkeep + 清洗脚本修复入库

**推送波折（如实留痕）**：
1. 首推遇 TLS 中断（GnuTLS -110，43.7 MiB 大包上传典型问题）——`http.version=HTTP/1.1` + 524 MB postBuffer 解决
2. **再推被 GitHub secret scanning 拦截**：清洗脚本第 59 行硬编码了真实密钥前缀 `sk-9aae***（17 位前缀，已从代码与日志抹除）` 作为定点校验目标——"检测密钥的代码自己成了密钥"。讽刺的是本地终检正则 `sk-[a-zA-Z0-9]{20}`（要求 20 位）门槛高于 GitHub 的 16 位判定，漏过了它。修复：改通用密钥特征正则（sk-/ghp_/github_pat_/AKIA/xox/AIza 全家桶），并移除"排除脚本自身"的侥幸过滤
3. worklog 中 `sk-9aae...`（4 字符缩写）低于检测阈值，保留作事实记录

## 2026-10-30 · GitHub 推送落地（密钥拦截 ×2 + 网络重试）

**推送三波折（如实留痕，作为"清洗不彻底"的活教材）**：
1. **第一次拦截（OpenAI 密钥）**：清洗脚本硬编码真实密钥前缀做定点校验——已修复（详见上节）
2. **第二次拦截（腾讯云 SecretId）**：早期 worklog 记录过用户提供的完整 SecretId（`AKIDBg7M` 前缀，现存于 327ce5d~1890428 四个历史提交的 worklog.md:34；当前版本早已改写掉，仅历史残留）。首次报错被管道 grep 过滤截断只看到尾部，误以为只有一个密钥——教训：**推送被拒必须看全量报错**。修复：提取完整密钥至规则文件（不回显）→ `git filter-repo --replace-text` 内容级替换为 `***REDACTED-TENCENT-SECRETID***` → 同提交无 32 位 SecretKey 伴生（已验证）
3. **网络**：HTTP/2 大包上传遇 GnuTLS TLS 中断；`http.version=HTTP/1.1` + 524MB postBuffer 稳定穿透；后台分离进程（setsid）推送规避工具超时

**终极验证**：全历史 × 全密钥家族超级扫描（AKID/sk-/sk_live/ghp_/github_pat_/AKIA/xox/AIza/PRIVATE KEY）零残留；两枚历史密钥（OpenAI sk-、腾讯云 AKID）均已从全部 16 个提交中物理清除，且当事密钥本身应视为已泄露作废

**推送最终落地（分块方案）**：后台分离进程在会话回收时被杀（沙箱特性：会话结束进程不保）。最终方案 `scripts/push-retry.sh`（幂等可重跑）：按提交前缀分 3 块（≈5 MiB / 33 MiB 引擎大块 / ≈13 MiB），每块独立连接 + 限时重试 + 奇偶交替 postBuffer（500MB 单 POST / 8MB 分块传输）。chunk1 第 2 次尝试成功、chunk2 与 final 一次通过——远端 main 与本地 HEAD 一致，全部 17 个提交落地。后续日常推送均为小增量，若再遇 TLS 中断可复用该脚本

## 2026-10-30 · 双语 README + 全面测试排障（y4 引擎陷阱修复）

**任务**：① 补英文 README ② 全面测试找 bug 与优化点。

**测试矩阵与结果**：
- 静态门禁：tsc 0 错误 / eslint src/ 0 问题 ✅
- 全量回归：进程在流水线轮询阶段静默死亡（无报错栈，疑似与浏览器+dev server 并行的资源压力；其余断言手动接力补齐）——Agnes 池语义/密钥脱敏/pi-ai 回退/18 主题注册全绿；搜索 REAL ❌（见 Bug#1）
- 浏览器 E2E：四 Tab 走查零 console 错误/零 page error ✅
- 边界攻击：空 query/非法 scope/非法 action 均 400 防御 ✅；超长 query 不炸（已加钳制）

**Bug 清单**：
1. **搜索静默降级 DEMO（数据层，用户侧待恢复）**：GitHub 清洗事故丢失 DB 内 SearchPro 密钥 → yuanbao-search isConfigured=false → demo-search 兜底。平台行为诚实（mode=DEMO 标记），但 UI 此前只有 9px 小徽章。**修复**：情报中心搜索结果上方新增醒目 amber 警告横幅（说明演示数据性质 + 指引到设置中心填密钥）。根因恢复需用户在设置中心重填 SearchPro 密钥（密钥无法从被物理清除的 git 对象中恢复）
2. **y4_storytime 语法陷阱（致命，已修复验证）**：art 线第 6/8 分镜整线报废。根因：y4 需 AI 生角色帧（data.character.frames），管线从不生帧，但 GRAMMAR_CHEATSHEET 仍向 LLM 广告 y4"适合叙事段"——LLM 选中即必炸。**三层修复**：L1 速查表移除 y4 + 提示词显式禁选；L2 VALID_GRAMMARS 白名单摘除（漏网输出被拒→场景回落安全默认）；L3 渲染前 grammar===y4 强制改写 t2_keynote_ui（双保险）。修复后 art 线 9/9 分镜全部完成（67.1s 成片）
3. **boot 错误诊断信息丢失（已修复）**：clip.js 的 fail() 把消息写进 `__bootFailed`（字符串），art-engine.ts 却读不存在的 `__bootError` → 永远只报"引擎启动失败"。改为 `String(window.__bootError || window.__bootFailed || '')`。诊断工具 `scripts/repro-art-boot.mjs` 入库（8 语法逐个 boot 探测，可复用）
4. **硬化：搜索 query 钳制 200 字符**（超长串会被真实供应商拒绝）

**验证补齐（手动接力）**：retheme sspai/radar 兼容映射、storyboard 8 分镜、cover 生成（90KB）、art 线 v3 成片（HEAD 200 video/mp4）、motion 线 v4 成片、publish 三级降级（level 2 粘贴加固）、DEMO 横幅浏览器实测渲染 ✅

## 2026-10-30 · y4 帧库全量启用 + 多平台导出中心 + 视频版本号修复

**任务**：① y4 故事帧库用 zai-image 生帧后真正启用（8 语法全量可用）② GET 路由补 try-catch ③ 搜索密钥 maple 落库 ④ 图文生成后可切换模板预览 + 复制 MD + 复制公众号格式 + 扩展更多平台格式。

**一、y4 角色帧库（11 帧，zai-image 生成）**：
- 基础帧 rest 文生图（浅蓝紫小机器人·橙色围巾·深藏青描边·扁平矢量风）→ VLM 查出脚下投影 → 图生图去投影复验
- 10 张衍生帧全部从 rest 图生图编辑（保证角色一致）：rest_open/talk/talk_open/point/point_open/shrug/type/stiff/react/back；VLM 逐帧质检（纯白底/无投影/全身完整/姿势正确）+ back 帧单独确认是背面视图
- 后处理管线 scripts/process-y4-frames.py：边缘泛洪去白底（哨兵色法）→ numpy 建 alpha（**坑：PixelAccess 赋整数 255 会被按字节打包成错误 RGB，曾致 alpha 全错**）→ MinFilter 收缩 1px 去白边 → **脚锚居中**（自底向上找首个 ≥20px 跨度接触行取中点——bbox 中心会被举臂姿势带偏，8 行均值会被大腿污染）→ 高度统一 1024
- 程序化终检 11/11：四角透明 / 脚贴底行 / 脚中心偏差 <0.8%

**二、y4 管线接入（解除上棒的三层封禁）**：
- L1 速查表恢复 y4 条目（含 insert/react/highlight cue 用法说明）+ 规则改为「勿写 data.character（管线自动注入）」
- L2 VALID_GRAMMARS 白名单恢复 y4_storytime
- L3 video.ts 双保险移除，改为 grammar===y4 时注入 `character: { frames: Y4_CHARACTER_FRAMES }`（art-engine.ts 导出注册表）；整片渲染线与指着改线两处都注入
- 新增单分镜兜底：引擎失败（如帧库资产缺失）→ 该分镜回落 t2_keynote_ui 文字卡，不整片报废
- **E2E 三级验证**：① renderArtClip 7s MP4（5 种 cue 全覆盖）+ 4 静帧 VLM 验证（房间+气泡/举指/反应特写+汗滴+问号/插入镜头+代码墙+计数器+后脑勺前景）② 管线级：叙事型分镜 art 渲整片 24s，LLM 自主选 y4（分镜 3/6、6/6 均为 y4_storytime），成片抽 3 帧 VLM 确认机器人在画面且无破损 ③ HEAD 200 video/mp4

**三、多平台发布中心（用户核心诉求）**：
- 新引擎 `src/lib/publish/platforms.ts`：块级解析一次 → 5 平台 Formatter——wechat（复用 18 主题管线）/ markdown（原文+脚注）/ zhihu（标准标签+文末外链参考）/ xiaohongshu（纯文本+◆小标题+话题标签，超 1000 字警告）/ toutiao（大字号版式）；[n] claims 标记各平台差异化处理（上标/脚注/剥离）
- 后端 action `export`：theme 参数仅预览不落库（与 retheme 持久化分离）；Asset 留痕 export-{platform}
- 前端 run-detail 重构：旧主题画廊移出动作栏 → 新「多平台发布中心」卡（5 平台 tab + 18 主题 chip 选中即预览 + html→iframe / text→等宽 pre + 一键复制 + 平台提示）
- 浏览器 E2E：5 tab 切换 / bauhaus chip 即时预览（iframe 更新+应用按钮出现）/ 小红书文本预览+话题标签 / 零 console error；VLM 确认布局无重叠溢出
- 回归断言 7/7：5 平台导出格式探针 + 主题预览不落库 + 非法平台 400

**四、GET 路由 try-catch 加固**：runs/[id] / agent/runs/[id] / agent/skills / gateway/providers / mcp 共 5 个（用户估 6，实测 5，全量复扫归零）

**五、搜索密钥 maple 落库**（scripts/set-search-key.mjs，密钥走环境变量不落盘）：落库后立即探活报 UnauthorizedOperation（腾讯云新密钥分片传播延迟，与上棒结论一致）——**数分钟后自然恢复**：全量回归「搜索 REAL 且有结果 mode=REAL n=10」✅。教训：新密钥 Unauthorized ≠ 密钥无效，等传播即可

**六、连带发现的视频版本号 bug（Phase 6 潜伏）**：
- 症状：全新 run 首次渲染恒为 v2（video-<runId>-v2.mp4），回归「art 成片可访问」断言（HEAD 无后缀路径）挂
- 根因：action 路由先创建 video-final Asset（meta 无 version 字段→按 v1 计）→ renderVideo 再查 latestVideoVersion 把自己数进去 → +1 = 2
- 修复：latestVideoVersion(runId, excludeAssetId) 排除自身；渲染线与指着改线两处调用点都传入 assetId
- 验证：全新 run 首渲 version=1（无后缀路径），回归「art 成片可访问 video/mp4 1.8MB」✅

**七、全量回归**（LLM 配额窗口恢复后补跑昨日欠账）：36+7 项全绿——六步流水线 REAL / art+motion 双成片 / 发布三级降级 / Agnes 池语义 / pi-ai 回退 / 18 主题 / 多平台导出；HTTP 面零 5xx。tsc/eslint 双零

**本轮交付文件**：public/engine/art-motion/lib/frames/（11 帧引擎资产 6.4MB）+ platforms.ts + 8 个 scripts（帧库生成/处理/验证/导出回归）+ .gitignore 增补（y4 原始帧/运行时视频封面/download 不入库）

---
Task ID: product-deep-dive（产品深化方案 + P0 快赢落地）
Agent: 主 Agent（Z.ai）
Task: 用户六问（纯图线/图文质量根因/视频线解耦与双轨/交互优化/顶尖质量方法论/拓展空间）→ 调研 + 深化方案 + 全部落地（方案文档 + P0 快赢代码）

Work Log:
- 调研双线并行：开源工程（TrendPublish/GPT-Researcher/linyuebanzi/guizang/MoneyPrinterTurbo/Revideo/doocs-md/NewsNow/RSSHub/WeWe RSS 等，产出 Top 8 可抄清单）+ 论文方法（STORM 2402.14207/Co-STORM/Self-Refine/Reflexion/DOC/FActScore/SAFE/G-Eval/DSPy，产出 ROI Top 6）
- 代码诊断三根因：①管线只生成封面且从未插入正文 + 三个渲染器均无图片块（render.ts/platforms.ts 块解析）②claims「假命中」（取第一条长结果就算核实，引用可信度塌方）③初稿单遍生成（无大纲/无分节/同模型自审）
- P0-A 正文配图落地：zai-image 重构 generateImage(slug+尺寸白名单 1344x768/864x1152/1024x1024，修同 run 多图覆盖 bug) → radar-image skill（插图规划 prompt：锚定小节标题/图提供文字之外信息量/禁生成文字 + findHeadingIndex 先验锚点）→ 流水线六步→七步（illustrate 步骤：规划→先验→生成→回插 markdown→更新 article/output）→ render.ts figure+figcaption 渲染 → platforms.ts img 块（知乎/头条 figure、小红书图注占位、wechat/markdown 含图提示）
- P0-A2 claims 真相关性匹配：CJK bigram + 拉丁词 tokenize（中文无空格，词级 token 整句一词导致重合度恒 0——首轮回归 4 个导出断言当场暴露），重合度≥2 才核实；离线用例相关 5~9/无关 0（scripts/test-claim-match.mjs）
- P0-B 纯图线落地：run kind=image 两步流水线（plan 构图方案 LLM → gen 批量生图逐张降级留痕）/api/image-runs + image-panel.tsx（3 用途×5 风格×1~9 张、画廊下载/打开/复制 MD、3s 轮询）+ 创作台三 Tab
- 上轮收尾核实：多平台导出前后端与 GET 路由 try-catch 均已在 1919212 提交完成（重扫归零）；y4 静帧 VLM 终检通过（房间+气泡「炸了三件事」/举手「跑分碾压」/反应汗滴/插入 383 行计数器，无渲染破损）
- 回归：主段 40+ 项全绿（七步 done、illustrate 3/3 插图回插+figure 渲染、纯图线 E2E 画廊+静态可访问、5 平台导出、主题预览隔离、零 5xx）；视频段 regression-video-only.mjs（last-storyboard 直出）art 50s done + motion 59s done；tsc/eslint 双零
- 环境坑（重要）：跨 Bash 调用后台 setsid 进程会存活（with-server EADDRINUSE 实锤）+ SQLite journal_mode=delete 下服务器被杀的落盘时机 → 运行时 DB 业务表被清空（integrity ok、可写、代码无关：回归期间断言均实时读库通过）。处置：回归拆段各自带 server（REG_SKIP_VIDEO 开关 + runId 落盘）、视频段改用 last-storyboard 直出；运行数据可再生，不影响提交
- 交付 docs/product-deep-dive.md（~1.4 万字：六问逐项深答/五层质量金字塔/目标架构 Mermaid/三个月 P0-P1-P2 路线图/轻量战略小结/参考清单附录）

Stage Summary:
- 本轮代码：图文线七步（含正文配图）、纯图线全链路、claims 关键词重合度、5 渲染器图片块
- 本轮文档：docs/product-deep-dive.md（产品深化方案，Markdown 入库随 git 走）
- 质量证据：主段 40+ 断言 + 视频段 + VLM 终检 + tsc/eslint 双零
- 待办（P0 起步项）：大纲先行管线、分节生成+跨家族审稿、原子断言核验、固定评测集、视频线选题直出（详见方案第 5 章路线图）

---
Task ID: p0-quality-pipeline（P0 质量翻身仗：评测集 + 大纲先行管线 + 视频选题直出）
Agent: 主 Agent（Z.ai）
Task: 按产品深化方案 P0 路线图开工并全部落地——固定评测集（50 题 + G-Eval 量表 + 质量门禁）、大纲先行管线（大纲 JSON → 分节生成 → 跨家族审稿 ≤2 轮 → 原子断言核验）、视频线选题直出（解耦图文线）

Work Log:
- 环境修复（沙箱回收善后）：prisma 引擎二进制随 ~/.cache 被清 → 手动下载 schema-engine/libquery_engine（binaries.prisma.sh 慢链路超时，长超时分块拉取后按 fetch-engine 缓存命名规则落位：裸名 + 纯哈希 .sha256，踩了两坑：sha256 文件必须只存裸哈希、libquery-engine 缓存名不带平台后缀）→ generate 恢复 → db push 重建业务表；运行时数据可再生，代码无损
- 环境事实：搜索密钥随 DB 清空丢失（密钥只存 DB/env，永不入库）→ 搜索诚实降级 DEMO；重播一条命令即可恢复（scripts/set-search-key.mjs）
- P0-1 固定评测集：eval-topics.ts（50 题 × 10 类，persona/theme 固定保证同题同配置可回归）+ eval.ts（G-Eval 式五维量表：评分锚点 9/8/7/6 分层 + 反偏差指令「不聚 7 不偏长文」+ 裁判跨家族优先）+ /api/eval（GET 题库/最近评分 + POST score）+ scripts/eval-set.mjs（跑题→等终态→评分→汇总五维均分/门禁率/断言统计→报告 JSON 落 download/）+ Asset(role=eval-score) 留痕
- P0-2 大纲先行管线（七步→九步）：①outline 步骤（radar-outline.ts：JSON 大纲每节论点/证据编号/配图位/字数预算；失败降级回老单遍管线）②draft 改分节生成（sectionMessages 逐节聚焦 + writtenSoFar 上下文衔接 + assembleDraft 归一 ## 层级）③review 改跨家族（gateway 增 chatVia 指定 provider 直调 + pickCrossFamilyReviewer 换家族裁判，无第二家族时同家族如实留痕）+ ≤2 轮修订上限（防过度修改漂移）+ pairwiseMessages 成对比较交换位置裁决（v1 A=原/B=修、v2 反向，修订稿胜场多才采纳——防越改越差）④verify 原子断言步（radar-verify.ts：FActScore 式拆 10~20 条原子事实断言→逐条检索 bestMatch 核验→无据率>30% 置 gateBlocked；DEMO 搜索诚实跳过）⑤claims/断言共用 matching.ts（tokenize CJK bigram+拉丁词、bestMatch、MIN_HITS=2）⑥断言落 Claim 表 kind=ASSERT idx=0（不进脚注渲染，UI 走 artifacts 断言卡）
- 发布门禁：actions 路由 publish 前置三查（无审稿记录/审稿均分<7.0/断言无据率>30% → 400 + reasons；force 可强发自担风险）；run-detail 发布按钮改双态（拦截面板 + 「仍要发布」）
- P0-3 视频线选题直出：video-runs.ts（run kind=video 三步：research 检索摘要落 artifacts → directions 导演三方向 → status=blocked 等用户选向 → generateDirectStoryboard 同步出分镜 + output 落 markdown 脚本）+ radar-rewrite.ts 增 storyboardDirectMessages/directionsDirectMessages（事实只能来自检索摘要、DEMO 数据不带具体数字的诚实条款）+ /api/video-runs（GET 列表 + POST 创建/storyboard）+ video-panel 增源模式切换（从图文成稿/选题直出）+ 三方向卡与分镜渲染控件复用（渲染/指着改/版本树挂 video run）
- UI 九步适配：run-detail STEP_LABELS 九项 + grid-cols-9 + 大纲卡（节标题/证据编号/配图位徽章）+ 断言卡（无据率进度条 + 逐条 ✅/❌ + 来源链接）+ studio-panel/page 文案
- gateway 429 长退避：chatRetry 纳入 429/too many requests 到 TRANSIENT + 15s/30s 长退避（配额按窗口结算，密集分节调用会触顶；配合 provider 内部短退避）
- 回归升级：full-regression 九步断言（outline 产物/分节对齐/审稿留痕 rounds+pairwise/断言统计与 ASSERT 账本/DEMO 诚实跳过）+ G-Eval 评分与题库断言 + 视频直出 E2E（blocked→分镜→done）+ 发布门禁双态断言（放行或拦截+force 强发）+ 搜索 DEMO 容忍；test-claim-match 离线用例不动全过
- 回归与验证：主段 55 项断言全绿 0 失败零 5xx（九步 done：大纲 5 节/分节 5/5 对齐/审稿 R1:8.2 一轮通过/断言 DEMO 诚实跳过/配图 3 张降级留痕/排版 6995 字符）+ G-Eval 评分 8.3 门禁 PASS + 视频直出 E2E（blocked→7 镜 60s→done）+ 5 平台导出（mode 感知探针）；视频段 art 50s/0.8MB + motion 59s/1280×720 双成片 done；评测集试跑 4 题（m01 8.3/m02 8.2/m03 8.2/m05 8.3，门禁 100%，报告落 download/ + 基线文档入库 docs/eval-baseline-2026-10-30.md）；agent-browser 端到端：九列步骤条/大纲卡/断言标签/门禁按钮全渲染 + 直出 UI 全链 + console 零错误
- 诚实性修复两处（回归当场暴露）：①跨家族裁判标签——pi-ai 假就绪（回归早段写入的 dummy key）→ 裁判调用失败回退 zai-llm 但仍标「跨家族」→ 改为回退后如实改标「同家族」；②导出探针 mode 感知——DEMO 搜索无已核实 claims 时 markdown/zhihu/小红书/头条的来源类探针必然落空 → 放宽为 REAL 模式才断言来源行为
- 鲁棒性修复两处：①brief 三档温度（0.4/0.2/0.3）+ 空返回重试（m01 首跑两档均空/畸形返回失败）；②评测运行器题间节拍 75s + 失败题等 100s 二次重试 + 评分 429 等 90s 重试（用户级 10 分钟 30 次限流实锤：管线连跑 3 题必撞）
- 视频段回归脚本改造：建 run 行从 POST /api/runs 改为 Prisma 直插——否则九步管线后台连跑与视频渲染抢 LLM 配额
- 平台配额工程事实（重要）：内置引擎按 chat 计日 300 次（北京时间零点重置，x-ratelimit-limit-daily 头可查）+ 用户级 10 分钟 30 次；本轮 14:36-24:00 全程 429 即前轮回归耗尽日配额，零点后恢复；评测集全量 50 题需分 5 次跑（scripts/quota-wait.mjs 可等窗口）
- 平台生图端点 405（阿里云网关页，全尺寸同症状）：配图/封面/纯图线全部诚实降级留痕，非代码问题；配图恰当率指标待端点恢复重测
- 沙箱回收善后两件：prisma 引擎缓存（~/.cache/prisma）随回收清空 → 手动下载二进制按 fetch-engine 命名规则落位（踩坑：.sha256 必须只存裸哈希；libquery-engine 缓存名不带平台后缀）；搜索密钥随 DB 清空 → DEMO 降级，重播一条命令恢复

Stage Summary:
- 本轮代码：P0 全部五项 + 解耦（九步管线/评测集三件套/发布门禁/视频直出/429 长退避）
- 本轮文档：README 核心能力更新、方案附录 D（改动清单+回归证据）、评测基线报告入库
- 质量证据：主段 55 断言全绿 + 视频双成片 + 评测 4 题 8.25 均分门禁 100% + 浏览器 E2E + tsc/eslint 双零
- 待办（用户侧）：①重播搜索密钥后跑全量 50 题基线 + 断言核验指标生效（SEARCH_KEY=xxx bun scripts/set-search-key.mjs）②配置第二 LLM 家族启用真跨家族裁判 ③生图端点恢复后重测配图恰当率 ④git push 需新令牌

---
## 2026-10-31 · P1 执行（第 5-8 周路线图）

### p11 纯图线 2.0 + p12 视频混合通道（上棒中断续完）

**背景**：上棒会话在 p11/p12 核心代码落地途中被沙箱回收（工作区被 amend 进 UUID 提交 6c7b018，~935 行无 worklog）。本棒核实代码本体完整（tsc 零错；「const ode,」为 Bash 工具 ANSI 转义显示假象，文件无损），补齐 UI 暴露 + 回归验证 + 留痕。

**p11 纯图线 2.0（版式骨架 + VLM 质检闭环）**：
- `card-engine.ts`：Editorial（杂志衬线）/Swiss（瑞士网格）两版系 × 封面/金句/数据三模板 × 4 色板/版系；纯函数 `cardHtml`（XSS 转义 + 超长硬截断 clamp）+ Playwright `renderCardToAsset`（字体就绪等待 + 产物 ≥5KB 校验），文件名与生图线同规约
- `radar-image.ts` 增 `cardPlanMessages`（生图前清单自检：模板字段约束/禁编数字/同组递进/语气克制）+ `parseCardPlan` 宽容解析（非法模板/版系回退、metrics 裁剪）
- `run-manager.ts` image run 双模式：mode=gen（zai-image + VLM 读回复核，未过带 retryHint 重试一次）｜mode=layout（代码排版渲染，未过截短文案重渲一次——版式卡失败主因是文字溢出）；VLM 不可达诚实标「未质检」不阻断；质检统计落 artifacts.vlm，逐张留痕落 Asset meta.vlm
- `vlm.ts`（gateway）：glm-4.5v 读回判定（4 项清单：画面完整/文字健康/主题相关/构图质量），429 退避一次，绝不 throw
- API/前端：POST /api/image-runs 增 mode/family；GET 增 families/templates 注册表；image-panel 双模式切换（violet 主色区分）+ 版系锁定下拉
- 离线回归 `scripts/test-card-engine.mjs`：**33/33 全绿**（HTML 纯函数 19 探针含 XSS 转义/硬截断 + 渲染全组合 2 版系×3 模板×2 尺寸 12 张 PNG 头/尺寸/非空白 + slug 净化规约）
- VLM 闭环探针 `scripts/probe-vlm-loop.mjs`：真实调用 done:true pass:true ✅

**p12 视频混合通道（code 主轨 + model 插播）**：
- 分镜协议：StoryboardScene 增 `render?: "code" | "model"`（两条 storyboard 提示词均要求逐镜标注：数据/字排/对比→code，实景/情绪→model，code 应占大多数）；parseStoryboard 缺省补 code
- `video.ts` 通道 D：hybrid 分发（render=model 且 Agnes 可用 → agnesSceneToMp4 5~12s 插播，失败单镜回落代码动画；render=code → motion 场景卡/art 引擎）；model 镜头时长钳制 5~10s；codeScenes/modelScenes 统计 + 完成时算模型秒数占比；provider 留痕 `hybrid(Ncode+Mmodel)+tts`
- API：actions 路由 channel 白名单增 hybrid，启动消息含分镜统计
- UI 补齐（本棒）：video-panel 混合通道卡（Blend 图标 + 分镜 model 数徽章 + Agnes 未配置诚实提示）/run-detail 通道 chip 增「混合」+ 解释文案 + 成片徽章配比/settings-panel 四通道（2×2 网格）+ 顶部状态徽章；VideoMeta 增 codeScenes/modelScenes
- settings.ts：VideoSettings.channel 类型增 hybrid

**回归断言新增**（full-regression + video-only）：
- 分镜 render 字段全覆盖断言（图文线分镜 + 直出分镜）
- 6d 版式卡 E2E：family 锁定 → 两步流水线 → provider=card-engine → VLM 留痕（meta.vlm + artifacts.vlm）→ PNG 静态可访问 → 画廊 markdown
- 7c/video-only 混合通道 E2E：channel=hybrid 渲染 → 终态 done + codeScenes+modelScenes=分镜总数 → provider 配比留痕

---
## 2026-10-31 · P1 第三批（p13 交互三件套 · 方案 §3.4 五抓手全落地）

### p13-1 三步向导（新手动线）+ 高级模式
- `src/components/wizard.tsx`（新建）：选题 → 人格与风格（7 人格可视化卡片 + 18 主题分类墙 + 文风档案）→ 确认（brief 要点预览 + 九步预告卡）三步；每步带「下一步会发生什么」预期文案（预览即所得心智）；选题池直达 chips
- `studio-panel.tsx`：向导/高级模式切换器（偏好 localStorage 持久化）；高级模式保留原直达表单（老手动线）；start() 收敛为 payload 参数化（两条动线共用）

### p13-2 ⌘K 命令面板
- `src/components/command-palette.tsx`（新建，cmdk）：新图文/新视频/新图组/生成早报 + 四主区导航 + 最近 Run 直达（懒加载）
- `page.tsx`：全局 ⌘K/Ctrl+K 开合 + ⌘1/2/3 三产线直达；header ⌘K 按钮
- 联动改为页面层 props（wizardFocus 自增 / jumpRunId），弃 window 事件（Turbopack 首编译时序不可靠——实测 120ms 延迟派发会丢事件）

### p13-3 指着改图文（选段重写 + 文章版本树）
- `radar-rewrite.ts`：`splitMarkdownSections`（## 分节，前言为第 0 节）/ `sectionRewriteMessages`（前后节摘要上下文 + 铁律：[n] 保留、篇幅 ±30%、禁新事实）/ `normalizeSectionRewrite`（代码围栏与客套行剥离、丢标题补回、>2 个 ## 判全文输出拒绝返空、空输入先判空）
- actions 路由 `rewrite-section`：选段 → 两档温度重写 → relayout 存 v+1 → diff 喂飞轮（与 edit 同链路）
- `md-view.tsx`：`SectionedMdView` 分节容器（group-hover 高亮 + 浮动「指着改」按钮）
- `run-detail.tsx` 成稿卡：版本树选择器（v0..vN，历史版本只读 + 作用域提示）+ 指着改反馈面板（AI 重写本节/取消）

### p13-4 运行前馈
- run-detail 九步进度卡：brief 已定且初稿未完时展示「核心判断 + 写给谁 + 大纲节标题 chips」（数据全在 artifacts，零额外请求）——4 分钟等待有内容可看

### p13-5 Run 详情信息重排（稿优先）
- 单列主体：动作栏 → 成稿（版本树+指着改）→ 改写结果 → 视频分镜/成片 → 多平台发布中心 → 封面
- 证据链（brief/大纲/断言/claims/审稿/飞轮）折叠进文末「为什么这样写」Collapsible 抽屉：运行中自动展开（配合前馈）、完成态折叠（稿优先）；与可溯源卖点对齐
- 重排手术用行级 python 脚本（`scripts/restructure_run_detail.py`，幂等防呆）完成大块 JSX 迁移

### 质量证据
- 离线单测 `scripts/test-section-rewrite.mjs`：28/28（分节 8 + 归一化 10 + 提示词 10）
- 浏览器 E2E `scripts/verify-p13-browser.sh`（agent-browser + 合成 run 注入）：34/34 全绿（向导三步/高级模式/⌘K 面板与跳转/稿优先行序/抽屉折叠展开/指着改 hover+面板/版本树只读/console 零错误）
- 在线回归 `scripts/regression-p13.mjs`：18/18（真 LLM 选段重写两轮：v0→v1→v2 连续累加、未选中节原文保留、[1] 引用保留、越界 400、飞轮规则提炼 3 条）
- tsc / eslint 双零
- 踩坑留痕：①agent-browser `find text` 会命中被对话框遮挡的背景同名元素（看板 run 卡）→ 面板项须 `find role option`；②opacity-0 的 hover 按钮直接 click 报「被覆盖」→ 先 hover 分节再按快照 ref 点击；③快照 -i 不含非交互文本（label/正文）→ 文本断言用 read

---
## 2026-10-31 · P1 第四批（p14 RSS 信源 + SimHash 去重）

### 数据层
- Prisma 新模型：`SourceFeed`（url 唯一 / active / lastFetchedAt / lastStatus(ok|error|pending) / lastError 人话化 / lastItemCount）+ `FeedItem`（feedId+guid 唯一约束 / simhash 索引 / status new|promoted|skipped / ideaId 转选题回填溯源）→ db push

### 信源引擎（src/lib/sources/）
- `simhash.ts`：64-bit 双 32 位半字 SimHash（FNV-1a 双种子），token 复用 matching.ts 的 CJK bigram + 拉丁词分词器（与 claims 匹配同一语言学假设）；海明距离 ≤3 判转载重复（学 TrendRadar）
- `rss.ts`：①零依赖宽容正则解析器（RSS 2.0 / Atom / RDF；CDATA + 实体 + 数字实体解码；rel=alternate 链接优先；guid 缺省 link 哈希兜底；摘要去标签截断 300）②`refreshFeeds` 有界并发 6 路（24 源 4 分钟 → 38 秒）：粗粒度新鲜度（>14 天超龄跳过，无日期宽容）→ 细粒度 guid 去重 → SimHash 跨源去重 → 入库；逐源诚实留痕（失败不阻断其他源）③`fetchAndParse` 网络类瞬时错误（fetch failed/timeout/5xx）自动重试 1 次——探活实证沙箱出网抖动（curl 三连可达而 fetch 偶发失败，重试救回 TechCrunch/Interconnects）④`ensureDefaultFeeds` 首访自动播种 ⑤`promoteItemToIdea` 转选题池闭环
- 默认源注册表 24 个（探活修正后）：中文 5（量子位/InfoQ/少数派/阮一峰周刊/Solidot）+ 英文 19（HN×2/TechCrunch/VentureBeat/Verge/MIT TR/MarkTechPost/AI News/Techmeme/Wired/DeepMind/OpenAI/Google AI/BAIR/arXiv cs.AI/Simon Willison/AI Snake Oil/Latent Space/Interconnects）；**探活剔除失效源：机器之心与 36氪官方 RSS 已死（改返 HTML）、虎嗅/AIbase/差评 404、HuggingFace/ImportAI 沙箱不可达、Anthropic 无 RSS**——修正记录在源注册表注释
- `.ts` 扩展相对导入 + tsconfig `allowImportingTsExtensions`（Node 24 离线可测规约，学 card-engine）

### API + UI
- `/api/sources`：GET（自动播种 + 源墙统计 + 最近 30 条）/ POST（refresh|promote|add）/ PATCH（启停）/ DELETE（级联删条目）；refresh 支持 limit/feedIds 定向
- `rss-panel.tsx`（情报中心首卡）：源墙（状态灯 ok/error/pending + 分类 + 启停/删除 + 悬停看失败原因）+ 自定义源添加 + 最近条目（转选题闭环）+ 失败源诚实提示条；intel-panel 集成于 AI 搜索卡之上

### 质量证据
- 离线回归 `scripts/test-rss.mjs`：**37/37 全绿**（simhash 8：同文 0/近文 3/远文 28/转载判定/空文本；parseFeed 13：CDATA/实体/日期/rel=alternate/guid 兜底/无标题跳过/非 feed；本地 HTTP E2E 16：超龄跳过/guid 二次去重/SimHash 跨源去重不误杀/非 RSS 诚实报错/状态落库/转选题 Idea+ideaId 回填/默认源 24 无重复 URL）
- 真实外网全量刷新三跑：24 源注册、单跑 17 ok / 226 条真实入库（量子位 10、OpenAI 40、HN 40、InfoQ 20、Techmeme 15…）、7 失败均诚实留痕（VentureBeat 429 限流 / arXiv 超时 / 其余为沙箱出网抖动——不同跑次失败源不同、curl 探活可达，非代码问题）；并发刷新 38s
- 浏览器验证：情报中心 RSS 面板 24 源 / 17 正常徽章 / 230 条目 / 34 个转选题按钮渲染，console 零错误
- tsc / eslint 双零（顺手修复 video.ts 遗留 hooks 命名误报：useAgnesFor → agnesForScene）
- 诚实边界：WeWe RSS（公众号全文）需自部署服务、热榜聚合 API 待接——自定义源入口已支持任意 RSSHub 路由，P2 再补托管

---
## 2026-10-31 · P1 第五批（p15 DSPy 式 prompt 调优）

### 落地（学 MIPROv2 精神子集，诚实边界：不引入 python dspy 依赖，自建轻量度量驱动闭环）
- `src/lib/runtime/tune.ts`（新）：变体注册表——v0 基线（空指令零侵入）/ v1 结构强化（段首论点句+显式递进）/ v2 证据密度（每段 [n] 锚点+数字必带来源+禁空泛收尾）/ v3 口语节奏（「你」视角回勾+砍学术腔+短句重音），各带调优假设；SettingKV `tune:draft` 读写（apply/clear/resolve，坏记录回基线）；`aggregateTuneReport` 聚合推荐纯函数（无基线不推荐防误判+样本量警告防过拟合声明）
- 注入位：`sectionMessages`/`draftMessages` 增 `tunePrompt` 可选参（【调优指令】块，分节与单遍两路径同生效）；run-manager 每次 run 读一次注入，draft 步留痕含变体号（「调优 v2」）
- `/api/eval`：GET 增 tune 状态+变体注册表；POST 增 tune-apply / tune-clear / tune-aggregate
- `scripts/tune-prompts.mjs`（新）：调优运行器——逐变体（apply → 逐题跑九步管线 → 等终态 → G-Eval 评分）→ 历史基线合并聚合 → 推荐落库或诚实回 v0 → 报告落 download/；题间节拍 75s + 429 重试 + draft 步注入断言

### 质量证据
- 离线单测 `scripts/test-tune.mjs`：**27/27**（注册表 6 / 注入位 5 / SettingKV 读写回滚 6 / 聚合推荐数学 10）
- live E2E（v2 × m01）：变体应用 → 九步管线真实跑通 → **draft 步留痕「调优 v2」实证注入生效** → G-Eval 评分 8.0 门禁 PASS → 聚合（DB 无历史基线 → 诚实不推荐并自动回滚 v0）→ 报告落 download/tune-report-2026-10-31.json
- 文档：README/README.en 核心能力与质量基线更新（交互/RSS/混合通道/版式卡/调优闭环）；deep-dive 附录 E（P1 全五项改动清单+验收对照）
- tsc / eslint 双零

### P1 收官备注
- 路线图验收对照见附录 E.4：混合通道成本 ✅ / RSS ≥20 源 ✅（24 注册 17+ ok/轮，沙箱出网抖动诚实留痕）/ 纯图线 2.0 ✅ / 调优闭环 ✅ / 新手首跑向导落地但埋点属 P2（未虚报）
- 全量调优 sweep（v1/v2/v3 × 多题）与 50 题全量基线需用户重播搜索密钥后跑（SEARCH_KEY=xxx bun scripts/set-search-key.mjs → node scripts/tune-prompts.mjs --variants v1,v2,v3 --ids m01,m02,m03）

---
## 2026-10-31 · P1 收官：全量分段回归 + 混合通道丢镜 bug 修复

### 混合通道静默丢镜 bug（本轮回归当场抓获，真实工程价值证明）
- **症状**：video-only 回归 hybrid 段 `stage=error`——concat 空列表失败
- **根因**：`renderLocalSceneSeg`（hybrid 通道的本地代码动画单镜渲染）渲染出 `s{i}.mp4` 后**从未 `segs.push`**——只有调用方的 model 分镜路径 push。全 code 分镜（今日主回归覆盖 last-storyboard.json 后 render 全为 code）→ segs 空 → concat 必挂；**此前有 model 分镜时更糟：code 分镜被静默丢帧**（成片缺镜但 meta 统计正常，旧断言只查 codeScenes+modelScenes 计数不查实际时长，未抓获）
- **修复**：renderLocalSceneSeg 两条路径（art 引擎 / motion 场景卡）渲染完成即 push；model 回落路径经此函数自动覆盖，无双重 push
- **回归加固**：video-only 增「成片时长 ≈ 全部分镜之和」断言（ffprobe 实测 vs 预期；本次实测 59.0s vs ~59s，零丢镜）——从此丢镜类 bug 无处遁形

### 全量分段回归证据（P1 三批落地后）
- 离线五套件：claim-match 全过 / test-section-rewrite 28/28 / test-rss 37/37 / test-tune 27/27 / test-card-engine 33/33
- 主段（REG_SKIP_VIDEO=1，full-regression）：**0 失败全绿**（约 45 项断言：九步 done/大纲 5 节/分节对齐 5/5/审稿留痕/断言诚实跳过/配图降级留痕/排版 v2/G-Eval 评分 7.6（同家族裁判 + 配额受限窗口，单样本波动如实记录）/评测题库 50/视频直出 E2E/纯图线诚实降级/版式卡 E2E 3 张 VLM 全过/发布门禁/5 平台导出/无 5xx）
- 视频段（regression-video-only）：**10/10**（art 50s 0.6MB + motion 59s 1280×720 + hybrid done 含时长断言）
- 配额工程事实：主段连跑 3 次撞用户级 10 分钟 30 次限流（第 2/3 次仅用于数断言数，无谓消耗——教训：回归输出应一次落盘再统计，已在收官轮改为 `> /tmp/reg-*.log` 模式）；quota-wait 探针等待窗口后视频段一次通过

### P1 最终交付清单（五项全落地）
- p11 纯图线 2.0（版式骨架 + VLM 质检闭环）✅ `dcbf656`+`0fa8975`
- p12 视频混合通道 ✅ `dcbf656` + 本轮丢镜修复
- p13 交互三件套（向导/⌘K/指着改/前馈/重排）✅ `8ca8f39`
- p14 RSS 信源 + SimHash 去重 ✅ `0e2c3a2`
- p15 DSPy 式调优闭环 ✅ `be768e7`
- 文档：deep-dive 附录 E（改动清单+验收对照）+ 双语 README 核心能力与质量基线

---
## 2026-10-31 · P1 交付收尾：远端推送 + DB 重建 + 调优 sweep 断点续跑基建（配额阻断诚实留痕）

### 沙箱回收影响（比上次更重，如实记录）
- `prisma/dev.db` **文件级丢失**（不止 run 数据回滚）+ `node_modules/.prisma/client` 生成物丢失
- 恢复：`prisma generate`（首跑撞出网抖动，重试即过）→ `prisma db push` 重建 schema → `set-search-key.mjs` 重落 provider:search（用户重播密钥，掩码 sk-b45…8199）
- 卡死残留：DB 中 1 条 run 停在 running 态（后台进程被清理所致，如实保留不抹）

### 远端推送（用户给新令牌）
- `push-retry.sh final` 一次成功：`1919212..bd7328f -> main`，本地领先 10 提交全上（P0 三项 + P1 五批 p11~p15），令牌全程走环境变量、日志 sed 脱敏
- 历史重写决策：`6c7b018`（沙箱回收自动 amend 产物，消息是 runId）内容为真实 VLM 闭环代码，后续提交与 worklog/deep-dive 引用其后哈希——**不重写直接推**

### 调优 sweep：后台长任务死路 → 分段断点续跑执行器（核心工程产出）
- **实证**：setsid 后台跑 with-server 编排，90s 后存活、7 分钟后 server 被沙箱清理（with-server.sh 注释的教训再次验证，setsid 也救不了）→ 长任务必须按 Bash 调用边界切片
- `scripts/sweep-step.mjs`：状态文件 `/tmp/sweep-state.json` 驱动——12 步队列（v0 基线×3 题补 DB 丢失的历史基线 + v1/v2/v3×3）+ 队列空自动收尾（aggregateTuneReport 聚合 → 推荐 tune-apply 落库 / 诚实回 v0 → 报告 download/tune-report-*.json）
  - 每步一次调用完成全生命周期：with-server 起 server → tune-apply/clear → 九步管线（waitRunDone 330s）→ draft 留痕断言（「调优 vx」）→ G-Eval 评分（eval-score 落 DB）→ 杀 server
  - **429 不消费队列**：管线终态 error 且原因含 429 → 留队首下轮重试（限流是暂时性错误，不能标 failed 跳过——首版在此吃亏，m01 被误消费后重置状态修正）
  - 配额探针：起 run 前探一次（45s 间隔最多 180s，429 探测不消耗计数）
  - `__isMain` 用 `path.resolve(argv[1]) === import.meta.filename` 精确判定（endsWith 会被 test-sweep-step.mjs 误命中）
- `scripts/test-sweep-step.mjs`：状态机离线自测 **11/11**（队列顺序/持久化往返/429 不消费/坏 JSON 回退/收尾触发）——零 LLM 配额
- `scripts/p1-final-sweep.sh`：一次性编排（v0 基线 → quota-wait → 变体 sweep），适用允许后台长任务的标准环境；沙箱实测不可行，保留为部署环境用法
- tsc / eslint 双零（.mjs 全干净，.sh 不在 eslint 范围属正常）

### 配额阻断（诚实边界，不虚报进度）
- sweep 首步两次尝试均撞 429；此后**绝对静默 30+ 分钟（零调用）后单次探测仍受限**——超出「用户级 10 分钟 30 次」滑动窗口的解释范围，疑触发小时级/日级配额池（今日 P1 收官全量回归已消耗数百次调用）
- 12 步 sweep 未在会话内跑完；基建已全部就绪且自测通过，恢复后**一键续跑**：
  `bash scripts/with-server.sh "node scripts/sweep-step.mjs"`（重复执行至打印收尾聚合，幂等断点续跑；状态在 /tmp/sweep-state.json，删之即重头）
- 50 题全量基线（`eval-set.mjs --count 50`）同样待配额恢复后续跑，命令与节拍已备
- 最终探测（14:24）：累计静默 60+ 分钟仍 429——确认日级/长效配额池耗尽，非滑动窗口；sweep 与 50 题基线留待配额恢复后一键续跑（命令见上），基建与自测已全部就绪

---
## 2026-11-01 · 配额恢复日：sweep 12 步全量完成（v3 推荐落库）+ 50 题基线基建与阶段推进

### 调优 sweep 全量收官（昨日被日级池阻断的 12 步今晨一次续跑成功）
- 配额恢复探测 1s 探通；沙箱夜间回收又清了 dev.db → prisma generate + db push + 密钥重落（流程已熟，3 分钟恢复）
- **12/12 全部成功，零失败**（v0×m01-m03 基线 8.2/8.1/8.3 + v1 三题 8.0/8.1/8.1 + v2 三题 7.6/8.0/8.1 + v3 三题 8.3/8.0/8.5）
- 偶发一例 v0×m02 任务书解析三档温度重试失败 → 手工移回队首一次重试即过（格式失败是偶发，不宜直接标 failed——已验证）
- 一例 429 留队重试正确生效（v1×m01 等一个窗口后过）
- **聚合结论：v3（口语节奏）均分 8.27 > v0 基线 8.20 > v1 结构强化 8.07 > v2 证据密度 7.90（v2 在 m01 上 7.6 BLOCK，门禁率 67%）**
- 五维洞察：v3 优势在 usefulness 8.6 / voice 8.4（口语节奏假设成立），accuracy 略降 8.5→8.4；v2 证据密度反而压低 accuracy 8.0（[n] 锚点指令与准确性有张力——值得后续研究）
- 推荐 v3 已落库 SettingKV tune:draft（后续 run 生效）；聚合器诚实提示「+0.07 分样本量小，确认需扩到 10+ 题」
- 报告：download/tune-report-2026-11-01.json（12 liveRuns / 0 failed）

### 50 题全量基线（v0）：分段执行器落地 + 5/50 阶段推进（日级池再度耗尽，诚实留痕）
- `scripts/eval-step.mjs`（新，模式复刻 sweep-step）：50 题队列 / 每调用一题（tune-clear 保 v0 → 九步管线 → 评分）/ 429 留队 / 偶发失败 retryCount<2 留队 / 评分双落盘（DB eval-score Asset + 状态文件）/ `--summary` 从 DB 重聚合（抗状态丢失）
- 预填优化：v0×m01-m03 从 sweep 结果复用（省 ~40 次调用）；m04 管线完成但评分被 10 分钟超时截断 → eval-set `--score-only`（全 id）补评 8.3 后入账
- **阶段成果 5/50：总均分 8.18｜门禁 5/5 全过｜五维 accuracy 8.30 / viewpoint 8.22 / usefulness 8.14 / voice 8.24 / readability 8.02｜字数中位 1577**（模型发布类 8.18）
- 报告：download/eval-baseline-50-2026-11-01.json
- **再次撞日级池**：eval50 第 6 题（o01）两轮 429 + 探针 3 分钟受限 + 静默 22 分钟仍受限——今日 sweep 12 题 + eval50 5 题 ≈ 220+ 次调用又把池子打空；剩 45 题明日续跑
- `scripts/test-eval-step.mjs`（新）：状态机离线自测 **9/9**（50 题队列同序/往返/坏 JSON/retry 语义）；tsc / eslint 双零

---
## 2026-11-01 · 预览 502 排障：dev 脚本固化内存上限（OOM 崩溃循环根因）

### 用户报障：预览页 502（POST /api/search + CSS 资源 + HMR 反复重连）
- 排障链：① `demo-search` 纯静态兜底（无 LLM 依赖）→ 排除配额炸链；② `recordCall` 已有 try/catch → 排除遥测炸链；③ `route.ts` catch-all 返回 502 但 DB KV=0 时应走 DEMO 返回 200 → 排除应用层
- **根因锁定**：package.json `dev` 脚本无内存上限——预览自动启动走 `npm run dev`，Turbopack 编译期内存尖峰 → OOM 崩溃循环 → 请求撞上死/重启中的服务器 → 网关 502（CSS 502 + HMR 反复重连 + API 502 的完整模式吻合）；with-server.sh 一直带 `--max-old-space-size=1536` 所以回归从未复现
- **修复**：`NODE_OPTIONS=--max-old-space-size=1536` 固化进 dev 脚本（任何启动路径同享保护）
- **验证**：起服务器 → POST /api/search → HTTP 200 · REAL 模式 · yuanbao-search · 10 条 · 2.5s（密钥重落生效）
- 顺带：本轮沙箱回收又清了 DB → 密钥重落流程 3 分钟完成（generate→push→set-search-key）
- 诚实边界：沙箱闲置回收仍会杀服务器进程并重置 DB——预览冷启动首批请求可能偶发 502（网关层），页面刷新即恢复；这是沙箱基建特性，代码侧已把可控因素全部消除

---
## 2026-11-01 · 全面测试轮：七套离线全绿 + 浏览器/API/RSS/搜索实测 + 抓出两个真实缺陷并修复

### 测试矩阵（LLM 配额受限下可全测的部分）
- **七套离线回归全绿**：claim-match 全过 / section-rewrite 28/28 / rss 37/37 / tune 28/28（含新增防污染断言）/ card-engine 33/33 / sweep-step 11/11 / eval-step 9/9
- **tsc / eslint 双零**：eslint 从 23 error 修复归零（见下）
- **浏览器实测**（agent-browser）：首页/情报中心/创作台/设置中心四 tab 零 console 错误；⌘K 命令面板完整（⌘1 图文 ⌘2 视频 ⌘3 图组/早报/RSS/导航/最近 Run）
- **RSS 真实外网刷新**：24 源注册 → 18 ok / 6 失败诚实留痕 / **235 条真实入库** / 84 超龄跳过 / SimHash 去 1 重
- **搜索真实模式**：POST /api/search → 200 · REAL · yuanbao-search · 10 条 · 2.5s
- **18 条 API 路由健康检查**：200×16 / search 405(GET 不支持,设计如此) / agent 404(子路由型)；eval 题库 50 题 · 10 类完整

### 抓出并修复的两个真实缺陷
1. **eslint ignores 漏 public/engine**：y4 三方引擎库（three.min.js 等打包产物）入库后 `eslint .` 全量扫描误报 23 error 1450 warning——修：ignores 增 `public/engine/**` `public/assets/**` `download/**` + 顺手修 test-export-regression.mjs 的 unused-expression warning → 全量零输出。此前「双零」结论都来自限定范围调用（src/scripts），未暴露此问题
2. **test-tune.mjs 测试污染 live DB**（本轮实证）：③ 节 SettingKV 测试直接操作真实库且收尾 `clearTune()`——把 sweep 落库的 v3 推荐清掉了（apply v3 → 跑测试 → tune=draft 消失）。修：测试前备份原值，收尾恢复而非清空 + 新增「测试污染防护」断言（28/28）；修复后实证 v3 在测试跑完后存活

### LLM 相关在线测试（诚实边界）
- 九步管线 E2E / G-Eval 评分 / 视频线渲染 / full-regression 主段——均需 LLM 配额，本轮探测仍 429 受限未跑；待配额恢复后跑（与剩余 45 题基线同批）

---
## 2026-11-01 · 工程韧性优化：一键环境自愈 + 报告双落盘（根治沙箱回收两大重复痛点）

### 痛点 → 方案（本轮三次手工恢复的教训固化）
- **痛点 1**：沙箱回收清 DB/密钥/调优态 → 每次会话手工 prisma generate → db push → set-search-key → tune-apply，约 5 分钟且易漏（v3 曾被静默清掉）
- **方案**：`scripts/boot-restore.mjs` 一键自愈（幂等）：①Prisma client 缺则 generate（3 次重试抗出网抖动）②schema 同步 db push ③provider:search 缺则从 env/.env 的 SEARCH_KEY 重落（不打印明文；.env 已确认 gitignored）④tune:draft 缺则从 `db/tune-state.json`（git 跟踪推荐态）重应用 ⑤RSS 默认源 ensureDefaultFeeds；`--check` 只读体检 / `--quiet` 静默
- **接线全覆盖**：with-server.sh 起服务器前自动自愈（失败不阻断）+ package.json dev 脚本链式自愈——**预览冷启动自动恢复，不再空态**
- **验证**：正常路径 4/4 健康；破坏性验证（删 provider:search + tune:draft 两条 KV）→ 一键补齐（密钥=sk-b45…，tune=v3）；with-server 端到端 API 200

### 报告持久化：reports/ 双落盘
- **痛点 2**：download/ 被 gitignore 且沙箱回滚会清空——sweep/eval50 两份报告原件丢失，仅 worklog 数字幸存
- **方案**：sweep-step / eval-step 落盘改双写（download/ 给用户 + `reports/` 进 git）；两份报告已按 worklog 数字重建（reconstructedFrom 字段如实标注「原件被沙箱回滚清除后重建」）；`db/tune-state.json` 记录 v3 推荐态与依据，随代码走
- 回归：tsc / eslint 双零；test-sweep-step 11/11 / test-eval-step 9/9 / test-tune 28/28（含防污染断言）

---
## 2026-11-01（下午）· P2 用户答疑驱动批次：选题池全链路修复 + 自动化任务上线

### 用户三问 → 诊断结论（全部代码级定位）
1. **「RSS/AI 搜索转选题后选题池没数据」**：API 层实测正常（create_idea/promote 均入库）；根因有二——
   - 【真实缺陷】RssPanel 是 IntelPanel 内嵌卡片，转选题后**无回调通知父组件**，选题池 UI 不刷新（数据在库里、界面看不见）；叠加【环境因素】沙箱回收重置 DB（实测当时 ideas/topics/reports=0 而 RSS 235 条幸存），上一会话转的选题被清
   - 修复：RssPanel 加 onDataChange 回调；空态文案明示五路入池 + 沙箱回收会清业务数据的诚实说明
2. **「AI 刷新会覆盖我选的吗」**：不会——刷新只做 createMany 新增 + 7 天标题去重，从不 update/delete；UI 补「只新增不覆盖」明示
3. **「雷达有什么用 / 和手动加选题区别」**：雷达=持续监测方向（驱动早报检索词 + 灵感燃料），选题=一次性任务；原 UI 零解释 → 话题卡加说明文案 + 每话题产出统计（N 期报 · N 选题）

### 本批落地（9 文件新增/修改，1 schema 变更）
- **Idea.source 来源字段**（schema + db push）：五路入池全标记（manual/rss/search/report/ai）；/api/ideas 返回 bySource/byStatus 统计；选题池卡加来源徽章 + 状态筛选 tabs + 池统计行
- **灵感刷新解耦**（ideas/refresh 重写）：燃料=方向(可选) > 雷达话题 > 早报标题 > **RSS 近 3 天 15 条**（原来硬依赖雷达+早报，DB 有 235 条 RSS 却不用）；全空才 400
- **早报方向可选 + AI 自主**（morning-report）：空方向 → 自主链（雷达关键词聚合 → RSS 热点作补充证据 → 泛方向兜底），返回 autonomous 标记；去掉硬塞默认检索词
- **自动化任务配置管理**（新功能，用户点名）：`src/lib/automation.ts`（配置/日志/到期判定/任务执行）+ `/api/automation`（save/run/tick/clearLog）+ 设置中心「自动化任务」卡（三任务：每日早报[方向可配]/RSS 定时刷新[间隔]/每日灵感刷新[方向可配] + 立即运行 + 运行日志 30 条）
  - 沙箱诚实模型：进程不常驻 → 「打开应用即补跑」（情报中心挂载 fire tick）+ 手动立即运行 + 外部 cron 可打 tick 端点；到期判定含「今日已跑不重复、错过窗口只补一次」
- **Idea↔Run 闭环**（schema 里 Idea.runId 一直存在但从未使用）：createArticleRun 接受 ideaId → 回填 runId + status=picked；Run done → 选题自动置 done；「去创作」全程携带 ideaId（page→studio→wizard 链路打通）；选题卡显示「已出稿线」徽章——**「采纳后去哪了」从此可追**
- **429 友好降级**：ideas/refresh 与 morning-report 把配额报错翻译成人话（503 + 「链路正常仅生成在等配额」）
- 测试资产：scripts/test-p2-intel.mjs（17 断言在线回归）+ scripts/test-p2-browser.sh（11 断言浏览器实测）

### 验证
- tsc / eslint（src + 新脚本）双零
- 在线回归 16/17 过（唯一 fail 是 LLM 日级配额 429 未恢复——链路验证已到 LLM 调用层，燃料聚合/入库/状态机全过；配额恢复后自动可用）
- **浏览器实测 11/11 全绿**：完整复现用户报障场景（空池 → RSS 转选题 → 不刷新页面池内立即出现 + RSS 徽章）+ 自动化卡渲染 + 双方向输入 + 控制台零错误；截图 22.9% 非白像素
- 离线回归不回归：section-rewrite 28/28、card-engine 33/33、sweep-step 11/11、eval-step 9/9、rss 37/37、tune 28/28、claim-match 全过
- 诚实边界：早报自主/灵感刷新的 LLM 生成段因日级池耗尽未跑通端到端（搜索段已验证）；剩余 45 题基线同样等配额

---
## 2026-11-01（傍晚）· 接力轮：远端推送 + Prisma 引擎镜像兜底 + 在线回归冷启动自洽

### 远端推送
- `push-retry.sh final` 推 `1943b3c..d460867`（P2 答疑驱动批次整批上远端，第 2 次尝试过网抖）；远端 main = 本地 HEAD

### 新故障模式实证与固化：Prisma 引擎下载的 Node fetch 死路（本轮核心工程产出）
- **现象**：沙箱回收清掉 Prisma client 后，boot-restore 的 generate/db push 反复失败（binaries.prisma.sh 请求 ETIMEDOUT），而同一文件 curl 能下（8MB/36s）
- **根因**：DNS 对 binaries.prisma.sh 解析双 A 记录（104.20.43.103 活 / 172.66.156.100 死），Node fetch（undici）撞死路、curl 走活路；且该问题是**间歇性**的（本轮晚些时候 Node fetch 又通了）——解释了历次「出网抖动重试即过」的真相
- **对策固化** `scripts/prisma-mirror.mjs`：curl 预热引擎+校验文件到 /tmp/prisma-mirror（幂等跳过已有、`--fail` 拒 404 错误页）→ 解压二进制入 ~/.cache/prisma（belt-and-suspenders，复刻实证成功组合）→ 起 127.0.0.1 临时静态服务（防路径穿越）→ `PRISMA_ENGINES_MIRROR` 指过去，服务与 prisma 命令同调用完成（进程不跨调用铁律）
- **接线**：boot-restore ①generate ②db push 双点兜底（常规 2 次重试 → 失败走镜像）；`--prepare` CLI 可单独预热
- **顺手抓出并修复一个真实缺陷**：curl 不带 `--fail` 时 404 错误页会被当成引擎写盘（离线自测 11 断言中 1 挂暴露，已修）
- 验证：`test-prisma-mirror.mjs` 离线 11/11（解析/幂等/404/穿越防护）；`withEngineMirror` 直调端到端实证（镜像 fetch 200 内容一致）；tsc/eslint 双零

### test-p2-intel 冷启动自洽（第二个测试质量缺陷）
- 首跑 10/13 三挂：全因「冷库序依赖」——断言 RSS 燃料时库里还没条目（刷新排在测试后段），暖库复跑 17/17 证实非代码缺陷
- 修：空库自动补刷一轮 RSS（24 源约 30-60s）再断言；**清空 177 条 FeedItem 模拟真冷库复跑 17/17**——从此不依赖历史数据

### 环境与回归快照（本轮）
- 沙箱回收两次：DB/client 又被清 → generate（撞新故障）→ 镜像方案手工恢复 → 固化为脚本（下轮起 boot-restore 一键含兜底）
- 离线八套全绿：rss 37/37 · card-engine 33/33 · section-rewrite 28/28 · tune 28/28 · sweep-step 11/11 · eval-step 9/9 · claim-match 全过 · **prisma-mirror 11/11（新）**
- 在线：p2-intel 冷库 17/17（配额两断言按诚实边界过：503 友好降级文案含 429 说明）
- LLM 日级配额仍未恢复（两轮探测均受限）：剩余 45 题基线、早报/灵感 LLM 端到端、full-regression 主段继续挂起等配额
