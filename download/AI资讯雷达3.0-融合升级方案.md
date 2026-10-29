# AI 资讯雷达 3.0 · 融合升级方案

**基于 AI 搜索打造的自媒体工作流平台**
**技术底座：pi-ai 供应商体系 × wewrite 内容方法论 × 双风格视频线 × Agnes 免费多账号 × dsh 可视化融合**

---

## 0. 六项目研究结论（本方案的事实基础）

| 项目 | 定位 | 对本平台的价值 | 引入方式 |
|---|---|---|---|
| **imraywang/wewrite**（3.5k★） | 公众号内容全流程 Skill，一句话跑完内容管道 | ① **18 套排版主题**（vs 我们现有 3 套）② **容器语法**（dialogue/timeline/callout/quote/steps/highlight/summary 九种富组件）③ 微信兼容修复清单（外链转脚注、CJK-Latin 空格、标点移位、暗黑模式）④ `learn-theme` 从任意公众号 URL 学习新主题 ⑤ 热点抓取+搜狗微信搜索+SEO 评分+阅读数据回填 | 借鉴架构 + 移植主题库（MIT 协议），不引入其 Python CLI |
| **alchaincyf/huashu-art-motion** | 36 种艺术风格 × 9 种解说语法的代码动画引擎（Canvas + Playwright + ffmpeg） | 视频线**风格 A 升级**：把现有 SVG 场景卡升级为艺术风格动画（梵高/敦煌/包豪斯/8-bit 等 53 张风格配方卡 + Kurzgesagt/Vox/白板等解说语法） | 引擎思路借鉴：风格配方卡 = JSON spec + 渲染参数，帧精确、横竖屏、透明底 |
| **alchaincyf/huashu-motion** | 商业级产品宣传片（代码动画 + ABC 记谱作曲配乐 + 浏览器可视化编辑器） | ① 「三个方向挑→写整片→自己写谱配乐」的创作流 ② **指着画面改**的编辑器（点击元素→评论→agent 只改那一处→版本历史撤销）③ 23 种音效与动画同步 | 「指着改」交互模式引入视频工作台；作曲配乐列为远期项 |
| **q253595422/dsh-imagegen-video** | DSH 插件：无限画布式图/视频一体生成工作室 | ① **视频供应商清单**：火山 Seedance（doubao-seedance-2-0-260128/fast/pro）、Agnes video、Grok imagine、comemoe ② API 协议（提交→轮询→取 URL）③ **分镜节点化 + 接尾帧 + 时间线拼接**的工作流模型 | 供应商协议移植进 Provider 层；分镜节点化引入视频工作台 |
| **xuan0708191-sketch/dsh-agnes-multimodal** | Agnes 多模态免费模型插件 | ① **免费供应商**：agnes-image-2.0/2.1/2.5-flash（1K-4K 免费）、agnes-video-2.5-flash（免费）、agnes-2.5/3.0-flash 文本免费 ② **多账号轮询**：N 账号 = 视频N次/分钟、图片并发10×N（限流槽位）③ 端点：中国站 `api.agnes-ai.cn/v1`、国际站 `apihub.agnes-ai.cn/v1`，GET /models 零成本校验 | **以供应商方式接入本平台**，多账号可配置（用户明确要求） |
| **earendil-works/pi（pi-ai）**（86k★） | 统一多 Provider LLM API + Agent 运行时（5 包 monorepo） | ① **pi-ai 统一 LLM 层**：30+ Provider 注册表，`getModel + streamSimple` 一次编写随处运行 ② **models.json 自定义供应商**（providers.{name}.baseUrl/api/apiKey/models）③ SKILL.md 技能自发现机制 ④ Session Tree + Compaction | 引入 `@earendil-works/pi-ai` 替换/包裹现有自研 registry，models.json 作为供应商配置协议 |

**关键判断**：我们的自研 Provider registry（`src/lib/gateway/registry.ts`）与 pi-ai 的 ApiProviderRegistry 思想同构，但 pi-ai 的供应商覆盖面（30+）、协议适配层（anthropic-messages / openai-responses / google-generative-ai 等原生协议）和 models.json 生态远超自研。**吸收 pi-ai 不是推倒重来，而是把「LLM 接入层」换成工业标准件，自有精力聚焦内容工作流本身。**

---

