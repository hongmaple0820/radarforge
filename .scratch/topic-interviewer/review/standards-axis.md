# 双轴评审 · Standards 轴 —— 选题采访器（S4 余项①）

> 日期：2026-11-10 · 评审对象：本批全部改动（14 条编码标准 + Fowler 12 smell 基线，两轴分开报不合并排序）

## 逐条对照（docs/agents/coding-standards.md）

| # | 标准 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | tsc 零错 | ✅ | `npx tsc --noEmit` rc=0（重构后复跑） |
| 2 | 标识符英文/文档中文 | ✅ | dimension 枚举 audience/boundary/evidence；注释提交中文 |
| 3 | em-dash 豁免 | ✅ | 中文破折号合法使用 |
| 4 | 测试分层 | ✅ | 离线 b2 新 ⑥ 节（80/80，含 38 条新断言）→ 聚焦 E2E（with-server）→ 回归门 |
| 5 | 修 bug 先红后绿 | ✅×2 | 红 1：模块缺失 `ERR_MODULE_NOT_FOUND`→绿；红 2：采访 API 503（包裹对象解析缺口，单测喂裸数组未暴露）→修复转绿 + 补单测钉住包裹形态 |
| 6 | 产线 SKILL.md 改动聚焦 E2E + eval | ✅ | wewrite-brief 仅加占位符；无卡路径字节级断言 + 全链 E2E + eval 带卡 8.0（门禁 PASS） |
| 7 | 诚实降级 | ✅ | 停用→409→前端收起；坏卡→忽略不阻断；出题失败→503 人话 + 可跳过；429→人话不轰炸 |
| 8 | 职责分离 | ✅ | 提示词协议住 SKILL.md；纯数据函数零依赖模块；ts 仅组装（ADR-0009 记录 style_block 同款例外边界） |
| 9 | 沙箱适配 | ✅ | E2E 全腿 <10min 窗口；发现双管线并行自撞 429 → 重构为串行（环境教训回写 worklog） |
| 10-12 | 密钥零落盘/推送凭证 | ✅ | 本批零密钥接触；无凭证操作 |
| 13 | spec 模板/无 emoji 未验证符号 | ✅ | 方案按模板全节；文档无 emoji |
| 14 | 提交信息一段式 | ✅ | 收尾提交按惯例（改动清单+证据+约束） |

## Fowler 12 smell 自查

- **duplicated code（发现并已修）**：`distillIdeaCard` 与 `validateIdeaCard` 的 qa 单条清洗逻辑重复 → 抽 `cleanQaItem()` 共用，b2 80/80 复验不回退
- **long parameter list（已知不改）**：`briefMessages` 增至 4 参（title/angle/stylePrompt/ideaCard）——与仓内既定风格（style_block 先例同轴）一致，改对象参数属风格翻新超出本批范围，留痕
- **long function（既存非本批引入）**：`executeArticleRun` 既存长函数；本批净增 ~12 行（起始继承 + 卡传参 + detail 留痕），未加重结构问题
- 其余 9 smell 未见：命名全部可读自释（ideaCard/ideaCardBlock/distillIdeaCard）；无全局可变数据（缓存仅 skill-prompt 既存 5s 热缓存）；无 middle man/feature envy

## 发现与对冲

1. **`ideaCardBlock` 帧文案在 ts（ADR-0009 已记录例外）**：模板引擎无条件渲染，帧无法整个住 SKILL.md 而不污染无卡路径——对冲=ADR-0009 不变量限定例外仅 style_block/idea_card_block 两处既存先例，句子级新文案仍禁入 ts
2. **eval 同家族裁判**：评分腿裁判未跨家族（池态决定）——对冲=宽门 7.88 而非 8.38 对齐，如实留痕不冒充跨家族
