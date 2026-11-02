# -*- coding: utf-8 -*-
"""
《RadarForge 2.0 七问体检与整固方案》正文内容块。
证据全部来自 2026-11-02 本轮只读取证（rg 检索 / 路由实测 / 运行时对照实验），
外部标准来自官方文档检索（dsh 官方指南、agentskills.io、MCP 各客户端配置文档）。
块协议：h1/h2/h3/p/pn/bullet/code/callout/table/caption/spacer
"""

BLOCKS = []

# ================= 执行摘要（不编号） =================
BLOCKS += [
    ("h1", "执行摘要"),
    ("p", "本轮针对用户提出的七个问题做了完整的代码级取证：逐条检索源码、起服务器实测接口、在 Node 与 Bun 两个运行时下复现报错、并对外部生态（DeepSeek Harness、Agent Skills 规范、MCP 各客户端配置约定）做了官方文档核实。本报告只陈述可复核的事实与据此推导的方案，不含臆测；取证命令与证据位置清单见附录 B。"),
    ("p", "总体结论：七问中六问成立、一问属于定位争议而非缺陷。<b>用户对产品质量的批评基本准确</b>，而且问题的根源高度集中——不是零散的 bug，而是三类系统性病灶：依赖治理缺失（ffmpeg 报错）、资产所有权错位（skills 目录被平台覆盖导致产品技能丢失）、生态能力「只展示不接通」（MCP 工具发现后不可调用、dsh 插件从未在真实宿主验证）。这三类病灶分别由第二章至第六章给出根治方案。"),
    ("callout", "三个最关键的取证发现", "发现一：dsh 不是自造概念。DeepSeek Harness 是深度求索 2026-08-13 开源的 Agent 框架（Cordis 内核，一切皆插件），官方插件指南真实存在；本项目已产出形态合规的插件包并推上 GitHub，但从未在真实 dsh 宿主里验证过。发现二：用户引用的报错「ffmpeg 不可用：Executable not found in $PATH」是 Bun 运行时的报错格式——预览生产模式以 bun 运行 standalone 产物，代码里 16 处裸命令名调用在受限 PATH 下必然复现。发现三：产品的 12 个自有技能（wewrite 十件套 + huashu 双件）已永久丢失，因为技能目录寄生在沙箱平台的 skills/ 下且被 .gitignore 忽略，从未入库。"),
    ("table",
     ["#", "用户观察", "代码级事实", "定性"],
     [
         ["Q1", "RSS 要支持编辑 + 可选代理", "sources API 只有 add / 启停 / 删除，无 update；fetchAndParse 裸 fetch 无代理参数；SourceFeed 模型无代理字段", "成立，补全成本低"],
         ["Q2", "社区 skills 无法加载，安装管理不完整不标准", "技能扫描目录 = 沙箱平台 skills/（69 个平台 agent 技能）；产品自有 12 技能已丢失；无任何安装/启停管理", "成立，架构性根因"],
         ["Q3", "工具注册表为什么支持单独运行", "插件中心的工具注册表卡带 JSON 调参执行台；5 个内置工具均真实可调用", "定位争议：价值在调试，缺「诊断」心智标注"],
         ["Q4", "dsh 插件形态是什么，怎么按官方指南实现", "dsh = DeepSeek Harness（真实开源框架）；插件包已产出且已推 GitHub；未对齐 defineTool/Config 规范，未做宿主实测，无 Release 分发", "部分成立：骨架在，四步补完"],
         ["Q5", "MCP 安装配置方式不准确不标准", "两套互不相通的客户端（两套协议版本、两套存储）；HTTP 客户端无会话管理；发现的工具从不注册进工具注册表，Agent 无法调用；UI 无法配置 stdio 命令", "成立，是七问中最实质的缺陷"],
         ["Q6", "视频模型配置管理缺失；刷新报 ffmpeg 不可用", "报错为 Bun 运行时格式（生产模式 PATH 问题）；「检查视频模型」按钮在 local 通道实际探测 ffmpeg；模型清单硬编码单选项；16 处裸命令名调用", "成立，双层根因（语义 + 依赖）"],
         ["Q7", "整体割裂、未闭环、缺陷多", "生态页四张卡与主创作流零关联；设置分散三处；多项功能只可看不可用；命名体系（dsh / cordis / pi-ai）无解释直接出现", "成立，收敛方案见第七章"],
     ],
     [0.05, 0.20, 0.47, 0.28], (0,)),
    ("caption", "表 0-1 七问定性总表（证据位置见附录 B）"),
    ("p", "处置策略按「先止血、再接通、后平台化」三批推进：P0 快修补齐编辑/代理、依赖解析、技能目录主权与 MCP 入口统一；P1 完成 dsh 官方对齐与真实宿主实测、MCP 工具接入 Agent、视频模型配置轻量化；P2 做技能安装管理、设置信息架构收敛与 MCP 服务端开放。全部 12 个事项的排期、工作量估算与验收门禁见第八章。"),
]

# ================= 第一章 =================
BLOCKS += [
    ("h1", "第一章 七问总体诊断"),
    ("h2", "1.1 取证方法与环境"),
    ("p", "本轮取证全程只读，不消耗 LLM 配额，也不改动任何业务代码，保证结论反映的是当前主干的真实状态。方法上有四条线：其一是全仓检索（rg 定位七问相关的路由、组件、库文件与 schema 定义）；其二是起服务器实测（对 settings/test、agent/skills、agent/tools、gateway/providers 等接口逐一发请求核对响应）；其三是运行时对照实验（分别在 Node 与 Bun 下执行 execFile 触发 ENOENT，比对报错文案，锁定用户报错的运行时来源）；其四是外部标准核实（对 dsh 官方指南、Agent Skills 规范、MCP 各客户端配置文档做检索与原文核对，引用清单见附录 A）。"),
    ("p", "环境事实：沙箱内 ffmpeg / ffprobe 实际存在于 /usr/bin（7.1.5 版本），开发模式（next dev，Node 运行时）下「检查视频模型」可以返回成功；用户看到的报错发生在预览的生产模式——package.json 的 start 脚本以 bun 运行 standalone 产物，这一差异正是第六章报错链路的关键。npm 源可达（@deepseek-ai/dsh 最新 0.2.1-rc.5、@deepseek-ai/cordis 4.0.5、@deepseek-ai/dsh-tools 0.0.1-rc.1 均可查询），意味着第五章的真实宿主实测在沙箱内可行。"),
    ("h2", "1.2 七问的分层定性"),
    ("p", "把七问放在同一张坐标系上看，会发现它们落在三个不同的层面，对应的修复动作完全不同。<b>能力缺失层</b>（Q1 RSS 编辑与代理、Q6 视频模型配置）：功能确实没做，方案就是补齐，工作量可控。<b>架构错位层</b>（Q2 skills 目录主权、Q5 MCP 双客户端）：不是「没做」而是「做错了位置」，修补无效，需要小规模结构性调整。<b>定位与心智层</b>（Q3 工具注册表、Q7 割裂感）：能力本身是真实可用的，但产品的呈现方式让用户无法理解它为什么存在——这类问题靠改名、收纳、接线解决，而不是加代码。"),
    ("p", "这个分层直接决定了第八章排期的形状：P0 集中在能力缺失层与架构错位层里成本最低的项（先把用户看得见的破洞补上），P1 处理需要外部生态配合的项（dsh 实测、MCP 接通），P2 做纯产品层的收敛。值得注意的是，Q4（dsh）在七问中情况最特殊：用户以为它「不完整不可用」，取证结论却是插件骨架已经产出、已经推上 GitHub、形态学自官方示例——它缺的不是代码量，而是规范对齐的四步补完与一次真实宿主里的端到端验证。这也是本报告把它单列一章的原因。"),
    ("callout", "对既有资产的正面盘点", "诊断不等于全盘否定。六步流水线（选题到成稿到排版）、选题池全链路（RSS / 搜索 / 早报到选题到 run 到资产）、自动化三任务、八套离线回归与浏览器回归——这些主链路在本轮实测中全部可用。割裂感集中在生态页与设置中心，而不是生产线本身；这决定了整固策略是「接线与收敛」而不是「重写」。"),
]

