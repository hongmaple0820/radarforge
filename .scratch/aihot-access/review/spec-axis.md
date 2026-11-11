# Spec 轴评审 — aihot-access 批次（2026-11-11）

> 对照：`docs/aihot-access-plan.md`（已拍板）+ `.scratch/aihot-access/` 四票验收 checkbox。

## D1~D4 拍板符合性

| 决策 | 拍板 | 落地 | 符合 |
|---|---|---|---|
| D1 推进 P1 | 要的 | 四票全落地（MCP 种子 + 18 源 + feedIds + ETag + 原文直链） | ✓ |
| D2 全都要 | 18 条全量 | `DEFAULT_FEEDS` 18 行（6 主源+6 分类+6 全文分类），b2 钉 42 行/18 条/地址集精确相等；E2E B 相实证 | ✓ |
| D3 两增强立项 | 可以的 | 票 03（ETag/304 线上 2/3 命中 + 本地服务器往返钉死）+ 票 04（30/30 原文直链） | ✓ |
| D4 不带 aihot_actor | 可以的（按推荐口径） | 种子 URL 零查询参数；ADR-0011 记录翻案成本（一行） | ✓ |

## 四票验收核对

- **01-mcp-default-seed**：b2 先红（MODULE_NOT_FOUND）→ 三断言绿；E2E A 相清库重播确定性实证（db 行=2，DeepWiki 原行字节保留）+ 握手 615ms + 10 工具 `mcp__AIHOT__*`。**全勾**。
- **02-rss-default-feeds**：b2 先红（24≠42）→ 绿；E2E B 相 18 源/42 行/seededNow 幂等（复跑=0）；POST feedIds 定向（results=1）；红线探究：预判「full.xml 二刷 inserted>0」被证伪 → 跨站 guid 去重按证伪结论缓议（Comments 留痕）。**全勾（红线探究替代原预判红线）**。
- **03-rss-etag**：b2 本地服务器先红（notModified 恒 false + TypeError）→ 七断言绿（含 IN1 无 etag 行为不变 + 服务器侧仅第二轮带 If-None-Match）；E2E D 相周期源二轮 2/3 命中 304（日报/月报日内稳定，周报轮换如实留痕）；test-rss-proxy 19/0（代理路径新形态兼容）。**全勾**。
- **04-aihot-original-link**：b2 函数族先红（无导出）→ 13 断言绿；E2E E 相先红（0/30 原文直链）→ 后绿（30/30 url host≠aihot.news、条目页链接在摘要尾、转选题闭环）；文档四件齐（ADR-0011 / GLOSSARY 47→50 / 研究文档拍板注记 / worklog+retro）+ 双轴评审两报告。**全勾**。

## 不变量核验

- IN1（无 etag 源行为不变）：b2 ⑧ 第三轮 200 正常解析 + 服务器侧头记录钉死。✓
- IN2（非 AIHOT 源字节不变）：b2 ⑧ 普通形态样本不产出 originalUrl + 原 24 源注册表行零改动断言。✓
- IN3（SimHash 口径部署前后一致）：跨源判重哈希用解析层原值，不掺回填后缀（rss.ts 注释钉死）。✓

## 风险五项对冲复核（方案 §7）

1. feed.xml/full.xml 短窗轮换 → 实测未失稳（C 相两态均过；周报轮换属 D 相容差内）。✓
2. CDN 566/566 → 未遇；429 全量回归视频段如实留痕（外部约束，见下）。✓
3. 18 源请求量 → ETag 落地后未变化零正文；AIHOT 限流 60 次/分未触发（全部实跑零 429 from aihot.news）。✓
4. 既有库不补种 MCP 行 → 方案 D5 明示，UI 手动路径在（E2E A0 清库路径即走手动删除 API）。✓
5. 摘要尾条目页链接入 angle → 已接受并留痕（方案风险 5、ADR-0011 后果）。✓

## 零范围蔓延

- POST feedIds：方案 §3 线 E 明示（D6）。✓
- 跨站 guid 去重：**减量**而非增量（红线证伪后缓议）。✓
- 未触碰：db/skills、REST /api/v1、aihot_actor、/api/v1/selected 同步、8KB 截断（方案 §8 范围外清单逐一核对）。

## 已知妥协（如实记录）

1. **全量回归视频直出段**：`POST /api/video-runs` 研究腿 zai 共享配额 429（71s 重试后 500）→ 三个级联断言红——外部约束（铁律 7），非本批代码（改动不触视频线/gateway）；配额冷却后复跑收口，若仍 429 按配额纪律不轰炸、留外部约束记录。
2. **纯图线「生图全降级」断言红**：同一 429 家族（zai 生图端点限流），文章主线全绿。
3. D 相周报 ETag 轮换：容差 2/3 断言（成刊日内轮换是上游真实行为，非产品缺陷）。