## 1. 四个问题直答

### 1.1 雷达和灵感池的区别是什么？能不能融合？

**现状定位（确实有冗余）**：
- 雷达 = **情报采集层**：话题监控（Topic）→ 早报生成（Report）→ 搜索验证（InboxItem），产出是「原始情报」
- 灵感池 = **选题管理层**：评分、状态流转（new→picked→done）、AI 刷新灵感

**冗余的证据**：AI 刷新灵感的燃料就是「雷达话题 + 近期早报」，两个 Tab 之间靠隐式数据流连接，用户感知上都是「找选题」，却要切两个页面。

**结论：融合为「情报中心」一个 Tab，双视图**：
```
情报中心（新）
├─ 左栏 · 监控线（原雷达）：话题管理 + 早报 + 信源速查
└─ 右栏 · 选题看板（原灵感池）：状态流转 + 评分 + AI 刷新灵感
```
数据流显式化：早报条目可「→ 转选题」，选题卡可「→ 查信源」（回查该选题相关的雷达情报）。这正是 wewrite 的 `wewrite-topic` 单 skill 内聚「热点+需求+评分+去重」的做法——**选题决策本来就是一个动作，不该拆两个页面**。

### 1.2 AI 搜索、图文、图片、视频全放一起，交互乱？

**病根**：当前创作台把「写前情报（搜索）」「图文流水线」「视频分镜/渲染」按**功能**堆叠，而用户的思维是**工作流阶段**。

**结论：IA 重构——按工作流阶段组织四个 Tab**：

| 新 Tab | 内容 | 不再出现 |
|---|---|---|
| **情报中心** | 监控线 + 选题看板 + AI 搜索（写前情报，结果一键转选题） | — |
| **图文创作台** | Run 看板 + 六步流水线详情 + 排版主题画廊 + 复制/发布 | 视频分镜、视频渲染（移走） |
| **视频工作台** | 从成稿一键发起：双风格选择 → 分镜 → 渲染 → 编辑器 → 下载 | 图文动作栏（只留「→ 去做视频」入口） |
| **供应商中心** | 全部模型配置（LLM/搜索/生图/视频/Agnes 账号池）+ 连通测试 | — |

原则：**每个 Tab 只回答一个问题**——情报中心答「写什么」，图文台答「怎么写好」，视频台答「怎么视频化」，供应商中心答「用什么引擎」。跨 Tab 只靠「→ 去做视频」「→ 转选题」这类单向推进按钮连接。

### 1.3 为什么设置不支持视频模型接入？两种风格动画在哪？

**现状承认**：配置中心只有 LLM/搜索/生图三卡；视频线只有「代码动画」一条路（SVG 场景卡 + TTS + ffmpeg），两种风格（huashu-art-motion 艺术动画 vs huashu-motion 产品宣传片）确实都没体现。

**结论：供应商中心新增「视频模型卡」+ 视频工作台提供「双风格 × 双引擎」四选**：

```
视频工作台发起渲染时：
├─ 风格 A · 代码动画（本地渲染，零成本，秒级可控）
│   ├─ A1 场景卡风（现有：品牌化 SVG 卡 + TTS 口播）
│   ├─ A2 艺术动画风（huashu-art-motion：36 艺术风格配方 + 9 解说语法）
│   └─ A3 宣传片风（huashu-motion：三方向挑 + 配乐 + 指着改编辑器）
└─ 风格 B · AI 视频生成（云端模型，真实感画面）
    ├─ B1 Agnes video（免费！多账号轮询提速）
    ├─ B2 火山 Seedance（doubao-seedance-2-0 系列）
    └─ B3 Grok imagine / 通用 OpenAI 兼容视频端点
```

### 1.4 是否有引入 pi-ai 框架？

**现状承认：没有引入**。现有 LLM 接入是自研（zai-llm SDK + custom-openai 兼容层），Provider registry 是自研的简单版。

**结论：引入 `@earendil-works/pi-ai` 作为统一 LLM 层**，理由三条：
1. **供应商免维护**：30+ Provider（DeepSeek/通义/Kimi/MiniMax/小米 MiMo/ZAI Coding Plan/OpenRouter…）开箱即用，新供应商不再需要我们写适配代码
2. **models.json 协议成熟**：自定义供应商 = 一份 JSON（baseUrl/api/apiKey/models 数组含 contextWindow/cost/compat），与 dsh 插件生态天然互通
3. **升级路径清晰**：pi-agent-core（Agent Loop + SKILL.md 自发现 + Session Tree + Compaction）为后续「对话式创作」铺路——Agent 说一句「写一篇公众号文章」跑全流程，正是 wewrite 的使用形态