# ================= 第二章 RSS =================
BLOCKS += [
    ("h1", "第二章 RSS 信源：编辑与代理"),
    ("h2", "2.1 现状证据"),
    ("p", "信源层的能力边界可以从三处代码精确划定。API 层（src/app/api/sources/route.ts）：POST 支持 refresh / promote / add 三个 action，add 接收 name / url / category 并做 http(s) 前缀与查重校验；PATCH 只接受 {id, active} 做启停；DELETE 按 id 级联删除。<b>没有 update 类的 action</b>——源一旦建错名字或地址，用户只能删除重建，而删除会级联清掉该源的历史条目。UI 层（rss-panel.tsx）与 API 层能力一致：检索「编辑 / edit / Pencil / proxy / 代理」均无匹配。数据层（prisma schema 的 SourceFeed 模型）：字段为名称、URL、分类、站点、启停、抓取状态与错误留痕，<b>没有任何代理相关字段</b>。"),
    ("p", "抓取层（src/lib/sources/rss.ts 的 fetchAndParse）用原生 fetch 直连目标 URL：带 RadarForge/2.0 的 User-Agent、15 秒超时、对网络类瞬时错误自动重试一次。这套实现本身是健壮的（诚实留痕、重试克制），但全部 24 个默认源与用户自建源都走同一条直连路径——沙箱外网抖动或区域不可达时，逐源失败只能留痕，没有第二条通路可选。"),
    ("h2", "2.2 方案：编辑与可选代理"),
    ("p", "编辑能力按最小侵入补齐：PATCH 扩展接收 name / url / category / proxyUrl 的任意子集，url 变更时保留原校验规则（http(s) 前缀 + 查重）并触发一次定向重抓验证（复用现有 refreshFeeds 的 feedIds 参数，该参数已存在）；UI 在源卡片上加铅笔按钮进入行内编辑态。代理能力分两级：设置中心新增「网络代理」全局配置（http/https 代理地址，默认空），SourceFeed 增加可空的 proxyUrl 字段做<b>按源覆盖</b>——优先级为按源代理高于全局代理高于直连，这与 Feedly、Folo 等阅读器「全局代理 + 源级例外」的通行做法一致。"),
    ("p", "实现要点：Node 22 的 fetch 走 undici，按源代理通过 undici 的 ProxyAgent 作为 dispatcher 注入即可，无需引第三方依赖；代理地址校验复用 http(s) 前缀规则。抓取结果留痕字段（lastStatus / lastError）对代理路径一视同仁，代理失败时错误信息带上「经代理」标记，方便用户区分是源挂了还是代理挂了。验收标准：编辑源的名称与分类后刷新列表立即生效且历史条目保留；改 URL 后自动重抓验证连通；配置按源代理后该源请求经代理发出（可用本地回环代理服务断言收到请求），其余源不受影响；代理不可达时报错文案明确指向代理。"),
    ("table",
     ["能力", "现状", "方案后"],
     [
         ["改名 / 改分类", "不可编辑（只能删除重建，级联清条目）", "行内编辑 + PATCH 子集更新，历史保留"],
         ["改 URL", "不可编辑", "编辑后自动定向重抓验证连通"],
         ["按源代理", "无字段、无参数", "SourceFeed.proxyUrl 可空字段，按源覆盖"],
         ["全局代理", "无", "设置中心网络代理，空 = 直连"],
         ["代理失败留痕", "不适用", "错误带「经代理」标记，区分源故障与代理故障"],
     ],
     [0.20, 0.38, 0.42]),
    ("caption", "表 2-1 RSS 源管理能力：现状与方案对照"),
]

# ================= 第三章 Skills =================
BLOCKS += [
    ("h1", "第三章 Skills：对齐 Agent Skills 开放标准"),
    ("h2", "3.1 根因：目录主权错位"),
    ("p", "「社区技能加载不出来」的表象之下是一个架构级错误。技能加载器（src/lib/skills/loader.ts 与 src/lib/agent/skill-loader.ts）扫描两个根目录：用户级 ~/.claude/skills 与项目级 <project>/skills。前者在沙箱内不存在；后者——项目根的 skills/ 目录——<b>是沙箱平台注入的 agent 技能目录</b>，当前装着 69 个平台运维技能（ASR、TTS、VLM、docx、pdf、charts 等）。也就是说，产品「社区技能」页实际展示的是宿主平台给 AI 助手用的技能清单，与内容创作毫无关系。"),
    ("p", "更严重的后果是资产损失：加载器注释与 /api/skills 路由注释都记载「本地已装 12 个技能（wewrite 十件套 + huashu 双件）」，即产品首批工作流模板；本轮检索证实这 12 个技能在 skills/ 目录里已不存在——平台目录更新时被整批覆盖。而 .gitignore 第 55 行明确忽略 /skills/，意味着这些产品资产<b>从未进入版本库，无法从 git 历史恢复</b>。UI 的搜索占位符硬编码「搜索 69 个技能…」，恰好暴露了实现是跟着平台目录数字走的。用户说「无法加载」，从产品视角看完全成立：该出现的技能一个都不在。"),
    ("callout", "定性", "这是七问里唯一造成不可逆损失的缺陷。根因不是解析器写得不好（自写 frontmatter 解析覆盖了常见形态），而是把产品资产的存放位置让渡给了不受产品控制、不受版本管理的外部目录。同类问题在 dsh 插件包上曾被正确处理（包体入 git），skills 却没有——同一工程里两种标准并存，正是第七章割裂感的一个微观样本。"),
    ("h2", "3.2 官方规范对照"),
    ("p", "Agent Skills 是 Anthropic 于 2025 年 10 月开放的技能标准（agentskills.io/specification，anthropics/skills 仓库提供参考实现），已被 Claude Code、Claude 应用与 API 生态采用。标准的核心约定：技能是一个目录，最少含一个 SKILL.md；SKILL.md 由 YAML frontmatter 加 Markdown 正文构成；frontmatter 必填 name（1 至 64 字符，仅小写字母、数字与连字符，不得以连字符开头结尾或连续连字符，且必须与目录名一致）与 description（1 至 1024 字符，说明做什么与何时用）；可选 license、compatibility（环境要求）、metadata（键值对）、allowed-tools（实验性）；目录可附 scripts / references / assets 三个可选子目录。加载遵循「渐进披露」三层：先读 name 与 description 做相关性判断，命中才读正文，正文再按需引用 references 文件——避免上下文被一次性塞满。"),
    ("p", "对照现状：现有解析器读取 name / description / allowed-tools，已覆盖渐进披露的第一层；但 name 未按「与目录名一致、小写连字符」校验，description 长度未校验，license / compatibility / metadata 未解析，scripts / references / assets 无加载语义。产品自有技能当初是否合规已不可考（资产已失），重建时按官方模板（anthropics/skills 的 template-skill）起草即可。"),
    ("h2", "3.3 方案：主权目录 + 安装管理"),
    ("p", "第一步（P0）收回目录主权：产品技能根目录迁至 <b>db/skills/</b>（git 跟踪、随仓库分发、不受平台目录影响），加载器改为扫描 db/skills 加可选的 ~/.radarforge/skills（用户自装位），平台 skills/ 从扫描根中移除。产品首批技能按官方规范重建：wewrite 十件套与 huashu 双件原本是外部社区技能包，恢复路径优先是「从原社区来源重新安装」（安装能力本身就是本轮要补的），无法溯源的技能按其功能语义重写。UI 占位符改为动态计数。第二步（P2）补安装管理：技能卡片增详情抽屉（SKILL.md 全文 + 目录结构 + 合规校验结果）、启停开关、从 URL 或 zip 安装、卸载；合规校验用官方规则（name 与目录名一致等），不合规技能明确标注原因而非静默跳过。"),
    ("p", "验收标准：db/skills 下技能在沙箱回收重启后依然可用（git 兜底）；平台 skills/ 目录内容变化不再影响产品技能清单；每个技能卡可查看 frontmatter 合规校验结果；从 URL 安装一个官方模板技能后立即可在 Agent 运行时选用；停用技能后不出现在候选池但不删除文件。"),
]

