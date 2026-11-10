# 文章引用留痕（citation-provenance）方案

> 批次：S4 余项②（对齐 mattpocock-skills 采纳方案 §4 S4 可选项「research 引用纪律 → 文章引用留痕」与 A4 研究缺口降级链遗留）
> 开工令：用户「继续推进」（2026-11-10）。S2 流程第三次全链首演：frontier 轮次 → 本 spec → .scratch 三票 → 红-绿实现 → 双轴评审 → retro。
> 依据开工令 + 用户既有「按推荐」模式，§5 决策点全按选项 A 采纳，可翻案。
> **已拍板并落地（2026-11-10）**：三票全勾（.scratch/citation-provenance/）；E2E 7/7 + eval 8.3 宽门 PASS；回归门全绿；ADR-0010 / GLOSSARY 47 条 / worklog 同批落档。

## 0. 结论摘要

把「写作时可信、成文后失忆」的引用链补成留痕闭环：claims 来源四元组（site/title/date/url）在 run 完成时以 `artifacts.citations` 落 AgentRun（引用来源落 artifacts）；新增纯函数 lint 对正文 [n] 锚点做机器校验（超范围/引用未证实编号=悬空），悬空锚机械移除并留痕；run 详情页新增「引用留痕」卡。顺手修复两处既有正文标注缺陷：正文 md 链接脚注编号与参考来源区错位（正文 [1] ≠ 脚注区 [N+1]）、`artifacts.assertions` items 来源字段不全。零新密钥、零新依赖、DEMO 模式照跑（纯函数无搜索依赖）。

## 1. 问题陈述与取证（frontier 事实自查证 F1~F10）

- **F1 来源数据存在但分散**：Step 2 claims 取证把 verified claims（sourceSite/Title/Date/Url + quote）落 `db.claim`（kind=FACT idx>0；非 fact 主张 kind=REF idx=0；Step 6 断言核验 kind=ASSERT idx=0），Prisma Claim 模型字段齐全。**但 run 完成后 `artifacts` 无任何「[n] → 来源」映射**——审计一篇成文的 [n] 必须回库查 claim 表，且从未校验正文 [n] 与 claim idx 一致。
- **F2 计数≠留痕**：`artifacts.research` 存轮次/gaps 计数（A4 降级链诚实标注）；Step 9 `artifacts.layout.refs` 只存渲染脚注**计数**，来源明细渲染后被丢弃。
- **F3 render 参考来源区**：`renderWechatHtml` Step 3 合并 verified claims 四元组 + md 链接脚注生成「参考来源」区；`renderClaims` 仅过滤 verified claims 传入（未证实编号在脚注区跳号缺位）。
- **F4 正文 [n] 零机器校验**：draft SKILL 纪律「事实句句尾标 [n]，n 只取证据块编号」「未找到直接来源，不得作为事实陈述」+ S3 完成判据「有证据的段落至少挂一个 [n]」（eval 锚点密度 3.17/千字）全靠 LLM 自觉——超范围编号（[9] 但仅 5 条 claims）与引用未证实编号都是悬空锚，现状无告警无留痕。
- **F5 AIGC 声明是未验证承诺**：排版脚注声明「事实性内容均标注 [n] 来源，可通过参考来源核对」——悬空锚存在时此话不实。
- **F6 编号错位缺陷（既有 bug，本批正射修复）**：`inlineMd` 把正文 md 链接渲染为 `<sup>[n]</sup>`（n=linkRefs.length 从 1 起），而脚注区链接编号是 `claims.length + i + 1`——正文 [1] 与脚注区对不上；且正文中 [1] 会被读者误读为 claims[1]。
- **F7 assertions 审计不完整**：`artifacts.assertions` items 截断 text 100 字、无 sourceTitle/sourceDate（db.claim 有完整四元组与 quote）。
- **F8 UI 先例**：run-detail.tsx 已有 assertions 卡（artifacts JSON.parse → Badge/进度条/items 列表）——citations 卡循此先例。
- **F9 测试先例**：离线三套 `scripts/test-{b1,b2,c}-offline.ts`（assert 风格，`node --experimental-strip-types`）；render-smoke.mjs 有 renderWechatHtml 直测先例；idea-card 批先例=纯函数模块 + b2 新增测试节先红（MODULE_NOT_FOUND）后绿。
- **F10 eval 度量先例**：`scripts/tmp/s3-eval-metrics.mjs` 已有锚点计数 `/\[\d+\]/g` 与密度——本批新增「锚点可解析率」（悬空修复后恒 100%）。