**边界（诚实声明）**：pi-ai 是 Node 库，需确认其在我们运行时的打包兼容性（Next.js 16 server 端 import）；若打包受阻，则**抄协议不引包**——把 models.json 供应商协议 + ApiProvider 注册接口移植进自研 registry，接口签名对齐 pi-ai，未来可无痛换真包。

---

## 2. 3.0 目标架构

```
┌─────────────────────────────────────────────────────────────┐
│  形态一 · Web 工作台（Next.js 16，主形态）                      │
│  情报中心 │ 图文创作台 │ 视频工作台 │ 供应商中心 │ 技能/插件    │
├─────────────────────────────────────────────────────────────┤
│  形态二 · dsh 插件（DeepSeek Harness 侧边栏，快捷形态）        │
│  复用同一套供应商配置（models.json 协议）+ 同一套后端 API      │
├─────────────────────────────────────────────────────────────┤
│  能力层 · Skills（SKILL.md 自描述，agent 自发现）              │
│  radar-*（六步流水线）wewrite-*（排版/主题/容器语法）          │
│  huashu-*（双风格动画配方） video-*（AI 视频编排）             │
├─────────────────────────────────────────────────────────────┤
│  统一接入层 · pi-ai（或 pi-ai 协议兼容的自研 registry）        │
│  LLM: 30+ Provider │ 搜索: 元宝SearchPro │ 生图: zai/agnes/火山│
│  视频: agnes(多账号轮询)/Seedance/Grok │ TTS: 现有             │
├─────────────────────────────────────────────────────────────┤
│  状态层 · Prisma(SQLite)：Run/Article/Claim/Asset/SettingKV  │
│  + ProviderRecord（供应商健康/调用统计，已有）                 │
└─────────────────────────────────────────────────────────────┘
```

**与 2.0 的关键差异**：接入层从「三类静态卡」升级为「供应商注册表 + models.json 协议 + 多账号槽位轮询」；视频线从「单一代码动画」升级为「双风格四引擎」；IA 从「六 Tab 功能堆叠」收敛为「四 Tab 工作流」。

---

## 3. 信息架构重构细则

### 3.1 情报中心（雷达 ⊕ 灵感池）

- 左栏监控线：话题卡（关键词、活跃开关）→ 生成早报按钮 → 早报列表（含引用数、REAL/DEMO 徽标）→ 信源速查输入框
- 右栏选题看板：按状态分列（新选题/已采纳/已完成），卡片带 score 星级 + 所属话题 + 「查信源」回链
- **AI 搜索前置为情报中心顶栏**（全宽）：检索 → 结果卡（标题/摘要/信源/日期）→ 每卡「转选题」按钮；mode 徽标 REAL/DEMO 照旧
- 空态引导：「添加第一个监控话题」→「生成第一份早报」→「AI 刷新灵感」三步引导

### 3.2 图文创作台（收窄聚焦）

- 顶部：新建 Run（选题标题 + 人格 + 主题下拉**扩为 18 套**）+ 选题池快捷点选
- 中部：Run 看板卡片墙（状态/claims 数/版本/发布标记）
- 详情页：六步进度条 + brief + claims 账本 + 五维审稿 + 封面卡 + 成稿 MD + 排版预览 iframe + 动作栏（改稿/CSDN/小红书/口播稿/复制×3/发布/主题切换）
- **视频相关全部移除**，替换为单一「→ 去视频工作台」按钮（携带 runId 跳转）

### 3.3 视频工作台（新建）

- 入口：从图文台带 runId 进入，或直接粘贴 Markdown
- **第一步 · 风格选择**（卡片四选，配预览动图）：
  - A1 场景卡风（快，30 秒出片）
  - A2 艺术动画风（选 36 风格之一 + 9 解说语法之一）
  - A3 宣传片风（三方向关键帧挑一 → 整片）
  - B AI 视频生成（选供应商：Agnes 免费/Seedance/Grok）