# ================= 第四章 工具注册表与 MCP =================
BLOCKS += [
    ("h1", "第四章 工具注册表重定位与 MCP 标准化"),
    ("h2", "4.1 工具注册表：单独运行的意义辨析"),
    ("p", "先正面回答 Q3。工具注册表（src/lib/agent/tool-registry.ts）当前注册了五个内置工具：web_search（联网检索，经网关降级链）、read_skill（读技能正文）、create_idea（写入选题池）、add_inbox_item（写结构化反馈）、list_topics（列出追踪话题）。每个工具都真实可调用——本轮实测 POST /api/agent/tools 逐一返回了正确结果。「单独运行」的执行台价值有三：验证工具契约（改参数 schema 后立即冒烟）、演示降级链（web_search 在无密钥时走演示数据的真实行为）、以及给后续接入的外部工具（MCP）提供联调入口。"),
    ("p", "用户觉得「没意义」的真正原因是<b>呈现位置错了</b>：它被放在「插件中心」里，与 Provider 注册表、MCP、dsh 并列成产品级能力，却没有任何「这是调试工具」的心智标注，也不与任何主流程发生关系。处置方案（P1）：改名为「工具测试台」并在卡片头注明诊断用途；执行结果增加耗时与降级路径显示（把演示/真实模式亮出来）；更重要的是让它成为 MCP 接入后的联调面板——外部工具接入后在此可见可测，测试台从「孤岛演示」变成「生态联调」。"),
    ("h2", "4.2 MCP：两套割裂的客户端"),
    ("p", "Q5 的批评成立，而且是七问中工程含量最高的缺陷。现状是<b>两套互不相通的 MCP 客户端并存</b>：一套在 src/lib/mcp/（client.ts + config.ts + /api/mcp 路由），stdio 传输，spawn 子进程走 JSON-RPC，协议版本 2024-11-05，配置存项目根 config/mcp.json，格式是自定义的 {servers: {...}}；另一套在 src/lib/agent/mcp-client.ts（/api/agent/mcp 路由，插件中心 UI 使用），HTTP 传输，fetch POST，协议版本 2025-06-18，配置存数据库 McpServer 表。两套的配置互不可见：config/mcp.json 里配置的服务器（当前只有内置 echo 测试服务器）在 UI 上完全不存在，UI 添加的服务器也不写回文件。"),
    ("table",
     ["维度", "lib/mcp（stdio 套）", "lib/agent/mcp-client（HTTP 套）"],
     [
         ["传输", "子进程 stdio（JSON-RPC 按行）", "HTTP POST（fetch）"],
         ["协议版本", "2024-11-05", "2025-06-18"],
         ["配置存储", "config/mcp.json（自定义 servers 键）", "数据库 McpServer 表"],
         ["UI 入口", "无（API 存在但界面不可达）", "插件中心 MCP 卡片"],
         ["工具落地", "仅枚举展示", "仅枚举展示（discoveredTools 落库）"],
         ["stdio 配置", "command + args + env 完整支持", "DB 有 command 字段但 UI 无输入"],
     ],
     [0.16, 0.40, 0.44]),
    ("caption", "表 4-1 两套 MCP 客户端对照"),
    ("p", "HTTP 套的协议实现还有三处与规范不符。其一，无会话管理：Streamable HTTP 传输要求从 initialize 响应头取 Mcp-Session-Id 并在后续请求携带，当前实现完全没处理，对接需要会话的服务器必然失败。其二，流式解析方式错误：parseSseBody 在响应体完整结束后才在全文里找 data: 行，而 text/event-stream 是长连接流，等全文结束意味着挂起或超时——这正是「安装配置方式不准确」体感的协议层来源。其三，两个客户端的协议版本不一致，也未做版本协商。"),
    ("p", "最实质的功能断层是：<b>发现的工具从不接入工具注册表</b>。testMcpServer 完成握手与 tools/list 后把结果存进 discoveredTools 字段用于展示，/api/mcp 注释宣称「任何 MCP 服务器的工具都能以此挂进平台工具注册表」，但代码里没有任何 registerTool 调用——Agent 运行时永远无法调用 MCP 工具。MCP 在当前产品里是纯展示功能，这与 dsh 官方对 MCP 的定位（工具以 mcp__服务器__工具 命名桥接进统一工具层，模型直接可调）形成直接对照。"),
    ("h2", "4.3 标准做法与整固方案"),
    ("p", "MCP 配置的通行标准是各客户端共用的 mcpServers JSON 格式：stdio 服务器声明 type / command / args / env（Cursor 还支持 envFile），远程服务器声明 url / headers / auth（静态 OAuth 客户端凭据）；配置文件位置因客户端而异——Cursor 的项目级 .cursor/mcp.json 与全局 ~/.cursor/mcp.json、Claude Desktop 的 claude_desktop_config.json、VS Code 的 .vscode/mcp.json——但条目结构一致，因此「一份 JSON 多处导入」是事实标准。传输层现行两种：stdio 与 Streamable HTTP（旧 SSE 已被标记为弃用方向）。官方同时提供 TypeScript SDK（@modelcontextprotocol/sdk）封装了握手、会话与两种传输。"),
    ("p", "整固方案（P0 收口 + P1 接通）：统一为单一 MCP 网关模块——自研收口（把 stdio 套的子进程管理并入 HTTP 套的存储与路由）或直接换官方 SDK 承载握手与会话，二选一在实施时按依赖体积定，但对外只保留 /api/mcp 一个路由族。数据模型扩展：McpServer 表增 args / env / headers 三个 JSON 字段，command 拆出独立字段与 args 数组对齐标准形态。配置互操作：新增「导入 mcpServers JSON」与「导出」——导入时按有无 url 区分 stdio / 远程条目并逐条校验，导出的 JSON 可直接粘进 Cursor 或 Claude Desktop。协议修补：HTTP 客户端补 Mcp-Session-Id 会话管理与流式读取（读到首个完整 JSON 帧即返回）。<b>工具接通</b>：握手成功的已启用服务器，其工具以 mcp__服务器名__工具名 注册进工具注册表（命名学 dsh），Agent 运行时与工具测试台均可调用；生态页每个服务器卡显示「已接入 N 个工具 / 被 M 个 run 使用」。config/mcp.json 旧通道在 P0 先并入统一路由读取（迁移期双读），P1 移除。"),
    ("p", "验收标准：导入一份标准 mcpServers JSON（含一个 stdio 与一个远程条目）后两服务器均出现在 UI 且可分别测试；对接需要会话的 Streamable HTTP 服务器握手成功；发现的工具出现在工具注册表并可被 Agent run 实际调用（run 详情里可见工具名与耗时）；导出的 JSON 在 Cursor 中直接可用；echo 测试服务器与新链路全通。"),
]

