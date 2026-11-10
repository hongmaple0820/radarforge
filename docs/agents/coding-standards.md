# Coding Standards（编码标准）

> Standards 轴评审的基线（双轴评审的另一轴是 Spec）。从六批次实测实践提炼，非愿望清单：每条都有实证来源。
> 机械错误 → 确定性检查；判断题 → 本标准。retro 时持续回写。

## 语言与类型

1. TypeScript strict；`npx tsc --noEmit` 零错是 push 最低门
2. 标识符、枚举值、JSON 字段、日志 key：英文；文档、提交信息、注释：中文（对照 `GLOSSARY.md`）
3. em-dash 豁免：中文排版破折号合法（上游 mattpocock/skills 的 em-dash 禁令不适用于中文仓）

## 测试纪律

4. **分层**：离线契约（`scripts/test-{b1,b2,c}-offline.ts`，零 LLM/零网络/零 ffmpeg）先行 → 冒烟 → 聚焦 E2E → 全量回归（需 server 时一律 `bash scripts/with-server.sh "..."`）
5. **修 bug 先红后绿**：动手前先立一条红线命令（能在本 bug 上变红、确定性、秒级、agent 可跑），修完转绿；提交信息附红线输出与被证伪/证实的假设。单测样本形态要与「调用侧实际会喂什么」对齐，不只与「函数能接什么」对齐（S4 实证：协议解析单测喂裸数组，LLM 实际按协议示形输出包裹对象 → 503 漏网；修复后两形态都钉住）
6. 产线提示词（db/skills SKILL.md）改动必须跑聚焦 E2E + eval 抽样（不回退纪律，见 ADR-0007）

## 行为哲学

7. **诚实降级**：所有失败显式降级 + 标注来源（aiNote / diag legs / 降级链路留痕），禁止静默吞错、禁止静默重试轰炸
8. **职责分离**：硬数据（kind=data）一律 card-engine 代码排版零错字，metrics 只来自真实字段禁编造；模型只做模型擅长的
9. 沙箱适配：不引入需要常驻进程的设计；超 10 分钟的任务拆腿；外部状态假设（密钥、凭证、prisma client）先自愈再干活

## 安全红线

10. **密钥零落盘**：密钥只进 `db/custom.db`（gitignored）与环境变量；脚本经环境变量传入；提交前跑密钥扫描（git diff + 脚本 + worklog 全查）
11. `.env` 历史曾泄露并已全历史清洗（filter-repo）：任何新密钥进仓库 = 事故级
12. git 推送凭证临时注入 remote URL 后必须立即还原

## 文档

13. 方案文档按 `spec-template.md`；正式文档不用 emoji 与未验证符号
14. 提交信息一段式事实陈述（本仓既有惯例：改动清单 + 验证证据 + 已知约束）

## Fowler 12 smell 基线（Standards 轴通用底座）

评审时对照：mystery name（谜命名）/ duplicated code / long function / long parameter list / global data / mutable data / divergent change / shotgun surgery / feature envy / data clumps / primitive obsession / middle man。发现 smell 报告时给轴归类，不与 Spec 轴合并排序。
