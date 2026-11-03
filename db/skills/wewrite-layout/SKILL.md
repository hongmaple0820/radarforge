---
name: wewrite-layout
description: 成稿排版：Markdown 转公众号格式化 HTML（主题 / 卡片 / 引用块 / [n] 上标 / AIGC 声明）。流水线最后一步排版时使用。
license: MIT
metadata:
  rebuilt: "true"
  rebuilt-at: "2026-11-02"
  origin-pack: wewrite-community（原包已失，按功能语义重建）
  standard: agentskills.io/specification

---

# 排版（layout）

把成稿 Markdown 渲染为可直接粘贴公众号的格式化 HTML。

## 渲染规则
1. **主题**：按 run 指定主题取对应配色与字号体系
2. **[n] 锚点**：渲染为可点击上标，参考来源区集中列出
3. **卡片化**：要点列表转卡片；金句转引用块
4. **CJK-Latin 空格**：中西文之间自动补空格
5. **合规**：文末 AIGC 声明 + 参考来源区

## 输出
- 全内联样式 HTML（公众号编辑器兼容）
- 字符数与 section 数留痕