# ================= 第五章 dsh =================
BLOCKS += [
    ("h1", "第五章 dsh 插件：补完与真实宿主实测"),
    ("h2", "5.1 dsh 是什么：官方事实"),
    ("p", "回答 Q4 的第一问：dsh 是 DeepSeek Harness 的命令行名，深度求索于 2026-08-13 公开的开源 Agent 框架（仓库 deepseek-ai/deepseek-harness，MIT 协议，TypeScript 编写，当前处于开发者预览阶段，npm 最新 0.2.1-rc.5）。它的核心理念是「一切皆插件」：模型适配、工具层、会话、技能、沙箱、调度、界面全部以插件形态挂在 Cordis 内核（cordiverse/cordis，Koishi 机器人的底层组合框架）上，没有特权内核可打补丁。插件就是实现了 Service 的对象——一个导出 apply(ctx) 的模块，用 inject 声明依赖服务，用 Schemastery 的 Config 声明可配置项，通过 ctx 注册的一切（监听器、工具、定时器）在卸载时自动回收。"),
    ("p", "分发与安装的官方路径：插件打成 npm 包，package.json 里用 dsh.bundle.patch 字段指向 cordis.patch.yml 补丁文件（漏声明则装了个普通依赖、配置层永不激活）；安装命令 dsh plugin --profile 名称 add 包路径（内部转发给 pnpm）；安装后必须重启 profile 才生效；dsh --profile 名称 --dump-config 可在不启动的情况下核对插件树里是否出现自己的行。官方发现机制是 GitHub topic「dsh-plugin」（无中心注册表）。扩展形态三选一：插件（进程内挂载，可替换包括 agent loop 在内的一切）、MCP 服务器（外部进程，仅工具经 @deepseek-ai/dsh-mcp-client 桥接，命名形如 mcp__github__create_issue）、技能（/名称 调用的文本指令）。官方指南特别强调当前 API 在 rc 间会破坏兼容，插件应声明验证过的 dsh 版本。"),
    ("h2", "5.2 现有资产评估：已做对的与差距"),
    ("p", "本项目已产出的插件包（download/dsh-plugin-radar/，五个文件均已 git 跟踪并推送 GitHub）：<b>已做对的部分</b>——package.json 声明了 dsh.bundle.patch 指向 cordis.patch.yml、dsh.client 声明浏览器半（inject @deepseek-ai/dsh-client-ui-renderer，platform web）并 exports 出 ./client 入口、keywords 含 dsh-plugin、files 清单包含补丁文件；cordis.patch.yml 是标准的单行 insert（id: radar-plugin，name: dsh-plugin-radar）；lib/index.js 导出 apply(ctx) 与 inject（声明 tools 与 webServer 两个服务），注册 radar_article（一句话跑六步流水线：brief 到取证到初稿到审稿到封面到排版，返回纯文本与平台链接）与 radar_video（分镜到成片，MP4 只给用户不给模型）两个模型工具，RADAR_BASE 环境变量配置平台地址，含轮询等待与超时保护。工具只回纯文本、富产物留在会话卡的约定与官方示例一致。"),
    ("table",
     ["差距项", "官方指南要求", "现状", "影响"],
     [
         ["工具定义方式", "defineTool + parameters JSON Schema + output.schema/render", "裸对象 ctx.tools.register，无参数 schema", "模型侧参数无校验，协议字段不完整"],
         ["可配置项", "Config 用 Schemastery 导出（两部署可能不同的值进 config）", "RADAR_BASE 仅环境变量", "不符合官方配置分层，改地址要动环境"],
         ["name 导出", "导出 name 做诊断元数据", "无", "加载失败时难定位"],
         ["engines.dsh", "声明验证过的 dsh 版本（rc 间破坏兼容）", "只有 node 限制", "宿主升级后行为不可预期"],
         ["inject 服务名", "官方示例为 tools；webServer 未见于公开文档", "inject 含 webServer", "未经真实宿主验证，可能加载失败"],
         ["宿主验证", "plugin add 后 --dump-config 核对 + 实调工具", "从未在真实 dsh 宿主运行（UI 已诚实标注）", "「能用」只是推断"],
         ["分发", "GitHub Release tgz / topic dsh-plugin", "源码在仓库，无 Release 产物", "用户无法从 GitHub 一键下载安装"],
     ],
     [0.15, 0.30, 0.28, 0.27]),
    ("caption", "表 5-1 插件包与官方指南的差距清单"),
    ("h2", "5.3 方案：四步补完 + 真实宿主实测 + GitHub 分发"),
    ("p", "补完四步（P1）：其一，工具定义迁移到 @deepseek-ai/dsh-tools 的 defineTool，为 radar_article 补 parameters（ideaTitle 必填字符串，angle / persona / theme / exemplarId 可选）与 output schema，radar_video 同理（runId 必填，direction / voice / aspect / style 可选）；其二，新增 Schemastery Config 导出 radarBase（默认 http://localhost:3000，环境变量作为回落），符合「配置层可改」的官方分层；其三，导出 name 与 engines.dsh（按实测通过版本固定下限）；其四，inject 服务名以真实宿主的 --dump-config 与启动日志为准修正。"),
    ("p", "真实宿主实测（P1，沙箱内可行——npm 源已验证可达）：在沙箱安装 @deepseek-ai/dsh，创建独立 profile，用 dsh plugin --profile radar add ./dsh-plugin-radar.tgz 安装打包产物；dsh --profile radar --dump-config 断言 radar-plugin 行出现在插件树；启动 dsh（headless 或 web 形态）确认插件加载日志；通过宿主实际调用 radar_article——对接本平台 /api/runs 跑通一条最小流水线（演示模式即可，验证的是协议链路而非出稿质量）；把全流程固化为 scripts/test-dsh-plugin.mjs 回归脚本，与既有八套离线回归并列。分发（P1）：插件包体从 download/ 迁入仓库正式目录（建议 plugins/dsh-radar/，download/ 语义上是用户交付物且大体被忽略），每次发版在 GitHub Release 附 dsh-plugin-radar.tgz 产物，README 安装命令指向 Release 直链——dsh plugin --profile web add 后接 Release tgz 的 URL（pnpm 支持 https tarball，这是官方「装来源可信的构建产物」建议下的最稳路径）；仓库打上 dsh-plugin topic 进入官方发现通道。"),
    ("p", "验收标准：--dump-config 出现 radar-plugin 行；宿主内两工具被模型正确选中调用（从会话日志核对工具名与参数）；回归脚本在沙箱一键复跑全链路；GitHub Release 页可下载 tgz 且按 README 命令安装成功；插件卡片上的「已知边界」标注从「宿主内联调待补做」改为「实测通过于 dsh 0.2.1-rc.5」并附回归证据链接。"),
    ("h2", "5.4 dsh 与 MCP：两个出口的取舍"),
    ("p", "补完 dsh 插件后，平台会同时拥有两个对外出口，需要一句清晰的取舍规则避免内部摇摆。判断维度有三：受众、集成深度与维护成本。dsh 插件面向装了 DeepSeek Harness 的用户，集成最深——工具直接出现在宿主对话里，能吃到会话卡片、进度渲染等宿主能力，代价是绑定单一宿主且要追 rc 版本间的破坏性变更。MCP 面向所有主流客户端（Claude、Cursor、VS Code 生态等），覆盖面最大、协议稳定，但只桥接工具层，拿不到宿主界面能力。结论性规则：同一能力优先做 MCP 接入（一次实现处处可用），仅当需要富交互（成稿卡片、视频播放器）或深度会话集成时才做 dsh 插件版。按此规则，radar_article 这类纯文本回传的工具未来可以下沉到 MCP 通道，radar_video 这类富产物工具留在 dsh 插件——两个出口各司其职，而不是各做一套。"),
]

