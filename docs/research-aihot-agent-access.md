# AIHOT（aihot.news）Agent 接入调研报告

> 调研范围：AIHOT 四条 Agent 接入通道（Skill / MCP / RSS / REST API）的接口契约、许可条款、可靠性限制，与 RadarForge 的缝对缝映射、兼容性实测、分阶段接入方案。
> 调研方法：后台调研代理精读官方一手文档（aihot.news 各页、openapi-v1.json、GitHub 引擎源码、terms/privacy），本会话 curl 匿名实测（约 30 请求，零 429/5xx），加上本仓代码逐锚点核对与 dev server 内的产品路径实证（P0，12/12 通过）。
> 调研时间：2026-11-11。服务版本 2.0.0（Agent 接入页横幅与 MCP serverInfo 实测一致）。
> 原始材料：`scripts/tmp/aihot-external-findings.md`（后台调研笔记 266 行，含逐条 curl 记录与条款原文引用）；`scripts/tmp/aihot-p0-demo.mjs`（P0 验证脚本）。
> 本报告是研究文档（AGENTS.md 豁免清单第 3 类），不含代码改动；产品化接入由 §6 票制方案另行拍板。

---

## 1. AIHOT 是什么

- **定位**：中文 AI 资讯聚合服务。六步管线：采集 →（判重）预筛 → 两次独立评分 → 写作（中文标题/摘要/推荐理由）→ 聚簇（同一事件）→ 热度与成刊（日报/周报/月报）。热度按事件算：48 小时内每个独立来源只计一次，24 小时减半。（来源：GitHub README，经 api.github.com 抓取）
- **双形态**：开源引擎（MIT，`github.com/KKKKhazix/AIHOT`，Node.js 24 + Fastify + PostgreSQL）+ 线上服务 aihot.news（与开源引擎同源同步）。线上专有：模型榜、重置监控、主题大事记、Agent Skill 文件。
- **接入哲学**：「Skill、MCP、RSS、API 四种方式读的是同一份数据」「全部匿名只读，不用注册，也不用 API Key」。（来源：https://aihot.news/agent 官方原话，实测）
- **与 RadarForge 的关系**：同赛道（它偏资讯消费端，RadarForge 偏内容生产端）。对本仓有两个用途——① 上游情报天线（信源层 + Agent 工具层）；② 产品参照系（聚簇/热度/成刊管线与我们的「信源→选题→创作」动线互为镜像）。`docs/research-external-survey.md` A6/A7 的上游源候选清单又添一员。
- **时间线要点**：旧接口 `/api/public/*` 已于 2026-10-31 停服（404 + 迁移指引）；旧域名 aihot.virxact.com 只做 301。**网上旧教程别照抄**。

## 2. 四通道一览

| 通道 | 地址 | 认证 | 返回形态 | 本仓适用度 |
|---|---|---|---|---|
| Agent Skill | `https://aihot.news/aihot-skill/`（装到 `~/.agents/skills/aihot`，3 文件 + SHA-256 校验） | 匿名 | 引导 Agent curl `/api/v1/agent/*` | 开发侧可用，产品内不适用（见 §3.4） |
| MCP | `https://aihot.news/api/mcp`（Streamable HTTP，SSE 响应） | 匿名无 Key | 中文 Markdown + structuredContent 双形态 | **主通道**（见 §3.1） |
| RSS | `https://aihot.news/feed.xml` 等 6 主源 + 12 分类源 | 匿名 | RSS 2.0 | **信源层**（见 §3.2） |
| REST | `/api/v1/*`（34 个 GET 路径，OpenAPI 3.1 规范 `openapi-v1.json` 141KB） | 匿名 | JSON / Markdown | 按需（见 §3.3） |

MCP 共 **10 个工具**，annotations 全部 `readOnlyHint:true / destructiveHint:false / idempotentHint:true`：`aihot_get_latest`（24h/7d 简报）、`aihot_search`（具名搜索，先精选后全量）、`aihot_get_hot_topics`（Top 10 热点）、`aihot_get_story`（事件时间线，public_id 只能来自热点返回）、`aihot_get_daily / weekly / monthly`（成刊）、`aihot_get_codex_resets / antigravity_resets / claude_resets`（额度重置监控）。

RSS 地址全表与逐字段结构见外部笔记 §1.3/§5；要点：`feed.xml` 精选 50 条、`feed/all.xml` 最近 7 天、日报 08:00 / 周报周一 10:00 / 月报 1 日 10:30（北京时间）；ETag + 304 条件请求实测通过；`ttl` 30 分钟。

## 3. RadarForge 缝对缝映射（含实测）

