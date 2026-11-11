# Standards 轴评审 — aihot-access 05 增强票（2026-11-11）

> 基线：`docs/agents/coding-standards.md` 14 条 + Fowler 12 smell。评审对象：本票全部改动（aihot-block.ts / aihot-context.ts / 两 SKILL.md 占位符 / radar-write / topic-interview / run-manager / topic-interview 路由 / b2 ⑨ / demo+eval 脚本 / ADR-0012 / GLOSSARY）。

## 编码标准 14 条逐项

1. **TS strict / tsc 零错**：过（实现后即时跑 + 收口复跑，exit 0）。
2. **标识英文、文档注释中文**：过（`aihotBlock`/`AihotTopic`/`aihotContext`/`recentAihotTopics`/`AIHOT_SITE` 英文；文件头与行内注释全中文带 ADR/票指针）。
3. **em-dash 豁免**：过。
4. **测试分层**：过——离线契约先行（b2 ⑨ 新增 18 断言，127→145，零 LLM/零网络）→ 聚焦 E2E（demo 三相 15/16，唯一红=字数越界观察项）→ eval（m01 同题同配置，429 冷却后复跑收口）→ c3 冒烟 SMOKE-PASS。
5. **先红后绿 + 假设留痕**：过——红1 MODULE_NOT_FOUND（aihot-block 模块不存在）→ 实现；红2 帧头断言子串不匹配（设计写错帧头含括号后缀，断言对齐）；**假设证伪留痕**：「告知 mcp__AIHOT__* 工具可用」在纯 chat 路径不产生行为（run-manager:186 / route.ts:50 均无 tools 参数）——形态改为数据注入，ADR-0012 D1 记录证据链。
6. **产线提示词改动走 S3 纪律**：过——本票正是该纪律执行者：占位符行增量最小（brief 一行三占位符同线、采访器一行）、无数据字节级不变断言（IN1）、聚焦 E2E、eval 不回退宽门。
7. **诚实降级**：过——查询失败 warn 留痕 + 空数组（降级不静默）；429 限流如实红不轰炸（冷却复跑收口路径与 P1 同款）；字数越界如实记观察项不放宽断言。
8. **职责分离**：过——帧组装（content 纯函数）/ 查询（sources 读路径）/ 消息组装（runtime 持字符串参数）/ 调用点（run-manager 与路由查传）四层各一职；组装层不 import db（b2 直读口径保持）。
9. **沙箱适配**：过——无新常驻进程；demo 直读 prisma 只读查询。
10. **密钥零落盘**：过——本票零密钥接触（匿名只读路径）。
11/12. 无新密钥/凭证入仓：过。
13. **方案按模板**：过（方案 §9 注记 + 票 05 全节；无 emoji 与未验证符号）。
14. **提交信息一段式**：过（待提交，改动清单+验证证据+已知约束）。

## Fowler 12 smell 自查

- **duplicated code（留痕不改）**：两个调用点（run-manager / topic-interview 路由）各自 `aihotBlock(await aihotContext())` 一行——两层本就分属不同进程边界（run 管线 vs API 路由），抽公共「查帧」函数会造出第三个纯转发模块；一行调用的重复低于间接层成本，Fowler 「 duplication cheaper than the wrong abstraction」。
- **long parameter list（评估后未触发）**：`briefMessages` 五参——第 4/5 参均为可选注入块（ideaCard / aihotBlockText），语义沿「调用方查传」先例；再增参时转 options 对象。
- **mystery name**：`aihotContext`（尽力而为的参考上下文）/ `aihotBlock`（帧）命名直白；`AIHOT_SITE` 常量单一事实源。
- **speculative generality（主动规避）**：不做「注入开关 / 用户自定义条数 / 更多步骤注入面」等未要求配置——D5 明确只开两步，其余留观。
- 其余 smell：`clip` 截断单一实现；无新全局态。

## 结论

零阻塞。一条留痕（两调用点一行重复）有明确不修理由；形态证伪先于设计是本票的方法论亮点（P1 retro 纪律再应用）。