# ================= 第六章 视频 =================
BLOCKS += [
    ("h1", "第六章 视频线：依赖治理与模型配置"),
    ("h2", "6.1 报错根因：一条完整的证据链"),
    ("p", "用户引用的报错「ffmpeg 不可用：Executable not found in $PATH」可以完整溯源。触发路径：设置中心的视频通道卡有一枚「检查视频模型」按钮，点击后 POST /api/settings/test 且 scope 为 video；当视频通道为 local（默认值）时，该接口执行 execFile 探测 ffmpeg -version，失败则拼出「ffmpeg 不可用：」加错误信息的文案（settings/test 路由第 133 至 136 行）。关键在错误信息本身：本轮做了运行时对照实验——对不存在的命令名执行同样的 execFile，<b>Node 的报错是 spawn ffmpeg ENOENT，Bun 的报错正是 Executable not found in $PATH</b>，与用户引用逐字一致。结论：用户的预览环境运行的是生产模式（package.json 的 start 脚本以 bun 运行 standalone 产物），且该进程的 PATH 里没有 ffmpeg 的所在目录。"),
    ("p", "这不是偶发环境问题的原因是：代码里全部 16 处 ffmpeg / ffprobe 调用（视频合成、分段、探时长、BGM 合成、缩略图等，散布在 video.ts 十余处与 settings 探测一处）<b>全部使用裸命令名</b>，把「可执行文件在哪」的决定权交给进程 PATH。开发模式恰好能跑（Node 继承完整 PATH），生产模式换运行时后路径解析行为不同，于是同一个按钮在两种模式下给出两种命运。叠加语义缺陷——按钮叫「检查视频模型」，local 通道下实际探测的是本地渲染依赖——用户自然得出「视频模型坏了」的结论。"),
    ("callout", "根因双层", "第一层是依赖治理缺失：二进制依赖（ffmpeg / ffprobe / TTS / Playwright）没有任何统一解析、探测与指引机制，16 处调用点各自为政。第二层是语义错位：模型探活与依赖自检混在一枚按钮里，报错文案又不解释「这是本地渲染依赖而非 AI 模型」。修任何一层都只能消除一半困惑，必须两层一起修。"),
    ("h2", "6.2 方案：依赖解析链 + 自检面板 + 轻量模型配置"),
    ("p", "依赖治理（P0）：新增 lib/media/binaries.ts 统一解析器——优先环境变量 FFMPEG_PATH / FFPROBE_PATH，其次 which 探测，再查常见安装路径表（/usr/bin、/usr/local/bin、/opt/homebrew/bin 等），最后回落 node_modules 内的 ffmpeg-static 包（作为可选依赖，装了就有，使部署自足）；解析结果模块级缓存并在启动日志打印一次。16 处调用点全部改为解析后的绝对路径。自检面板（P0）：设置中心的「检查视频模型」拆为两个动作——「AI 模型探活」走 agnes 通道的真实 health；「本地渲染依赖自检」逐项列出 ffmpeg / ffprobe / TTS / Playwright 的解析路径与版本，缺失项给修复指引（设置环境变量、装 ffmpeg-static 或系统安装命令）而非原始报错。"),
    ("p", "模型配置轻量化（P1，按「图文为主视频为辅」定位裁剪）：现状是视频模型清单硬编码为单一选项（agnes-video-2.5-flash），视频配置分裂在两处（Agnes 池内的模型下拉 + 视频通道卡的秒数滑杆）。方案收敛为视频通道卡内一个完整区块：模型下拉改为可编辑清单（预置项 + 允许手填自定义模型 id，不维护远端目录拉取）、分辨率预设（720P 起步）、画幅（9:16 / 16:9）、每镜秒数沿用现有滑杆；Agnes 池卡只管账号与配额，不再承载视频模型选择。成本估算、批量出片等重功能明确不做——这与产品当前阶段的视频线定位一致。"),
    ("p", "验收标准：用 env -i 清空 PATH 模拟受限环境后，自检面板给出含三种修复路径的指引文案，而不是原始 ENOENT；配置 FFMPEG_PATH 指向自编译二进制后本地渲染全链路出片成功；ffmpeg-static 兜底在无系统 ffmpeg 的环境出片成功；「AI 模型探活」与「依赖自检」两枚按钮的返回内容与其名称一致；视频通道卡内完成模型 / 分辨率 / 画幅 / 秒数的全套配置并保存后，下一次生成请求携带全部参数。"),
]