- **第二步 · 分镜确认**：LLM 生成分镜表（沿用现有 storyboard 结构，A2/B 追加视觉风格字段）
- **第三步 · 渲染**：进度卡（stage/percent/audioMode 留痕机制沿用）
- **第四步 · 指着改**（A3/远期）：浏览器内点击画面元素 → 评论框 → agent 局部修改 → 版本历史
- 产出：MP4 播放器 + 下载 + 分镜脚本复制 + Asset 留痕

### 3.4 供应商中心（设置中心升级）

五卡扩展为六卡 + 账号池：

1. **LLM 大模型**（pi-ai 化）：内置引擎 / models.json 供应商列表（DeepSeek、通义、Kimi、MiniMax、小米、OpenRouter…下拉直选，key 填空即用）/ 自定义 OpenAI 兼容
2. **AI 搜索**：元宝 SearchPro key（现状保留）
3. **生图模型**：内置 SDK / Agnes（免费，联动账号池）/ 火山 Seedream / 自定义
4. **视频模型**（新）：Agnes video / 火山 Seedance / Grok imagine / 自定义轮询式端点；每卡带「测试连通」（Agnes 用 GET /models 零成本校验，视频类用最小提交）
5. **Agnes 账号池**（新，用户点名）：多账号列表（增删/启停/掩码显示），**槽位轮询**（N 账号 = 视频 N 次/分钟、图片并发 10×N），槽位状态可视化（当前轮到第几个、各账号限流倒计时）
6. **创作风格定位**（现状保留）

---

## 4. 供应商中心技术设计

### 4.1 models.json 兼容协议（pi-ai 风格）

```jsonc
// ~/.radar/models.json（或在 SettingKV 存 JSON 字符串）
{
  "providers": {
    "deepseek": {
      "baseUrl": "https://api.deepseek.com",
      "api": "openai-completions",          // pi-ai 协议类型
      "apiKey": "$DEEPSEEK_API_KEY",         // 环境变量引用
      "models": [
        { "id": "deepseek-v4-pro", "name": "DeepSeek V4 Pro",
          "contextWindow": 1000000, "maxTokens": 384000,
          "input": ["text"], "reasoning": true }
      ]
    },
    "agnes": {
      "baseUrl": "https://api.agnes-ai.cn/v1",
      "api": "openai-completions",
      "accounts": ["sk-acc1", "sk-acc2"],   // 扩展字段：账号池轮询
      "capabilities": ["text", "image", "video"],
      "models": [
        { "id": "agnes-2.5-flash", "price": "free" },
        { "id": "agnes-image-2.5-flash", "kind": "image", "price": "free" },
        { "id": "agnes-video-2.5-flash", "kind": "video", "price": "free" }
      ]
    }
  }
}
```

### 4.2 Agnes 多账号轮询（用户点名需求）

```
AccountPool
├─ slots: [{key, cooldownUntil, failCount, okCount}]
├─ acquire(kind): 取第一个可用槽位；全部冷却 → 返回最早解冻者 + 等待提示
├─ 汇报结果：成功 → okCount++；429/限流 → cooldownUntil = now + 60s
└─ 速率语义（对齐 dsh-agnes-multimodal）：
   视频提交：每账号 1 次/分钟（轮询间隔 = 60s / N）
   图片并发：min(10 × N, 8)（Node 侧实际上限）
```

UI 呈现：账号池表格（槽位号/key 掩码/状态●绿●黄/下次可用倒计时/累计调用），顶部「轮询状态：当前槽 #2，视频 2 次/分钟」。

### 4.3 视频供应商协议适配

对齐 dsh-imagegen-video 提炼的三种协议：

| 协议 | 提交 | 轮询 | 取结果 |
|---|---|---|---|
| **Agnes 式** | `POST /v1/videos {model,prompt,seconds}` | `GET /v1/videos/{id}` | `metadata.url` |
| **Grok 式** | `POST /videos/generations` | `GET /videos/{id}` | `video.url` + `video.duration` |
| **火山式** | `POST {baseUrl}/contents/generations/tasks` | `GET .../tasks/{id}` | `content.video_url` |

统一抽象为 `VideoProvider.submit(previewSpec) → taskId → poll(taskId) → url → download`，失败/超时诚实留痕（Asset.error），**绝不静默假装成功**。

---

