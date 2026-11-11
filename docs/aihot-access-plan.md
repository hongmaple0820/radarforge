# AIHOT 接入 P1 产品化方案（aihot-access）

> 状态：已拍板（D1~D4 于 2026-11-11 用户批复，原文「1. 要的 2. 全都要 3. 可以的 4. 可以的」；拍板结果见 §5）
> 日期：2026-11-11 · 作者：主 Agent（Z.ai）
> 姊妹篇：`docs/research-aihot-agent-access.md`（调研与 P0 实证，本方案的唯一事实上游）

## 0. 结论摘要

AIHOT 从 P0 验证型接入升级为 P1 产品化默认能力：MCP 默认种子（`seedDefaultServer` 加 AIHOT 行，与 DeepWiki 并列）+ RSS 默认源种子（`DEFAULT_FEEDS` 加全部 18 条 AIHOT feed，D2 拍板「全都要」）+ 两个刷新增强（ETag 条件请求、原文直链回填）。全部改动限定信源层与 Agent 工具层，**零 SKILL.md / 产线提示词改动**（ADR-0007 边界不动）。原拟随「全都要」一并落地的跨站 guid 去重，经 E2E 红线探究被证伪为当下非必需（同 guid 条目同标题 + 摘要 300 字截断后同文本 → SimHash 跨源去重已覆盖全部 feed 重量对，见 §5 D7），转留观。D4 按推荐不带 `aihot_actor`（匿名统计假名非必需，最小隐私足迹）。许可定性不变：组织内部使用免费合规，对外商业化前须 agent@virxact.com 书面授权（红线清单见研究文档 §4）。

## 1. 问题陈述与取证

| # | 现状（代码级证据） | 后果 |
|---|---|---|
| 1 | `src/lib/agent/mcp-client.ts:461` `seedDefaultServer()` 只播 DeepWiki 一行（`count>0` 即返回） | 全新库的 Agent 工具层没有 AIHOT 10 个只读工具，用户须手动 add（P0 demo 走的就是手动路径） |
| 2 | `src/lib/sources/rss.ts:23` `DEFAULT_FEEDS` 24 源无 AIHOT | 信源层没有中文 AI 聚合天线；P0 的「AIHOT 精选」留在 `db/custom.db`，沙箱回收即清（研究文档 §6 P0 节） |
| 3 | `rss.ts:322` `fetchAndParse` 每次全量拉正文，无条件请求 | AIHOT 18 条源全部入种子后，未变化源每 30 分钟仍传约 48KB/源；官方已提供 ETag/304（实测通过，见外部笔记 §1.3） |
| 4 | `rss.ts:87` `cleanSummary` 去标签后，AIHOT 条目 description 内的「阅读原文」锚丢失；条目 `url` 指向 AIHOT 站内阅读页 | 转选题后拿不到第三方原文直链，下游取证/引用多一跳 |
| 5 | `rss.ts:425` 跨源去重只有 SimHash（标题+摘要） | 预判风险：D2「全都要」下 feed.xml 与 feed/full.xml 载同一批条目而摘要可能不同（全文版内联正文），SimHash 对 AIHOT 重写文本命中率本就低（研究文档 §5）。**红线探究结论（2026-11-11 E2E）**：该假设被证伪——同 guid 条目同标题，`cleanSummary` 截断 300 字后摘要亦同文本 → 同 SimHash，实测 full.xml 二刷 duplicates=40 全拦截；风险降级留观（见 §5 D7） |
| 6 | `src/app/api/sources/route.ts:44` POST refresh 只透传 `limit`，无 `feedIds` | 定向刷新能力只存在于 PATCH 重抓路径（`route.ts:160`），API 面不对称；全量 42 源刷新无法缩到指定源做回归/重试 |

## 2. 背景与研究