## 2. 背景与研究

- 采纳方案 §3 现状对照表：research 技能的「引用 md」纪律在库内天然符合（docs/research-external-survey.md），文章产线的引用纪律只到「写作 prompt 层」（F4），缺「数据留痕层」。
- A4 研究缺口（content-quality-upgrade-plan §A4）：两轮研究循环 + 大纲演化在 SEARCH_KEY 约束下走「单轮+规则 gap 标注」降级链，`artifacts.research` 如实标注。本批不做研究循环升级（外部密钥约束不变），做**引用面的留痕闭环**——两者的关系：research 决定「证据从哪来」，citation-provenance 记录「证据去哪了」。
- STORM/引用溯源方法论（research-external-survey §A4）：可验证性=「每条事实陈述可回溯到来源」；本批把该纪律机器化到文章产物（artifacts.citations = 审计账本）。

## 3. 方案设计

**新增模块 `src/lib/content/citations.ts`（零依赖纯函数，客户端/服务端共用单一实现）**：

1. `lintArticleCitations(markdown, claims)`——扫描正文 `[n]` 锚点（`\[\d{1,2}\]`，与 render 同口径），对照 claims 账本：
   - `valid`：编号存在且 verified（脚注区可解析）；
   - `orphan`：编号超范围 或 对应 claim 未证实（脚注区跳号缺位=悬空）；
   - 产出 `used`（被引用编号集）、`citedCount` per claim、`orphanAnchors` 清单（编号+出现次数）。
2. `stripOrphanAnchors(markdown, claims)`——机械移除悬空 `[n]`（保留句子，最小干预），返回修正稿；`orphanRemoved` 计数随 lint 结果留痕。
3. `citationsArtifact(claims, lint)`——组装 `artifacts.citations`：`{ total, verified, cited, orphanRemoved, sources: [{ idx, claimType, text, verified, citedCount, sourceSite, sourceTitle, sourceDate, sourceUrl }] }`（fact claims 全量含未证实 flagged，审计视角；REF/ASSERT 不入——职责分离，分别属 research/assertions 键）。

**管线接入（run-manager Step 9 排版步内，不新增 step 序号）**：

- lint + 机械修复在排版前执行（悬空锚只影响脚注映射，不影响配图腿）；修正稿写回**三处一致**：`AgentRun.output`、`article.markdown`（update）、`article.formatted`（render 修正稿）。
- `artifacts.citations` 落 run；step 摘要如实报告（「X 锚点全可解析」或「Y 悬空已机械移除留痕」）。
- **render 编号错位修复**：`inlineMd` 的 md 链接脚注编号改为 `claims.length + linkRefs.length`（与 allRefs 编号空间一致）——InlineCtx 扩展 claims 计数字段传入。
- **assertions items 补全**：text 截断 100→500（对齐 db.claim）+ 补 sourceTitle/sourceDate（四元组完整）。

**前端（run-detail.tsx）**：「引用留痕」卡循 assertions 卡先例——Badge（全绿「X/Y 已引用」/ 有悬空「Y 锚已修」）+ 来源列表（citedCount/verified 标记/四元组）。

**两不变量（E2E 断言钉死）**：

- IN1 无来源字节不变：claims 为空（或全未证实）时 render 输出与现状字节级一致（不新增 DOM/文案）；
- IN2 三处一致：lint 修复后 `AgentRun.output` / `article.markdown` / `article.formatted` 三处的 [n] 锚点集合一致（单一事实源）。

## 4. 分批落地（.scratch/citation-provenance/ tracer-bullet 线性链）

- **票 01 事实源+纯函数**：`citations.ts` 四函数 + 离线测试节先红（ERR_MODULE_NOT_FOUND）后绿（悬空/超范围/跳号/空账本/编号错位口径等断言）。
- **票 02 管线接入**：Step 9 lint+修复+三处一致+artifacts.citations+摘要；render 编号错位修复；assertions items 补全。
- **票 03 前端+E2E+eval+文档**：run-detail 引用留痕卡；E2E（DEMO 模式 lint 照跑实证 + IN1/IN2 + orphan 修复链）；eval m01 一题宽门 7.88 + 锚点可解析率 100% + citations 留痕完整性；文档四件（ADR-0010 / GLOSSARY 45→47 / worklog / 本方案拍板注记）。