## 5. wewrite 能力吸收清单（图文线增强）

| 能力 | 现状 | 3.0 目标 | 工作量 |
|---|---|---|---|
| 排版主题 | 3 套（radar/ink/cream） | **18 套**：professional-clean、minimal、newspaper、tech-modern、bytedance、github、warm-editorial、sspai、ink、elegant-rose、bold-navy、minimal-gold、bold-green、bauhaus、focus-red、midnight、impeccable、lobster-notes | 主题 YAML 化（`themeId → {色板/字号/间距/组件样式}`），render.ts 读注册表 |
| 主题画廊 | 无 | `wewrite gallery` 等价物：详情页「主题」按钮 → 18 主题并排预览（同一文章秒渲染）+ 一键应用 | 复用 relayoutForRun，画廊=iframe 网格 |
| 容器语法 | 无 | Markdown 里写 `:::callout tip` / `:::timeline` / `:::quote` / `:::steps` / `:::label` / `:::summary` 九种富组件 | render.ts 前置解析器（块级正则 → section 结构） |
| 微信兼容修复 | 部分（section 加固、[n] 上标） | 补齐：CJK-Latin 自动空格、标点移出 `</strong>`、ul/ol 转样式化 section、暗黑模式 data-darkmode 属性 | render.ts 修補函数 |
| learn-theme | 无 | 粘贴任意公众号文章 URL → 提取内联样式 → 生成自定义主题入库存 | 高难度，列为 P2（阶段二） |
| 热点/SEO/阅读回填 | 早报已有（元宝） | 搜狗微信搜索（同题密度）、SEO 评分、阅读数据回填反哺选题 | P2 |

**注意**：wewrite 的 10 skill（topic/write/review/learn）与我们的六步流水线在方法论上**本就同源**（brief→claims→审稿→飞轮），3.0 不重写流水线，只吸收排版与容器语法这两个纯增量。

---

## 6. 双风格视频线设计（用户点名「两种风格动画」）

### 6.1 风格 A · 代码动画（本地渲染，零 API 成本）

**A1 场景卡风（现有，保留为「快速档」）**：SVG 场景卡 + TTS + ffmpeg。60 秒成片，品牌一致性好，适合日更口播。

**A2 艺术动画风（huashu-art-motion 路线）**：
- 引入「风格配方卡」机制：`{styleId, palette, 母题动作[], 签名转场, 字体策略}` JSON 化
- 首批移植 8~12 个高辨识度风格（敦煌壁画、梵高星夜、包豪斯、8-bit、Rick&Morty 式线稿、白板、Kurzgesagt 扁平、3Blue1Brown 数学风）
- 渲染管线：配方 + 分镜 spec → Canvas（Playwright Chromium 无头渲染）→ 帧 → ffmpeg；现有 sharp/ffmpeg 依赖复用
- 解说语法影响字幕节奏与图表样式（9 种语法先落 3 种：白板、Kurzgesagt、财经图表）

**A3 宣传片风（huashu-motion 路线，阶段三）**：
- 创作流：读「产品/选题」→ 三个方向关键帧（LLM 产 3 套分镜+视觉方案）→ 用户挑一 → 整片渲染
- **指着改编辑器**：浏览器内 MP4 时间轴 + 画面点击 → 评论浮层（时间点/场景/选中元素）→ agent 局部重渲染该场景 → 版本树
- ABC 记谱配乐列为远期（无版权曲库问题，本地合成，但工作量大）

### 6.2 风格 B · AI 视频生成（云端模型，真实感）

- 供应商：Agnes（免费首选）/ Seedance / Grok / 自定义
- 工作流：分镜表 → 逐镜生成（prompt = visual + broll 字段，身份锚定提示词保持主角一致）→ 时间线拼接（ffmpeg concat + 转场淡入淡出）→ 叠加 TTS 口播音轨
- 多账号轮询提速：8 镜视频，Agnes 4 账号 ≈ 8 分钟内逐镜完成（单账号需 8 分钟轮询间隔）
- 降级链：Agnes 免费档 → Seedance → 代码动画 A1 兜底（「云端不可用时不阻断出片」原则延续）

---

## 7. 与 dsh 插件版融合

**原则：一套供应商配置，两种运行形态。**

