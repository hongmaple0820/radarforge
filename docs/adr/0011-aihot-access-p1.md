# 0011 — AIHOT 接入 P1 产品化：MCP 默认种子 + 18 条 RSS 默认源 + ETag 条件请求 + 原文直链

> 状态：已接受（2026-11-11，aihot-access 批次，spec 见 `docs/aihot-access-plan.md` §5；D1~D4 用户批复「要的 / 全都要 / 可以的 / 可以的」）
> 溯源：`src/lib/agent/mcp-seeds.ts`；`src/lib/agent/mcp-client.ts`（seedDefaultServer）；`src/lib/sources/rss.ts`（DEFAULT_FEEDS / fetchAndParse / originalLinkFromDescription）；`prisma/schema.prisma`（SourceFeed.etag）；`src/app/api/sources/route.ts`；`docs/research-aihot-agent-access.md`（调研与 P0）

## 背景

AIHOT（aihot.news）四通道调研（研究文档 + 外部笔记 + P0 运行时实证 12/12）结论「能接入，且成本远低于预期」：MCP 与 RadarForge 统一客户端零代码兼容（协议 2025-06-18 回显、无状态设计咬合）；RSS 结构与宽容解析器逐字段对应；许可定性「组织内部使用永久免费」。P0 的服务器与源留在 gitignored 的 `db/custom.db`，沙箱回收即清——持久性靠默认种子。用户批复四决策点：D1 推进 P1；D2 RSS 源「全都要」（18 条全量，超出调研推荐的两条）；D3 两增强立项（ETag 条件请求、原文直链）；D4 `aihot_actor` 按推荐不带。

## 决策

- **MCP 种子走「空库首播」批次（DeepWiki + AIHOT 同批），不改补缺式**。循 DeepWiki 先例：用户删除默认服务器不复活；既有库不自动补种，UI 手动添加与 `import mcpServers JSON` 路径仍可用。种子表抽到独立零依赖模块 `mcp-seeds.ts`（b2 离线可直读，规避 mcp-client 的 `@/` 别名值导入不可达问题）。
- **RSS 种子 18 条全量入 `DEFAULT_FEEDS`（D2「全都要」）**：6 主源（精选/全文/全部动态/日报/周报/月报）+ 6 分类 + 6 全文分类，统一 `category:"AI聚合"`、`site:"aihot.news"`，插中文源后（createdAt 序使「精选摘要版」在跨 feed 判重时先入池）；`ensureDefaultFeeds` 按 url 幂等补种既有库。
- **ETag 条件请求（票 03）**：`SourceFeed.etag` 列 + `fetchAndParse` 第 4 参；304 → `notModified` 零正文返回，`FeedRefreshResult.notModified` 留痕，POST refresh summary 计数透出。etag 解析单一事实源在 `fetchAndParse`：304 → 响应回显或保留旧值；200 → 新值或清空；抓取失败保持库中旧值。304 不入 error（未变化≠失败）。
- **原文直链（票 04）分层**：解析层 `originalLinkFromDescription` 只「发现」（带「阅读原文」锚文本的 href，非 http(s) 拒收；`parseFeed` 填 `RawFeedItem.originalUrl`，url 不改写）；存储层按 `site==="aihot.news"` 门控回填（url←原文、摘要尾附「（AIHOT 条目页：…）」）。防误伤：成刊条目与普通源的内链不构成原文信号（方案 D8）。
- **跨站 guid 去重不落地，转留观**：红线探究证伪了预判——同 guid 条目跨 feed 同标题、`cleanSummary` 截断 300 字后全文版与摘要版同文本 → 同 SimHash，实测 full.xml 二刷 40/40 全被既有跨源去重拦截（`duplicates=40, inserted=0`）。无红线不写防御代码（Fowler speculative generality）；触发条件=实测出现同 guid 双条入池（如 full.xml 描述结构变化），届时立红线实装。

## 不变量

- **IN1 无 etag 源行为不变**：etag 为空不发条件头、解析路径零变化（b2 ⑧ 本地服务器三轮往返钉死：无 etag → 200 正常解析）。
- **IN2 非 AIHOT 源条目字节不变**：原文直链回填仅对 `site==="aihot.news"` 生效，且判据限定「阅读原文」锚文本（b2 ⑧ 普通形态样本不产出 originalUrl；原 24 源注册表行零改动）。
- **IN3 SimHash 口径部署前后一致**：跨源判重哈希用解析层原值（标题+摘要），不掺存储层回填后缀——部署边界两侧的同条目哈希可比，跨 feed 判重不受票 04 变换影响。

## 后果

- 全量刷新源数 24 → 42；未变化源靠 304 零正文（AIHOT 官方限流约 60 次/分钟/IP，18 源一轮远低于线）。POST refresh 新增可选 `feedIds`（与 PATCH url 变更重抓的定向能力对称，方案 D6），既有调用方零影响。
- 周期源（日报/周报/月报）的成刊条目受 14 天新鲜度过滤：首刷只入近 14 天内的期（实测日报 30 期入 14 条、月报 6 期入 1 条），超龄跳过计入 stale——既定产品语义非缺陷。
- `promoteItemToIdea` 的 angle 文本随摘要尾条目页链接轻微增长（溯源 + 条款「保留机器来源信息」双满足，方案风险 5 接受）。
- 既有库的既有条目不回溯重填原文直链（known 跳过）；删源重种 + 刷新是确定性重取路径（E2E E 相实证）。
- 零 SKILL.md / 产线提示词改动：在 wewrite-brief / topic-interviewer 提示词中告知 `mcp__AIHOT__*` 工具可用属后续独立增强票（须走 S3 同款纪律：token 基线 + 聚焦 E2E + eval 不回退）。