# ================= 第七章 闭环与割裂感 =================
BLOCKS += [
    ("h1", "第七章 产品闭环与割裂感治理"),
    ("h2", "7.1 割裂感的结构化清单"),
    ("p", "Q7 是七问的总纲，前六问都是它在具体切面上的投影。把「割裂」拆成可执行的清单，核心是六条断点。其一，<b>生态页与主流程零关联</b>：社区技能不能作为创作步骤或人格模板被六步流水线引用（Agent 运行时与创作流水线是两套入口）；MCP 工具发现后不可调用；dsh 卡是静态说明。其二，<b>设置分散</b>：模型密钥、Agnes 池、视频通道、自动化分居四张卡，视频模型配置甚至分裂在两张卡里。其三，<b>展示多于可用</b>：Provider 巡检、工具注册表、MCP 工具发现都是「看得见用不上」，用户自然产生半成品感。其四，<b>错误信息口径不一</b>：ffmpeg 报错直接透出运行时原始文案，与其余「人话留痕」的工程约定相悖。其五，<b>命名无门槛</b>：dsh、cordis、pi-ai、models.json 等内部生态术语在 UI 首次出现处无任何解释。其六，<b>四顶级 tab 的信息架构</b>把「生态」抬到了与「创作」平级的位置，而其内容当前撑不起这个位置。"),
    ("table",
     ["断点", "现象", "治理动作", "批次"],
     [
         ["生态与主流程脱钩", "skills / MCP / dsh 三能力不进创作链", "三接线：技能接入创作模板、MCP 工具进注册表、dsh 变对外分发入口", "P1-P2"],
         ["设置分散", "视频模型配置分裂两卡", "设置三分区：模型与密钥 / 运行时依赖 / 内容策略", "P2"],
         ["展示性功能", "三项只可看不可用", "「不上纯展示功能」入工程规约 + 回归断言", "P1 起持续"],
         ["错误口径不一", "ffmpeg 原始报错直出", "依赖自检面板 + 人话文案约定", "P0"],
         ["命名无解释", "dsh / cordis / pi-ai 裸奔", "首次出现处一句话注释 + tooltip", "P1"],
         ["信息架构头重", "生态 tab 撑不起顶级位", "生态降级并入创作台侧栏或保留但内容充实后复评", "P2"],
     ],
     [0.17, 0.27, 0.40, 0.16], (3,)),
    ("caption", "表 7-1 闭环断点清单与治理动作"),
    ("h2", "7.2 收敛方案与防复发机制"),
    ("p", "收敛的主轴是「接线」而不是「砍功能」。生态三接线分别落在第三章（技能成为创作可选模板与人格来源，Agent 运行时与流水线共享同一技能池）、第四章（MCP 工具进注册表，生态页显示接入数与使用数）、第五章（dsh 卡从静态说明升级为对外分发入口：安装命令、验证过的宿主版本、实测徽章与回归证据链接）。设置中心三分区重构：模型与密钥（LLM / 搜索 / 生图 / 视频模型统一卡片与统一「测试连通」语义）、运行时依赖（ffmpeg / Playwright / TTS 自检）、内容策略（风格定位 / 文风校准 / 自动化任务）。全局健康中心作为首屏状态条：搜索密钥、LLM 通道、视频依赖、信源健康四项一览，任何一项异常可直接跳转对应设置卡——把「哪里坏了」的答案从报错文案里挪到结构化入口上。"),
    ("p", "防复发比修复更重要，三条机制写入工程规约并配套回归：第一，「纯展示功能不上线」——新能力必须在提案里写明它在主流程的接入点，否则不合并；第二，外部资产一律入 git（本次 skills 目录教训的制度化）；第三，生态页回归清单增加断言（MCP 工具可在注册表枚举、技能池含产品技能、dsh 卡状态与回归脚本结果一致）。这三条与既有的诚实降级、留痕、断言文化一脉相承，把本轮的割裂感教训沉淀为可检查的约束。"),
    ("h2", "7.3 术语治理与首现注释"),
    ("p", "割裂感的另一半来自语言：UI 与文档里直接裸奔 dsh、cordis、pi-ai 这类生态术语，新用户无从判断它们是产品名、协议名还是内部代号。治理约定很简单：任何非通用术语在产品界面首次出现处配一句人话注释（tooltip 或括号短句），文档里首次出现处加脚注式说明；内部代号（如 pi-ai）在面向用户的文案中一律替换为能力描述而非代号本身。下表给出当前在用术语的统一解释口径，作为文案与文档的单一事实源。"),
    ("table",
     ["术语", "一句话解释", "归属"],
     [
         ["dsh / DeepSeek Harness", "深度求索开源的对话式 Agent 宿主框架，插件形态把平台能力装进它的对话框", "外部生态"],
         ["Cordis", "dsh 的底层插件内核（服务与事件组合框架），平台侧只需知道它是 dsh 插件的挂载机制", "外部生态"],
         ["bundle / profile", "dsh 的插件包与启动配置层：装插件即加 bundle，启哪套能力用 profile", "外部生态"],
         ["Agent Skills / SKILL.md", "开放技能标准：一个目录加一份 SKILL.md 声明式指令，即装即用", "外部标准"],
         ["MCP", "模型上下文协议：外部工具服务的统一接入标准，配一份 JSON 即可接入主流客户端", "外部标准"],
         ["Streamable HTTP", "MCP 的远程传输方式（单端点双向流式），需会话头管理", "外部标准"],
         ["pi-ai / models.json", "多供应商模型配置的互通协议：一份 JSON 在本平台与插件侧共用", "外部协议"],
         ["Agnes", "平台内的免费多模态供应商通道（多账号池调度），非外部专名", "内部命名"],
         ["RSSHub", "把网站转为 RSS 的开源路由器，拼好 URL 即可作为本平台信源", "外部生态"],
         ["ffmpeg-static", "随 node_modules 分发的 ffmpeg 二进制包，作为系统缺失时的兜底", "依赖治理"],
     ],
     [0.22, 0.62, 0.16]),
    ("caption", "表 7-2 术语统一解释口径（文案与文档的单一事实源）"),
]

