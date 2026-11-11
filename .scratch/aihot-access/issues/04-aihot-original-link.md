# 04-aihot-original-link：AIHOT 条目原文直链回填（url 指原文，条目页留摘要）

Status: resolved（四票全勾，2026-11-11）
Blocked by: 03

## 目标

AIHOT 源条目 `url` 指向第三方原文（description 内「阅读原文」锚抽取），AIHOT 站内阅读页链接保留在摘要尾；非 AIHOT 源条目 url/summary 字节不变（IN2）。本票含批次文档四件（ADR-0011 / GLOSSARY 三词条 / 研究文档拍板注记 / worklog+retro）与双轴评审两报告。

## 改动

- `src/lib/sources/rss.ts`：新增导出纯函数 `originalLinkFromDescription(html)`（带「阅读原文」锚文本的 href，非 http(s) 拒收，无则 null）；`RawFeedItem` 加 `originalUrl`（parseFeed 只发现不改写）；processFeed 对 `site==="aihot.news"` 源回填（url←originalUrl，摘要尾附「（AIHOT 条目页：…）」，方案 D8）。

## 验收

- [x] b2 ⑧ 节先红：`originalLinkFromDescription` 断言失败（模块无此导出：SyntaxError）
- [x] 函数族：带标签锚取 href；无标签锚（via AIHOT 站内链）→ null；多锚取带标签者；非 http 协议拒收；无锚 → null；带属性锚仍取 href
- [x] parseFeed AIHOT 样例（CDATA description + 阅读原文锚 + guid + pubDate）：`originalUrl` 抽出、`url` 仍为站内阅读页（解析层不改写）、摘要已去标签、pubDate 不回退
- [x] E2E（随 p1 demo）：删源重种确定性路径 → 重抓 30/30 条 url 域名 ≠ aihot.news 且摘要含「AIHOT 条目页」；转选题闭环不回退（先红：0/30 原文直链）
- [x] IN2：b2 断言 parseFeed 对非 AIHOT 形态输入不产出 originalUrl（无标签锚）+ 原 24 源注册表行零改动
- [x] 文档四件齐：ADR-0011、GLOSSARY 47→50（+AIHOT 接入/ETag 条件请求/原文直链）、研究文档 §6 拍板注记、worklog 本条
- [x] 双轴评审两报告落 `.scratch/aihot-access/review/`
- [x] 回归门：tsc 零错 + 离线三套全绿（b2 116→127）

## Comments
