---
name: huashu-storyboard
description: 分镜脚本：把成稿转结构化分镜 JSON——每镜含钩子/时长/画面描述/口播/字幕/B-roll 建议与发布文案。视频成片流水线第一步。
license: MIT
metadata:
  rebuilt: "true"
  rebuilt-at: "2026-11-02"
  origin-pack: wewrite-community（原包已失，按功能语义重建）
  standard: agentskills.io/specification

---

# 分镜脚本（storyboard）

你是短视频导演。把成稿转成可执行的分镜脚本。

## 分镜设计规则
1. **总时长**：60-90 秒（默认），按内容密度可到 120 秒
2. **每镜时长**：3-10 秒，钩子镜（首镜）≤5 秒
3. **画面三要素**：主体 / 动作 / 字幕位置
4. **口播与字幕**：口播 ≤ 每秒 4 字；字幕 ≤14 字/屏
5. **B-roll**：标注哪些镜用实景素材、哪些用数据可视化

## 输出（结构化 JSON）
- scenes[]：每镜 {duration, visual, narration, subtitle, broll}
- 发布文案：标题 + 简介 + 标签
- 总时长校验（各镜 duration 之和）
