# RadarForge 内容质量升级方案——文章 / 配图 / 视频三线

> 状态：**待审核**（决策点见第八章，其余章节为已论证的实施设计）
> 依据：用户反馈三条（文章篇幅少/死板/未用 skills、配图质量差应优先大模型生图、视频与图片生成质量差并指定参考 [q253595422/dsh-imagegen-video](https://github.com/q253595422/dsh-imagegen-video)）+ 本地代码取证 + 外部调研（论文 2 篇、开源项目 10+）
> 前置：七问十二项（P0+P1+P2）已全部落地并推送远端；本方案是下一阶段的**质量升级**专项，不推翻既有架构

---

## 执行摘要

三条用户抱怨经代码取证**全部成立**，且各自根因明确：

| 抱怨 | 直接根因（代码级） | 升级主线 |
|---|---|---|
| 文章篇幅少、死板 | 字数被硬钳制在 1200~2000 字；所有文章共用一套叙事骨架；13 个 wewrite/huashu 技能**从未接入主产线**（运行时走硬编码模块，DB 里 19 篇文章只有 1 条 skill 运行记录） | 线 A：SKILL 接管产线 + 篇幅三档 + 叙事骨架多样化 + 两轮研究循环 |
| 配图质量差 | 生图提示词=一句概念+固定风格 token（「现代扁平插画风」全家桶）；图文线**无 VLM 审图**；WAF 拦截后**静默降级无图** | 线 B：提示词工程管线 + 风格包 + VLM 审图闭环 + 3774 条模板库 + 多通道回退 |
| 视频/图片生成质量差 | 默认通道 `local`（SVG 场景卡代码动画而非模型视频）；Agnes 通道默认关闭且纯文生（**无首帧图**）；720P flash 档 | 线 C：AI 首帧 i2v 混合通道 + 导演规划器 + 协议族抽象 + 账号池限流 + 1080P |

外部调研的核心结论：**竞争与质量差距都在编排层，不在模型层**（对 GitHub 50+ 条开源视频流水线的生态综述结论）。dsh-imagegen-video 的做法（协议族请求整形、提示词增强模型、视频导演规划、模板库、降级不消失哲学）可移植；斯坦福 STORM（多视角提问驱动大纲）与 AgentCPM-Report 的 WARP（起草-深化交替、大纲动态修订）直接回答「文章怎么写长、怎么不死板」。

实施分三批（约 12 个工作日当量）：批次一速效（SKILL 接管+篇幅三档+提示词工程+VLM 审图，3 日）→ 批次二资产与通道（风格包+模板库+多通道+骨架+研究循环，4 日）→ 批次三视频升级（AI 首帧通道+导演规划+协议族+池+画质，5 日）。验收全部量化（第六章）。

---

## 第一章 问题定位：三条抱怨的代码级取证

### 1.1 「文章篇幅太少、太死板」

**篇幅铁证（字数被四处钳死）**：

- `src/lib/runtime/skills/radar-write.ts:184`——初稿铁律直接写死「4. 字数 1200~2000 字」；
- `src/lib/runtime/skills/radar-outline.ts:50`——大纲指令「words 是字数预算，合计 1200~2000」；
- `radar-outline.ts:101`——解析层 `Math.min(500, Math.max(100, ...))` 把每节字数钳在 100~500；
- 基线实测：eval50 已完成的 4 题成稿 1378~1940 字——**天花板就是 2000**。

**死板铁证（单骨架同构）**：所有文章都是「# 标题 + 4~6 个 ## 小节」，每节内部「论点+证据+小结」同构（`radar-outline.ts:55` 的节结构模板）。新闻快讯、深度分析、争议话题、实操教程全部一个模子。人格有 7 套（`radar-write.ts:17-88`）但只改语气不改结构。

**skills 未接管的铁证**：

- 主产线 `src/lib/runtime/run-manager.ts`（九步流水线：brief→claims→大纲→分节初稿→审稿→断言核验→配图→封面→排版）**完全不 import `skill-loader`**——九步各自由硬编码的 `src/lib/runtime/skills/radar-*.ts` 驱动；
- `db/skills/` 里 13 个技能（wewrite-brief / wewrite-fact-check / wewrite-review / wewrite-polish / wewrite-layout / wewrite-title / wewrite-voiceover / wewrite-draft / wewrite-csdn / wewrite-xiaohongshu / huashu-director / huashu-storyboard + agnes）是按功能语义重建的，与 radar-* 模块一一对应却**互不引用**——用户在技能中心看到的是「展示件」；
- DB 证据：AgentRun 19 个 article 类型 vs **仅 1 个 skill 类型**——技能从未实际参与成稿。

**研究深度不足**：claims 取证每条只做单轮 `searchWithFallback`，无补搜循环、无视角差异（对比 STORM：先模拟多专家多轮提问再写）；tune 调优样本仅 3 题（m01~m03），证据薄弱。

### 1.2 「配图质量差、没用大模型生图」

平台**有**生图能力（z-ai SDK 生图，1344×768），质量差的根因在提示词与闭环缺失：

- **提示词极简**：`radar-image.ts:178` 的 `ILLUSTRATION_STYLE_TOKEN` 是全局唯一风格——「现代扁平插画风，几何构图，蓝灰科技配色」——无论写 AI 政策还是写显卡评测，全部同一张脸；正文插图 prompt = 节配图概念一句话 + 这个固定 token，无构图/光线/色调/画幅设计，无负面词；
- **图文线无 VLM 审图**：`src/lib/gateway/vlm.ts`（glm-4.5v 读图判 pass/issues/advice）**只用于纯图线**（run-manager.ts:839,893，未过带建议重生一次）；图文线的正文插图与封面**生成即采用，无任何质检**；
- **静默降级**：`zai-image.ts:75` 沙箱 WAF 偶发 405，重试 2 次失败后**静默放弃**——读者看到无图文章，用户（你）看到的是「配图质量差」却不知是没生成；
- **版式卡与生图职责混淆**：card-engine 的 HTML 截图卡（editorial/swiss 两系）观感固定，被当成「配图质量差」的一部分背锅——实际它适合数据卡，不适合意境图。

### 1.3 「视频和图片生成制作质量太差」

- **默认产出是代码动画而非模型视频**：`src/lib/settings.ts:114` 视频通道默认 `channel:"local"`，Agnes 默认 `enabled:false`（:104）——除非用户手动改配置，实际成片是 SVG 场景卡（sharp 栅格化）或 Canvas 逐帧动画 + ffmpeg 拼接；
- **Agnes 通道无首帧**：`video.ts:414` 提交 `mode:"text"` 纯文生视频——没有关键帧图参考，画面完全听天由命（对比 dsh-imagegen-video：keyframe/reference 双模式 + 参考图带 role）；
- **画质档位低**：默认 `agnes-video-2.5-flash`、720P、单镜头 4~12s；
- **BGM 是合成音**：本地 ffmpeg `aevalsrc` 生成的正弦波混音，一听就是「程序生成的」；TTS 失败降级为静音。

---

## 第二章 外部调研综述

### 2.1 用户指定参考：dsh-imagegen-video 深读

npm 拉取 `@q253595422/dsh-imagegen-video@1.17.0` tgz（4.1MB）+ 本地 docs 副本（README/CHANGELOG 1258 行/3 份契约文档）交叉分析。核心可移植做法：

1. **协议族（family）抽象**：不做 OOP 适配器——模型 id 前缀判族 + 每族独立请求整形；别名先归一成真实 id 再读能力。图像侧预置 9 渠道（OpenAI 兼容 Images / Chat 网关 / xAI Grok / Nano Banana / Seedream 方舟 / Qwen-Image / GLM-Image / MiniMax / Agnes）；**面板按模型真实能力提前拦截**（grok/nanobanana 单图、Seedance fast≤720p）而不是发出去吃 400；
2. **提示词增强模型（promptModel）**：任意 `/chat/completions` 端点做提示词改写，留空复用生图渠道——**无新密钥成本**，这是「提示词工程管线」的参考原型；
3. **视频导演规划（video-director + POST /video/plan）**：一句话拆多镜头（景别/光线/运镜/风格，结构参照 Wan2.2 `--use_prompt_extend`）；**预览不耗渲染费、预览即所提交**；失败/超时/非 JSON 降级离线规则规划并标注来源；
4. **模板库 8 源 3774 条**：结构 `{id, title, prompt(中英双语), category, categoryZh, styles, scenes}`，构建期钉 commit 快照，许可逐一署名于 THIRD_PARTY_NOTICES.md——**已拿到全量 JSON，可直接引入**；
5. **工程哲学**：诊断环形缓冲（200 条、密钥脱敏、视频 submit/poll/download 三腿分相）+「降级不消失」（代码生成答非所问→降级标题卡并标 degraded）+ 资源上限全显式；
6. **视频 5 协议族**：Agnes（text/**keyframe**/reference 三模式，每账号 1 任务/分钟、429 退避 6s、10min deadline）、方舟 Seedance（参考图带 role）、comemoe、Grok、通用 OpenAI 兼容（含 `GET /videos/{id}/content` 回退）；
7. **账号池限流**（相邻项目 agnes-multimodal，本地 `repos/dsh-agnes-multimodal/lib/index.js:566-699` 有完整可读实现）：RPM 滑窗 + 429/401 熔断冷却 + round-robin + 批量容量=账号数×10。

它**没有**的（我们的差异化机会）：VLM 自动审图、成本统计、TTS/配乐链路（显式 `generate_audio:false`）——前两者恰是我们已有资产（vlm.ts、run 报告体系）。

### 2.2 长文写作质量：论文与开源

- **斯坦福 STORM**（NAACL 2024，28k star）：核心论断——研究质量瓶颈在**写前探索**而非成稿。多视角模拟（领域专家/监管分析师/从业者人设）先多轮提问补盲区，再固化层级大纲，分节写作时每节独立喂检索片段，最后编辑去冗余。实测平均 8200 字、引用准确率 92%；
- **AgentCPM-Report**（CoRR 2026，8B 本地模型）：提出 **WARP（Writing As Reasoning Policy）**——批判 plan-then-write 范式的「insight ceiling」（大纲冻结后写手只是执行器，结构性正确但智力浅薄）；改为**起草与深化交替**，写的过程动态修订大纲。对我们的启示：deep 档长文不应一次性冻结大纲，写作中段允许大纲演化；
- **GPT-Researcher**（DeepResearchGym 三项第一）：8 Agent 编辑部（planner/researcher/reviewer/reviser/writer/fact-checker…）——与我们九步流水线结构神似，可借鉴其 **reviewer→reviser 触发定向补搜**（评审发现证据不足→只对该论点补检索，不整篇重来）。

### 2.3 视频生成开源生态

对 GitHub 50+ 条开源流水线的综述（pixo.video，2026-09）结论直接引用：**「几乎没有人还在模型层竞争——模型都是租来的，竞争完全转移到编排层」**。分三阵营：agent 技能包（OpenMontage 56k star）、一站式平台（MoneyPrinterTurbo 135k star）、导演画布。MoneyPrinterTurbo 天花板（「素材库画面全国上万个号在用同一批」）验证了我们不走素材拼装、走 **AI 生成画面**路线的正确性；NarratoAI 的「剪映草稿导出」（AI 粗剪+人工精修）是务实的质量兜底思路；Pixelle-Video 的「ComfyUI 工作流+HTML 模板」与我们的 card-engine+ffmpeg 架构同构。HeyGen 开源的 HyperFrames（43.9k star）「Write HTML. Render video. Built for agents.」佐证 HTML→视频的合成层路线。

---

## 第三章 线 A：文章内容质量升级

### A1 SKILL 接管产线（单一事实源改造）

**目标**：db/skills 的 SKILL.md 成为提示词主体的唯一事实源，代码退化为「编排+变量注入」——用户改 SKILL.md 即改行为，技能中心从展示件变成真器官。

**设计**：
- `runtime/skills/radar-*.ts` 各步骤的 prompt 主体（人格铁律、结构要求、审稿维度、排版规则）**下沉**到 `db/skills/<对应技能>/SKILL.md`，ts 模块只保留：变量占位注入（主题/claims/大纲/风格档）、JSON 解析与钳制、步骤编排；
- 变量注入协议用现成的 frontmatter+占位符约定（`{{topic}}`、`{{claims}}`、`{{outline_json}}`…），与 P2-1 的技能安装体系共用解析层；
- 13 个技能与九步流水线的映射关系显式化：wewrite-brief→①、wewrite-fact-check→②、（新增 outline 技能）→③、wewrite-draft→④、wewrite-review→⑤、（断言核验并入 fact-check 二段）→⑥、配图见线 B→⑦、wewrite-title→⑧、wewrite-layout→⑨；wewrite-voiceover/csdn/xiaohongshu/huashu-* 保持为「下游改编技能」由用户手动或自动触发；
- 用户位技能（`~/.radarforge/skills`）同名可**覆盖**产品库版本（P2-1 已有启停/目录优先级机制，补「覆盖提示词」语义）。

**验收**：删除 db/skills 任意一个 SKILL.md，对应步骤明确报错（不静默回退）；改 SKILL.md 中字数指令 → 成稿字数随之变化（A2 联测）。

### A2 篇幅三档制

**设计**：SettingKV `article:lengthTier` = `short | medium | deep`（默认 medium，可按 run 覆盖）：

| 档位 | 总字数 | 节数 | 每节预算（outline words 钳制上限） | 定位 |
|---|---|---|---|---|
| short | 1200~2000（现状） | 4~6 | 100~500 | 快讯/日报 |
| medium | 2500~4000 | 6~9 | 200~700 | 默认，深度资讯 |
| deep | 4500~8000 | 8~14 | 300~1200 | 封面级深度稿 |

- 同步修改四处钳制点（radar-write.ts:184 铁律、radar-outline.ts:50/:101 钳制、brief 任务书字数字段）；
- 分节初稿改为**逐节生成+逐节校验**（字数不足±20% 自动带「本节论点+证据」重生成一次，而非整篇重来）；
- **上下文管理**：deep 档逐节生成时只喂「全局 brief+大纲+本节 claims+前文摘要滚动窗（前 2 节的 200 字摘要）」，避免 14 节文章把上下文撑爆——这是长文质量的技术底座。

### A3 叙事骨架多样化

**设计**：brief 阶段新增「骨架选择」——按内容类型自动选 + 用户可强制指定，5 种骨架模板入库（db/skills 新增 skeleton 定义或并入 wewrite-brief）：

1. `news-brief` 快讯速览（导语倒金字塔+要点清单+影响评估）；
2. `deep-analysis` 深度解析（背景→机制→证据链→反方观点→研判）——**反方观点为必选节**，直接治「死板」；
3. `debate` 争议辨析（正方证据→反方证据→交锋点→条件化结论）；
4. `tutorial` 实操教程（问题→步骤→坑点→验收）；
5. `roundup` 盘点清单（入选标准→逐项评述→横向对比表）。

骨架决定节的 heading 模式与节内结构模板（替换现有同构「论点+证据+小结」）；人格 7 套保持调语气，骨架管结构，风格包管美学（线 B）——三者正交。

### A4 两轮研究循环 + 大纲演化（deep 档）

**设计**（分档启用，控制成本）：
- **第一轮**（现状保留）：claims 逐条检索；
- **gap 分析**（medium+）：检索完成后 LLM 对照大纲找「证据不足的论点」，生成 ≤5 个补搜问题（STORM 式：从不同视角——从业者/监管/竞品/历史案例——提问）；
- **第二轮补搜**：只对 gap 论点定向补搜（GPT-Researcher 的 reviewer→reviser 定向补搜模式），新证据并入 claims 池；
- **大纲演化**（deep 档，WARP 思想）：分节写到 40% 时允许一次「大纲体检」——LLM 依据已写内容与新证据提出大纲增删/合并建议（结构化 diff），应用后继续写剩余节；medium/short 不启用（成本与稳定性权衡）。

### A5 文风校准扩样

tune 调优样本从 3 题扩到 10 题、覆盖三档篇幅与至少 4 种骨架；调优对象从「分节初稿」扩到大纲指令与 gap 分析指令。eval50 续跑时按新档位重测基线（旧基线 8.225 只对应 short 档）。

---

## 第四章 线 B：配图质量升级

### B1 提示词工程管线（核心，参考 promptModel + 导演规划）

**新增模块** `src/lib/runtime/illustration-director.ts`：把「节配图概念一句话」升级为完整生图提示词。

- 输入：文章主题+骨架+节内容摘要+风格包（B2）+目标画幅；
- LLM 生成结构化提示词：`{主体描述, 构图(视角/景别/布局), 色调与光线, 风格引用, 画幅, 负面词}`——中文主体+英文翻译版（生图模型对英文 prompt 响应普遍更好，模板库的中英双语结构即为此设计）；
- 复用现有 LLM 通道（zai-llm SDK 免密钥），**无新密钥成本**（dsh-imagegen-video promptModel 同款决策）；
- 失败降级：LLM 不可用时回退「概念+风格包 token」的现行拼接并**标注来源=legacy**（降级不消失）。

### B2 风格包体系

`ILLUSTRATION_STYLE_TOKEN` 单风格 → `db/asset/image-style-packs.json`，首批 8 包：扁平几何（现款）、新拟物、3D 渲染（Blender 风）、赛博霓虹、水墨淡彩、杂志编辑插画风（The Economist/New Yorker 系）、等距轴测、像素复古。每包含：中文 token、英文 token、负面词、适用骨架与人格标签。选择逻辑：人格标签自动匹配 + run 级覆盖 + 设置中心默认值（内容策略分区加「默认画风」项）。

### B3 VLM 审图闭环扩展到图文线

- 正文插图与封面接入 `vlm.ts` 审查（与纯图线同协议：pass/issues/advice）；未过→带 advice 重生一次（提示词由 director 修订）；二次未过→采用并标注 `vlm:failed`（诚实留痕，不静默）；
- 通过率写入 run 报告（B5 通道回退统计同页），健康中心「内容策略」区加配图质量卡片。

### B4 提示词模板库（3774 条，dsh-imagegen-video 直接资产）

- `src/templates/*.json` 8 文件入仓 `db/asset/image-prompt-library/`，保留原分类与双语结构，THIRD_PARTY_NOTICES 逐源署名（原包已备好署名文件，随迁）；
- 用法是**检索式**：按文章主题与风格包标签做相似度/关键词匹配取 top-3 作为 director 的 few-shot 参考或改写基底——不是让用户翻模板库，是让管线自己抄好作业；
- 检索实现用简单关键词倒排（不引向量库，避免重依赖）。

### B5 生图多通道回退链（修「静默降级」）

显式链：`zai SDK 生图 → agnes-image（免费池，含账号池限流）→ 自定义 OpenAI 兼容端点（doubao-seedream-3 配置位已存在）`。每通道独立超时与重试，**每次回退在 run 报告留痕**（channel 链+各环节耗时+失败原因），终结「配图差=没生成」的黑盒。设置中心「模型与密钥」分区生图卡显示通道链顺序（可拖拽调序）。

### B6 配图密度与排版职责分离

- 密度分档：short=封面+0~1 图、medium=封面+2~3 图、deep=封面+4~6 图（每 2~3 节一图）；
- **职责分离原则**：数据密集节（对比/趋势/份额）用 card-engine 数据卡（HTML 截图，信息精确）；意境/场景/概念节用 AI 生图（美感优先）——骨架节定义时标注 `illustration: chart | scene | none`，管线按标注分派。封面一律 AI 生图（B1 提示词工程）。

---

## 第五章 线 C：视频质量升级

### C1 AI 首帧混合通道（核心）

**现状**：hybrid 通道=「code 主轨（SVG 场景卡）+ model 插播」。**升级为「AI 首帧主导轨」**：

```
口播稿/文章 → 导演规划器(C2) 拆分镜
  → 每分镜：B1 管线生成首帧图（1280×720 / 720×1280 按画幅）
  → agnes-video keyframe 模式 i2v（首帧图+运动描述提示词）
  → ffmpeg 合成：i2v 片段序列 + TTS 配音 + 字幕 + BGM(C5)
  → 代码动画降级为「转场点缀/数据可视化插播」（保留 motion 风格作过场）
```

- 首帧图质量由线 B 保障（风格包与文章一致→**视频画面风格自动与文章统一**，这是「图文章视频风格一致性」的免费收益）；
- i2v 提示词=导演规划器产出的运动描述（运镜/时长/动态元素），不再是「visual+口播要点截断 500 字」的粗糙拼凑（video.ts:414 现状）；
- 降级链完整：agnes 不可用→回退现 local 通道并**在成片元数据标注通道构成**（`segments: [{source: "i2v"|"code", …}]`）。

### C2 视频导演规划器（移植 video-director 思想）

`src/lib/runtime/video-director.ts`：LLM 把口播稿拆结构化分镜计划 `{shots: [{duration, 口播段落, 首帧提示词(走 B1), 运动描述(推拉摇移/主体动作), 转场}]}`；

- **预览即所提交**：分镜计划可先渲染缩略 storyboard 给用户确认（run 详情页），确认后才花 i2v 费用；
- 失败/超时/非 JSON → 降级离线规则规划（按句切分+固定运镜轮换）并标注 `planner: rule-based`；
- 规划只收紧参数不放大（时长/镜头数上限钳制）——移植其「规划不扩张」纪律。

### C3 视频协议族抽象

`src/lib/gateway/providers/video/` 重构为协议族模式（图像侧同步受益）：

- `family.ts`：id 前缀判族（agnes-* / ark-seedance-* / openai-compat-*）+ 别名归一 + 能力元数据（分辨率上限/时长范围/参考图支持/音频支持）；
- 每族独立请求整形器：agnes（text/keyframe/reference 三模式）、方舟 Seedance（预留，参考图带 role——**本期只留接口不接 key**）、通用 OpenAI 兼容（`GET /videos/{id}/content` 回退）；
- UI 按能力元数据提前拦截（分辨率/时长超限时收起选项而非提交吃 400）。

### C4 账号池与限流（移植 agnes-multimodal）

`repos/dsh-agnes-multimodal/lib/index.js:566-699` 的实现直接移植为 `src/lib/gateway/providers/agnes/pool.ts`：RPM 滑窗（每账号 1 任务/分钟）+ 429/401 熔断冷却 + round-robin + 池容量=批量并发上限。池空/全熔断时 UI 显式指引（「Agnes 池为空，请在设置中心添加账号或切换通道」），**不再静默落回 local**。

### C5 画质与音频升级

- 分辨率：设置项增加 1080P（agnes 支持档位时下发，能力元数据驱动）；时长滑杆已有保留；
- **BGM**：aevalsrc 合成音 → 内置 6~8 首无版权音乐资产（按情绪标签：科技/紧张/舒缓/悬念，ffmpeg 淡入淡出混音）+ 预留 AI 配乐接口；
- **TTS**：失败降级从静音 → 「字幕主导模式」显式标注 + 建议重试入口；
- 字幕：时间轴与 TTS 对齐已有，补字体/描边样式 3 套预设。

### C6 合成诊断可观测

视频合成引入诊断环形缓冲（100 条/run）：submit/poll/download/ffmpeg 四腿分相记录耗时与错误，run 详情页视频区显示每镜头来源与失败段定位——对齐 dsh-imagegen-video 的「三腿分相可定位『没提交 vs 没轮询到』」。

---

## 第六章 实施排期与验收标准

### 6.1 三批排期

| 批次 | 内容 | 工作日当量 | 关键交付 |
|---|---|---|---|
| 一·速效 | A1 SKILL 接管 / A2 篇幅三档 / B1 提示词工程 / B3 VLM 审图扩展 | ~3 | 篇幅与提示词两条最痛的根因先除 |
| 二·资产与通道 | B2 风格包 / B4 模板库 / B5 多通道回退 / B6 密度与职责分离 / A3 骨架 / A4 研究循环 / A5 调优扩样 | ~4 | 配图体系成型；文章结构活起来 |
| 三·视频 | C1 AI 首帧混合 / C2 导演规划 / C3 协议族 / C4 账号池 / C5 画质音频 / C6 诊断 | ~5 | 模型视频成为主轨 |

每批收口跑全量回归（十二套离线 + 六套在线 + 浏览器冒烟）+ 提交推送；测试新增：`test-a-length.ts`（三档字数与逐节校验）、`test-b-illustration.mjs`（director 提示词结构 + VLM 闭环 mock + 通道回退链）、`test-c-video.mjs`（导演规划 JSON 契约 + keyframe 请求整形 + 池限流模拟）。

### 6.2 量化验收

- **文章**：deep 档 ≥4000 字达成率 ≥90%；eval50（新档位重测）五维均分 ≥8.4（旧基线 8.225）；10 类题材覆盖 ≥4 种骨架且每骨架 ≥2 题；引用无据率 ≤30% 维持；
- **配图**：一次生成 VLM 通过率 ≥75%、重生后累计 ≥90%；多通道生图**非降级成功率 ≥95%**（WAF 场景靠回退链达成）；deep 文 ≥3 张 AI 图且数据节用数据卡；
- **视频**：Agnes 可用时成片 i2v 片段占比 ≥80%（点缀性 code 动画不计）；1080P 选项生效；run 详情可见分镜来源构成与失败段定位；
- **工程**：tsc/eslint 零；全量回归全绿；run 报告含配图通道链/视频诊断（可观测性验收）。

---

## 第七章 前置依赖、风险与降级

1. **SEARCH_KEY 必须先恢复**（你操作）：A4 两轮研究循环、B4 模板检索的主题理解增强都依赖真实检索；当前演示降级链下 A4 只能走单轮+规则 gap 分析（诚实降级并标注）；
2. **LLM 配额**：deep 档单篇 token 消耗约为 short 的 3~4 倍（逐节生成+gap+大纲体检+提示词工程叠加）；配额 30 次/10min、日池 220 → 单日 deep 上限约 5~8 篇；eval50 续跑与生产互斥排期；
3. **Agnes 免费池吞吐**：每账号 1 任务/分钟、视频 10min deadline——一个 8 分镜视频串行需 ~10 分钟/账号；池规模建议 ≥3 账号起；**账号来源需要你确认**（现有池是否够用/是否提供新账号）；
4. **模板库许可**：8 源 3774 条按原包 THIRD_PARTY_NOTICES.md 署名引入；不修改原文保持署名干净，改写衍生单独标注；
5. **WAF 与网络**：沙箱生图端点偶发 405——B5 多通道是**必修**而非优化；agnes 国际站连通性需实测（设置中心一键测通已有）；
6. **降级哲学全局统一**：所有新环节失败都「显式降级+标注来源」，禁止静默吞错——延续七问整固的诚实留痕纪律。

---

## 第八章 待你拍板的决策点（方案审核项）

1. **默认篇幅档位**：medium（2500~4000，推荐——质量/成本平衡）还是 deep（4500~8000，封面级但单日产能掉到 5~8 篇）？
2. **模板库引入方式**：全量 3774 条带署名（推荐——检索式使用，资产完整）vs 精选 ~500 条改写（轻但丢长尾）？
3. **视频默认通道**：改为 `auto`（Agnes 优先、失败回退 local，推荐）还是维持 `local` 由你手动切？
4. **Agnes 账号池**：现有池规模是否够？要不要你提供 2~3 个新账号做吞吐保底？方舟 Seedance（需火山方舟 key）本期只留协议接口不接通——OK 吗？
5. **批次顺序**：按「文章→配图→视频」三批推进（推荐，批次一最快见效）还是视频优先？
6. **风格包首批 8 款**（B2 清单）有没有要增删的审美方向？

> 以上任何一条改主意都只影响对应章节参数，不动架构。方案通过后我按批次一动工，每批完成后推送+汇报。
