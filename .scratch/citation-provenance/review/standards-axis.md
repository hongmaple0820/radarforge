# Standards 轴评审 —— S4 引用留痕（citation-provenance）

评审人：主 Agent（Z.ai）｜日期：2026-11-10｜对象：`git diff 4d5d104..HEAD`（本批全部改动）

## coding-standards 14 条逐项

| # | 条目 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | tsc strict 零错 | ✅ | `npx tsc --noEmit` exit 0（citations.ts 新模块 + run-manager/render/run-detail 改动后） |
| 2 | 标识符英文/注释中文 | ✅ | `lintArticleCitations/stripOrphanAnchors/citationsArtifact` 英文标识符；模块头与函数注释全中文（GLOSSARY 对齐） |
| 3 | em-dash 豁免 | ✅ | 中文破折号仅用于中文注释/文档 |
| 4 | 测试分层：离线→冒烟→聚焦 E2E→回归 | ✅ | b2 ⑦ 节（离线）→ render-smoke（tsx 直跑）→ s4-citation-e2e.mjs（with-server 聚焦）→ 离线三套 + c3 冒烟（回归） |
| 5 | 修 bug 先红后绿 | ✅ | 三条红线留痕：① b2 ⑦ MODULE_NOT_FOUND 红（票 01）② render-smoke link-sup 编号错位红（票 02——真功能红）③ E2E 相⑤ 文案不统一红（票 03）。断言器自身形态错误造成的假红也如实记录（claim-sup/IN1 形态错三次修正后收敛） |
| 6 | 产线改动跑聚焦 E2E + eval | ✅ | 本批未改 SKILL.md（prompt 面），但改了产出面（render/run-manager）——仍跑 E2E 7/7 + eval 8.3（宽门 7.88 PASS 不回退） |
| 7 | 诚实降级 | ✅ | 摘要三口径（全绿/有修复/零锚点）如实报告；orphanRemoved + orphanNumbers 留痕；DEMO 跳过断言核验但 lint 照跑（对照实证 mode=DEMO run 的 citations 键在） |
| 8 | 职责分离 | ✅ | 机械校验=纯函数零 LLM；citations/research/assertions 三键语义分离；修复不注入改语义文本 |
| 9 | 沙箱适配 | ✅ | 无常驻进程；E2E 全链 325s < 10min 窗；一 run 双用 + 只读复验模式省配额 |
| 10 | 密钥零落盘 | ✅ | 本批零密钥接触（zai 免费通道 + DEMO 搜索）；提交前扫描见 Spec 轴报告附录 |
| 11 | .env 无新内容 | ✅ | 未触碰 .env |
| 12 | 推送凭证临时注入还原 | ✅ | 提交后执行 set-url 注入→push→还原（同 S1~S4 既有手法） |
| 13 | 方案按模板/正式文档无 emoji | ✅ | citation-provenance-plan.md 模板全节（问题取证/背景/设计/分批/决策/验收/风险/范围外）；ADR-0010 同构；测试脚本内 ✓✗✅❌ 沿 b1/b2 既有惯例（非正式文档） |
| 14 | 提交信息一段式事实陈述 | ✅ | 改动清单 + 验证证据 + 已知约束三段式一段话（本仓惯例） |

## Fowler 12 smell 自查

- **Duplicated code**：E2E 断言器 `anchorsOf`（mjs）与 `citations.ts` 同口径重算——**测试独立性惯例不改**：断言器独立重算才能承担红证职责（与被测代码同源 import 会让断言器共享实现的 bug，假绿）。citations.ts 内 `verifiedSet` 单一实现被 lint/strip 两处调用，无内部重复。
- **Long parameter list**：`citationsArtifact(claims, lint, orphanRemoved)` 三参，clean。
- **Feature envy / Primitive obsession**：CitationSource 显式接口四元组+idx+verified，无裸数组游走。
- 其余 smell（shotgun surgery/lazy class/…）无命中。

## 结论

14/14 通过，Fowler 自查零阻塞（1 项测试独立性惯例留痕说明）。