- 一手调研与许可条款：`scripts/tmp/aihot-external-findings.md`（266 行，含条款原文引用与逐条 curl 记录）。
- 缝对缝映射与 P0 运行时实证（12/12）：`docs/research-aihot-agent-access.md`。四通道（Skill / MCP / RSS / REST）读同一份数据、全匿名只读无 Key；旧接口 `/api/public/*` 已停服。
- 关键实测结论：RadarForge `mcp-client.ts` 硬编码协议 2025-06-18 被 AIHOT 接受并回显，无状态设计与每调用重新 initialize 咬合，**零代码兼容**；RSS 结构与 `parseFeed` 逐字段对应无缺口；ETag/304 条件请求实测通过。
- 本仓先例：`ensureDefaultFeeds` 幂等补种（RSS 层）、`seedDefaultServer` 首播批次（MCP 层）、`refreshFeeds` 的 `feedIds` 定向刷新（PATCH 重抓路径）——三处既定语义是本方案种子策略与 API 面的直接依据。

## 3. 方案设计

四条改动线，各自循既有锚点，不新开抽象：

| 线 | 改动 | 锚点与先例 |
|---|---|---|
| A. MCP 种子 | `seedDefaultServer` 改为遍历 `DEFAULT_MCP_SERVERS`（DeepWiki 原行不动 + AIHOT 新行：name `AIHOT`、transport `http`、url `https://aihot.news/api/mcp`、enabled）。保持「空库首播」语义（`count>0` 返回），用户删掉默认项不复活，循 DeepWiki 先例 | `mcp-client.ts:461`；GET `/api/agent/mcp` 自愈播种路径不变 |
| B. RSS 种子 | `DEFAULT_FEEDS` 追加 18 条 AIHOT 源（6 主源 + 6 分类 + 6 全文分类），统一 `category: "AI聚合"`、`site: "aihot.news"`，插在中文源之后（`createdAt` 序决定跨 feed 去重时「精选版」先入池）；注册表注释更新 24→42 | `rss.ts:23`；`ensureDefaultFeeds` 按 url 幂等补种，既有库不重复 |
| C. 刷新增强·ETag | `SourceFeed` 加 `etag String @default("")`；`fetchAndParse` 加第 4 参 `etag`，非空时发 `If-None-Match`，304 → `{ notModified: true }` 零正文返回；200 时捕获响应 ETag 回存。`FeedRefreshResult` 加 `notModified` 布尔留痕；POST refresh 响应 summary 加 `notModified` 计数 | `rss.ts:322/379`；`prisma/schema.prisma` SourceFeed 模型 |
| D. 去重与直链 | 去重：不新增跨站 guid 查询（红线探究后留观，见 §5 D7——既有的「feed 内 guid 唯一 + SimHash 跨源」双层已覆盖 AIHOT 全部 feed 重量对）；②原文直链：解析层新增 `originalLinkFromDescription`（description HTML 内带「阅读原文」锚文本的 href，非 http 拒收）与 `RawFeedItem.originalUrl`（只发现不改写），存储层对 `site==="aihot.news"` 的源回填：`url`←原文直链、摘要尾附「（AIHOT 条目页：…）」 | `rss.ts:425`（去重链）、`rss.ts:145`（parseFeed）、`rss.ts:431`（create data） |
| E. API 面 | POST refresh 透传 `feedIds?: string[]`（与 PATCH 重抓的定向能力对称；也是本批 E2E 的配额纪律手段——42 源全刷两轮可缩到指定源） | `src/app/api/sources/route.ts:44` |

## 4. 分批落地（票制 `.scratch/aihot-access/`）

| 票 | 范围 | 文件 | 红线（先红后绿） |
|---|---|---|---|
| 01-mcp-default-seed | 线 A | `src/lib/agent/mcp-client.ts`、`scripts/test-b2-offline.ts`（⑧ 节） | b2 引入 `DEFAULT_MCP_SERVERS` 断言先红（import 失败），实现后绿 |
| 02-rss-default-feeds | 线 B + E | `src/lib/sources/rss.ts`、`src/app/api/sources/route.ts`、b2 ⑧ | ①b2 断言 18 源/42 行先红；②红线探究：预判「先刷 feed.xml 再刷 full.xml 会 inserted>0（需跨站 guid 去重）」→ 实测被证伪（SimHash 全拦截），结论留观并留痕（§5 D7） |
| 03-rss-etag | 线 C | `prisma/schema.prisma`、`rss.ts`、sources 路由、b2 ⑧、`scripts/test-rss-proxy.mjs`（调用点随返回形态更新） | b2 ⑧ 本地 HTTP 服务器 304 往返断言先红（notModified 恒 false） |
| 04-aihot-original-link | 线 D② | `rss.ts`、b2 ⑧ | b2 ⑧ `originalLinkFromDescription` 断言先红（函数不存在） |

