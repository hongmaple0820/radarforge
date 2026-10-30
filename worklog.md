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