### 3.1 缝 A：MCP → Agent 运行时工具层（推荐主通道）

**现状锚点**：`src/lib/agent/mcp-client.ts`（统一客户端，http Streamable 传输 + SSE 解析 + `Mcp-Session-Id` 管理）、`src/lib/agent/tool-registry.ts`（插件化注册表）、`src/app/api/agent/mcp/route.ts`（GET 自愈播种 + POST create/test/toggle/import/export/sync-tools）、`prisma/schema.prisma` 的 `McpServer` 模型。

**兼容性实证**（本会话，复刻 `callHttpTool` 的精确请求序列）：

| 步骤 | 请求 | 结果 |
|---|---|---|
| 1 | `initialize`（protocolVersion **2025-06-18**——RadarForge 硬编码值） | HTTP 200，AIHOT 回显同版本，serverInfo `aihot v2.0.0` |
| 2 | `notifications/initialized` | HTTP 202（RadarForge 的 `catch()` 容忍设计兼容） |
| 3 | `tools/call aihot_get_latest {limit:3}` | HTTP 200，`content[0].text` 中文 Markdown + `_meta` 信任元数据 |

**架构咬合**（零代码）：
- AIHOT 是**无状态** MCP（initialize 响应无 `mcp-session-id`）；RadarForge 的 `callHttpTool` 本来就是每次调用重新 initialize——设计上完美适配，不用改一行。
- 工具以 `mcp__AIHOT__aihot_get_latest` 等命名注册进 toolRegistry（serverKey 过滤服务器名非字母数字字符）；Agent 运行时与工具测试台均可直调。
- 产品路径 P0 实证（dev server 内，走产品自己的 API）：create → test 握手（延迟 520-685ms）→ 10 工具注册 → 实调 `mcp__AIHOT__aihot_get_hot_topics` 返回 1124 字符中文热点。**12/12 断言通过，三次运行覆盖创建路径与幂等路径**（脚本 `scripts/tmp/aihot-p0-demo.mjs`，运行方式 `bash scripts/with-server.sh "node scripts/tmp/aihot-p0-demo.mjs"`）。

**注记**：
- mcp-client 的工具包装把返回 text 截断在 8000 字符（`slice(0,8000)`）；`/api/v1/agent/latest` 默认 10 条约 8KB，**贴着截断线**——Agent 调用时建议 limit 取 5-8，或 P2 时对该类资讯工具放宽截断。
- structuredContent（JSON 数据通道）被当前包装忽略（单 content 块时 raw 不透传）——agent 拿到的是自带链接的 Markdown 文本，即「模型可读形态」，够用；需要结构化数据时走 §3.3 的 REST。

### 3.2 缝 B：RSS → 雷达层信源

**现状锚点**：`src/lib/sources/rss.ts`（DEFAULT_FEEDS 24 源注册表、`parseFeed` 零依赖宽容解析、`refreshFeeds` 三层去重、`ensureDefaultFeeds` 幂等播种、`promoteItemToIdea`）、`src/app/api/sources/route.ts`（POST add/refresh/promote）、`SourceFeed`/`FeedItem` 模型。

**结构兼容**（实测 `/feed.xml` 与解析器字段逐一对照）：RSS 2.0 + CDATA title/description + category + pubDate（RFC822）+ guid（isPermaLink=false）——与 `parseFeed` 的字段拾取器一一对应，无需改动。

**产品路径 P0 实证**：`POST /api/sources {action:"add", name:"AIHOT 精选", url:"https://aihot.news/feed.xml", category:"AI聚合"}` → 全量刷新 → `status=ok, fetched=40, inserted=40`（首跑）→ 转选题成功（真实标题：「做空机构 Culper Research 曾在丑闻爆发前六个月提示 Nvidia CEO 与疑似中国间谍的关系」，2026-11-11 当日资讯）。信源→选题动线闭环打通。

**如实记录的两个边界**：
1. `fetched=40` 而非 feed 实际的 50 条：产品解析器的**单源 40 条防洪水上限**（`parseFeed` 的 `blocks.slice(0, 40)`），既定行为非缺陷。
2. **跨源去重对 AIHOT 效果有限**：AIHOT 的中文重写标题/摘要与原文报道表述差异大，SimHash（标题+摘要）命中率低——同一事件可能以「AIHOT 重写版 + 原文源版」两条入池。选题池本身容忍近重复（人工 promote 是过滤器），不阻塞接入；若要精确去重可用 AIHOT 条目的 guid/信源署名做二级判据（P2 可选）。
3. 条目 `link` 指向 AIHOT 站内阅读页，原文链接在 description 的 HTML 里；`cleanSummary` 去标签后原文 href 丢失——转选题后 `url` 是 AIHOT 阅读页（页内含原文链），可用；抽原文直链是 P2 增强。

