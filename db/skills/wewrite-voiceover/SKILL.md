---
name: wewrite-voiceover
description: 图文转口播稿：把成稿转成适合 TTS 朗读或真人出镜的口播版本（口语节奏 / 气口 / 时长预估）。做播客或视频旁白前使用。
license: MIT
metadata:
  rebuilt: "true"
  rebuilt-at: "2026-11-02"
  origin-pack: wewrite-community（原包已失，按功能语义重建）
  standard: agentskills.io/specification

---

# 口播稿改写

把成稿转写为口播版本。

## 转换规则
1. **口语化**：书面语全部转口语；[n] 标记改为「根据某某报道」
2. **气口**：每 2-3 句一个自然停顿点
3. **时长**：中文语速 240 字/分钟，标注预计时长
4. **开场钩子**：前 10 秒必须抛出核心悬念
5. **收尾**：行动召唤或金句收束

## 输出
- 口播全文 + 预计时长 + 分段气口标记
