# Spec 轴评审 —— S4 引用留痕（citation-provenance）

评审人：主 Agent（Z.ai）｜日期：2026-11-10｜对照物：`docs/citation-provenance-plan.md`（§3 设计 / §5 决策 / §6 验收 / §7 风险）

## D1~D10 决策符合性

| # | 决策（拍板=全 A） | 落地证据 | 符合 |
| --- | --- | --- | --- |
| D1 | `artifacts.citations` 独立键 | run-manager Step 9；E2E 相① 键+四元组在 | ✅ |
| D2 | 悬空锚机械移除+留痕（不注入改语义文本） | `stripOrphanAnchors` 纯函数；b2 ⑦「保留句子」断言；E2E orphanRemoved=14 留痕 | ✅ |
| D3 | lint 内嵌 Step 9、DEMO 照跑 | 不新增 step 序号；mode=DEMO run 的 citations 键在（与 Step 6 REAL 守门对照） | ✅ |
| D4 | fact 全量含未证实 flagged | E2E sources=2 条含 verified=false | ✅ |
| D5 | assertions items text 500+四元组 | run-manager Step 6 已改；**线上断言留观**（DEMO 跳过 Step 6 → 无 artifacts.assertions 可验——已知妥协①） | ✅* |
| D6 | run-detail 引用留痕卡 | tsc 零错 + JSON.parse 缺键 null；**浏览器视觉未验**——已知妥协② | ✅* |
| D7 | AIGC 声明维持现状 | render.ts AIGC 段未动 | ✅ |
| D8 | eval m01 宽门 7.88 | 实测 8.3 PASS（同题同配置） | ✅ |
| D9 | 文档四件 | ADR-0010 / GLOSSARY 47 / worklog / 方案拍板注记 全落 | ✅ |
| D10 | 编号错位修复纳入 | render-smoke link-sup 红→绿；InlineCtx.claimsCount 偏移；空 claims 回落 [1] 字节一致 | ✅ |

## §6 验收复核

- 红线命令先红后绿：✅（三条红线，见 Standards 轴 #5）
- 功能验收：✅ E2E 7/7（键/四元组/三处一致次数级/悬空修复链/摘要口径）；IN1 字节不变（render-smoke 空 claims 无链接不出现参考来源区 + IN1b 链接回落 [1]）；IN2 三处一致（相②）
- 质量验收：✅ eval 8.3 ≥ 7.88；锚点可解析率 100%；四元组完整
- 回归门：✅ tsc 零错｜离线 68/101/81｜render-smoke 全主题 PASS｜c3 冒烟 10/10

## §7 风险五项对冲复核

1. 机械移除后句子失标注 → orphanRemoved/orphanNumbers 留痕 + 摘要如实 + Step 6 REAL 门禁在前：✅ 对冲落实（E2E 14 锚场景实证）
2. 字数/排版影响 → wordCount 重算随修正稿写回三处、inBand 沿产品容差判据：✅
3. 编号错位改变既有渲染 → 旧 run formatted 不回溯（render 只在新 run 调用）、render-smoke 断言同步：✅
4. citations 膨胀 → sources ≤ fact 上限 5 条，实测 2 条 <1KB：✅
5. eval 单题 → 宽门沿先例 PASS，若红修复复跑（未触发）：✅

## 零范围蔓延核查

改动清单全部落在 spec §3~§4 声明范围：`src/lib/content/citations.ts`（新）/ `run-manager.ts`（Step 9+Step 6）/ `render.ts`（InlineCtx+链接编号）/ `run-detail.tsx`（卡）/ `render-smoke.mjs` / `test-b2-offline.ts`（⑦ 节）/ `scripts/tmp/s4-citation-e2e.mjs`（新）/ 文档四件 + .scratch 三票。无范围外文件改动；视频线/研究循环/LLM 修复腿均未触碰（范围外清单守住）。

## 已知妥协（3 件，均有对冲或留观路径）

1. **assertions 四元组线上未证**：DEMO 模式 Step 6 跳过（REAL 守门语义正确）→ 代码层已改+字段定义明确；REAL 会话跑任一 run 即自然验证（留观，与 A4 同源环境约束）。
2. **run-detail 卡浏览器视觉未验**：c3 冒烟不覆盖 run 详情页；tsc+parse 逻辑层验证；结构与断言卡同构（成熟先例）。下个浏览器级冒烟批次可补。
3. **相④ 断言器红证跳过**：历史 done run 不可得（列表查询无果）；红证证据链由 render-smoke link-sup 先红后绿 + b2 ⑦ MODULE_NOT_FOUND 先红承担。

## 结论

D1~D10 符合性 10/10（含 2 项带留观注记）；验收四块全过；风险对冲落实；零范围蔓延。可合并。

## 附录：密钥零落盘扫描

`git diff 4d5d104..HEAD` + 新增脚本 + worklog：无任何密钥/令牌形态字符串（ghp_/sk-/AGNES_KEYS 值等均 0 命中）；本批零密钥接触（E2E 走 zai 免费通道 + DEMO 搜索）。
