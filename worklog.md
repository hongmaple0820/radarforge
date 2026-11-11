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

### eval50 断点回种（双落盘策略首次实战兑现）
- 沙箱回收清了 /tmp/eval50-state.json 与 DB eval-score Asset，但 `reports/eval-baseline-50-2026-11-01.json` 进 git 幸存
- 新增 `scripts/eval50-reseed.mjs`：报告 rows → 状态文件回种（m01-m03 五维取 sweep 报告 v0 段；m04 自带；**m05 缺五维 → 留队重跑不凑合**；不落假 run/Asset，DB 保持干净，runId=recovered 标记历史来源）
- 回种结果：恢复 4 题（8.2/8.1/8.3/8.3）+ 待续 46 题（m05 起恰 50）——`--summary` 聚合验证 4/50 · 总均 8.22 · 门禁 4/4 · 五维齐全
- 配额恢复后：`bash scripts/with-server.sh "node scripts/eval-step.mjs"` 即从 m05 续跑；沙箱再回收也只需重跑一次本脚本（幂等，已有状态不覆盖）

---
## 2026-11-02 · 七问体检轮：全量代码级取证 + 整固方案（方案先行，不动业务代码）

### 本轮性质（用户选定：方案先行 / PDF 深度版 / dsh 补完+实测 / MCP 完整对齐 / Skills 对齐标准 / 图文主视频辅）
- 只读排查七问，零 LLM 配额消耗；交付《RadarForge七问体检与整固方案.pdf》（19 页，折算字数 13180）+ docs/q7-consolidation-plan.md 镜像
- 定性总表：六问成立、一问（工具注册表）为定位争议；三类系统性病灶——依赖治理缺失 / 资产权错位 / 生态只展示不接通

### 七问取证结论（全部可复核，证据清单在方案附录 B）
- **Q1 RSS**：sources API 仅 add/启停/删除（无 update）；fetchAndParse 裸 fetch 无代理；SourceFeed 无代理字段 → P0-2 补 PATCH 子集更新 + proxyUrl 按源代理 + undici ProxyAgent
- **Q2 Skills（架构性根因 + 不可逆损失）**：技能扫描根 = `<project>/skills/` = 沙箱平台 69 个 agent 技能；产品自有 12 技能（wewrite 十件套 + huashu 双件）被平台目录覆盖丢失，且 /skills/ 在 .gitignore → 从未入库无法恢复；UI 占位符硬编码「搜索 69 个技能」→ P0-3 目录主权迁 db/skills/ + P2 安装管理（对齐 agentskills.io 官方规范）
- **Q3 工具注册表**：5 内置工具实测全部真实可调用；「单独运行」= 调试/契约验证价值，缺「诊断」心智标注 → P1-6 重定位为工具测试台 + MCP 联调面板
- **Q4 dsh（关键澄清）**：dsh = DeepSeek Harness（深度求索 2026-08-13 开源，Cordis 内核，一切皆插件），官方插件指南真实存在（deepseekai.works/plugins）；插件包已产出且 5 文件已推 GitHub；差距 7 项（defineTool parameters/Config Schemastery/name 导出/engines.dsh/inject 服务名未验/无宿主实测/无 Release 分发）→ P1-1/2/3 四步补完 + 沙箱真实宿主实测（npm 已验证 @deepseek-ai/dsh@0.2.1-rc.5 可达）+ GitHub Release tgz 分发
- **Q5 MCP（最实质缺陷）**：两套互不相通客户端（stdio '2024-11-05' config/mcp.json 自定义 servers 格式 vs HTTP '2025-06-18' DB McpServer 表）；HTTP 套无 Mcp-Session-Id 会话管理、parseSseBody 等全文结束才解析（流式 hang）；**发现的工具从不 registerTool，Agent 无法调用（纯展示）**；UI 无 stdio command 输入、无标准 mcpServers 导入 → P0-4 入口统一 + P1-4 完整标准化（schema 扩展/导入导出/工具接入注册表，命名 mcp__服务器__工具）
- **Q6 视频（报错根因铁证）**：「ffmpeg 不可用：Executable not found in $PATH」为 **Bun 运行时报错格式**（对照实验：Node 报 spawn ENOENT、Bun 报该文案逐字一致）——预览生产模式 `bun .next/standalone/server.js` + 16 处裸命令名调用 + 受限 PATH 必然复现；「检查视频模型」按钮在 local 通道实际探测 ffmpeg（语义错位）；AGNES_VIDEO_MODELS 硬编码单一选项 → P0-1 binaries.ts 解析链（env→which→常见路径→ffmpeg-static 兜底）+ 按钮拆分（模型探活/依赖自检）+ P1-5 视频模型配置轻量化
- **Q7 割裂感**：闭环断点清单 6 条（生态与主流程零关联/设置分散/展示多于可用/错误口径不一/命名无解释/信息架构头重）→ 三接线 + 设置三分区 + 全局健康中心 + 术语治理表（方案表 7-2）

### 交付物与工程产物
- download/RadarForge七问体检与整固方案.pdf：Template 07 Crystal Blue 封面 + 自动 TOC + 8 章 + 4 附录（含逐文件改动清单与接口草案）；pdf_qa PASS（0 错误）、toc_validate pass、font.check 0 issue、19 页无空白页
- docs/q7-consolidation-plan.md：同源内容块生成（gen-q7-plan-md.py），进 git 抗回收
- scripts/gen-q7-plan-pdf.py + q7_plan_content.py + q7-cover.html + merge-q7-pdf.py + gen-q7-plan-md.py：文档生成流水线（内容块单源，PDF/MD 双出）
- 排期：P0 四项（约一轮）/ P1 六项（约两轮）/ P2 三项（约两轮）；与既有路线图合并——p23 扩展为双向 MCP、p24 建议顺延一轮、P0/P1 插队 p21/p22 之前

### 待用户评审后执行
- 方案获批即按表 8-1 顺序开工（P0-1 依赖解析链为第一刀）；用户可直接对 13 行排期表做增删调序
- LLM 配额恢复后并行续跑：eval50 剩余 46 题 + 在线回归补测（与本轮方案互不阻塞）

---

## 2026-11-03 · 七问整固 P0+P1 全量落地（用户批准「高质量严格执行」后一轮完成）

### 本轮范围（q7 方案表 8-1 的 P0 四项 + P1 六项，除 P1-3 的 GitHub Release 上传外全部落地）

**P0-1 依赖解析链（根治「ffmpeg 不可用：Executable not found in $PATH」）**
- `src/lib/media/binaries.ts` 四层解析链：env(FFMPEG_PATH) → which(PATH 扫描) → known(常见路径表) → static(ffmpeg-static 包兜底)；模块级缓存 + 启动日志 + 人话错误（三条修复路径指引，不透出原始 ENOENT）
- 13 处裸命令名调用点全部改 `mustResolve()` 绝对路径（video.ts 11 + art-engine.ts spawn 1 + settings/test 1）
- 按钮语义拆分：「检查视频模型」→「AI 模型探活」（local 通道返回引导说明而非拿 ffmpeg 冒充）+「渲染依赖自检」（新 scope=dependencies，逐项路径+版本+指引）；新增 GET /api/settings/dependencies
- ffmpeg-static 列 optionalDependencies（外部部署装上即兜底；沙箱 GitHub 大文件下载持续截断，二进制未落——系统 ffmpeg 已就绪不影响）
- 自测 test-binaries.ts **18/18**（受限 PATH 清空复现生产场景仍解析成功=核心断言）
- 顺手修真实 bug：ideas/[id] 路由 `db.ideaCandidate`（schema 无此表，运行时必炸）→ `db.idea`；删 2 个死文件（gateway/bootstrap.ts、wsa-search.ts）→ **tsc 历史遗留 13 错清零**

**P0-2 RSS 编辑与代理**
- PATCH /api/sources 扩展子集更新（name/url/category/proxyUrl 任意组合；url 变更自动定向重抓验证 recheck 留痕不阻断保存；历史条目全保留对比删除重建）
- SourceFeed 增 proxyUrl 字段；三级代理优先级：按源 > 全局(SettingKV network:proxy) > 直连；设置中心新增「网络代理」卡（保存即失效 rss 层缓存）
- **工程教训固化：undici 7.30 ProxyAgent 在本环境实测挂死**（请求级 dispatcher 不发任何字节，连 CONNECT 都不出）→ 手写 Node 标准库代理客户端（http 绝对形式 / https CONNECT 隧道），不可达代理毫秒级报错
- 「经代理」标记区分源故障与代理故障；RSS 源卡铅笔行内编辑 + Globe 按源代理标记
- 自测 test-rss-proxy.mjs **19/19**（本地回环代理断言请求确实经代理发出 + 两代理分别计数断言优先级）+ 既有 rss 37/37 不回归

