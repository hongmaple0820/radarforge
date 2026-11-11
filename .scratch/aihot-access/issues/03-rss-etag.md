# 03-rss-etag：fetchAndParse 支持 If-None-Match 条件请求（304 零正文）

Status: resolved（四票全勾，2026-11-11）
Blocked by: 02

## 目标

带 ETag 的源（如 AIHOT 全部 18 条）未变化时刷新返回 304 零正文传输，`notModified` 留痕；无 etag 的源行为字节级不变（IN1）。

## 改动

- `prisma/schema.prisma`：`SourceFeed` 加 `etag String @default("")`（沙箱内 `npx prisma generate` + `npx prisma db push`）。
- `src/lib/sources/rss.ts`：`fetchAndParse` 加第 4 参 `etag = ""`，返回形态改为 `FeedFetchOutcome`（`{ notModified, feed, etag }`，notModified 时 feed 为空壳）；直连与代理两条路径都带 `If-None-Match` 头、捕获响应 ETag（proxyGet 的 `ProxyGetResult` 加 etag 字段）；304 不入 error（现状 304 会按 `HTTP 304` 报错）；etag 解析规则单一事实源：304 → 回显值或保留旧值，200 → 响应头或清空。`FeedRefreshResult` 加 `notModified` 布尔；processFeed 透传/回存 etag。
- `src/app/api/sources/route.ts`：refresh 响应 summary 加 `notModified` 计数。
- `scripts/test-rss-proxy.mjs`：三处 `fetchAndParse` 调用点随返回形态更新（`outcome.feed`）。

## 验收

- [x] b2 ⑧ 节先红：本地 HTTP 服务器（固定 ETag）第二轮带 etag 调用断言 `notModified===true` 失败（现状恒 false 且 304 会当错误抛；实测红为 3 断言红 + TypeError）
- [x] 本地服务器往返：第一轮 200 + etag 捕获；第二轮 `If-None-Match` → `notModified===true` 且 items 为空；第三轮不带 etag → 200 正常解析（IN1）
- [x] 服务器侧记录到第二轮请求携带 `If-None-Match` 头（三轮头序列精确断言）
- [x] E2E（随 p1 demo）：周期源（日报/周报/月报）二轮至少 2/3 命中 304（周报轮换如实留痕）；无 error；summary.notModified 透出
- [x] 回归门：tsc 零错 + 离线三套全绿（b2 104→116）+ test-rss-proxy 新形态兼容实跑 19/0

## Comments