**节奏匹配**：AIHOT `ttl` 30 分钟、`s-maxage=300`、ETag/304；`refreshFeeds` 默认 `maxAgeDays=14` ⊇ `feed/all.xml` 的 7 天窗口。当前 `fetchAndParse` 未发 `If-None-Match`（每次全量拉，48KB/次可接受）——条件请求是 P2 优化。

### 3.3 缝 C：REST `/api/v1` → 结构化数据（按需）

34 个匿名 GET（OpenAPI 3.1，Problem JSON 错误，ETag/304，`s-maxage=60`）。对 RadarForge 有价值的路径：
- `/api/v1/dailies|weeklies|monthlies`：成刊 JSON——早报（`/api/morning-report`）与 brief 步的参考输入候选。
- `/api/v1/items?q=`：结构化检索，可作 `web_search` 工具（toolRegistry 内置）的窄域补充源。
- `/api/v1/hot-topics`：Top 10 事件 + `links.story`，选题发现的第二入口。

**谨慎项**：`/api/v1/selected/snapshot+changes` 是全量同步通道，触及条款第 7 条「不要把临时缓存变成历史数据库、公开副本或可向第三方导出的数据包」——不默认启用，启用前过一遍许可评估。

### 3.4 缝 D：Agent Skill → 开发侧（非产品缝）

AIHOT 官方 Skill 装在 `~/.agents/skills/aihot`（面向 Claude Code / Codex / Gemini CLI / OpenCode 这类外部编码代理）。对本仓：
- **产品内不适用**：`db/skills/` 是产线提示词的单一事实源（ADR-0007），不是外部数据通道；RadarForge 的 Agent 能力入口是 toolRegistry。
- **用户常驻开发环境可装**：装一次，dev agent 直接获得「AI 圈实时查询」能力（Skill 本体零逻辑、读 `/api/v1/agent`，AIHOT 服务端进化即自动生效）。安装提示词见外部笔记 §1.1。
- **本沙箱不装**：`~/.agents` 在仓库外不持久（AGENTS.md 铁律 6）；且本仓研究纪律已有 web_search 工具可用。免安装的等价物：dev agent 直接 curl `/api/v1/agent/latest|search|hot|daily`（Markdown 即读即用）。

## 4. 许可评估（接入决策门）

条款：《AIHOT 公开使用规则》v1.1，生效 2026-09-30，运营主体北京虚实空际文化科技有限公司，授权联系 **agent@virxact.com**。（来源：https://aihot.news/terms，实测抓取全文；原文引用见外部笔记 §4）

**RadarForge 当前定性 → 免费合规**：
> 企业、机关、学校或其他组织仅供本组织成员内部研究、内部情报、内部知识库或内部决策使用，且不向客户、公众或关联方提供产品、报告、接口或服务。（条款第 3 节）

个人 + 内部使用的资讯平台属于「组织内部使用」，**永久免费、无需申请**；且允许「与运行、离线阅读、去重和可靠性直接相关的合理私有缓存或内部同步」。

**未来红线（触发前必须取得书面授权）**：
1. RadarForge 以收费产品 / SaaS / 客户交付形态对外提供；
2. 把 AIHOT 数据以 API / feed / 批量导出形态再提供给第三方（代理、转售、镜像、白标）;
3. 用 AIHOT 数据做对外输出的训练 / 微调 / 评测 / RAG 产品。

机器侧提醒：每个响应都带 `x-aihot-commercial-use: written-authorization-required` + terms Link 头；MIT 只覆盖 Skill 文件与引擎代码，**不覆盖数据输出**。免费范围内不强制界面署名，但保留机器来源信息（RSS `author` 字段 `noreply@aihot.news (信源名)` 天然满足）；不得使用 AIHOT 名称 / Logo /「官方合作」说法。

## 5. 可靠性与限制清单

