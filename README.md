<div align="center">

# 📡 RadarForge

**AI 资讯雷达 · 自媒体内容生产线**

[![中文](https://img.shields.io/badge/文档-中文-red)](README.md) | [![English](https://img.shields.io/badge/docs-English-blue)](README.en.md)

*Radar for intelligence, forge for content — from a raw signal to a published story.*

![Next.js](https://img.shields.io/badge/Next.js-16-black?logo=next.js)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-SQLite-2D3748?logo=prisma)
![Tailwind](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss&logoColor=white)

</div>

---

## 这是什么

RadarForge（AI 资讯雷达 2.0）是一个跑在浏览器里的**自媒体工作流平台**：它用 AI 搜索当雷达，持续扫描热点信号；再把信号锻造成成品——一篇带封面图的图文，或一条带配音的短视频。

一条流水线走完「选题 → 情报 → 成稿 → 配图 → 视频」，中间没有剪贴板，没有八个窗口之间的来回切换。

![主界面](download/assets/app-main.png)

## 核心能力

### 📡 情报雷达（搜索 + RSS 双底座）
- **AI 搜索**（元宝 SearchPro）：真实联网检索，不是模型幻觉
- **RSS 信源**：24 个默认 AI 资讯源（量子位/InfoQ/HN/OpenAI/DeepMind/arXiv…，探活修正后入库），有界并发刷新 + 双粒度新鲜度过滤 + **SimHash 跨源去重**，条目一键转选题池——先看见，才谈生产
- **主题追踪**：订阅你关心的领域，信号自动进收件箱
- **信源溯源**：每条资讯带原始来源链接，可核查、可引用；逐源拉取状态诚实留痕（失败不阻断）

### ✍️ 图文流水线（九步 · P0 质量管线）
brief 任务书 → claims 联网取证（关键词重合度）→ **大纲先行**（JSON：每节论点/证据编号/配图位）→ **分节初稿**（逐节聚焦写作）→ **跨家族审稿**（换 LLM 家族 · 成对比较裁决 · ≤2 轮）→ **原子断言核验**（FActScore 式逐条检索，无据率超阈值拦截发布）→ 正文配图 → 封面 → 微信排版（18 主题）

### 🖱️ 交互（P1）
**三步向导**（选题 → 人格卡片 → 确认预览，老手可切高级模式）｜**⌘K 命令面板**（跨线动作 + 最近 Run 直达）｜**指着改图文**（悬停任意小节 → 只重写该节 → 文章版本树）｜**运行前馈**（初稿生成中就展示任务书核心判断与大纲预告）｜详情页**稿优先**信息重排（证据链折叠进「为什么这样写」抽屉）

### 🎬 视频流水线（三通道 + 选题直出 + 混合通道）
两种源：**从图文成稿改编**（推荐）或**选题直出**（检索要点直接生成分镜，不必先写文章）；导演三方向 → 分镜 → motion 商业片 / art 艺术动画 / Agnes AI 模型 / **混合通道**（数据字排走代码动画、实景情绪走 AI 插播，成本 ≈ 纯模型 1/3）+ BGM + 指着改版本树

### 🖼️ 纯图线（生图 + 版式卡）
主题 → LLM 构图方案 → 批量生图（3 用途 × 5 风格 × 1~9 张）；**版式卡**（Editorial/Swiss 两版系 × 封面/金句/数据三模板，代码排版零生图成本）+ **VLM 质检闭环**（生成后读回判定，未过带 hint 重试）→ 画廊导出

### 📏 固定评测集 + 发布门禁 + 调优闭环（P0 度量层 → P1 调优层）
50 篇固定选题 × G-Eval 式五维量表（裁判跨家族优先）；发布前置门禁：审稿均分 ≥7.0 且断言无据率 ≤30% 才放行；**prompt 变体调优**（MIPROv2 精神子集）：变体 × 评测子集 → 评分 → 对比 → 推荐落库，可回归可回滚——先建度量，再动刀

### 🔌 多模型网关
LLM / 搜索 / 生图 / 视频大模型四类供应商统一接入，带**探活**、密钥池、故障退避重试——换供应商不用改代码。

### 🧩 插件生态
MCP 服务器管理 + 本地插件工作区（`skill-pool/`，不入库，见 `.gitignore`），能力可插拔。

![流水线](download/assets/content-pipeline.png)

## 架构一览

![架构](download/assets/architecture.png)

| 层 | 组成 |
|---|---|
| 前端 | Next.js 16 App Router + Tailwind 4 |
| 后端 | Next.js API Routes + z-ai-web-dev-sdk |
| 数据 | Prisma + SQLite（14 张表） |
| 网关 | 四类供应商适配层（含 429 退避重试 / WAF 穿透） |
| 媒体 | ffmpeg 合成 + AI 生图 |

## 快速开始

```bash
# 1. 安装依赖
bun install

# 2. 准备数据库（SQLite，自动建表）
echo 'DATABASE_URL=file:./db/custom.db' > .env
bun run db:push

# 3. 启动
bun run dev        # http://localhost:3000
```

> 💡 所有模型密钥在应用内「设置中心」配置（落库 `SettingKV`），`.env` 只需要 `DATABASE_URL`——密钥永不进 git。

## 质量基线

- `tsc` 与 `eslint src/` 双零
- 40+ 项端到端主回归（`scripts/full-regression.mjs`）：九步流水线 / 评测集 / 视频直出 / 纯图线 / 5 平台导出 / 门禁
- P1 专项回归：版式卡 33/33（`test-card-engine.mjs`）、指着改 28/28 + 浏览器 34/34 + 在线 18/18（`test-section-rewrite.mjs` / `verify-p13-browser.sh` / `regression-p13.mjs`）、RSS 信源 37/37 含本地 HTTP E2E（`test-rss.mjs`）、调优闭环 27/27（`test-tune.mjs`）
- 固定评测集运行器（`scripts/eval-set.mjs`）与调优运行器（`scripts/tune-prompts.mjs`）：调优前后同题对比，评分可回归
- 全程 `worklog.md` 留痕：每个功能怎么做的、踩了什么坑、怎么修的

## 目录速览

```
src/
├── app/            # 页面与 API 路由
├── components/     # UI 组件（含设置中心 settings-panel）
├── lib/
│   ├── gateway/    # 多模型供应商适配层
│   ├── settings.ts # 设置读写（含 DEFAULTS 兜底）
│   └── ...         # 雷达/图文/视频流水线
prisma/schema.prisma # 14 张表的数据模型
scripts/            # 回归 / 构建 / 维护脚本
worklog.md          # 开发全记录
download/           # 截图与交付资产
```

## 相关产出

- 📄 征文《AI 资讯雷达 2.0》：四 Tab 全景走查 + 15 张真实运行截图（`download/比赛文章/`，未入库）
- 🛠️ 每个"灵异故障"都有复盘：WAF 穿透、429 退避、`.gitignore` 裸规则吞路由、密钥全历史清洗——见 `worklog.md`

## License

MIT
