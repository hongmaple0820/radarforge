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