1. **配置互通**：供应商中心导出/导入 models.json（pi-ai 协议）；dsh-agnes-multimodal 的账号配置与本平台账号池互认（同一 JSON 结构）
2. **Web 形态（主）**：全工作流——情报→选题→图文→视频→发布，多 Run 并行，适合日常生产
3. **dsh 插件形态（辅，阶段三评估）**：把「公众号出稿」做成 dsh 插件（对话式：'写一篇公众号文章'→ 调本平台 API 跑六步流水线 → 回传成稿链接）；无限画布（dsh-imagegen-video）与视频工作台分镜表共享 JSON schema，画布上的分镜节点可导出为本平台 storyboard 格式
4. **短期务实路径**：先做 Web 平台 + models.json 协议兼容（1 天工作量）；dsh 插件壳待 Web 端四 Tab 稳定后再评估

---

## 8. 实施路线

### Phase 4（IA 重构 + 供应商中心，~2 个工作日）
1. 雷达 ⊕ 灵感池 → 情报中心（数据不动，纯 UI 融合 + 早报「转选题」/选题「查信源」双向链接）
2. 创作台剥离视频 →「→ 去视频工作台」按钮（携 runId）
3. 视频工作台骨架（风格四选卡 + 分镜确认 + A1 引擎迁入 + 产出卡）
4. 供应商中心：视频模型卡 + Agnes 账号池（槽位轮询 + 状态可视化）+ models.json 导入导出
5. pi-ai 评估落地：打包兼容 → 真引入或协议移植（二选一，验收同口径）

### Phase 5（wewrite 吸收 + 双风格视频，~3 个工作日）
1. 18 主题入库（YAML 注册表）+ 主题画廊 + 创建/切换 UI 扩容
2. 容器语法解析器（九种 ::: 组件）+ 微信兼容修复补齐
3. A2 艺术动画引擎（首批 8 风格配方 + Canvas 渲染管线）
4. B AI 视频生成（Agnes/Seedance 双供应商 + 逐镜生成 + 拼接 + 降级链）

### Phase 6（dsh 融合 + 编辑器，远期）
A3 宣传片风 + 指着改编辑器 + learn-theme + dsh 插件壳 + 作曲配乐

### 每阶段验收基线（延续项目铁律）
- ESLint / tsc 零错误；API 全 200 零 5xx；浏览器 errors 零；375px 无溢出
- 新增功能各配一条 REAL 验证路径 + worklog 留痕 + 截图
- 降级必须诚实留痕（Asset.error / meta），禁止静默失败

---

## 9. 风险与边界（诚实声明）

1. **pi-ai 打包兼容未知**：Next.js 16 server 端 import 第三方 Node 库可能有坑 → 已备协议移植降级路径
2. **Agnes 免费是阶段性**：官方标注「阶段性优惠」，收费切换时账号池自动降级为普通供应商卡（限流语义保留）
3. **A2 艺术动画工作量真实存在**：36 风格全量移植不现实，首批 8 个；配方质量依赖视觉调试，逐风格验收
4. **AI 视频生成的可控性弱**：身份一致性（同一主角跨镜头）靠提示词锚定，效果不及代码动画稳定——这正是保留双风格路线的原因
5. **视频生成时长/内容审核**：云端模型有内容政策，涉政涉敏感选题会被拒——降级链兜底到 A1
6. **18 主题视觉质量**：从 wewrite 移植的是主题定义思路，视觉细节需逐套调校（bauhaus/midnight 等强风格主题的字体依赖需评估）

---

## 10. 一页纸总结

> **把「功能堆叠的六 Tab」收敛为「回答四个问题的工作流四 Tab」：写什么（情报中心=雷达⊕灵感池⊕AI搜索）、怎么写好（图文台+wewrite 18主题+容器语法）、怎么视频化（视频台=双风格四引擎：代码动画A1/A2/A3 + AI视频B）、用什么引擎（供应商中心=pi-ai协议+Agnes免费多账号轮询+视频模型卡）。**
> **接入层向 pi-ai 的 models.json 协议对齐，供应商配置与 dsh 插件生态互通；内容方法论继续走已验证的六步流水线+编辑飞轮，只吸收 wewrite 的排版增量；视频线从单路升级为「本地代码动画（零成本可控）+ 云端 AI 生成（真实感）」双路线，Agnes 免费模型以多账号槽位轮询方式接入成为默认免费档。**