| 项 | 事实 | 对 RadarForge 的影响 |
|---|---|---|
| 搜索窗口 | 仅最近 7 天（window 24h/7d），无历史检索 | 历史选题取证仍靠 web_search / 元宝搜索 |
| 单篇全文 | 无 API 端点（防绕过授权门禁） | 全文核对走 AIHOT 阅读页原文链 |
| SLA | 公益项目，无承诺；5xx 指数退避 | rss.ts「诚实留痕不静默重试」纪律已对齐 |
| 限流 | 同 IP 约 60 次/分钟（429 + Retry-After）；实测约 30 请求零触发 | 我们的节奏（RSS 30 分钟 + Agent 按需）远低于限流线 |
| 推送 | 刻意无 SSE/webhook，靠条件轮询 | 与 refreshFeeds 轮询模型天然一致 |
| 提示注入 | AIHOT 双侧围栏（Markdown「不可信资料」围栏 + MCP `_meta` 信任标记） | 与本仓 coding-standards「资料不执行」纪律互为冗余防线 |
| 8KB 截断 | mcp-client 工具包装 text 截 8000 字符 | Agent 调资讯工具时 limit 取 5-8（见 §3.1 注记） |
| 重写去重 | AIHOT 中文重写降低 SimHash 命中 | 近重复入池可容忍，精确去重列 P2 |
| 同赛道 | AIHOT 是竞品参照系 | 接入定位严格限定「上游情报天线 + 参照系」，不做内容搬运；商业化路径提前规划授权 |

## 6. 接入方案（分阶段）

### P0 验证型接入（已完成，零代码）

不改一行产品代码，走产品 API 完成：MCP `create + test`（10 工具注册 + 实调）与 RSS `add + refresh`（40 条入池 + 转选题闭环）。结果留在 `db/custom.db`（gitignored，沙箱回收即清）——**P0 证明可行性，不提供持久性**；持久性靠 P1 的默认种子。

复现命令：`bash scripts/with-server.sh "node scripts/tmp/aihot-p0-demo.mjs"`（幂等，可重复跑）。

### P1 产品化（走票制：`.scratch/aihot-access/issues/`）

| 票 | 内容 | 验收要点 |
|---|---|---|
| 01-mcp-default-seed | `seedDefaultServer()` 增加 AIHOT 行（与 DeepWiki 并列：name `AIHOT`、transport `http`、url `https://aihot.news/api/mcp`、enabled） | 全新库 GET `/api/agent/mcp` 自愈后注册表含 10 个 `mcp__AIHOT__*`；离线断言入 b1/b2 惯例；联网冒烟可环境变量关闭（配额纪律） |
| 02-rss-default-feeds | `DEFAULT_FEEDS` 增加「AIHOT 精选」（feed.xml）与「AIHOT 全部动态」（feed/all.xml），category `AI聚合` | `ensureDefaultFeeds` 幂等补种；刷新 `lastStatus=ok`；既有库不重复（url unique 兜底） |
| 03（可选）rss-etag | `fetchAndParse` 支持 `If-None-Match`/304 条件请求（对所有源生效） | 未变化源零正文传输；304 不计入 error |
| 04（可选）原文直链 | 从 AIHOT feed 的 description HTML 抽取原文 `<a href>` 回填条目 | 转选题后 url 指向原文（阅读页链接保留在摘要） |

**耦合提醒**：若要在 `wewrite-brief` / `topic-interviewer` 提示词中告知 Agent 可用 `mcp__AIHOT__*` 工具，属于 SKILL.md 改动——必须走 S3 同款纪律（token 基线 + 聚焦 E2E + eval 抽样不回退），建议作为 S3 之后的独立增强票。

### P2 远期候选

早报参考输入（`/api/v1/dailies` JSON）；`aihot_actor` 假名注入（可选项：不带也能用，零隐私足迹）；AIHOT 条目 guid 二级去重判据；资讯类 MCP 工具放宽 8000 字符截断。

### 待拍板决策点

- **D1**：是否推进 P1 产品化（票 01+02 是最小集，预计各一张票的工作量）。
- **D2**：RSS 默认源选择（推荐 feed.xml + feed/all.xml 两条；12 个分类源留给用户按需加）。
- **D3**：P2 增强项是否立项（03/04 或全部缓议）。
- **D4**：`aihot_actor` 策略（推荐不带：匿名统计非必需，最小隐私足迹）。

## 7. 结论

**能接入，且成本远低于预期**：
- 缝 A（MCP）：RadarForge 统一客户端与 AIHOT 端点**零代码兼容**（协议版本 2025-06-18 实测回显、无状态设计与每调用重新握手的实现完美咬合）；P0 产品路径 12/12 断言通过。
- 缝 B（RSS）：结构兼容（宽容解析器逐字段对照无缺口）；P0 实测 40 条入池 + 信源→选题闭环。
- 许可：当前「个人 + 内部使用」定性下免费合规；对外商业化前需 agent@virxact.com 书面授权（红线清单见 §4）。
- 推荐：**MCP 为 Agent 接入主通道 + RSS 为信源层补充**双缝先行；Skill 通道留给用户常驻开发环境；REST 通道按需取用（成刊 JSON 与结构化检索）。