# ================= 第八章 排期 =================
BLOCKS += [
    ("h1", "第八章 实施排期与合并路线图"),
    ("h2", "8.1 三批十二项"),
    ("p", "排期遵循三个原则：用户可见的破洞优先（P0 四项全部直接回应本轮七问）；需要外部生态配合的项集中处理并配真实验证（P1 的 dsh 实测与 MCP 接通共享「真实宿主」验证框架）；纯产品层收敛放最后（P2）。工作量按本工程的实施节奏估算（一轮 = 一次完整开发加回归的会话），P0 一轮可全部完成，P1 约两轮，P2 约两轮。每项都有独立验收标准，允许按验收状态而非时间来裁剪范围。"),
    ("table",
     ["批次", "事项", "内容", "验收要点"],
     [
         ["P0-1", "依赖解析链", "binaries.ts 解析器 + 16 调用点改绝对路径 + 按钮拆分为模型探活 / 依赖自检", "受限 PATH 下给指引不出原始报错"],
         ["P0-2", "RSS 编辑与代理", "PATCH 子集更新 + proxyUrl 字段 + 全局代理 + undici ProxyAgent", "编辑保历史；按源代理生效可断言"],
         ["P0-3", "技能目录主权", "扫描根迁 db/skills + 平台目录移出 + 动态计数", "沙箱回收后技能仍在"],
         ["P0-4", "MCP 入口统一", "两套路由合并双读 + UI 补 stdio 命令表单 + 启停开关", "两套配置在同一界面可见可测"],
         ["P1-1", "dsh 补完", "defineTool + Config + name / engines + inject 修正", "官方规范差距表逐项关闭"],
         ["P1-2", "dsh 宿主实测", "沙箱装 dsh + plugin add + dump-config + 实调工具 + 回归脚本", "全链路一键复跑"],
         ["P1-3", "dsh 分发", "包体入 plugins/ + GitHub Release tgz + topic", "按 README 命令安装成功"],
         ["P1-4", "MCP 标准化", "schema 扩展 + mcpServers 导入导出 + 会话管理 + 工具接入注册表", "导出 JSON 在 Cursor 可用；run 内可调 MCP 工具"],
         ["P1-5", "视频模型配置", "模型可编辑清单 + 分辨率 / 画幅 + 配置收敛单卡", "配置全参数下发到生成请求"],
         ["P1-6", "工具测试台重定位", "改名 + 诊断标注 + MCP 工具联调面板", "测试台可调 MCP 工具并显示降级路径"],
         ["P2-1", "技能安装管理", "详情抽屉 + 合规校验 + URL / zip 安装 + 启停", "装官方模板技能即可用"],
         ["P2-2", "设置三分区 + 健康中心", "设置信息架构重构 + 首屏健康状态条", "四项健康一览且可跳转"],
         ["P2-3", "MCP 服务端开放", "RadarForge 作为 MCP server 对外（原 p23 扩展为双向）", "外部 MCP 客户端可调用平台能力"],
     ],
     [0.08, 0.17, 0.47, 0.28], (0,)),
    ("caption", "表 8-1 三批十二项排期（P0 一轮 / P1 两轮 / P2 两轮）"),
    ("h2", "8.2 与既有路线图的合并"),
    ("p", "本轮十二项与 docs/product-deep-dive.md 的 P2 阶段（定时出版 p21、资产中心 p22、MCP 开放 p23、多租户评估 p24）合并如下：p23「MCP server 开放」扩展为「双向 MCP」——客户端标准化（本轮 P0-4 与 P1-4）先行，服务端开放（本轮 P2-3）沿用 p23 的窗口；p21 定时出版与 p22 资产中心不受影响，照常推进；多租户评估（p24）建议顺延一轮，理由是本轮七问暴露的「单用户态的依赖与资产管理」问题应先于多租户收敛——租户隔离建立在资产主权清晰之上。P0 与 P1 的八个事项建议插队在 p21 / p22 之前执行，因为它们直接回应在案的用户报障，且工作量（合计约三轮）远小于 P2 阶段既有项。"),
    ("p", "风险与回滚：所有改动沿用既有回归框架兜底——八套离线回归加浏览器回归全绿是合并门槛；dsh 实测与 MCP 接通两项引入外部依赖（npm 包与外部服务器），回归脚本需具备「外部不可达时明确跳过并标注」的降级语义，避免网络抖动误伤合并判断。回滚策略按事项独立：每项一个提交序列，出问题回退单项不牵连批次。"),
    ("h2", "8.3 验收门禁与度量"),
    ("p", "每个批次共用一套完成定义（DoD）：功能验收标准逐条通过（见表 8-1）；八套离线回归与浏览器回归全绿；涉及外部生态的项（dsh 实测、MCP 握手）附原始证据（dump-config 输出、握手响应）；面向用户的报错文案符合「人话留痕」约定。度量方式沿用本报告的取证方法而非新造指标：每批次结束时用同一组命令重跑取证清单（附录 B），比对断点是否真实闭合——例如 P0 后重新检索 sources 路由应能找到 update 语义，P1 后在 run 详情里应能看到 mcp 前缀的工具调用记录。"),
    ("p", "门禁的裁剪规则提前约定，避免执行期争议：外部依赖不可达（如 npm 源阻断导致 dsh 无法安装）时，对应项降级为「实现完成、实测挂起」并如实标注，不冒充通过；验收标准中的每一条要么通过要么明确挂起，不存在部分完成状态。用户评审本方案时，可以直接对表 8-1 的 13 行做增删与优先级调整，排期与验收即随之重算——这正是把方案做成可执行清单而非承诺文档的目的。"),
]

# ================= 附录 =================
BLOCKS += [
    ("h1", "附录 A 外部标准与参考"),
    ("p", "以下为本报告引用的外部标准与官方文档，均为本轮实际检索核对过的来源；具体条目的归属与原文以链接指向的当前版本为准。"),
    ("table",
     ["主题", "来源", "链接"],
     [
         ["dsh 插件官方指南（社区 Field Guide）", "deepseekai.works", "https://deepseekai.works/plugins"],
         ["DeepSeek Harness 仓库", "GitHub", "https://github.com/deepseek-ai/deepseek-harness"],
         ["Cordis 内核", "GitHub", "https://github.com/cordiverse/cordis"],
         ["dsh 插件编写教程", "SSD Nodes", "https://www.ssdnodes.com/learn/write-your-own-dsh-plugin"],
         ["Agent Skills 规范", "agentskills.io", "https://agentskills.io/specification"],
         ["Agent Skills 参考实现", "GitHub anthropics/skills", "https://github.com/anthropics/skills"],
         ["Claude 平台 Agent Skills 文档", "Claude Platform Docs", "https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview"],
         ["MCP 配置格式（mcpServers / stdio / 远程 / OAuth）", "Cursor Docs", "https://cursor.com/docs/mcp"],
         ["MCP servers 配置结构参考", "LibreChat Docs", "https://www.librechat.ai/docs/configuration/librechat_yaml/object_structure/mcp_servers"],
     ],
     [0.34, 0.22, 0.44]),
    ("caption", "表 A-1 引用来源清单"),
    ("h1", "附录 B 本轮取证清单（可复核）"),
    ("p", "以下命令均可在仓库当前主干复跑；证据位置以文件与行为描述给出，行号以本轮检索时点为准。"),
    ("table",
     ["取证项", "方法", "结果要点"],
     [
         ["RSS 无编辑无代理", "检索 sources 路由与 rss-panel 组件（编辑 / edit / Pencil / proxy / 代理）", "仅 add / 启停 / 删除；抓取无代理参数"],
         ["技能目录被平台覆盖", "ls skills（69 项）+ 检索 wewrite / huashu + 读 .gitignore 第 55 行", "产品 12 技能不在；/skills/ 被忽略未入库"],
         ["占位符硬编码", "读 agent-panel 搜索占位符", "「搜索 69 个技能…」静态写死"],
         ["MCP 双客户端", "读 lib/mcp 与 lib/agent/mcp-client 及两路由；比对协议版本常量", "2024-11-05 与 2025-06-18 并存；工具不注册"],
         ["工具注册表实测", "curl GET /api/agent/tools", "五内置工具全部真实返回"],
         ["ffmpeg 报错溯源", "对照实验：Node 与 Bun 下 execFile 不存在命令", "Node 报 spawn ENOENT；Bun 报 Executable not found in $PATH（与用户引用一致）"],
         ["运行模式确认", "读 package.json start 脚本", "生产模式 bun 运行 standalone 产物"],
         ["视频模型清单", "读 settings-panel 模型常量", "AGNES_VIDEO_MODELS 硬编码单一选项"],
         ["dsh 生态可达", "npm view @deepseek-ai/dsh / cordis / dsh-tools", "0.2.1-rc.5 / 4.0.5 / 0.0.1-rc.1，实测可行"],
         ["插件包资产", "git ls-files download/dsh-plugin-radar/", "五文件已跟踪已推 GitHub；无 Release 产物"],
         ["接口健康实测", "with-server 下 curl settings/test、agent/skills、gateway/providers", "local 通道 ffmpeg 探测当前成功；69 技能可加载"],
     ],
     [0.20, 0.42, 0.38]),
    ("caption", "表 B-1 取证命令与证据位置"),
]