## 5. 决策点（十项，frontier 轮次产出，全按选项 A）

| # | 决策 | 选项 A（采纳） | 备选（不选原因） |
|---|---|---|---|
| D1 | 落点形态 | `artifacts.citations` 独立键（先例 ideaCard 键分离） | 并入 research：语义混杂（research=研究循环元数据） |
| D2 | 悬空锚修复 | 机械移除+留痕（最小干预，不改句子语义） | 注入「（未核实）」文本改语义/只留痕不修（AIGC 声明继续不实） |
| D3 | lint 时机 | Step 9 排版步内 lint+修+渲染同报（不新增 step 序号；DEMO 模式照跑——纯函数无搜索依赖） | 独立 Step 6.5：step 列表变化影响前端编号展示 |
| D4 | sources 范围 | fact claims 全量（含未证实 flagged）；REF/ASSERT 不入（职责分离） | 全 kind 混入：与 assertions 键职责重叠 |
| D5 | assertions items | text 500 + 四元组补全（对齐 db.claim，审计完整） | 维持 100 截断：审计不完整留缺陷 |
| D6 | 前端 | run-detail「引用留痕」卡（循 assertions 卡先例） | 不做前端：用户不可见价值低 |
| D7 | AIGC 声明 | 维持现状文案（lint 修复后「均标注 [n]」成立） | 动态文案复杂化 |
| D8 | eval | m01 一题宽门 7.88（先例同题同配置）+ 锚点可解析率度量 | 四题全跑：配额纪律（聚焦增量） |
| D9 | 文档 | ADR-0010 + GLOSSARY 45→47 + worklog + 本方案（四件） | 跳过 ADR：违反里程碑记录决策⑥ |
| D10 | 编号错位 | 纳入修复（正文标注正射范围：读者点 [n] 必须能对上脚注） | 留既有缺陷：正文标注目标未达成 |

## 6. 验收与度量

- **红线命令先红后绿**：票 01 `node --experimental-strip-types scripts/test-b2-offline.ts`（新增 ⑦ 节先红 ERR_MODULE_NOT_FOUND）；票 02 E2E 断言 artifacts.citations 键缺失先红。
- **功能验收**：E2E 含 lint 修复链（构造悬空锚实证移除+留痕）、IN1 字节级不变、IN2 三处一致、DEMO 模式 lint 照跑、run-detail 卡渲染。
- **质量验收**：eval m01 同题同配置均分 ≥ 宽门 7.88（不回退）+ 锚点可解析率 100% + artifacts.citations.sources 四元组完整。
- **回归门**：tsc 零错｜离线 b1/b2/c｜c3 冒烟 10/10｜密钥零落盘扫描。

## 7. 风险与权衡

1. **机械移除悬空锚后句子失去来源标注**（诚实性权衡）：句子内容不变但 AIGC 承诺的「事实句有 [n]」出现例外——对冲：orphan 清单留痕 artifacts + step 摘要如实报告；Step 6 断言核验门禁（无据率>30% 拦截）仍在前把关。
2. **移除锚点影响字数/排版**：锚点计入 wordCount（`\s` 剔除后 `[3]` 4 字符计入）——修复后 wordCount 重算并写回（三处一致含 wordCount 对齐）；带内标记以修复后稿为准。
3. **编号错位修复改变既有成文渲染**：旧 run 的 formatted 不回溯重渲染（只影响新 run）；render-smoke.mjs 断言同步更新。
4. **citations 膨胀**：sources 上限对齐 Step 2 现状（fact ≤5 + REF ≤3 不入 → ≤5 条），artifacts 增量可控（<1KB）。
5. **eval 单题**：聚焦增量度量（可解析率/留痕完整性），门禁沿先例宽门——若门禁红则修复后复跑（S3 m02 先例）。

## 范围外

- A4 两轮研究循环/gap 补搜升级（SEARCH_KEY 外部约束不变，`artifacts.research` 降级链标注维持）；
- LLM 定向修复悬空句（软化措辞/换锚）——机械修复后若 eval 显示悬空常态化再评估（观察项）；
- 视频线（huashu 无 [n] 体系）；
- md 链接脚注去重/短链美化等排版增强。
