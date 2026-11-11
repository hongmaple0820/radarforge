# 02-rss-default-feeds：DEFAULT_FEEDS 加 18 条 AIHOT 源 + 定向刷新透传

Status: resolved（四票全勾，2026-11-11）
Blocked by: （无；与 01 并行，本票先进，03/04 同文件改排其后）

## 目标

默认源注册表从 24 → 42（D2 拍板「全都要」：6 主源 + 6 分类 + 6 全文分类）；POST refresh 支持定向 `feedIds`；同 guid 条目跨 feed 只入池一次（由既有去重层保证，见 Comments 红线探究）。

## 改动

- `src/lib/sources/rss.ts`：`DEFAULT_FEEDS` 追加 18 条（统一 `category: "AI聚合"`、`site: "aihot.news"`，插中文源之后——createdAt 序决定跨 feed 去重时「精选摘要版」先入池）；注册表头注释 24→42。
- `src/app/api/sources/route.ts`：POST refresh body 透传 `feedIds?: string[]`（数组校验，不传即全量，方案 D6）。

## 验收

- [ ] b2 ⑧ 节先红：18 源 / 42 行断言失败（红：n=24）
- [x] `DEFAULT_FEEDS.length === 42`，AIHOT 行 18 条且 url 集与预期 18 地址精确相等（6 主源 + 6 分类 + 6 全文分类）
- [x] 全表 url 唯一；AIHOT 行 `category` 全为「AI聚合」、`site` 全为 aihot.news；原 24 源零改动
- [x] E2E：POST refresh 带 `feedIds` 只刷指定源（results 数=1）；不带 feedIds 行为不变
- [x] E2E：先刷「AIHOT 精选」再刷「AIHOT 精选全文」，同 guid 条目只入池一次（`inserted===0` 且 `duplicates+known===fetched`）
- [x] 既有库幂等：`ensureDefaultFeeds` 按 url 补种不重复（demo 复跑 seededNow=0 验证）
- [x] 回归门：tsc 零错 + 离线三套全绿（b2 101→109）

## Comments

- 2026-11-11 红线探究留痕：原计划本票含「跨站 guid 去重」（同 `feed.site`+同 guid 查询），红线设计为「先刷 feed.xml 再刷 full.xml 时 `inserted>0`」。实测该红线**不红**：full.xml 二刷 `duplicates=40, inserted=0`——同 guid 条目同标题 + `cleanSummary` 截断 300 字后全文版与摘要版同文本 → 同 SimHash，既有跨源去重已覆盖。按「无红线不写防御代码」纪律（Fowler speculative generality），跨站 guid 去重转留观（触发条件：实测出现同 guid 双条入池），见方案 §5 D7 与 ADR-0011。
