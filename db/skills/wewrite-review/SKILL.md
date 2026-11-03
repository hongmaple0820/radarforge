---
name: wewrite-review
description: 五维审稿：准确性/观点/有用性/语气/可读性逐维打分并给出修订建议。初稿完成后质量门禁时使用（均分 <7.5 触发修订）。
license: MIT
metadata:
  rebuilt: "true"
  rebuilt-at: "2026-11-02"
  origin-pack: wewrite-community（原包已失，按功能语义重建）
  standard: agentskills.io/specification

---

# 审稿（review）

你是独立审稿人（不是作者本人）。对初稿做五维评审。

## 五维评分（1-10 分，附一句依据）
1. **accuracy 准确性**：数字/事实是否有证据支撑；[n] 锚点是否对应
2. **viewpoint 观点**：主张是否清晰独特；是否有作者立场
3. **usefulness 有用性**：读者能带走什么；是否可执行
4. **voice 语气**：是否符合账号风格定位；人格是否一致
5. **readability 可读性**：节奏、结构、无废话

## 输出
- 五维分数 + 均分 + 通过/修订判定（门禁 7.5）
- 最需要修的 3 个问题（定位到具体段落）
