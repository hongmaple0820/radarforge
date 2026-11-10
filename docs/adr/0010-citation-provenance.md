# 0010 — 文章引用留痕：citations 落 artifacts、悬空锚机械移除、排版步内嵌

> 状态：已接受（2026-11-10，mattpocock/skills 采纳 S4 余项②，spec 见 `docs/citation-provenance-plan.md` §5）
> 溯源：`src/lib/content/citations.ts`；`src/lib/runtime/run-manager.ts` Step 9；`src/lib/runtime/render.ts`；`src/components/run-detail.tsx`；`docs/citation-provenance-plan.md`

## 背景

引用链「写作时可信、成文后失忆」（spec §1 取证）：claims 来源四元组（site/title/date/url）在 Step 2 落 `db.claim` 后只被排版引擎临时消费，run 终态的 `artifacts` 只留计数（`layout.refs`）不留明细；正文 [n] 锚点零机器校验——超范围编号与引用未证实编号都是悬空锚（脚注区跳号缺位），无告警无留痕，AIGC 声明「事实性内容均标注 [n]」是未验证承诺。另有一处既有编号错位缺陷：正文 md 链接上标从 1 起编，脚注区却在 claims.length+1 起——读者对不上号。

## 决策

- **`artifacts.citations` 独立键（fact claims 全量含未证实 flagged）**。语义=「[n] 脚注来源审计账本」：total/verified/cited/orphanRemoved + sources[]（四元组 + citedCount）。不并入 `artifacts.research`（那是 A4 研究循环元数据，职责分离）；REF/ASSERT 不入（分别属 claims 账本与 `artifacts.assertions` 键）。
- **悬空锚机械移除 + 留痕（最小干预）**。`stripOrphanAnchors` 移除悬空 `[n]` 保留句子——不注入「（未核实）」类改语义文本；orphan 清单与移除计数随 `artifacts.citations` 留痕，步骤摘要如实报告（全绿/有修复/零锚点三口径，统一「引用留痕」前缀）。对冲：Step 6 断言核验门禁（无据率>30% 拦截）仍在 REAL 模式把关。
- **lint 内嵌 Step 9 排版步（不新增 step 序号，DEMO 模式照跑）**。纯函数无搜索依赖——与 Step 6 断言核验的 REAL 守门形成对照：引用体检是机械校验，不应被搜索降级跳过。修正稿写回三处一致（`AgentRun.output` / `article.markdown` / `article.formatted`，wordCount 同步重算）。

## 不变量

- **IN1 无来源字节不变**：claims 为空（或全未证实）时 render 输出与旧版字节级一致——不新增参考来源区 DOM、链接上标回落 [1]（claimsCount=0 偏移归零）。判据钉在 `scripts/render-smoke.mjs`（标题闭合形态 `参考来源</span>` 避开 AIGC 声明文案「参考来源核对」的字符串干扰）。
- **IN2 三处一致**：lint 修复后 output / article.markdown / formatted 三处的 [n] 锚点集合一致（E2E 次数级断言，`scripts/tmp/s4-citation-e2e.mjs` 相②）。

## 后果

- **md 链接脚注编号错位修复只影响新 run**：`inlineMd` 链接上标 = `claimsCount + linkRefs.length`（与 allRefs 同编号空间）；旧 run 的 formatted 不回溯重渲染。
- **`artifacts.assertions` items 补全**：text 截断 100→500、补 sourceTitle/sourceDate（对齐 `db.claim` 四元组，审计完整）。
- **run 详情页「引用留痕」卡**：循断言卡先例（Badge 全绿/锚已修 + 引用率进度条 + 来源列表 citedCount）；旧 run 无键返回 null 不炸。
- **DEMO 搜索模式下 claims 全未证实**（沙箱无 SEARCH_KEY 的既定约束）：draft 引用证据块编号全悬空 → 机械移除 + orphanRemoved 留痕（E2E 实证 14 锚全移除、三处一致、零残留）。「部分 verified」跳号语义由离线 b2 ⑦ 节钉死；REAL 模式全绿路径（orphanRemoved=0 且 anchors>0）留观（与 A4 降级链同源环境约束）。
- eval 均分 8.3（宽门 7.88 PASS，同题同配置）不回退；锚点可解析率 100%。
