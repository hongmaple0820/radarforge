# 03-前端+E2E+eval+文档：run-detail 引用留痕卡 + 五相 E2E + m01 eval + ADR/GLOSSARY/worklog

Status: done
Blocked by: 02

## 目标

票后可验证：用户在 run 详情页看到「引用留痕」卡（Badge + 来源列表 + 悬空修复留痕）；E2E 全链跑通含 IN1/IN2/悬空修复链/DEMO 模式实证；eval m01 同题同配置不回退且锚点可解析率 100%；文档四件闭环（ADR-0010/GLOSSARY 47 条/worklog/方案拍板注记）。

## 验收
- [x] run-detail.tsx「引用留痕」卡：循 assertions 卡先例（JSON.parse artifacts.citations → Badge 全绿「X/Y 已引用」或有修复「N 锚已修」→ 来源列表 citedCount/verified 标记）；citations 缺失时返回 null（旧 run 兼容）；tsc 零错
- [x] E2E（串行收尾防 429 自撞，一 run 双用省配额 + 只读复验模式）：首跑 6/7（相⑤红=摘要文案不统一「引用体检」vs「引用留痕」，修文案统一）→ 复跑 **7/7 全绿**：① citations 键+四元组完整 ② 三处一致（次数级）③ 悬空修复链实证（DEMO 模式 claims 全未证实→14 锚全悬空→全移除+留痕+零残留）④ 断言器红证跳过（历史 run 不可得，红证证据链由 render-smoke link-sup 先红后绿承担）⑤ layout 步摘要含「引用留痕」
- [x] eval m01：同题同配置均分 8.3（宽门 7.88 PASS，不回退）+ 锚点可解析率 100% + 字数判据沿用产品容差（draft.inBand）
- [x] ADR-0010：三决策（D1 独立键/D2 机械移除/D3 Step 9 内嵌）+ 两不变量（IN1 无来源字节不变/IN2 三处一致）+ 后果含例外边界（编号错位修复只影响新 run）
- [x] GLOSSARY 45→47（+引用留痕/悬空锚，带代码锚点）；worklog 本批条目（含 retro 三条）；方案头部拍板注记
- [x] 回归门：tsc 零错｜离线 68/101/81｜render-smoke 全主题 PASS（含引用一致性块）｜c3 冒烟 10/10｜密钥零落盘扫描 0 命中

## Comments
- 2026-11-10 首跑暴露两点：① 摘要文案不统一（修复口径误写「引用体检」）——统一「引用留痕」前缀后复跑全绿；② DEMO 模式（SEARCH_KEY 外部约束）下 claims 全未证实——意外提供「全悬空」极限场景实证：draft 引 14 锚全悬空→机械移除+orphanRemoved=14 留痕+三处一致+零残留，机制在极限场景如实工作。「部分 verified」跳号语义由离线 b2 ⑦ 节钉住，REAL 全绿路径留观。