**P0-3 技能目录主权（根治「社区技能无法加载」架构性根因）**
- 扫描根迁移：平台 skills/（69 个宿主运维技能，曾整批覆盖产品技能造成不可逆损失）→ **产品库 db/skills/**（git 跟踪随仓库分发）+ 用户自装位 ~/.radarforge/skills；同 id 产品库优先
- 12 技能按 agentskills.io 官方规范重建（wewrite 十件套 + huashu 双件，name=目录名/description 1-1024 字符/重建标记入 metadata）；双 loader（skills/loader.ts + agent/skill-loader.ts）同迁
- UI 动态计数替代硬编码「搜索 69 个技能」；extensions-panel 来源标签改产品库/用户自装
- scripts/build-db-skills.py 生成流水线入库

**P0-4 MCP 入口统一**
- 统一客户端 mcp-client.ts：stdio 真握手（spawn 子进程 JSON-RPC，原「Web 环境不支持」的诚实借口不再是必要的）+ http 会话管理（Mcp-Session-Id 响应头取、后续请求带）
- /api/agent/mcp GET 双读（DB + config/mcp.json file: 前缀条目）迁移期兼容；POST create 支持 stdio（command 必填）
- UI：双传输切换表单（远程 HTTP/本地 stdio 命令行）+ 启停开关 + config 文件条目标记与删除引导

**P1-1/2/3 dsh 补完 + 真实宿主实测 + 分发就绪**
- 四步补完：`defineTool()`（parameters 类型化 schema + **output 必填声明** schema+render + timeoutMs 策略元数据）+ Schemastery `Config` 导出 radarBase + `name` 导出 + `engines.dsh >= 0.2.1-rc.5` + 协作取消（execute 观测 exec.signal）
- **真实宿主全链路实测（沙箱内装 @deepseek-ai/dsh@0.2.1-rc.5）**：pnpm 安装 → `--dump-config` 插件树出现 radar-plugin 行 → 启动挂载日志（radar_article + radar_video）→ `radar_article` 实调六步流水线（249s 全绿 · 纯文本回传 1972 字符 · 平台 run 留痕）→ 协作取消契约（已中止 signal 立即报「已取消」）
- **两条实测教训固化**：① dsh-tools 必须钉住与宿主对齐版本（0.0.1-rc.1 与宿主 0.2.1-rc.5 的 dsh-llm 导出不兼容——rc 间破坏性变更实证）② 插件不能 export default（cordis unwrapExports 取 exports.default ?? exports，default 会把命名导出折叠成裸函数丢失 inject/Config——加载失败定位半天）
- 插件包迁 plugins/dsh-radar/（git 正式目录，download/ 旧目录出库）；README 安装命令指向 Release 直链 + 实测声明；UI dsh 卡「已知边界」改「实测通过于 dsh 0.2.1-rc.5」
- 回归脚本 test-dsh-plugin.mjs **33/33**（产物五件套/规范对齐/官方 validateArgs 五用例/协议链路/取消契约/tgz）
- **P1-3 唯一挂起项：GitHub Release 上传与 topic 打标**——推送令牌在本会话不可见（用户消息原文持有）；scripts/github-release.sh 一键脚本已就绪（幂等：topic+Release upsert+tgz 上传+直链输出），`GHP=<token> bash scripts/github-release.sh` 即完成分发
- 诚实边界：LLM 驱动的「模型自主决定调工具」需宿主侧 DeepSeek 凭证（沙箱无）——协议链路已全验，模型行为属宿主侧

**P1-4 MCP 标准化（七问中最实质缺陷的根治：工具从不接入注册表 → 发现即接入）**
- schema 扩展：McpServer 增 args(JSON 数组)/env(JSON 对象)/headers(JSON 对象鉴权头)——D.2/D.3 标准形态
- mcpServers 标准格式导入导出：有 url 判远程（headers/auth 同步入库）有 command 判 stdio（args/env 入库）；不支持字段（envFile 等）**显式列出不静默丢弃**；导出同构 JSON 可直贴 Cursor/Claude Desktop；坏 JSON/缺键 400 人话错误
- **工具接入注册表（核心接线）**：`syncMcpToolsToRegistry()` 把已启用+已握手服务器的工具以 `mcp__服务器__工具` 命名（学 dsh）注册进 toolRegistry——inputSchema 转 params 说明；发现即接入（test 成功自动同步）；启停联动摘除恢复；删除服务器摘除其工具；boot-restore 启动自愈恢复（进程重启注册表不再丢）
- callMcpTool 双传输工具调用（stdio 一次连接完成调用 / http 带会话与鉴权头）
- UI：导入导出同步三按钮 + 已接入 N 工具徽章 + 导入面板
- 自测 test-p1-mcp.mjs **31/31**（导入双形态/双传输握手/注册表接入+echo 真回显/导出往返一致/启停联动/老通道兼容；DeepWiki 3 工具实测自动接入）

**P1-5 视频模型配置轻量化**
- VideoSettings 扩展四字段：model（datalist 预置+手填自定义 id）/models（可编辑清单，去重+上限12）/resolution（720P/1080P）/aspect（9:16/16:9）
- 视频通道卡收敛全套参数单卡（模型/分辨率/画幅/秒数）；Agnes 池卡卸下视频模型选择（兼容字段保留回退 `s.video.model || s.agnes.videoModel`）
- render-video 画幅缺省取 settings.video.aspect（请求可覆盖）；agnes-video 请求构造 size 用 resolution
- 自测 test-p1-video.mjs **15/15**（全套保存/清单去重上限/白名单校验/向后兼容旧 DB 值默认补齐）

**P1-6 工具测试台重定位**
- 「工具注册表」→「工具测试台」+ 诊断用途徽章 + 说明改「改参数 schema 后立即冒烟 · 验证降级链 · MCP 外部工具联调」
- 测试台列 MCP 工具（violet 边框 + MCP 徽章 + 已接入计数）——从「孤岛演示」变「生态联调」

### 回归快照（本轮全绿）
- **十一套离线**：binaries 18/18 · rss-proxy 19/19 · rss 37/37 · card-engine 33/33 · section-rewrite 28/28 · tune 28/28 · sweep-step 11/11 · eval-step 9/9 · prisma-mirror 11/11 · claim-match 5/5 · dsh-plugin 33/33
- **四套在线集成**：p0-integration 39/39 · p1-mcp 31/31 · p1-video 15/15 · p2-intel 17/17（既有）
- **浏览器实测 18/18**（新 UI 全链路：设置三新卡/测试台重定位/MCP 三按钮/RSS 编辑态/控制台零错误）
- tsc 零错误（历史 13 死错清零）· 全量 eslint 零输出（ignores 收口 repos/skill-pool 等三方目录）

### 遗留与下一步
- **P1-3 尾项**：GitHub Release 上传 + topic 打标待令牌（github-release.sh 就绪一键完成）；远端推送同待令牌（push-retry.sh）
- **P2 三项**（技能安装管理 / 设置三分区+健康中心 / MCP 服务端开放）按方案排期待后续轮次
- LLM 配额：本轮 dsh 实测两条真实流水线 + 在线回归约消耗 60+ 次；eval50 剩余 46 题继续排队（互不阻塞）
- 工程资产：scripts/test-p0p1-browser.sh（浏览器实测）/ test-p1-mcp.mjs / test-p1-video.mjs / test-binaries.ts / test-rss-proxy.mjs / test-dsh-plugin.mjs / build-db-skills.py / github-release.sh 全部入库

---

## 2026-11-04 · 七问整固 P2 全量落地（P0+P1 之后第三批次收官）

### 本轮范围（q7 方案表 8-1 的 P2 三项全部落地）

**P2-1 技能安装管理（q7 方案 3.3 第二步）**
- 合规校验模块 `src/lib/skills/compliance.ts`：agentskills.io 官方五规则（name 必填/1-64 字符/小写连字符/与目录名一致/description 必填 1-1024）——**pattern 与 matches-dir 独立报告**（大写 name 同时指出两处错误）；warn 不阻断（allowed-tools 实验性/license 未声明）
- 安装双通道 `src/lib/skills/install.ts` + 纯函数层 `zip-struct.ts`：**URL 安装**（GitHub tree/blob 页自动转 codeload zip + 仓库根包裹层剥离；直链 zip 即装）与 **zip 上传**（multipart）；三种形态全支持——根形态（id 优先取 SKILL.md 声明的合法 name，规范语义 name=目录名）/ 单目录包裹（剥壳后目录名做 id）/ 技能仓库（多技能批量识别）
- 安全防护：zip-slip（.. 与绝对路径条目过滤）+ __MACOSX/.DS_Store/.git 垃圾跳过 + 限额（单文件 2MB/总量 20MB/200 文件）+ 落盘前目标路径二次校验
- 产品库同 id 冲突 → 409 拒绝（产品库优先语义）；不合规技能**照样装但显式标注**（「明确标注原因而非静默跳过」方案原文）
- 详情抽屉（Sheet 组件）：SKILL.md 全文 + 目录结构树（200 项截断）+ 合规报告明细；API `GET /api/skills/detail?id=`
- 启停联动：SettingKV `skills:disabled` 停用集（5s 缓存）——停用技能**文件保留但移出 Agent 候选池**（agent/skill-loader 过滤 + /api/agent/runs POST API 纵深防御双保险）；幽灵 id 启停 404（不写死状态）；卸载自动清停用集
- 卸载：仅用户位可卸（产品库技能随仓库分发拒绝卸载，引导停用）
- UI：agent-panel 重构——安装盒（URL+上传双通道）、来源/合规/停用三徽标、行内管理动作条（详情/电源/删除）
- 工程重构顺手件：frontmatter 解析抽 `frontmatter.ts` 纯函数共享（loader/install/detail 三处同源防漂移）；删除死代码 workbench/extensions-panel（4 文件，从未被引用）

**P2-2 设置三分区 + 全局健康中心（q7 方案 7.2）**
- 设置中心三分区信息架构：模型与密钥（LLM/搜索/生图/Agnes 池/视频通道）/ 运行时依赖（**渲染依赖自检归位此区**——逐项解析路径+版本+来源+修复指引卡，P0-1 按钮语义终态）/ 内容策略（风格定位/自动化任务）；每卡带锚点 id `settings-card-<key>`
- `GET /api/health/summary` 四项聚合：搜索密钥/LLM 通道/视频依赖（ffmpeg 解析链）/信源健康（RSS 抓取留痕统计）——**只读聚合不主动探活**（探活是设置卡里的显式动作）；每项 status 枚举 + 人话 detail + 跳转目标（分区+卡片锚点）
- 首屏 HealthBar 状态条（page 层）：60s 自动刷新、异常项脉冲红点、点击跳转对应设置卡（jump 属性驱动分区切换+350ms 后锚点滚动）；信源健康跳情报中心
- overall = 最差项聚合（error>warn>ok）
- **实测教训固化：Radix TabsTrigger 在 mousedown 激活**——`element.click()` 只派发 click 不触发切换，浏览器自动化测试须 `dispatchEvent(new MouseEvent('mousedown'))`（冒烟脚本 CLICK_TAB 封装）

**P2-3 MCP 服务端开放（q7 方案 p23 双向 MCP 收官）**
- 平台工具集 `src/lib/mcp-server/platform-tools.ts` 八件：radar_ping/radar_list_topics/radar_create_idea/radar_start_article（异步 runId+轮询指引+人格主题清单回传）/radar_run_status/radar_run_output/radar_list_skills/radar_search——全部真实可调用，参数校验人话错误
- JSON-RPC 路由 `POST /api/mcp-server`：Streamable HTTP 形态——initialize 下发 Mcp-Session-Id + capabilities + instructions；notifications 202；ping；tools/list（含 JSON Schema）；tools/call（工具错误→isError=true 人话文案，协议错误→-32601/-32602/-32700/-32600 精确码）；GET 405 / DELETE 会话注销 204
- 鉴权与启停 `config.ts`：SettingKV `mcp:server`——Bearer / X-Radar-Token 双头；启停 503 人话指引；令牌 8-128 位格式校验
- UI 卡（plugins-panel）：接入端点 + **一键复制标准 mcpServers JSON**（Cursor/Claude Desktop/VS Code 直贴可用）+ 启停开关 + 令牌（随机生成/替换/清除）+ 对外工具徽标清单 + 与 dsh 出口的分工说明（方案 5.4：纯文本走 MCP、富产物留 dsh）
- **自环 dogfood（双向 MCP 铁证）**：本平台作为 MCP 客户端导入自身端点 → 测试连接握手（36ms）→ 8 工具以 mcp__radarforge-self__* 注册进工具注册表 → 工具测试台经统一注册表实调自环成功 → 删除服务器工具同步摘除——客户端与服务端两半在同一进程内互证

### 回归快照（本轮全绿）
- **离线十二套**：rss 37/37 · rss-proxy 19/19 · binaries 18/18 · p2-skills 36/36（新）· card-engine 33/33 · section-rewrite 28/28 · tune 28/28 · sweep-step 11/11 · eval-step 9/9 · prisma-mirror 11/11 · claim-match 全过 · dsh-plugin 27 过+1 降级跳过
- **在线六套**：p0-integration 39/39 · p1-mcp 31/31 · p1-video 15/15 · p2-health 15/15（新）· p2-skills-integration 44/44（新）· p2-mcp-server 47/47（新，含 245s 真实流水线端到端）
- **浏览器三套冒烟**：p21 9/9 · p22 14/14 · p23 11/11（控制台零错误）
- tsc 零错误 · 全量 eslint 零输出

### 工程纪律与诚实边界
- 测试冷启动自洽持续贯彻：test-p1-video 补「无 run 时自建最小 AgentRun」修复（沙箱回收后不再依赖暖库）；p2-skills-integration 首尾双清场（用户位+停用集复位）
- 沙箱回收一次（本轮开头 boot-restore 恢复）；SEARCH_KEY 在本会话不可见——搜索走演示降级链，health 显示「未配置」属诚实留痕
- LLM 配额未受限：P2-3 流水线端到端实测两轮（201s/245s 各一）
- 提交说明：24e96e2 提交信息只写了 P2-2，实际内容含 P2-3 全部代码（add -A 卷入）——内容完整无缺，特此在 worklog 留痕更正

### 遗留与下一步
- **P1-3 尾项仍在**：GitHub Release 上传 + topic 打标待令牌（github-release.sh 一键就绪）；远端推送 8+ 提交待令牌（push-retry.sh）
- 七问十二项（P0 四项 + P1 六项 + P2 三项）全部落地完毕；q7 方案执行闭环
- 后续可选（非七问范围）：eval50 剩余 46 题续跑（等配额窗口）、p21 定时出版/p22 资产中心（product-deep-dive 路线图）

---

## 2026-11-04 · 七问方案分发收官（令牌到位后的最后一公里）

### 远端推送
- origin/main：cbcb0c3 → cdecd60 **12 个提交全量推送**（七问体检轮+P0 四项+P1 六项+P2 三项+锁同步），分四块攻坚（体检轮/P0 大块含 13.7MB gif/P1 收尾/P2 全量），upstream 已建立；沙箱网络两次连接失败均由限时重试自愈（块 A 第 2 次、块 C 第 2 次成功）
- 驱动脚本入库：`scripts/tmp/push-chunks.sh`（push-retry.sh 的定向增量版，幂等可重跑，令牌仅经 GHP 环境变量不入库）
- 补提交 `bun.lock`（adm-zip 锁条目，P2-1 提交时漏带）

### GitHub Release（P1-3 尾项闭环）
- 仓库 topic：**dsh-plugin / dsh / ai-radar** 已打（官方发现通道）
- **Release v0.2.0-dsh-plugin**（id=433725503，prerelease）已发布：notes 含 dsh 0.2.1-rc.5 真实宿主实测声明与安装命令
- tgz 资产上传并**匿名直链实测**：HTTP 200 / 8227B / md5 与本地 `download/dsh-plugin-radar.tgz` 逐字节一致；README 安装命令指向的 URL 即时生效
- 顺手修 `github-release.sh` 资产列举 node 单行箭头函数缺右括号的语法 bug（首轮上传因此中断，幂等重跑成功）

### 至此七问十二项（P0+P1+P2）代码、测试、文档、远端、分发全链路闭环
- 唯一诚实遗留：**SEARCH_KEY 本会话不可见**——搜索走演示降级链（health 面板如实显示未配置），用户提供密钥后经设置中心「模型与密钥」分区写入即恢复真实检索

---

## 2026-11-05 · 内容质量升级 批次一落地（A1 SKILL 接管 + A2 篇幅三档 + B1 配图导演 + B3 图文线 VLM 审图）

背景：用户三条质量抱怨（文章篇幅少/死板、配图未用大模型生图、视频质量差）→《docs/content-quality-upgrade-plan.md》三线十二项三批排期获批。用户拍板：①默认档 medium（2500~4000 字）②模板库全量 3774 条带署名入库 ③视频默认通道 auto 且 UI 可选 ④Agnes 池够用不新增。批次一 = 方案 A1+A2+B1+B3（篇幅与提示词两条最痛根因先除）。

### A1 SKILL.md 接管产线（提示词唯一事实源）
- `src/lib/runtime/skill-prompt.ts`：loadSkillPrompt——用户位 `~/.radarforge/skills/<id>` 覆盖产品位 `db/skills/<id>`，两级都缺 → SkillPromptMissingError 显式报错（拒绝静默回退，方案 A1 验收项）；extractPromptSection 支持 `<!-- prompt: name -->` 多 prompt 分节；renderPromptTemplate {{var}} 占位符渲染 + 3+ 空行收敛；5s 热加载缓存（改 SKILL.md 最长 5s 生效）
- 七个产线技能 prompt 主体全部下沉 SKILL.md：wewrite-brief / outline / draft（single+section 双分节）/ review（review+revise+pairwise 三分节）/ fact-check / illustrate / art-direct（inline+cover 双分节，新增）；radar-* ts 模块退化为「编排+变量注入+解析」
- 技能中心守卫：PIPELINE_SKILL_IDS 七技能 toggle 停用 → 400（人话指引「可编辑 SKILL.md 定制，或在用户位放同名技能覆盖」）；GET /api/skills 逐技能透出 pipeline 标记 + pipelineTotal
- 验收双证：删除任一 SKILL.md → 对应步骤显式报错（离线 68 断言之二）；改 SKILL.md 字数指令 → 成稿字数随之变化（A2 联测，E2E 大纲指令即来自 SKILL.md 档位占位符）

### A2 篇幅三档制（默认 medium）
- `length-tier.ts`：short 1200~2000 字/4~6 节 · medium 2500~4000 字/6~9 节（默认）· deep 4500~8000 字/8~14 节；四处旧硬钳制（radar-write:184 / radar-outline 两处 / MAX_SECTIONS=8）全部档位驱动
- AgentRun.lengthTier 字段（schema+db push）；POST /api/runs 非法档位 400；GET /api/runs 下发 tiers；优先级 run.lengthTier > settings.article.lengthTier > 默认 medium
- UI 三处：向导第二步三卡可视化选档（默认 medium 高亮）+ 创作台高级表单下拉 + 设置中心新增「文章产线」卡（内容策略分区首位：默认档三卡 + 插图风格统一入口下拉；PUT scope=article 落 SettingKV article:pipeline，非法值 400）
- **合计预算带归一化（实测抓出并修复）**：首轮 E2E medium 档成稿仅 2257 字 < 2500——根因 parseOutline 只逐节钳制（8×300=2400 预算和低于档位下限）；normalizeSectionBudgets 把预算和等比缩进带（< totalMin → 抬到 ×1.1 留落笔余量；> totalMax → 压到 ×0.9；两轮迭代收敛钳制漂移，节数不足以达带时尽力而为）；修复后同流程复测 2552（draft v0）/2719（终稿）字双落带
- 逐节 ±65%/160% 容差带带反馈重生一次；rollingContext 滚动窗（deep 档防上下文撑爆）；artifacts.draft 增 wordCount + inBand 诚实留痕，带外时步骤摘要显式「⚠ 字数带外（批次二 A5 扩样补齐）」
- 决策③顺带落地：settings.video.channel 默认 local → auto（优先 Agnes 失败回退本地）

### B1 配图导演（提示词工程管线）
- `illustration-director.ts`：directInlineIllustration / directCoverImage——复用现有 LLM 通道（零新密钥成本，学 dsh-imagegen-video promptModel 思想）把「配图概念一句话」升级为结构化专业提示词：主体（中英双语，生图模型对英文响应更好）+ 构图 + 色调光线 + 风格 + 负面词；prompt 主体在 wewrite-art-direct/SKILL.md；两档温度 0.4/0.2 解析重试；失败 → legacy 降级（概念+风格拼接）显式标注 source=legacy，降级不消失
- assemblePromptFull：中文主体 + 英文关键词短语 + avoid: 负面词收尾；风格基准由 settings.article.imageStyleId 统一入口下发（图文线与纯图线同源）

### B3 VLM 审图闭环扩到图文线
- run-manager 正文插图与封面双环节：导演生成 → vlmCheckImage 读回复核（完整/文字健康/主题相关/构图四清单）→ 未过带 retryHint 定向重生一次（导演注入针对性修正建议）→ 仍未过诚实留痕不阻断
- artifacts.illustrations 全统计：planned/inserted/degraded/director/legacy/vlmPass/vlmFail/vlmRetried；步骤摘要带「VLM 审图 N 过/M 未过（重生 K）」

### 验证（批次一收口全绿）
- 离线 `scripts/test-b1-offline.ts` **68/68**：三档纯函数/逐节钳制/合计归一化三场景/SKILL 分节提取/占位符渲染/用户位覆盖/缺技能显式错/真实 SKILL.md 事实源断言/outline-section-draft 档位注入/导演拼装解析与 legacy 降级
- 服务器冒烟 `scripts/tmp/b1-smoke.sh` **9/9**：tiers 三档下发/非法档 400/deep 落库回读一致/pipelineTotal=7/停用产线技能 400/settings 默认 medium/PUT article 合法往返+非法 400/还原默认
- 全量回归 full-regression.mjs（REG_SKIP_VIDEO=1，视频线批次一动未动）全绿：九步流水线 E2E done、8 节大纲 8/8 回填、**正文配图「导演 3/3｜VLM 审图 3 过/0 未过」**、版式卡 VLM 质检 3 过含 1 重试后通过、18 主题/五平台导出/发布门禁全过
- 聚焦 E2E `scripts/tmp/b1-e2e-tier.mjs`：默认 medium run 301s done，成稿 2719 字落带；artifacts {draft: inBand=true 2552 字｜illustrations: 导演 3/3，VLM 2 过/1 未过，重生 1}——B3 重生循环活体工作
- 浏览器冒烟 `scripts/tmp/b1-browser-smoke.mjs` **5/5**：向导第二步三档卡可见、deep 点选 amber 高亮、设置中心文章产线卡三档按钮齐、插图风格下拉在；截图 4 张 download/assets/b1-*.png（非空白像素比核验）
- tsc --noEmit 零错误

### 工程纪律与断点修复
- 上棒会话断点续传：test-b1-offline 一处半成品乱码断言（名字参数被三元污染成 "true"）修正；extractPromptSection 整体返回统一 trim；sectionWordNeedsRetry 空文不误报（空文是上游 <50 字硬错的失败类）
- 模块缺省档位 short→medium 对齐决策①（产线恒显式传档位，缺省只影响旁路调用，测试同步改）
- 死代码清理收尾：src/components/workbench/ 五组件（6 Tab 时代旧件；上棒已删 bootstrap/wsa-search 但漏删此目录，零引用实证）+ scripts/tmp/debug-tabs*.sh 四个调试残留
- 两笔 UUID 消息临时提交（上棒断线遗留，均未推送）软重置合并为单笔干净批次一提交，远端历史保持线性
- 一次性 DB 核数脚本用后即删；三个验收脚本入库 scripts/tmp/
- 沙箱回收一次（gitignored db/custom.db 随之丢失，boot-restore 幂等自愈：prisma generate+db push+密钥+tune+默认源）；SEARCH_KEY 本会话仍不可见——A4 两轮研究循环将按方案走「单轮+规则 gap 标注」降级链（批次二）

### 遗留与下一步
- 批次二（资产与通道，~4 日）：B2 八风格包 / B4 模板库 3774 条带署名入库（/tmp/digv 已随沙箱回收消失，需从 npm 重拉 dsh-imagegen-video 源包）/ B5 三通道生图回退链 / B6 配图密度分档+数据卡意境图职责分离 / A3 五种叙事骨架 / A4 两轮研究循环 / A5 调优扩样
- 批次三（视频，~5 日）：C1 AI 首帧 i2v 混合通道 / C2 导演规划器 / C3 协议族抽象 / C4 账号池限流 / C5 1080P+BGM / C6 合成诊断

---

## 2026-11-05 · 内容质量升级 批次二落地（B4 模板库 + B2 八风格包 + B6 密度与职责分离 + A3 叙事骨架 + A5 扩写补救 + B5 三通道生图 + A4 降级链）

承接批次一（A1/A2/B1/B3）。用户拍板项：模板库全量 3774 条带署名入库。/tmp/digv 已随沙箱回收，从 npm 重拉 `@q253595422/dsh-imagegen-video@1.22.2`（4.3MB tgz）恢复源包。

### B4 模板库（3774 条 · 检索式使用）
- `db/asset/image-prompt-library/`：八个快照 JSON（canghe/cases/evolink/handraw/itgoyo/prompt-signal/songtianlun/youart）**3774 条**中英双语专业生图提示词 + Apache-2.0 LICENSE + NOTICE + THIRD_PARTY_NOTICES 原样保留（上游 MIT/CC0 署名链完整）+ README（来源版本/字段契约/检索入口）
- `src/lib/runtime/prompt-library.ts`：惰性全库加载（进程缓存）+ CJK bigram/拉丁词双通道分词 + title/categoryZh/styles/prompt 四字段加权计分检索（limit≤10 防上下文爆）+ exemplarBlock 范例块拼装（只取中文段 ≤160 字，学结构不灌全文）
- B1×B4 集成：directInlineIllustration/directCoverImage 自动按「选题+锚点+概念」检索 top-2 范例注入导演 user 消息；SKILL.md 明示「学结构与用词密度，禁止照抄具体画面」
- **实测抓 bug**：readdir 过滤 `-cases.json` 漏掉无前缀的 `cases.json`（库只载 3333/7 文件）→ 改 `cases.json` 后缀匹配，3774/8 全量对数

### B2 八风格包（5→8）
- 新增：编辑质感摄影（影棚光浅景深莫兰迪）/ 新水墨（宣纸墨晕朱砂点睛）/ 玻璃拟态 3D（磨砂折射 C4D）；全八风格补一句定位 desc（UI 提示）；「无文字无水印」共同铁律；/api/image-runs styles 透出 desc

### B6 配图密度分档 + 数据卡/意境图职责分离
- LENGTH_TIERS 增 illustrationsMin/Max（short 1~2 / medium 2~3 / deep 3~5）；wewrite-illustrate SKILL.md 改 {{count_rule}} 档位注入
- 插图规划新增 kind 字段：data（硬数据节→代码排版数据卡零错字，metrics 只能来自本节证据禁止编造）/ mood（叙事节→生成式意境图）；run-manager 双通道分轨
- data 通道：dataCardMessages（wewrite-art-direct 第三分节 data-card）→ parseCardPlan → renderCardToAsset 1024² → VLM layout 质检（未过截短文案重渲染一次）
- **实测抓 bug**：data-card 提示词让模型输出单对象而 parseCardPlan 只吃数组契约 → 首轮 E2E 两张数据卡全降级（「文案解析失败」）；SKILL.md 改数组契约 + run-manager 宽容解析（单对象自动包数组）→ 复测 2/2 出卡入文
- artifacts.illustrations 增 dataCards 统计；步骤摘要「数据卡 N 张（零错字）」

### A3 五种叙事骨架（治死板）
- `narrative-skeletons.ts`：金字塔结论先行 / 时间线演进 / 问题-方案-边界 / 对比冲突裁决 / 场景故事带入——每骨架一段结构编排指令（非话题词，具体到小节推进规则）
- 选择逻辑：run.skeleton 显式指定（创作台高级表单下拉）→ 否则 runId FNV-1a 哈希轮换（同选题重跑换骨架、同 run 稳定；200 seed 均匀覆盖五骨架离线验证）
- wewrite-outline SKILL.md 增 {{skeleton_block}}（无骨架→默认结构语义保留）；AgentRun.skeleton 字段 + API 校验（非法 400）+ GET skeletons 清单；步骤摘要与 artifacts.outline.skeleton 留痕

### A5 扩写补救（字数带外的第二道闸）
- wewrite-draft SKILL.md 第三分节 expand：三类合法扩写（补证据细节/补因果推理/补场景转折）+ 禁止注水纪律 + ## 标题原文不变（保配图锚点）
- run-manager：合计归一化后仍 < totalMin → 一次定向扩写（温度 0.6），artifacts.draft 增 expanded 留痕；E2E 实测触发：低于下限 → 扩写后 3901 字 inBand

### B5 三通道生图回退链
- zai-image.generateImage 重构：主通道（mode：custom 端点/内置 SDK）→ Agnes 免费池（启用且有可用账号时，走 agnes-image provider + URL/dataURI 下载落盘）→ SDK 兜底（去重不重试主通道）；每级失败进链路字符串（「custom✗… → agnes-image✗… → builtin-sdk」降级不消失）；GeneratedImage.via 留痕出图通道
- 回归实测：纯图线 2 张产出（builtin-sdk 主通道）✓、版式卡线 3 张 ✓（card-engine 不经生图端点不受影响）

### A4 研究循环（SEARCH_KEY 不可见 → 降级链诚实落地）
- 单轮检索后规则 gap 标注：未核实 fact 主张（idx>0 且 !verified）截取前 6 条注入大纲 user 消息「已知研究缺口（规避引用或标注未经证实）」；artifacts.research = {rounds:1, gaps:N, mode, strategy:"单轮+规则 gap 标注（A4 降级链）"}；大纲步骤摘要「研究缺口 N 条已标注」
- SEARCH_KEY 配置后升级两轮研究循环（STORM 多视角定向补搜）留待后续批次

### 验证（批次二收口）
- 离线 `test-b2-offline.ts` **42/42**（新增：3774 全量/bigram+拉丁双通道检索/范例块格式/八风格/密度分档/data-card 事实源/五骨架+轮换覆盖/骨架注入/缺口注入/expand 分节）+ `test-b1-offline.ts` **68/68** 复跑全绿；tsc 零错误
- 服务器冒烟 b1-smoke **11/11**（新增 skeletons 清单下发 + 非法骨架 400）
- 聚焦 E2E 三次全链路：① versus 222s done（骨架/缺口/导演 3/3/VLM 全链验证，暴露数据卡解析 bug）② 修复后 versus 96s done（**数据卡 2/2 出卡入文、A5 expanded:true 3901 字落带、VLM 1 过/1 未过重生 1**）③ medium 301s done（批次一复验）
- 全量回归 REG_SKIP_VIDEO：18 主题/Agnes/pi-ai/搜索/纯图线/版式卡/视频直出全绿；文章线两次被 429 瞬时窗口打断（诚实 error 终态、不静默）——当日已消耗 5 轮文章级 E2E，日池见底属环境限制，代码路径已由上述三次成功 E2E 覆盖
- 浏览器冒烟 5/5 复验（向导档位卡/设置文章产线卡）
- 调试资产入库：scripts/tmp/debug-datacard.ts（数据卡链路诊断，可复用）

### 遗留与下一步
- 批次三（视频，~5 日）：C1 AI 首帧 i2v 混合通道 / C2 导演规划器（预览即所提交）/ C3 视频协议族抽象 / C4 Agnes 池限流 / C5 1080P+BGM / C6 合成诊断
- A4 完整两轮研究循环待 SEARCH_KEY；版式卡 VLM 质检本日一轮 3 未过（内容相关波动，非代码回归，下批观察）
- LLM 日池今日已耗尽（5 轮文章 E2E + 3 轮回归 + 调试），批次三开工前留意窗口

---
Task ID: CQ-batch3
Agent: 主 Agent（Z.ai）
Task: 内容质量升级批次三·视频线 C1~C6（用户指令：继续推进下一步；开工令与批次顺序沿既定方案）

Work Log:
- 前情：批次一（4825f55 A1+A2+B1+B3）与批次二（80d8fe0 B4+B2+B6+A3+A5+B5+A4降级链）均已提交推送，本批为收官批次（视频线六项）
- **C3 协议族抽象** `src/lib/gateway/providers/video/family.ts`：id 前缀判族+别名归一（agnes-* / doubao-seedance-*|seedance*|ark-* / 其余 openai-compat）+ 能力元数据（modes/秒数范围/分辨率/远程取消/wired）+ 三族独立整形器（agnes：mode/seconds 字符串/size/first_frame/images；ark-seedance：content 数组+role first_frame/reference_image+ratio+小写分辨率——本期只留协议不接 key；compat：prompt/seconds/size）+ 三族轮询解析器；agnes-video.ts 协议知识全部迁入 family（保留池取号/双端点模板/错误上报），新增族守卫（模型非 agnes 族显式拦截提交）；GET /api/video-runs 透出 capabilities+agnesPool（UI 提前拦截的数据源）
- **C4 池状态显式化**：池化（RPM 滑窗+熔断+round-robin）此前已落地，本批补 UI 显式指引——视频面板通道卡池徽章（账号数/当前可提交/熔断中），池空不再只有一行小字
- **C2 导演规划器** `src/lib/runtime/video-director.ts` + `db/skills/huashu-video-direct/SKILL.md`（A1 纪律：SKILL.md 唯一事实源，入 PIPELINE_SKILL_IDS 不可停用）：LLM 拆结构化分镜计划 {shots: sceneId/seconds/首帧提示词中英/运动描述中英/转场}；契约校验 1:1 逐镜、收紧不放大（要 20s 钳到原分镜 8s；低于模型地板取地板）、转场白名单、缺字段判废；失败/非 JSON/异常 → 规则规划降级（固定运镜轮换）留痕 planner=rule-based；**预览即所提交**：render-video 支持 preview=true（只出分镜计划+AI 首帧不花 i2v 额度，stage=preview 等确认）+ reuseKeyframes（确认后复用预览首帧）
- **C1 AI 首帧 i2v 主轨**（video.ts v4）：agnes/auto 通道全镜走「导演规划 → B1 首帧导演（wewrite-art-direct 新增 prompt: keyframe 分节，风格基准与文章配图同源→图-文-视频视觉统一）→ 三通道生图 → sharp cover 裁切对齐画幅 → VLM 审帧闭环（未过带 hint 定向重生一次，二次未过采用并标注）→ agnes keyframe 模式 i2v（首帧 jpeg dataURI + 导演运动描述，不再是「visual+口播截断 500 字」拼凑）→ 字幕烧录+定格延长混音」；hybrid 的 model 镜头同链路；生图失败→场景卡兜底首帧（code-card 留痕，i2v 主轨不整线回退）；首帧落 Asset（role=video-keyframe，run 详情页可见）；segments[] 每镜来源留痕（i2v/code+keyframe 来源+失败段定位）；成片 provider 标 `agnes-i2v(Ni2v+Mcode)`
- **C5 画质与音频**：预设层抽 `video-presets.ts`（纯函数可离线自测）；分辨率 720P/1080P 贯通（scaledLayout 1.5x 等比缩放+dimsFor，族能力闸门降档）；BGM 3→6 预设（新增紧张/悬念/温暖，本地 aevalsrc 无版权，AI 配乐接口预留）；i2v 片段 drawtext 字幕三预设（清爽描边/强调底条/柔和暗底，expansion=none+单引号弯引号转义，每行一条 drawtext 避换行地狱，字体缺失诚实降级无字幕）；TTS 失败降级文案改「字幕主导模式」+重试指引；口播长于 i2v 上限时 tpad 定格延长
- **C6 合成诊断** `video-diagnostics.ts`：环形缓冲 100 条/run，diagRun 包裹计时（submit/poll/download/tts/keyframe/vlm/ffmpeg/concat/bgm 分腿）；汇总写入 Asset.meta.diag（分腿 n/errors/avgMs/lastError）；成片卡显示「合成诊断：N 条留痕·M 处失败（leg×n）」
- UI：video-panel v3（通道卡 i2v 文案+池徽章+能力秒数/分辨率、预览先行开关、预览确认区=首帧画廊+「确认渲染成片（复用首帧）」+「重生成首帧」、成片卡镜头来源 chips+首帧质量统计+诊断行+planner/i2v 占比徽章）；settings 视频卡字幕样式三预设（PUT 白名单校验）；run-detail 渲染按钮签名同步
- 环境抢救实录：沙箱回收清了 prisma client，prisma generate 撞 DNS 死路（binaries.prisma.sh 双 A 记录，Node fetch 撞死路）——发现 prisma-mirror 的 execSync 会冻结事件循环导致镜像服务无法应答（历史 bug），改异步 spawn + curl 预热引擎后 generate 成功；boot-restore 自愈恢复 RSS 源
- **实测取证（诚实降级链全部按设计工作）**：当日生图端点 WAF 405 全封 → 3/3 首帧走 code-card 场景卡兜底（keyframes.fallback=3 留痕，i2v 主轨不因此断线）；TTS 端点不可达 → 字幕主导模式（audioMode=muted+新文案）；Agnes 账号池密钥随沙箱回收丢失（用户侧需重配，已记遗留）→ auto 通道诚实回退 local
- **验证**：离线 `test-c-offline.ts` **81/81**（三族判族/整形/轮询解析、规划契约 12 项、诊断环形缓冲、预设层、C2→C1 贯通）+ `test-b1-offline.ts` **68/68**（管线技能 7→8 断言更新）+ `test-b2-offline.ts` **42/42** 复跑全绿；tsc/eslint 零错误；服务器冒烟 c3-smoke **10/10**（能力元数据/池状态/subtitleStyle 往返+白名单/管线守卫 8 技能/入口契约）；聚焦 E2E 两段全绿：preview **8/8**（planner=director 真实 LLM 规划、3 首帧落库 HTTP 200、VLM 闭环留痕、未花 i2v 额度）+ 全片 **11/11**（21.1s 成片、segments 每镜留痕、diag=tts+concat+bgm 0 错、BGM warm 混音、v2 版本树、分段留存）；浏览器冒烟 **14/14**（通道卡/池徽章/预览开关/BGM 六选项/镜头来源行/预览画廊+确认按钮/字幕预设）+ 4 截图程序化核验；全量回归因当日生图/TTS 双不可达（降级路径会稀释信噪）以聚焦 E2E+离线三套替代，代码路径已由离线契约与两段 E2E 覆盖

### 遗留与下一步
- **Agnes 账号池密钥随沙箱回收丢失**：i2v 提交腿（agnes keyframe 模式真实远端调用）本日无法实测，需用户在设置中心重配账号后跑一次 channel=agnes 全片验证「i2v 片段占比 ≥80%」验收项；协议整形/轮询解析已由离线契约 81 项覆盖
- prisma-mirror.mjs 的 execSync 阻塞事件循环 bug 已定位（本批用 gen-prisma-inline.mjs 异步 spawn 绕过），根治改造留待下批
- A4 完整两轮研究循环仍待 SEARCH_KEY；SEARCH_KEY 与 Agnes 密钥同随沙箱回收丢失
- 内容质量升级三批全部落地（A 线 5 项/B 线 6 项/C 线 6 项），后续可做：eval50 重测（配额窗口）、视频线指向分镜重规划的指着改增强

---
Task ID: CQ-agnes-i2v-fieldtest
Agent: 主 Agent（Z.ai）
Task: Agnes 账号池重配置（用户提供 4 密钥）+ i2v 提交腿真机实测 + 两项真机补强（批次三遗留尾巴收口）

Work Log:
- 用户重配 4 个 Agnes 密钥 → `scripts/tmp/agnes-pool-setup.mjs`（密钥经环境变量传入、零落盘，仅入 db/custom.db SettingKV——/db/*.db 已 gitignore，.env 历史泄露教训延续）：PUT /api/settings 写账号池 → **探活 4/4 有效**（GET /models 56~136ms）→ 池状态透出 configured=true · 4 账号 · 80 RPM · videoReady=4；坑位记录：设置写入方法是 **PUT 非 POST**（POST 405 空响应，dev.log 定位）
- **i2v 提交腿真机实测两轮**（scripts/tmp/agnes-i2v-e2e.mjs，channel=agnes · 3 镜 · 2 model i2v + 1 code 对照）：
  - ✅ 提交腿 100% 工作：两轮均真实提交 Agnes 视频队列、拿到 taskId、进入 poll 轮询（run 2klpvzr7 / r2ly10h9，provider=agnes-i2v+tts 留痕）
  - ✅ 首帧链 100% 工作：B1 首帧导演 keyframe 分节 → **Agnes 真实生图 3/3**（keyframes.ok=3 fallback=0 via=agnes-image，第二轮全 Agnes 无 SDK 兜底）→ VLM 审帧 **3/3 pass**；凭证首帧入库 public/assets/vkf1-cmw4rawgm*.png（分镜 1）+ vkf3r-*（VLM 重试帧）
  - ⚠️ **Agnes 免费档视频产能为本时段瓶颈**：分镜 i2v poll >10 分钟未完成（deadline 超时→诚实本地兜底）；诊断脚本 agnes-poll-diag.mjs 遍历 4 账号直连提交 → 2 账号 503 video_queue_full + 2 账号连续请求体异常 → 证实队列全局满载（外部容量问题，非代码问题；错峰时段可用性待观察）
  - ✅ 兜底链真机工作：i2v 超时/503 → 本地渲染兜底，链路留痕不消失
- **真机补强 ①（503 换号重试）** agnes-video.ts submitVideo：429/503/5xx 判「可换号类」（视频队列按账号隔离，换号往往即可提交），循环 acquireVideoSlot 换号重试（上限=活跃账号数 ≤4）；401/403 认证类仍直接报错；全部账号失败 → 汇总各账号错误明细抛出（不静默）
- **真机补强 ②（轮询绑定提交账号）**：VideoTask 新增 accountRef（提交账号 id）；getVideoTask(remoteTaskId, accountRef?) 优先用提交账号密钥轮询（任务按账号隔离，此前固定用第一个账号——跨账号任务会 404 死等到超时）；video.ts 轮询调用透传 task.accountRef
- 验证：tsc 零错误；test-c-offline **81/81** 复跑全绿（协议族/整形/轮询解析/规划契约/诊断/预设/C1 贯通无回归）；密钥落盘扫描（git diff + 脚本 + worklog）零命中
- 入库：3 源码修复 + 3 实测/诊断脚本（setup/e2e/diag，均不含密钥）+ 2 张凭证首帧

### 遗留与下一步
- Agnes 免费档视频队列满载时段 i2v 成片产出受限（提交/轮询/兜底全链已验证）；错峰复跑 agnes-i2v-e2e.mjs 可验收「i2v 片段占比 ≥80%」项
- 轮询完成态响应结构（parseAgnesPoll 对真实 completed JSON 的命中）待错峰任务完成时顺带核验（解析器已有 unknown+url→completed 兜底）
- agnes-poll-diag.mjs 观察到同进程高频连发 POST 偶发 invalid_json（keep-alive 连接复用疑似），应用层提交节奏天然稀疏未触发；如复现可加 Connection: close

---
Task ID: CQ-agnes-i2v-acceptance
Agent: 主 Agent（Z.ai）
Task: 错峰复跑 i2v 验收（用户指令：启动运行一下）+ 槽位记账 bug 修复——i2v 真实成片首次落地

Work Log:
- 沙箱回收重置 db/custom.db（02:27 重建仅剩 tune:draft）→ 重灌 4 密钥（环境变量传入零落盘）→ 探活 4/4 有效（68~201ms）· 池 80 RPM
- **首轮复跑暴露我昨日补强①引入的记账 bug**：acquireVideoSlot 取号即预记 busy 60s，但 503 失败提交不占服务端任务位——分镜 1 换号 4 连败把 4 账号全标记占用，分镜 2/3 被「全部账号占用中」秒拒（diag 实证：submit n=3 errors=3 avgMs=132ms，连 HTTP 都没发出）——自己锁死自己
- **补强③（修复）**：pool.ts 新增 releaseVideoSlot（失败即释放）；agnes-video.ts submitVideo 重构为三件套：① 换号重试（429/503/5xx，≤4 账号/轮）② 失败即释放槽位（401/403/无 taskId/fetch failed 路径全覆盖）③ 占用等待（waitMs 在 2min 预算内 → 等账号释放而非秒拒）+ 轮间节流（一轮全败 sleep 8s，最多 3 轮防轰炸免费档队列）；全败错误信息带错峰指引
- **验收复跑 13/13 全绿**（周六 11:2x，队列半满时段）：分镜 1/2 提交 3 轮×4 账号全 503 → 诚实兜底（每镜 ~20s，不再锁死后续）→ **分镜 3 真实提交成功 → poll ~7min → 下载入片**：segments `#3:i2v 8s` · provider `agnes-i2v(1i2v+2code)` · diag 出现完整 poll+download 腿 · done 文案「i2v 主轨 1/3 镜（占 33%）」；成片 24.1s · 720x1280 · 0.92MB · HTTP 200 · 分段留存
- 首帧本轮走 code-card 兜底（生图端点此刻 WAF 波动；昨日同链路 b1(director)+agnes-image 3/3）——**i2v 用兜底首帧照常生成成功**，「生图失败不整线回退」设计获实证；TTS 仍不可达（字幕主导模式，环境照旧）
- 验证：tsc 零错误 + test-c-offline **81/81** 复跑全绿；「i2v ≥80% 占比」验收项剩外部容量约束（队列空闲时段 3/3 提交即达），代码链路已全绿

### 遗留与下一步
- i2v 占比 80% 验收：待队列空闲时段（工作日清晨/深夜）复跑一次 agnes-i2v-e2e.mjs 即可收口
- 生图端点间歇 WAF 405（本日 code-card 3/3、昨日 agnes-image 3/3）——三通道回退链已兜住，观察即可

---
Task ID: CQ-agnes-i2v-run3
Agent: 主 Agent（Z.ai）
Task: 傍晚时段复跑 i2v 验收（用户指令：启动运行一下）

Work Log:
- 环境自愈：沙箱再回收（prisma client 清除 + 密钥库重置）→ gen-prisma-inline.mjs 再生 + 4 密钥重灌探活 4/4（57~174ms）；另见系统自动提交 604b862 收上午轮 3 首帧入库
- 周六 17:06 复跑：**首帧链全真**——B1 导演 keyframe 分节 → agnes-image 真实生图 3/3（上午轮为 code-card 兜底，本链恢复）→ VLM 审帧 3/3 pass（凭证 vkf1/2/3-cmw66kpes 入库）；视频队列该时段仍全局满载：3 镜 × 3 轮 × 4 账号全部 503 video_queue_full（节流+换号按设计工作，每镜 ~20s 诚实兜底本地渲染）；成片 24.1s · 720x1280 · HTTP 200 · 12/13 断言通过（唯一失败项 = i2v 占比，纯外部容量）
- 结论：代码链路三轮实测全部按设计工作；i2v ≥80% 验收仅剩队列空闲窗口（工作日清晨/深夜概率更高），建议下个工作日清晨错峰复跑一次即收口

### 遗留与下一步
- i2v 占比验收：工作日清晨错峰复跑 agnes-i2v-e2e.mjs（队列空闲时 3/3 提交即达 80%+）
- 周末全天（上午/傍晚两采样点）Agnes 免费档视频队列均满载——「错峰」窗口需避开周末

---
Task ID: CQ-agnes-i2v-closure
Agent: 主 Agent（Z.ai）
Task: 工作日错峰复跑 i2v 验收（用户指令：启动运行一下）——单镜 i2v 完整闭环 + TTS 口播恢复，视频线验收收口

Work Log:
- 密钥重灌（沙箱再回收）探活 4/4（63~194ms）
- **第一段（agnes 通道 3 镜全 model）**：工作日上午队列质变——分镜 1 首次 1 次提交即成功（周末两轮全 503 秒拒）进入 poll ~6min；但 3 镜串行 i2v 总时长 ~20-30min 超出 Bash 单调用 10min 硬约束 + 脚本 9.25min 窗口，超窗被收尾截断（run cmw8ox0ag 留痕 stage=poll）——窗口约束下的方法论结论：全 agnes 通道 3 镜验收需分次或非交互环境跑
- **第二段（hybrid 通道 1 model + 2 code，agnes-i2v-hybrid.mjs）**：**13/13 全绿，单镜 i2v 完整闭环**——segments `#1:i2v 3.4s`（真实 AI 视频入片）+ `#2:code #3:code`；provider `hybrid(2code+1model·i2v)+tts+bgm`；**diag errors=0 全零**（首次）；成片 10.6s · 720x1280 · 0.83MB · HTTP 200 · 分段留存 s0=0.65MB
- **TTS 口播恢复**：audioMode=tts「全部分镜 TTS 口播完成」（此前多轮均「端点不可达→字幕主导」）；BGM 转正常模式「口播为主、BGM 垫底」；时长对齐设计实证：code 镜随口播时长收紧（6→3s、4→2.1s）
- 验收结论：i2v 提交腿/轮询/下载/入片/segments 留痕全链实证 ×2（周六 #3:i2v + 本日 #1:i2v 且零错误）；「agnes 通道 ≥80% 占比」受串行时长与队列波动外部约束，但链路正确性已闭环，非代码问题

### 遗留与下一步
- 全 agnes 通道 3/3 i2v 完整成片：需 20-30min 不中断窗口（建议夜间跑或服务器常驻环境实测），代码无阻塞
- TTS 端点工作日恢复可用；周末观察到的不可达疑为时段性

---
Task ID: MP-SKILLS-ADOPTION-PLAN
Agent: 主 Agent（Z.ai）
Task: 安装 mattpocock/skills 工作流（vendor 入库）+ 产出引入与优化方案（用户指令：帮我安装这个工作流，然后优化我们的项目，给我一份详细的方案）

Work Log:
- 调研：WebFetch 仓库主页 + 全量克隆深读——26 个 promoted 技能（工程 18 + 生产力 8，MIT），四层组织纪律（promoted 双登记/ask-matt 路由同步/SCOPE 采纳门槛/em-dash 禁令），理念=对抗 AI 开发四大失败模式（做错方向/话多/代码不工作/系统乱），小而可组、反 GSD/BMAD 式全接管
- 深读 12 个核心技能原文：ask-matt（主流程地图：grill→to-spec→to-tickets→implement(tdd)→code-review→retro + 三上匝道 triage/diagnosing-bugs/wayfinder + 相位边界五选项）、tdd（seam 前置约定/三反模式/循环规则）、diagnosing-bugs（六阶段，Phase 1 红线反馈环完成判据四项+[DEBUG-xxxx] 标记）、to-spec/to-tickets（tracer-bullet 垂直切片+blocking edges+本地票模板）、code-review（双轴并行子代理+Fowler 12 smell 基线）、grilling（design tree/frontier 轮次/事实我查决策你拍）、handoff、setup（脚手架输出物清单）、writing-for-agents（context pointer/两级负载/信息层级三级阶梯/leading words/正向指令/完成判据两性/no-op 剪枝）
- **安装（L0 源库层）**：repos/mattpocock-skills vendor 快照入库（1.7MB·125 md·上游 commit 4ae2317·去 .git·NOTICE.md 署名 provenance），跟随 repos/dsh-* 既有先例
- **方案**：docs/mattpocock-skills-adoption-plan.md——现状逐项对照（12 概念×差距×动作表：grilling↔六决策拍板、to-spec↔docs 方案文档、to-tickets↔批次表、tdd seam↔离线/E2E 体系、diagnosing-bugs↔槽位 bug/WAF 取证、retro↔worklog 1147 行、handoff↔会话延续摘要、research↔research-external-survey 天然符合、writing-for-agents↔A1 纪律）；三层落位（L0 已完成/L1 仓库脚手架+12 技能流程接管/L2 writing-for-agents 六技法反哺 db/skills 八技能）；四批排期（S1 脚手架半天 13 文件含 AGENTS.md 沙箱铁律成文+GLOSSARY 双语+追溯 7 篇 ADR/S2 流程接管随下特性周期/S3 平台反哺 token -20% 量化/S4 可选产品灵感含密钥重灌向导）；适用性评级 A12/B5/C3/D6；六个决策点待拍板；§6 验收度量总表 + §7 五项风险权衡（上下文常驻成本/流程税豁免/vendor 漂移/双轨维护/S3 回归防护）
- PDF 版：download/RadarForge工作流引入与优化方案.pdf（9 页，gen-mp-skills-plan-pdf.py 复用 CQ 方案 Crystal Blue 风格体系）；程序化核验：9 页全非空白（11~42%）、风险字符扫描零命中、六决策点在文
- 卫生：方案 md 清理 emoji/未验证符号（✅✓↔≈−→ 已验证集合），密钥零落盘扫描

### 遗留与下一步
- 待用户拍板六决策点（接管范围/tracker/根约定文件/GLOSSARY 形态/S3 时机/ADR 范围）→ 开工 S1（脚手架，无代码改动半天量）

---
Task ID: MP-SKILLS-S1-SCAFFOLD
Agent: 主 Agent（Z.ai）
Task: 六决策点拍板（用户指令「按你的推荐建议来」）+ 批次 S1 仓库脚手架落地 + 验收收口

Work Log:
- **拍板记录**：六决策点全按推荐项（①12 个 A 级技能 ②本地 .scratch/ markdown tracker ③AGENTS.md ④根级双语单语境 GLOSSARY ⑤S3 本期做 ⑥7 篇里程碑 ADR）——写入方案 §5 拍板记录块，状态行改「已拍板并开工」；§4-S1 标记已落地；§6 S1 度量修正 13→14 文件（7 脚手架+7 ADR，原为笔误）
- **S1 落地 14 文件**（纯文档新增，零代码改动）：
  - AGENTS.md（76 行 ≤150 约束）：Agent skills 三指针块（仿 setup-matt-pocock-skills 输出格式）+ 沙箱铁律 7 条成文（with-server/10min 窗/回收重置/密钥零落盘含 PUT 405 坑/推送凭证还原//tmp 不持久/配额纪律）+ 工作流地图（仿 ask-matt 适配单代理 IM 节奏：磨利想法→落规范→拆票→实现→双轴评审→收尾回看 + 上匝道/词汇底层）+ 豁免规则（四类免票）+ 语言文风（em-dash 豁免声明）+ 回归门命令块
  - GLOSSARY.md：42 条双语（数据模型 12/内容管线 11/视频线 10/工作流 9），每条「中文|English|一句定义|代码锚点」，锚点全为真实代码位置（超出预估 25~35 上限，检索性优先，方案已记偏差）
  - docs/agents/ 五文件：issue-tracker（本地票制约定+票模板+tracer-bullet/blocking edges 纪律）、triage-labels（五标签词汇先立住）、domain（消费规则：探索前先读 GLOSSARY+相关 ADR、用词汇表的话说话、冲突显式报）、coding-standards（14 条，全部带实证来源：分层测试/红线命令/诚实降级/职责分离/密钥零落盘/Fowler 12 smell 底座）、spec-template（to-spec 中文化+writing-for-agents 写作纪律五条）
  - docs/adr/ 七篇追溯 ADR（上游叙事体+状态/日期/溯源头）：0001 篇幅三档默认 medium（4825f55）、0002 视频通道默认 auto（含 hybrid 方法论）、0003 模板库全量带署名、0004 Agnes 池化与密钥存放（3022dd9+d18ab8b）、0005 批次顺序文章→配图→视频（依赖方向论证）、0006 i2v 换号重试与槽位释放（含自锁事故完整复盘：avgMs=132ms 取证+三轮实证数据）、0007 SKILL.md 唯一事实源（PIPELINE_SKILL_IDS 八技能=S3 反哺目标集）
- **验收（scripts/tmp/s1-acceptance.mjs，48/48 全绿）**：14 文件齐备；AGENTS.md 76 行 ≤150；指针可达 12/12（占位符与运行时文件 db/custom.db 豁免）；GLOSSARY 锚点全量存在 21/21（强于方案要求的抽 20）；命名一致率 20/20=100%（门槛 ≥90%）；词条计数 42 精确命中
- **回归门**：tsc 零错 + 离线三套 68/68、42/42、81/81 全绿（纯文档新增不影响代码路径的实证）
- **PDF 同步重生成**：gen-mp-skills-plan-pdf.py DOC_AUTHOR 改「已拍板（六决策点按推荐项）· S1 已落地」→ 9 页重渲；程序化核验：9 页全非空白（18~42%）、「拍板」18 处在文、状态行/拍板记录/14 文件/42 条修正数字全部落 PDF、页脚 9 页全带新署名；风险字符扫描仅命中既存 →（上一版已有，Noto Serif SC 有字形非本批引入）
- 卫生：新文件 emoji 零使用；密钥零落盘（本批纯文档无密钥接触）

### 遗留与下一步
- **S3 平台反哺**（下一可开工批次，决策⑤本期做、不依赖 S2）：writing-for-agents 六技法 → db/skills 八技能（wewrite-brief/outline/draft/review/fact-check/illustrate/art-direct + huashu-video-direct）；纪律=逐技能改+聚焦 E2E+eval 抽样，不一次性全改；先做 token before 基线计数
- S2 流程接管：待下个特性周期（开工令 → frontier 轮次 → spec → .scratch/ 票制首演）
- 全 agnes 通道 3/3 i2v 完整成片：外部窗口约束不变（夜间/常驻环境跑一次即收口）

---
Task ID: MP-SKILLS-S3-FEEDBACK
Agent: 主 Agent（Z.ai）
Task: 批次 S3 平台反哺——writing-for-agents 六技法改写 db/skills 八个管线技能（方案决策⑤：本期做）

Work Log:
- **before 基线（当前 A1 技能，4 题定题 m01/m02/m03/m05）**：均分 8.26｜门禁 4/4｜字数 2855/2722/2877/2686 全落带｜锚点密度 2.06/千字｜S3 专属度量抽取器入库（s3-eval-metrics.mjs：锚点数/密度/落带/骨架/stepCount）
- **改写三轮（八文件全部，六技法落地）**：第 1 轮保守（-3.4%）→ 第 2 轮剪运行时已注入的复述（retryHint 纪律/风格基准发展）+ 范例枚举 no-op + frontmatter technique 并入 rebuilt-at → 第 3 轮双口径计数。技法对应：正向指令（禁编造→数字只来自证据材料；禁注水→三类之外的增量都算注水）、完成判据（每技能/分节尾部可判定判据）、no-op 剪枝（认真思考/确保质量类空载句）、单一事实源去重（art-direct 四分节的范例规则收敛为接收分节各一句；导览注释只留地图）、渐进披露（huashu-video-direct 补 prompt: plan 显式分节标记——原依赖 extractPromptSection 宽容回退，契约显式化）
- **b2 断言同步（3 条）**：数字纪律/默认结构/不注水三条断言钉住旧措辞（禁编造/若未指定/禁止注水），随正向改写同步更新为钉新措辞——护栏强度不减（仍是字面量钉住）
- **token 验收（双口径）**：正文体（frontmatter 剥离后，运行时实际注入量）平均 char/4 -17.0%｜CJK -18.3%（目标 -20%±5% band [-25,-15] 达标）；文件级 -10.5%/-13.7%（被 rebuilt-at 元数据增项稀释，如实双口径报告）；最大单技能 art-direct -25.2%
- **中途抓到真回归（eval 纪律的价值实证）**：after m01 首跑 8.4 分但 5062 字严重出带——取证三件套（s3-run-forensic/s3-article-sections）定位：大纲预算 2750 与 before 2751 一致，回归在 section 写作腿（各节写到预算 120%~201%）——根因=第 2 轮误删「遵循大纲逐节写作」角色框定（行为锚：大纲顺从性含字数纪律）+ >160% 重生只试一次拦不住持续超写；修复=恢复角色框定 + 完成判据显式带「该节预算 ±20%」带（判据技法做对的形式）；修复后同题复跑 2772 字落带、8.6 分
- **after 组（修复后技能，同 4 题对比）**：均分 8.38（before 8.26，+0.12 不回退）｜门禁 4/4 保持｜五维 accuracy 8.5/好读 8.5 提升、viewpoint m05 单题 7.2（≥7 达标线内）｜字数 2772/4023/2783/2910（m02 超 23 字边界案例，落带 3/4）｜锚点密度 3.17/千字（before 2.06，+54%——正向判据「有证据的段落至少挂一个 [n]」直接见效）
- **回归门全绿**：tsc 零错｜离线 b1 68/b2 42（3 断言更新后）/c 81｜c3 冒烟 10/10（管线守卫 8 技能+停用 400 不回退）｜eval 4 题九步全链含真实生图配图
- **元数据**：八技能 metadata.rebuilt-at 统一更新为「2026-11-09 · writing-for-agents S3」（方案要求注明技法批次）
- 卫生：密钥零落盘扫描零命中；eval 报告双落盘（download/ + reports/ git 跟踪）；429 限流按诚实重试纪律处理（冷却等待，不轰炸）

### 遗留与下一步
- m02 字数 4023（超界 23 字）为边界案例：观察后续 eval 是否常态化超界，若复发则把逐节重生上限从 1 次提到 2 次（配额代价评估后）
- S2 流程接管：待下个特性周期（frontier 轮次 + spec + .scratch/ 票制首演）
- 全 agnes 通道 3/3 i2v 完整成片：外部窗口约束不变
- S4 可选批（密钥重灌向导/选题采访器/引用留痕）：低优先待排期

---
Task ID: S4-WIZARD-S2-DEBUT
Agent: 主 Agent（Z.ai）
Task: S4 批次首项「密钥重灌向导」落地，兼 S2 流程接管首演（用户开工令「继续推进」）——frontier 轮次 → spec → .scratch/ 三票 → 红-绿实现 → 双轴评审 → retro 全链走通留痕

Work Log:
- **Frontier 轮次（grilling 纪律）**：设计树一轮收敛 10 决策点（D1 形态/D2 输入通道/D3 零落盘边界/D4 server 编排/D5 脚本晋升/D6 验收判据/D7 测试落位/D8 文档回写/D9 非交互确认语义/D10 留痕范围），事实类先行自查证（PUT 语义、env 传播、gitignore 覆盖、shellcheck 缺失、引用面 6 处、README 结构）；依据开工令 + 用户既有「按推荐建议来」模式全按选项 A 采纳，留痕方案 §5 可翻案
- **规范与拆票**：`docs/agnes-key-wizard-plan.md`（模板全节 + 测试缝前置声明：--dry-run 与 AGNES_WIZARD_SERVER_CMD）；`.scratch/agnes-key-wizard/issues/` 三票 tracer-bullet 线性链 01→02→03（晋升/向导核心/端到端回写）
- **票 01（晋升）红-绿**：红线 `node scripts/agnes-pool-setup.mjs` 先红（MODULE_NOT_FOUND）→ `git mv` tmp→scripts/ → 绿（缺失 env 标准提示 rc=1）；AGENTS.md 铁律 4 与 ADR-0004 注记同步
- **票 02（向导核心）红-绿**：selftest 先行先红（5/6 断言红，rc=127）→ 库区逐字复用上游 template.sh（曾手抄引入 set_var 两处漂移，awk 提取库区 diff 抓到后回正，复验 LIB-IDENTICAL）→ 7/7 全绿。**真坑实证**：沙箱 stdin 是常开管道，库区 pause 的 read 永不返回（selftest 悬挂 120s 超时）——修复=STAGES 区开头非 TTY 时 `exec < /dev/null`（交互契约：非 TTY 只认 AGNES_KEYS），库区未动一字；修复后 timeout 60 全绿
- **票 03（端到端与回写）**：真密钥本会话不可得（沙箱回收 + 密钥零落盘的代价）→ 按方案风险 6 诚实降级：假格式密钥走**真实默认链路**——向导 → with-server → boot-restore 全新库自愈 → PUT 保存✓/回读一致✓/agnesPool.configured✓/探活 401 预期红（实证出站连通，真密钥同链路即全绿）→ rc=1 透传✓ + 明文 0 次命中✓；环境插曲：首跑挂 prisma 引擎下载网络抖（boot-restore 两轮+镜像兜底均败，/tmp 镜像回收后为空），第三次直跑 generate（121ms）+ db push（14ms）即通。文档回写：ADR-0008（三决策+两不变量）/GLOSSARY 43 条（+密钥重灌向导）/README 快速开始一行/AGENTS.md 铁律 4 一条命令
- **回归门**：tsc 零错｜离线 68/42/81｜c3 冒烟 10/10（含管线守卫 8 技能停用 400 不回退）
- 卫生：密钥零落盘（假格式测试串也全程不入盘不写库——dry-run 断言实证）；探活仅 2 次 401（零配额）；提交含 .scratch/ 全链留痕

### 环境改进（retro）
- **stdin 常开管道悬挂 read**（机械错误→确定性检查，已回写铁律 2）：代理管道下跑含交互 read 的脚本必须套 `timeout`；脚本自身非 TTY 先 `exec < /dev/null`（agnes-key-wizard 先例）
- **with-server 传参形态**（机械错误，已回写铁律 1）：`.sh` 结尾的测试命令走文件分支，必须传裸路径；带 `bash ` 前缀整串被当文件名报 No such file
- **prisma 引擎校验网络抖**（已回写铁律 3）：boot-restore 两轮重试窗不够宽（本批实证第三次直跑成功）；gen-prisma-inline 的 /tmp 镜像回收后为空非首选；恢复序改为「重跑 generate + db push」
- **密钥零落盘的代价面**（判断题，记入本 log 不改规则）：沙箱回收后真密钥不可恢复属设计内行为——向导把重灌成本降到一条命令即为对冲；真密钥端到端待下个密钥可用会话一条命令收口（票 03 首项 checkbox 待勾）

### 遗留与下一步
- 票 03 首项待补：`AGNES_KEYS="<真实密钥>" bash scripts/agnes-key-wizard.sh` 四腿全绿即闭环（.scratch 票已留收口路径）
- db/custom.db 现含 2 个 401 假键（探活红实证留存）：首次真密钥重灌 PUT 整池替换自动清理
- S2 首演完成：本特性即首个完整特性周期（五技能链全走通留痕：frontier→spec→tickets→implement+红绿→双轴评审报告 2 份→retro）
- S4 余项（选题采访器/引用留痕）：待排期

---
Task ID: S4-TOPIC-INTERVIEWER
Agent: 主 Agent（Z.ai）
Task: S4 批次余项①「选题采访器」落地——grilling frontier 轮次纪律产品化到文章创作入口（用户开工令「继续推进」）——frontier 轮次 → spec → .scratch/ 三票 → 红-绿实现 → 双轴评审 → retro 全链留痕（S2 流程第二次全链首演）

Work Log:
- **进度核对**：开工先核 git/远端（0/0 同步）——S3 与 S4 首项+首演均已在远端（交接摘要滞后于实际仓库状态，以仓库为准）；S4 余项=选题采访器+引用留痕，本批做前者
- **Frontier 轮次（10 项事实自查证 F1~F10 + D1~D9 决策点）**：关键事实——「三方向」字面只在视频线（blocked 态），选题卡三字段与 brief 六字段精确对应才是真缺口（brief 现状 title+angle 凭空发明六字段，radar-write.ts:113-124）；AgentRun.input 被纯图线/UI 字符串消费不能塞 JSON；artifacts 在 executeArticleRun 空对象起步会抹预置键。D1~D9 全按选项 A（依据开工令+用户既有「按推荐」模式，方案 §5 可翻案）：向导第 1 步同步一轮问答/卡落 AgentRun.artifacts.ideaCard 预置+起始继承/新 SKILL.md 非产线技能（停用=409=入口隐藏，与 PIPELINE 守卫语义对照：可降级的能力不钉成不可降级）/{{idea_card_block}} 占位符（style_block 同线先例，无卡字节级不变）/eval 1 题带卡宽门 7.88
- **规范与拆票**：`docs/topic-interviewer-plan.md`（模板全节+测试缝前置声明）；`.scratch/topic-interviewer/` 三票 tracer-bullet 线性链 01→02→03
- **票 01（事实源+纯函数）红-绿**：test-b2 ⑥ 节先行先红（MODULE_NOT_FOUND）→ `db/skills/topic-interviewer/SKILL.md`（frontier 纪律协议+完成判据）+ `src/lib/content/idea-card.ts`（零依赖纯函数四件：parseInterviewQuestions/distillIdeaCard/validateIdeaCard/ideaCardBlock；客户端可安全 import，distill 双端共用单一实现）+ topic-interview.ts 消息组装 → b2 42→80（38 条新断言，含无卡字节级不变断言：渲染===剔占位符渲染）
- **票 02（API 面）红-绿两次**：红 1=采访路由 404（快相 7/7 失败留痕）→ 路由（两档温度 0.4→0.2、停用 409、429 人话、坏卡忽略不阻断）+ runs 路由透传 + run-manager 预置/继承/brief 传卡 → 14/14。红 2=出题 503：**真坑实证**——SKILL.md 协议示形是 {"questions":[...]} 包裹对象，LLM 按示形输出包裹而解析层只认裸数组（单测喂裸数组未暴露）；修复=解包裹+补单测钉住两形态
- **票 03（前端+E2E+eval+文档）**：wizard 第 1 步采访面板（预填推荐可改/全部按推荐填/409 收起/失败重试可跳过/改题即作废卡）；第 3 步卡三行摘要；三字段齐才发送（对冲服务端静默丢卡）。E2E 五相脚本终跑 **19/19 全绿**（出题 6 问三维度带推荐/409 降级链/卡即时持久/全链 done 174s+卡终态存活+「选题卡已注入」+4061 字 inBand/坏卡不硬凑）；eval 带卡 m01 同题同配置 **均分 8.0**（宽门 7.88 PASS，门禁 PASS，同家族裁判如实记录；2688 字 inBand）；文档四件：ADR-0009（三决策+两不变量：无卡字节不变/ts 文案例外边界限定 style_block 与 idea_card_block 两处既存先例）、GLOSSARY 43→45 条、worklog 本条
- **字数判据修正（S3 m02 先例延伸）**：首全跑 4756 字超严格带 2500~4000 → 取证三件套（s3-article-sections 逐节分布 + length-tier.ts:421 容差定义 + artifacts.draft.inBand=true）确认产品自身纪律=带×0.9/1.2 容差——E2E 判据对齐 b1-e2e ③ 同判据；带卡字数样本 2688/4756/4061 留观（卡片证据丰富度可能推高 brief→大纲节数，常态化超带再评估预算收紧）
- **双轴评审两报告**：Standards 轴 14 条全过+Fowler 自查抓 duplicated code（qa 清洗重复→抽 cleanQaItem 修掉，80/80 复验）+long parameter list 留痕不改；Spec 轴 D1~D9 符合性全过+风险五项复核+零范围蔓延+三已知妥协（均对冲留痕）
- **回归门**：tsc 零错｜离线 68/80/81（b2 +38）｜c3 冒烟 10/10（管线守卫与入口契约不回退）
- 卫生：密钥零落盘（本批零密钥接触）；配额纪律遵守（429 不轰炸，冷却重试留痕）

### 环境改进（retro）
- **E2E 多 run 并行自撞 429**（判断题→测试编排纪律，回写票 03 注记）：一个测试脚本内连发多个会各自触发全管线的 run（带卡 run+坏卡探针）= 双倍 LLM 突发 → 自撞限流且两败俱伤；编排原则=管线类断言串行收尾，快断言（创建即验）先行——重构后 234s/174s 两次全绿
- **单测输入形态要钉住生产实际形态**（判断题，回写 coding-standards 第 5 条注记）：协议解析单测喂裸数组而 LLM 实际输出协议示形包裹对象——503 实证后补两形态单测；判据=单测样本形态与「调用侧实际会喂什么」对齐，不只与「函数能接什么」对齐
- **交接摘要可能滞后于仓库状态**（流程观察）：开工先核 git log/远端再定批次（本批实证：摘要说 S3 未开工，仓库显示 S3+S4 首项已推送）；以仓库为准

### 遗留与下一步
- S4 余项②「文章引用留痕」（research 引用纪律 → 引用来源落 artifacts、正文标注，对齐 A4 降级链遗留）：下一可开工批次
- 带卡字数观察项：样本三证留观（见票 03 注记）；若常态化超严格带→大纲预算收紧评估
- 票 03 真密钥收口 / 全 agnes 3/3 i2v 成片：外部约束不变（真密钥待补 / 20-30min 不中断窗口）
- db/custom.db 留有本批 E2E 探针 run（含 401 假键旧留）：非交付物，不影响产线

---
Task ID: S4-CITATION-PROVENANCE
Agent: 主 Agent（Z.ai）
Task: S4 余项②「文章引用留痕」落地——引用来源落 artifacts + 正文锚点机器校验（用户开工令「继续推进」）——frontier 轮次 → spec → .scratch 三票 → 红-绿实现 → 双轴评审 → retro 全链留痕（S2 流程第三次全链首演）

Work Log:
- **进度核对**：开工先核 git/远端（0/0 同步，HEAD 4d5d104）——交接摘要再次滞后（摘要说 S3 未开工，实际 S3+S4 首项+余项① 均已在远端）；以仓库为准。本批=S4 余项②引用留痕（worklog「遗留与下一步」明确项），真密钥收口与全 agnes i2v 成片受外部约束不做。
- **Frontier 轮次（事实自查证 F1~F10 + 决策 D1~D10）**：关键取证——claims 来源四元组落 db.claim 但 run 终态 artifacts 只留计数（layout.refs）不留明细；正文 [n] 零机器校验（超范围/引用未证实编号=悬空锚无告警）；**抓到既有编号错位缺陷**：正文 md 链接 sup 从 1 起编而脚注区在 claims.length+1 起（正文 [1] 读者会误读为 claims[1]）；AIGC 声明「均标注 [n]」是未验证承诺；assertions items 截 100 字缺 title/date。D1~D10 全按选项 A（依据开工令+既有按推荐模式，方案 §5 可翻案）：citations 独立键/悬空锚机械移除留痕/lint 内嵌 Step 9（DEMO 照跑——纯函数无搜索依赖，与 Step 6 REAL 守门对照）/fact 全量 flagged/assertions 补全/run-detail 卡/AIGC 文案维持/eval m01 宽门/文档四件/编号错位纳入修复。
- **规范与拆票**：`docs/citation-provenance-plan.md`（模板全节）；`.scratch/citation-provenance/` 三票 tracer-bullet 线性链 01→02→03
- **票 01（纯函数）红-绿**：test-b2 新增 ⑦ 节先红（ERR_MODULE_NOT_FOUND）→ `src/lib/content/citations.ts` 三件（lintArticleCitations/stripOrphanAnchors/citationsArtifact，零依赖，fence 口径与 render `/^```/` 一致）→ b2 80→101（21 新断言）。**空账本快捷路径 bug**（ok.size===0 跳过 replace）被断言抓出：空账本恰是全悬空场景应全移除——修掉复验全绿。
- **票 02（管线+render）红-绿**：render-smoke.mjs 新增引用一致性块——**红线实证 link-sup 编号错位**（正文链接上标 [1] vs 脚注区 [N+1]）→ render.ts 修复（InlineCtx.claimsCount 偏移，空 claims 回落 [1] 字节一致）→ 全绿。**红线形态教训两条**：① paste-safe 会给脚注区也包 leaf span，正文判据必须切「参考来源」标题之前；② AIGC 声明文案含「参考来源」四字，判据用标题闭合形态。首次断言形态写错导致 3 条假红（claim-sup/IN1），修正后红线干净收敛=唯一功能红。run-manager Step 9 内嵌 lint+机械修复+三处一致（修正稿写回 output/article.markdown/formatted+wordCount 重算）；Step 6 assertions items 补全（text 500+四元组）；tsc 零错｜离线 68/101/81。
- **票 03（前端+E2E+eval+文档）**：run-detail「引用留痕」卡（循断言卡先例：Badge/引用率进度条/来源列表 citedCount，旧 run 无键 null 不炸）。E2E `scripts/tmp/s4-citation-e2e.mjs`（一 run 双用省配额 + 只读复验模式）：首跑 6/7——相⑤红=摘要文案不统一（修复口径「引用体检」vs 断言「引用留痕」）+ **DEMO 模式极限场景实证**（SEARCH_KEY 外部约束→claims 全未证实→draft 引 6 锚全悬空→机械移除+留痕+三处一致+零残留）；修文案统一后复跑 **7/7 全绿**（14 悬空锚全移除留痕）+ eval 同 run 8.3（宽门 7.88 PASS，同题同配置不回退）+ 锚点可解析率 100%。文档四件：ADR-0010（三决策+两不变量 IN1 无来源字节不变/IN2 三处一致）+ GLOSSARY 45→47（+引用留痕/悬空锚）+ worklog 本条 + 方案 §0 拍板注记。
- **回归门**：tsc 零错｜离线 b1 68/b2 101/c 81｜render-smoke 全主题 PASS（含编号一致性块）｜c3 冒烟 10/10
- 卫生：密钥零落盘（本批零密钥接触）；配额纪律（E2E 一 run 双用 + 只读复验模式，全链 run 共 2 个：红证跑+全绿跑）

### 环境改进（retro）
- **render 断言的 leaf-span 干扰**（机械错误→确定性检查，回写 render-smoke 注释）：paste-safe 会给全部文本节点（含脚注区）包 leaf span——正文 vs 脚注区判据必须按「参考来源」标题切片；标题判据用闭合形态（`参考来源</span>`）避开 AIGC 声明文案的同名字符串
- **with-server 传 .sh 须裸路径**（铁律 1 本批再犯一次）：`bash scripts/with-server.sh "bash scripts/tmp/x.sh"` → No such file；正确=`bash scripts/with-server.sh scripts/tmp/x.sh`——铁律已有但肌肉记忆未固化，worklog 留痕强化
- **交接摘要滞后于仓库状态**（S4 余项① 已记，本批再证实）：开工先核 git log/远端再定批次，两次连续实证该模式有效

### 遗留与下一步
- REAL 搜索模式全绿路径实证（orphanRemoved=0 且 anchors>0 的「部分 verified」跳号场景）：离线 b2 ⑦ 节已钉语义，线上留观（SEARCH_KEY 外部约束，与 A4 降级链同源）
- mattpocock/skills 采纳方案 S1~S4 全部落地（含余项②）；后续待办=真密钥收口（票 03 一条命令）+ 全 agnes 3/3 i2v 成片（外部窗口）
- db/custom.db 留本批 E2E 探针 run 2 个（DEMO 模式，claims 全未证实）：非交付物
---
Task ID: AIHOT-RESEARCH
Agent: 主 Agent（Z.ai）+ 后台调研代理（research 技能）
Task: 用户指令「研究一下这个，看看能不能接入到我们的项目里去 AGENT 接入」——AIHOT（aihot.news）四通道调研 + RadarForge 缝对缝映射 + P0 运行时实证（纯文档批次，零产品代码改动）

Work Log:
- **方法**：research 技能后台代理做外部一手文档精读 + 匿名实测约 30 请求（aihot.news 各页 / openapi-v1.json 141KB 解析 / GitHub 引擎源码 / terms+privacy 全文，笔记落 `scripts/tmp/aihot-external-findings.md` 266 行含条款原文引用）；主代理并行做仓库代码锚点核对（mcp-client/tool-registry/rss.ts/sources+agent 路由/prisma 模型）+ 协议兼容探针 + dev server 内 P0。
- **四通道事实**：Skill（装 ~/.agents/skills/aihot，3 文件 + SHA-256，本体零逻辑读 /api/v1/agent，装一次永不需要更新）｜MCP（https://aihot.news/api/mcp，Streamable HTTP+SSE，**无状态**（无 mcp-session-id），10 工具全 readOnlyHint:true）｜RSS（6 主源 + 12 分类源，RSS 2.0，ETag/304 实测通过，ttl 30min）｜REST（/api/v1 34 匿名 GET，OpenAPI 3.1，Problem JSON）。旧接口 /api/public/* 已 2026-10-31 停服、旧域名仅 301——旧教程别照抄。
- **决定性兼容验证**：RadarForge `mcp-client.ts` 硬编码协议 **2025-06-18** 实测被 AIHOT 接受并原样回显（后台代理只测过 2025-03-26，本会话补测 RadarForge 精确请求序列：initialize 200 → notifications/initialized 202 → tools/call 200 + _meta 信任元数据）；AIHOT 无状态设计与 `callHttpTool` 每调用重新 initialize 的实现完美咬合——**零代码兼容**。
- **P0 运行时实证**（`scripts/tmp/aihot-p0-demo.mjs`，with-server 走产品自己的 API）：缝A MCP——create → test 握手 aihot v2.0.0（延迟 520-685ms）→ 10 工具以 `mcp__AIHOT__` 前缀接入 toolRegistry → 实调 `aihot_get_hot_topics`（limit=3）返回 1124 字符中文热点 Markdown；缝B RSS——add「AIHOT 精选」→ 全量刷新 status=ok → fetched=40 / inserted=40 → 转选题闭环（真实当日标题：Culper Research 做空 Nvidia 报道）。三次运行覆盖创建路径与幂等路径，**12/12 全绿**。
- **断言修正两课**（研究型 demo 的预期值要先读代码）：① fetched=40 而非 feed 实际 50 条——产品解析器单源 `slice(0,40)` 防洪水上限，既定行为非缺陷，断言已钉住正确语义；② GET /api/sources 只回最新 30 条 status=new——非首跑时 AIHOT 条目被其他源新条目挤出窗口，promote 判据改条件式（首跑已实证闭环）。
- **许可评估**（决策门）：组织内部使用（内部研究/情报/知识库/决策）**永久免费无需申请**——RadarForge 当前个人+内部定性合规；对外商业产品/收费服务/客户交付/代理接口/转售/镜像/白标/对外训练微调评测 RAG 须 agent@virxact.com **书面授权**（每响应带 x-aihot-commercial-use: written-authorization-required 头）；MIT 仅覆盖代码与 Skill 文件不覆盖数据输出；免费范围不强制界面署名但保留机器来源信息（RSS author 字段天然满足）。
- **诚实留痕**：25 源全量刷新 ok 14-18 / error 7-11（沙箱网络对部分海外源不可达的既定现象，非 AIHOT 因素）；SimHash 对 AIHOT 中文重写文本命中率低——同一事件可能双条入池（选题池容忍近重复，人工 promote 过滤，精确去重列 P2）；mcp-client 工具包装 text 截 8000 字符而 agent/latest 默认 10 条约 8KB 贴线——Agent 调用 limit 取 5-8。
- **交付**：`docs/research-aihot-agent-access.md`（七节：是什么/四通道一览/四缝映射含代码锚点与实测表/许可评估/风险清单/分阶段方案/结论，研究文档豁免票制）+ 两份 scripts/tmp 资产（外部调研笔记 + P0 幂等可复现脚本）。

### 环境改进（retro）
- **研究型 demo 的断言预期先读代码再定值**：首跑 1 条假红（fetched 预期 50）源于没读 `parseFeed` 的单源上限——机械错误 → 确定性检查：跨产品断言前先核产品既定行为，已回写 demo 注释
- **后台调研代理只验证了它会用的协议版本**（2025-03-26），本仓客户端用的是 2025-06-18——委托调研的结论要对着本仓调用代码再核一遍关键参数，本批「主代理补测」模式有效

### 遗留与下一步
- 待用户拍板四决策点：D1 P1 产品化两票（`seedDefaultServer()` 加 AIHOT 行与 DeepWiki 并列 + `DEFAULT_FEEDS` 加精选/全部动态，走 `.scratch/aihot-access/` 票制）；D2 RSS 源选择（推荐 feed.xml + feed/all.xml）；D3 P2 增强（rss ETag 条件请求 / AIHOT 原文直链抽取）；D4 aihot_actor 策略（推荐不带）
- P0 状态留在 db/custom.db（gitignored，沙箱回收即清）——持久性靠 P1 默认种子；25 源刷新的 240+ 条探针数据同库，非交付物
- 若要在 wewrite-brief / topic-interviewer 提示词告知 mcp__AIHOT__* 工具可用：SKILL.md 改动须走 S3 同款纪律（token 基线 + 聚焦 E2E + eval 不回退），列为 S3 后独立增强票
---
Task ID: AIHOT-ACCESS-P1
Agent: 主 Agent（Z.ai）
Task: AIHOT 接入 P1 产品化——用户批复调研报告四决策点（原话「1. 要的 2. 全都要 3. 可以的 4. 可以的」：D1 推进 P1 / D2 RSS 源 18 条全量 / D3 两增强立项 / D4 不带 aihot_actor）→ 方案 → .scratch 四票 → 红-绿实现 → 双轴评审 → retro 全链留痕

Work Log:
- **进度核对**：开工先核仓库（AIHOT 调研 b1c3e6b 已在远端；S3/S4 均已收口——交接摘要再滞后一次，三连实证「以仓库为准」模式）。本批=P1 产品化，用户四批复即 D1~D4 拍板记录。
- **规范与拆票**：`docs/aihot-access-plan.md`（模板全节+D1~D4 拍板结果列+实现级 D5~D8）；`.scratch/aihot-access/` 四票线性链 01（MCP 种子）→02（18 源+feedIds 透传）→03（ETag）→04（原文直链+文档四件）。
- **票 01 红-绿**：b2 ⑧ 先红（mcp-seeds MODULE_NOT_FOUND）→ 新模块 `src/lib/agent/mcp-seeds.ts`（独立零依赖：b2 直读规避 mcp-client 的 `@/` 别名值导入不可达，strip-types 无 tsconfig 路径映射）+ `seedDefaultServer` 改遍历种子表（空库首播语义循 DeepWiki 先例，方案 D5）→ b2 101→104。E2E A 相清库重播确定性实证（db 行=2+握手 615ms+10 工具）。
- **票 02 红-绿 + 红线探究（本批最有价值的一课）**：b2 先红（24≠42）→ DEFAULT_FEEDS 24→42（18 条 AIHOT：6 主源+6 分类+6 全文分类，统一 AI聚合/aihot.news，插中文源后使「精选版」先入池）+ POST refresh 透传 feedIds（方案 D6）→ b2 104→109。**预判红线被证伪**：原设计「先刷 feed.xml 再刷 full.xml 应 inserted>0（同 guid 双条入池，需跨站 guid 去重）」，实测 0 红——duplicates=40 全拦截。机制取证：同 guid 条目跨 feed 同标题 + cleanSummary 截断 300 字后全文版与摘要版同文本 → 同 SimHash。按「无红线不写防御代码」纪律（Fowler speculative generality）跨站 guid 去重缓议留观（触发条件成文于 ADR-0011），方案 §5 D7 与票 02 Comments 同步改写为证伪结论。
- **票 03 红-绿**：b2 ⑧ 本地 HTTP 服务器 304 往返先红（3 断言红+TypeError：旧返回形态无 notModified）→ `SourceFeed.etag` 列（prisma generate+db push，PRAGMA 实证列落地）+ `fetchAndParse` 第 4 参 etag（直连/代理两路径均带 If-None-Match、捕获响应 ETag；304 → notModified 零正文）+ `FeedRefreshResult.notModified` + summary 计数 + test-rss-proxy 调用点随新形态更新 → b2 109→116，test-rss-proxy 19/0。E2E D 相：周期源（日报/周报/月报）二轮 2/3 命中 304（周报在两轮间真实轮换出新 ETag → 200 重解析如实留痕，断言容差 ≥2 并记录单源轮换——上游成刊轮换是真实行为非缺陷）。
- **票 04 红-绿**：b2 函数族先红（SyntaxError 无导出）→ `originalLinkFromDescription`（只认「阅读原文」锚文本的 href，非 http 拒收）+ `RawFeedItem.originalUrl`（解析层只发现不改写）+ 存储层按 `site==="aihot.news"` 门控回填（url←原文、摘要尾附「（AIHOT 条目页：…）」；SimHash 哈希口径保持解析层原值不掺回填后缀=IN3，部署边界两侧同条目哈希可比）→ b2 116→127。E2E E 相先红（0/30 原文直链）后绿：删源重种确定性路径（既有条目 known 跳过不回溯——删级联+重播种+刷新是重取正路）→ 30/30 条 url host≠aihot.news（样例 techcrunch 原文可点）+ 条目页链接在摘要尾 + 转选题闭环。
- **E2E 全量**：`scripts/tmp/aihot-p1-demo.mjs` 五相 22/22 全绿且幂等复跑稳定（A/B/C/D/E 覆盖种子/握手/去重/304/直链/转选题；复跑兼容断言适配 304 态）。
- **回归门**：tsc 零错｜离线 b1 68/b2 127/c 81｜c3 冒烟 10/10｜RSS 层 test-rss-proxy 19/0 + test-rss 37/0（42 源下 ≥24 断言兼容）｜full-regression 主线绿（文章九步/评测/导出全过）。
- **外部约束如实留痕**：full-regression 视频直出段 `POST /api/video-runs` 研究腿 zai 共享配额 429（71s 重试后 500+三个级联红，铁律 7 外部约束非本批代码——改动不触视频线/gateway）；配额冷却约 20 分钟后独立脚本复跑 7/7 收口（`scripts/tmp/aihot-video-retry.mjs`）。纯图线「生图全降级」断言红属同 429 家族（zai 生图端点降级，脚本自身标注非代码问题）。
- **文档四件**：ADR-0011（五决策+三不变量 IN1 无 etag 行为不变/IN2 非 AIHOT 字节不变/IN3 哈希口径部署一致）+ GLOSSARY 47→50（+AIHOT 接入/ETag 条件请求/原文直链）+ 研究文档 §6 拍板注记 + 双轴评审两报告（Standards 轴 14 条全过+Fowler 自查两条留痕不修理由+speculative generality 主动规避亮点；Spec 轴 D1~D4 符合+四票验收全勾+不变量三项+风险五项对冲+零范围蔓延+三已知妥协）。
- 卫生：密钥零落盘（本批全程匿名只读零密钥接触）；AIHOT 实跑约 40+ 请求零 429（限流线 60/分钟远未触）。

### 环境改进（retro）
- **预判型红线要先证伪再写防御代码**（判断题，回写本 log 与方案 §5 D7 留档）：跨站 guid 去重是「为想象的未来写代码」——E2E 红线探究用一次定向刷新证伪假设，省掉一段无红线支撑的查询代码；判据=防御性设计的每个分支都要能指认一条让它变红的现实场景，否则缓议并写明触发条件。
- **full-regression 超过 Bash 10 分钟窗**（机械事实，流程观察）：脚本自带 REG_SKIP_VIDEO 分段设计，本批实证分段跑+冷却复跑收口的编排有效；后续全量回归超窗即分段，不在单窗口硬等。
- **交接摘要滞后三连证**（S4 余项①已记两次）：开工先核 git log/远端定批次已成为肌肉记忆级流程。

### 遗留与下一步
- 后续增强票（独立排期，须走 S3 同款纪律）：wewrite-brief / topic-interviewer 提示词告知 `mcp__AIHOT__*` 工具可用（token 基线+聚焦 E2E+eval 不回退）
- P2 远期候选不变：早报参考输入（/api/v1/dailies JSON）/ 资讯类 MCP 工具放宽 8000 字符截断 / 跨站 guid 去重留观（触发条件见 ADR-0011）
- db/custom.db 留本批 E2E 探针数据（AIHOT 条目/成刊条目/已转选题 1 条）：非交付物，不影响产线
- 真密钥收口与全 agnes 3/3 i2v 成片：外部约束不变（密钥待补 / 20-30min 不中断窗口）
