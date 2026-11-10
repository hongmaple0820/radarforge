# 02-管线接入：Step 9 lint+机械修复+三处一致 + render 编号错位修复 + assertions 补全

Status: done
Blocked by: 01

## 目标

票后可验证：一篇文章 run 完成后，`artifacts.citations` 含全部 fact claims 四元组与 citedCount；正文中悬空 [n] 被机械移除并留痕（orphanRemoved）；修正稿三处一致（AgentRun.output / article.markdown / article.formatted 锚点集合一致）；正文 md 链接脚注编号与参考来源区对齐；assertions items 四元组完整（text 500）。

## 验收
- [x] Step 9 排版步开头：lintArticleCitations → stripOrphanAnchors（有悬空才修）→ 修正稿渲染与写回；DEMO 模式 lint 照跑（纯函数无搜索依赖——与 Step 6 断言核验的 REAL 守门形成对照断言）
- [x] 修正非空时：`article.update` markdown=修正稿 + wordCount 重算 + formatted=render(修正稿)；AgentRun.output=修正稿（finalDraft 步内写回，output 步外统一落——三处一致 IN2 数据层完成，E2E 断言在票 03）
- [x] `artifacts.citations` 落 run；step 摘要三种口径：全绿「X 锚点全部可解析，Y/Z 来源被引用」/ 有修复「N 个悬空已移除留痕（编号清单）」/ 零锚点诚实报告（诚实报告）
- [x] render.ts：`inlineMd` md 链接 `<sup>[n]</sup>` 编号改为 claimsCount 偏移（与 allRefs 编号空间一致，InlineCtx 扩展）；render-smoke.mjs 同步新增引用一致性块——**红线实证：link-sup 错位断言先红（正文 [1] vs 脚注 [N+1]）→ 修复后全绿**
- [x] renderClaims 空（或全未证实）时参考来源区行为与现状字节级一致（IN1 不变量——空 claims 无链接时不出现参考来源区，以标题闭合形态为判据避开 AIGC 文案干扰）
- [x] Step 6 `artifacts.assertions` items：text 截断 100→500 + 补 sourceTitle/sourceDate
- [x] 离线 b1/b2 同步断言（render 部分落位 render-smoke.mjs——render 依赖 @/ 别名无法进 strip-types 离线套，遵既有先例）；tsc 零错｜离线 68/101/81 全绿

## Comments
- 2026-11-10 实现：render 红线三次形态修正后收敛到唯一功能红（link-sup）——教训两条如实记：① paste-safe 会给脚注区也包 leaf span，正文判据必须切「参考来源」标题之前的片段；② AIGC 声明文案含「参考来源」四字，判据用标题闭合形态 `参考来源</span>` 而非裸字符串。首次断言写错导致 claim-sup/IN1 假红（形态错），修正后红线干净=只剩错位功能红。