# ================= 附录 C/D（深度版增量：逐文件改动清单 + 接口草案） =================
BLOCKS += [
    ("h1", "附录 C 逐文件改动清单"),
    ("p", "以下按排期事项列出涉及文件的精确改动范围，供评审时逐项核对工作量与影响面；「新建」指仓库内不存在的文件，「迁移」指路径变更并保留内容。P2 批次以方向为主，文件级清单在该批次启动时按同样格式补齐。"),
    ("table",
     ["事项", "新建", "修改", "说明"],
     [
         ["P0-1 依赖解析", "src/lib/media/binaries.ts", "src/lib/runtime/video.ts（16 处调用点）；src/app/api/settings/test/route.ts（scope 拆分）；src/components/settings-panel.tsx（双按钮与自检卡）", "解析结果模块级缓存，启动打印一次"],
         ["P0-2 RSS 编辑代理", "无", "src/app/api/sources/route.ts；prisma/schema.prisma（SourceFeed 增 proxyUrl）；src/lib/sources/rss.ts（代理 dispatcher）；src/components/rss-panel.tsx；src/lib/settings.ts；settings-panel.tsx", "改 URL 触发定向重抓"],
         ["P0-3 技能目录主权", "db/skills/（产品技能重建）", "src/lib/skills/loader.ts 与 src/lib/agent/skill-loader.ts（扫描根）；src/components/agent-panel.tsx（动态计数）", "平台 skills/ 移出扫描根"],
         ["P0-4 MCP 入口统一", "无", "src/app/api/mcp/route.ts 与 src/app/api/agent/mcp/route.ts（合并双读）；src/components/plugins-panel.tsx（stdio 表单与启停）", "迁移期双读，P1 移除旧通道"],
         ["P1-1/2/3 dsh", "plugins/dsh-radar/（自 download/ 迁入）；scripts/test-dsh-plugin.mjs", "插件四件（package.json / cordis.patch.yml / lib/index.js / lib/client.js）；README 安装命令", "GitHub Release 附 tgz"],
         ["P1-4 MCP 标准化", "无", "prisma/schema.prisma（McpServer 增 args/env/headers）；src/lib/agent/mcp-client.ts（会话 + 流式 + 工具注册）；src/lib/agent/tool-registry.ts（前缀命名）；plugins-panel.tsx（导入导出）", "工具名 mcp__服务器__工具"],
         ["P1-5 视频模型配置", "无", "src/lib/settings.ts（VideoSettings 扩展）；src/components/settings-panel.tsx（模型区块收敛）；src/components/video-panel.tsx（参数透传）", "模型清单可编辑"],
         ["P1-6 测试台重定位", "无", "src/components/plugins-panel.tsx（卡片改名与诊断标注）", "联调面板化"],
     ],
     [0.13, 0.24, 0.46, 0.17]),
    ("caption", "表 C-1 P0 与 P1 批次逐文件改动清单"),
    ("h1", "附录 D 接口与数据结构草案"),
    ("h3", "D.1 RSS 源编辑（PATCH /api/sources）"),
    ("code", "请求：PATCH /api/sources\n{\n  \"id\": \"cli_xxx\",\n  \"name\": \"量子位\",        // 可选，<= 60 字符\n  \"url\": \"https://.../feed\",  // 可选，变更后定向重抓验证\n  \"category\": \"中文综合\",     // 可选，<= 20 字符\n  \"proxyUrl\": \"http://127.0.0.1:7890\"  // 可选，空串 = 清除按源代理\n}\n响应：{ \"feed\": { ...更新后完整行 }, \"recheck\": { \"status\": \"ok\", \"fetched\": 23 } }\n错误：url 查重 / 前缀校验失败返回 400 与人话信息；重抓失败不阻断保存，仅在响应 recheck 留痕。"),
    ("h3", "D.2 MCP 数据模型扩展（prisma schema 增量）"),
    ("code", "model McpServer {\n  // 既有字段保持：id name transport url command enabled status discoveredTools lastError ...\n  args    String  @default(\"[]\")  // JSON 数组，stdio 用（如 [\"-y\", \"mcp-server-github\"]）\n  env     String  @default(\"{}\")  // JSON 对象，注入子进程 / 请求头变量\n  headers String  @default(\"{}\")  // JSON 对象，远程服务器鉴权头（如 Authorization）\n  kind    String  @default(\"stdio\") // 收敛后单一判别字段：stdio | http\n}"),
    ("h3", "D.3 mcpServers 标准导入格式"),
    ("code", "{\n  \"mcpServers\": {\n    \"deepwiki\": { \"url\": \"https://mcp.deepwiki.com/mcp\" },\n    \"github\": {\n      \"command\": \"npx\",\n      \"args\": [\"-y\", \"@modelcontextprotocol/server-github\"],\n      \"env\": { \"GITHUB_TOKEN\": \"env:GITHUB_TOKEN\" }\n    }\n  }\n}\n导入规则：有 url 判远程（headers/auth 同步入库）；有 command 判 stdio（args/env 入库）；\n不支持字段（envFile 等）导入时逐条列出并跳过，不静默丢弃；导出为同构 JSON 可直贴 Cursor。"),
    ("h3", "D.4 二进制解析器（src/lib/media/binaries.ts 接口草案）"),
    ("code", "export interface BinResolve { path: string; source: \"env\" | \"which\" | \"known\" | \"static\" }\nexport function resolveFFmpeg(): BinResolve | null\n// 解析顺序：FFMPEG_PATH 环境变量 -> which 探测 -> 常见路径表\n//           (/usr/bin /usr/local/bin /opt/homebrew/bin) -> ffmpeg-static 包兜底\n// 同构 resolveFFprobe()；模块级缓存 + 启动日志打印一次；\n// 自检接口 GET /api/settings/dependencies 返回逐项 { name, resolved, path, version, hint }"),
    ("h3", "D.5 dsh 插件工具定义（对齐 defineTool 的目标形态）"),
    ("code", "import { defineTool } from \"@deepseek-ai/dsh-tools\"\nexport const Config = Schema.object({\n  radarBase: Schema.string().default(\"http://localhost:3000\"),\n})\nexport const inject = [\"tools\"]          // 以真实宿主 --dump-config 验证为准\nexport function apply(ctx) {\n  ctx.tools.register(defineTool({\n    name: \"radar_article\",\n    parameters: {\n      ideaTitle: { type: \"string\", required: true, description: \"文章主题或选题标题\" },\n      ideaAngle: { type: \"string\" },\n      persona: { type: \"string\" },\n      theme: { type: \"string\" },\n    },\n    output: { schema: { type: \"string\" }, render: (_a, v) => [{ type: \"text\", text: v }] },\n    async execute(args) { /* 平台 API 调用与轮询，返回纯文本成稿与链接 */ },\n  }))\n}"),
    ("p", "以上草案在实施批次内允许字段微调，但接口形状（PATCH 子集更新、mcpServers 双形态判别、mcp 前缀命名、binaries 解析顺序、defineTool 参数化）与本报告第四章至第六章的方案绑定，调整需同步更新回归断言。"),
]