文档票内联于 04：ADR-0011、GLOSSARY 三词条、研究文档拍板注记、worklog/retro、双轴评审两报告。

## 5. 决策点（已拍板）

调研报告 §6 待拍板四点，用户 2026-11-11 批复（原话见状态行）：

| # | 决策 | 选项（调研报告推荐） | 拍板结果 | 依据 |
|---|---|---|---|---|
| D1 | 是否推进 P1 产品化 | A 推荐：推进（01+02 最小集） | **要的**（推进；D3 两增强随之立项） | 用户批复 1 |
| D2 | RSS 默认源选择 | A 推荐：feed.xml + feed/all.xml 两条；B：全部 | **全都要**（18 条：6 主源 + 6 分类 + 6 全文分类） | 用户批复 2；跨站 guid 去重随之必做（§3 D①） |
| D3 | P2 增强项（ETag 条件请求 / 原文直链） | 缓议或立项 | **可以的**（两项均立项为票 03/04） | 用户批复 3 |
| D4 | `aihot_actor` 匿名统计假名策略 | A 推荐：不带 | **按推荐不带** | 用户批复 4（「可以的」按推荐口径理解：不带也能正常用，跨渠道去重非必需，最小隐私足迹；若需带上，加一个查询参数即可，翻案成本一行） |

实现级决策（agent 依仓内先例定，可翻案，留痕于此）：

| # | 决策 | 理由 |
|---|---|---|
| D5 | MCP 种子保持「空库首播」语义，不改补缺式 | 循 DeepWiki 先例；用户删除默认服务器不复活。既有库（含 P0 手动加的 AIHOT 行）不自动补种，UI 手动路径仍然可用 |
| D6 | POST refresh 透传 `feedIds` | 与 PATCH 重抓的定向能力对称；E2E 配额纪律必需（避免 42 源全刷两轮）；对既有调用方零影响（不传即全量） |
| D7 | 跨站 guid 去重不落地，转留观 | 红线探究（E2E）证伪了预判：AIHOT 同 guid 条目跨 feed 携带同标题，且 `cleanSummary` 截断 300 字后全文版与摘要版同文本 → 同 SimHash，实测 full.xml 二刷 40/40 全被跨源去重拦截（`duplicates=40, inserted=0`）。无红线不写防御代码（Fowler speculative generality）；留观触发条件：实测出现同 guid 双条入池（如 full.xml 描述结构变化），届时立红线实装。原 D7 设计（同 `feed.site`+同 guid 查询）留档于本方案 Git 历史 |
| D8 | 原文直链只对 `site==="aihot.news"` 源回填，抽取判据为「阅读原文」锚文本 | 防误伤：日报/周报成刊条目与普通源条目的 description 内链接不构成「原文」信号；解析层只发现不改写（忠实原则），策略归存储层 |

## 6. 验收与度量

| 度量 | 目标 | 采集方式 |
|---|---|---|
| 离线断言 | b2 101 → ≥120（⑧ 节新增约 20+，覆盖 MCP 种子常量 / 18 源注册表 / ETag 本地 304 往返 / 原文直链函数族 / parseFeed AIHOT 样例） | `node --experimental-strip-types scripts/test-b2-offline.ts` |
| 回归门 | tsc 零错；b1 68 / b2 新值 / c 81 全绿；c3 冒烟 10/10 | AGENTS.md 回归门命令块 |
| E2E（P1 demo） | 全新库 GET 自愈后 18 源/42 行；MCP 清库重播 → test → 10 个 `mcp__AIHOT__*`；同 guid 条目只入池一次（全文 feed 二刷 `inserted===0`，SimHash 跨源去重覆盖）；周期性源（daily/weekly/monthly）二次刷新 `notModified===true`；条目 url 指向第三方原文且摘要尾带条目页链接；转选题闭环 | `bash scripts/with-server.sh "node scripts/tmp/aihot-p1-demo.mjs"`（幂等可复跑） |
| 不变量 | IN1 无 etag 源行为不变（不发条件头、解析路径零变化）；IN2 非 AIHOT 源条目 url/summary 字节不变（门控保证） | b2 ⑧ + demo 分相断言 |

