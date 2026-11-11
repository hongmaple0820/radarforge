# Standards 轴评审 — aihot-access 批次（2026-11-11）

> 基线：`docs/agents/coding-standards.md` 14 条 + Fowler 12 smell。评审对象：本批全部改动（mcp-seeds / mcp-client / rss.ts / sources 路由 / prisma schema / b2 ⑧ / test-rss-proxy / p1 demo）。

## 编码标准 14 条逐项

1. **TS strict / tsc 零错**：过（每票实现后即时跑，收口再跑一次）。
2. **标识英文、文档注释中文**：过（`DEFAULT_MCP_SERVERS`/`FeedFetchOutcome`/`notModified`/`originalUrl` 均英文；注释全中文带方案/ADR 指针）。
3. **em-dash 豁免**：过（中文破折号用于文档，代码无）。
4. **测试分层**：过——离线契约先行（b2 ⑧ 从 101 → 127，含本地 HTTP 服务器 304 往返零外网）→ 聚焦 E2E（p1 demo 22/22）→ RSS 层既有回归（test-rss-proxy 19/0、test-rss 37/0）→ 全量回归（主线过，视频段外部 429 见下）。
5. **先红后绿 + 假设留痕**：过——票 01/03/04 各有真红（MODULE_NOT_FOUND / 304 断言红+TypeError / E2E E 相 0/30 原文直链红）；票 02 的预判红线「先刷 feed.xml 再刷 full.xml inserted>0」**被证伪**（SimHash 40/40 拦截，机制：同标题+摘要 300 字截断同文本）→ 跨站 guid 去重缓议并留痕（方案 §5 D7、票 02 Comments、ADR-0011 决策第 5 条）。
6. **产线提示词零改动**：过——本批不触 `db/skills/`（ADR-0007 纪律不适用，无聚焦 E2E + eval 义务）。
7. **诚实降级**：过——304 未变化≠失败、成刊轮换如实留痕、抓取失败保持旧 etag、429 不轰炸（全量回归视频段外部限流如实记录，不静默重试）。
8. **职责分离**：过——解析层只发现（`originalLinkFromDescription`/`originalUrl`）不改写；存储层按 `site==="aihot.news"` 门控回填；etag 解析单一事实源在 `fetchAndParse`。
9. **沙箱适配**：过——无新常驻进程；b2 本地 304 服务器即起即关（finally close）。
10. **密钥零落盘**：过——本批全程匿名只读零密钥接触（AIHOT 四通道本就无 Key）。
11/12. 无新密钥/凭证入仓：过。
13. **方案按模板**：过（`docs/aihot-access-plan.md` 模板全节；无 emoji 与未验证符号）。
14. **提交信息一段式**：过（待提交，改动清单+验证证据+已知约束）。

## Fowler 12 smell 自查

- **long parameter list（留痕不改）**：`fetchAndParse(url, timeoutMs, proxyUrl, etag)` 四位置参——沿既有签名追加第 4 参，改 options 对象属接口重构（波及全部调用方），本批不做；若未来再加参数应转对象签名。
- **duplicated code（留痕不改）**：直连与代理两条路径各自构建请求头（If-None-Match 条件分散两处）——两路径本就分叉（代理走手写 proxyGet），合并需抽公共 headers 构造器，收益低于复杂度；注释已互指。
- **speculative generality（主动规避，本批亮点）**：跨站 guid 去重因红线被证伪而不落地（无红线不写防御代码），留观触发条件成文。
- **mystery name**：`notModified`（304 语义）/ `originalUrl`（原文直链）/ `DEFAULT_MCP_SERVERS`（默认种子表）命名直白；`FeedFetchOutcome` 扁平形态避免 union 收窄扩散。
- 其余 smell（long function / data clumps 等）：`processFeed` 保持既有结构只加必要行；未引入新全局可变态（`proxyLogged`/`globalProxyCache` 为既有）。

## 结论

零阻塞。两条留痕（参数列表/头构建重复）有明确不修理由，跨站 guid 缓议是红线证据驱动的主动决策。
