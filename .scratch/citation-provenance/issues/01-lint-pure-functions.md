# 01-事实源与纯函数层：citations.ts 四函数 + 离线断言（b2 新增 ⑦ 节）

Status: done
Blocked by: （无）

## 目标

票后可验证：引用留痕的校验/修复/账本组装全是零依赖纯函数（客户端可安全引入，与 idea-card.ts 同层同先例）；lint 口径与 render 的 `[n]` 上标正则一致（`\[\d{1,2}\]`）；悬空语义钉死（超范围 或 编号对应 claim 未证实）；空账本路径字节级不变。

## 验收
- [x] `src/lib/content/citations.ts` 零依赖，导出 lintArticleCitations / stripOrphanAnchors / citationsArtifact / LintCitations 类型（+ CitationSource）
- [x] `lintArticleCitations`：锚点集/valid/orphan（超范围+未证实两种悬空）/used/citedCount 逐项断言；跳号场景（1,3 号 verified、2 号未证实→[2] 是悬空）
- [x] `stripOrphanAnchors`：移除悬空 `[n]` 保留句子；无悬空时返回原文（字节级不变）；code fence 内 `[n]` 不当作锚点（fence 内容 render 不走 inlineMd 锚点——口径对齐）；重复悬空（[2] 出现 2 次）全移除并计数
- [x] `citationsArtifact`：sources 含 fact claims 全量（verified flagged）、citedCount、四元组字段名与 db.claim 一致（sourceSite/sourceTitle/sourceDate/sourceUrl）；REF/ASSERT 不入
- [x] wordCount 口径对齐：锚点字符计入 body 字数（`replace(/\s/g,"")` 同口径，为票 02 重算留缝）——单锚 3 字符实证
- [x] b2 离线新增 ⑦ 节 ≥14 断言全绿（先红后绿：MODULE_NOT_FOUND 红 → 实现绿；实收 21 条，101/101）

## Comments
- 2026-11-10 实现：红线先行（test-b2 ⑦ 节 → ERR_MODULE_NOT_FOUND 红）；fence 口径与 render.ts `/^```/` 行首检测一致；悬空语义两种（超范围/未证实——后者因 renderClaims 仅含 verified 跳号缺位）。首版空账本快捷路径 bug（`ok.size===0` 跳过 replace 导致空账本不移除）被断言抓出后修复——空账本恰是全悬空场景。