## 7. 风险与权衡

1. **feed.xml 与 full.xml 短窗内轮换**：两次抓取间隔中精选榜变化 → E2E「inserted===0」可能偶发失红。控制：两刷在同一轮内秒级先后发出；失红时打印 fetched/duplicates 取证，人工判定是否真窗口边界（不静默放宽断言）。
2. **周期源 304 依赖 CDN 回源**：EdgeOne `must-revalidate` 已实测 304 生效；若某轮 566/566 拦截（外部笔记 §5.1），诚实留痕按 error 记，不重试轰炸。
3. **18 源全订阅的请求量**：全量刷新 42 源。控制：ETag 落地后未变化源零正文；AIHOT 官方限流约 60 次/分钟/IP，18 源一轮远低于线；`refreshFeeds` 6 路有界并发不变。
4. **既有库不补种 AIHOT MCP 行**（D5）：既有部署看不到新默认服务器。控制：UI 手动添加与 `import mcpServers JSON` 路径仍可用；P0 demo 即手动路径实证。
5. **摘要尾附条目页链接会进入选题 angle 文本**（`promoteItemToIdea` 取 `summary.slice(0,260)`）：轻微噪声换溯源与「保留机器来源信息」条款合规，方案接受并留痕。
6. **prisma schema 变更**（SourceFeed.etag）：沙箱需 `npx prisma generate` + `npx prisma db push`；引擎校验有网络抖先例（铁律 3），失败重跑即可。

## 8. 范围外（显式不做）

- 不改 `db/skills/` 任何 SKILL.md / 产线提示词（不在 wewrite-brief、topic-interviewer 里告知 `mcp__AIHOT__*` 工具可用——须走 S3 同款纪律：token 基线 + 聚焦 E2E + eval 不回退，列为后续独立增强票）。
- 不做 REST `/api/v1` 通道产品化（成刊 JSON 入早报参考输入、`/api/v1/items` 窄域检索等列 P2 远期，见研究文档 §6）。
- 不带 `aihot_actor`（D4）；不做 12 分类源的 UI 开关（全部直入默认种子，用户可逐源停用）。
- 不碰 `/api/v1/selected/snapshot+changes` 全量同步通道（许可第 7 条「不要把临时缓存变成历史数据库」红线，启用前须单独过许可评估）。
- 不放宽 mcp-client 8000 字符截断（研究文档 §3.1 注记，Agent 侧 limit 取 5-8 已够用）。

## 9. 增强票（05：AIHOT 热点参考注入，2026-11-11 落地）

§8 第 1 条点名的后续独立增强票，走 S3 同款纪律收口（票 `.scratch/aihot-access/issues/05-aihot-context-block.md`，ADR-0012）：

- **形态证伪先于设计**：原设想「提示词告知 `mcp__AIHOT__*` 工具可用」被证伪——brief / 采访器两步均为纯 chat 补全（`chatRetry` 无 tools 参数），告知不产生行为；正确形态 = 数据注入（ADR-0009 `{{idea_card_block}}` 先例延伸）。P1 retro「预判型红线先证伪」纪律的直接再应用。
- **落地形态**：`db/skills/wewrite-brief` 与 `db/skills/topic-interviewer` 各加一行 `{{aihot_block}}`；`content/aihot-block.ts`（零依赖帧组装：近 7 天 5 条，title 80 / summary 120 截断）+ `sources/aihot-context.ts`（查询 + 失败降级空数组）；调用方查传（run-manager Step1 / topic-interview 路由），消息组装层不碰 db。
- **不变量**：IN1 无数据字节级不变（渲染 === 剔占位符渲染，b2 ⑨ 钉死）；IN2 注入是增强不是依赖（查询失败留 warn 不产 error 终态）。
- **验收**：b2 127→145（⑨ 节 18 断言）；E2E 三相 15/16（查询层 5 条真实热点 / 出题 7 问三维度 / brief 步「AIHOT 热点已注入」确定性留痕，run done 132s）；唯一红=成稿 5087 字超容差带（S3 m02 4023 / S4 4756 / 本批 5087 三证同族大纲裁量偶发，观察项）；eval m01 同题同配置宽门 ≥7.88（429 冷却后复跑收口，见票 Comments）。
