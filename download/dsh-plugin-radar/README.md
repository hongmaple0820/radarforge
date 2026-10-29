# dsh-plugin-radar

> **AI 资讯雷达 · 对话式出稿插件（DeepSeek Harness / dsh）**
> 在 dsh 对话框里说「写一篇公众号文章」，插件调 AI 资讯雷达平台跑六步流水线（brief → claims 联网取证 → 人格初稿 → 五维审稿 → 封面 → 微信排版 18 主题），回传成稿全文与平台链接；说「把它做成视频」，走导演三方向 → 分镜 → 本地成片。

| 组成 | 在哪 | 干什么 |
|---|---|---|
| **`radar_article`** | 模型工具 | 一句话出公众号成稿（Markdown + 平台链接，可带文风校准） |
| **`radar_video`** | 模型工具 | 成稿 → 三方向 → 分镜 → MP4（本地 motion/art 双风格） |
| **会话卡片** | 对话界面 | 流水线六步进度实时、成稿入口、MP4 播放器/下载 |

## 前置条件

1. 已部署并运行 **AI 资讯雷达平台**（本项目 Next.js 应用，默认 `http://localhost:3000`）
2. 已安装 DeepSeek Harness（`dsh`）与 Node.js 18+

## 安装

```bash
# 本地包安装（推荐先打 tgz）
dsh plugin --profile web add ./dsh-plugin-radar.tgz

# 或直接指向目录
dsh plugin --profile web add ./dsh-plugin-radar
```

安装后重启 `dsh web`。命令行方式装完需在插件页手动打开开关（与 dsh-agnes-multimodal 同语义）。

## 配置

| 项 | 方式 | 默认 |
|---|---|---|
| 平台地址 | 宿主环境变量 `RADAR_BASE` | `http://localhost:3000` |

## 对话用法

```text
你：帮我写一篇公众号文章，选题「具身智能融资观察」
dsh：（调 radar_article）→ 六步流水线进度卡 → 成稿全文 + 平台链接

你：稿子不错，把它做成抖音视频，要大胆一点的方向
dsh：（先 storyboard-directions 拿三个方向，选 B·Amplify）→ 分镜 → 本地渲染 → MP4 播放卡
```

## API 契约（插件 ↔ 平台）

| 调用 | 平台端点 |
|---|---|
| 启动图文流水线 | `POST /api/runs` `{ ideaTitle, ideaAngle?, persona?, theme?, exemplarId? }` |
| 轮询进度/成稿 | `GET /api/runs/:id`（steps / articles / assets） |
| 导演三方向提案 | `POST /api/runs/:id/actions` `{ action: "storyboard-directions" }` |
| 生成分镜（带方向） | `POST /api/runs/:id/actions` `{ action: "storyboard", direction? }` |
| 渲染成片 | `POST /api/runs/:id/actions` `{ action: "render-video", storyboard, voice, aspect, style, bgm? }` |
| 指着改单镜 | `POST /api/runs/:id/actions` `{ action: "revise-scene", sceneId, feedback, baseAssetId }` |

供应商配置（LLM/搜索/生图/Agnes 账号池）全部在平台设置中心完成；插件侧零密钥。

## 已知边界（诚实声明）

- 本包为**骨架已完整**的 v0.1.0：工具与卡片代码可直接运行，但沙箱内无 dsh 宿主，未做宿主内端到端联调——装进 dsh 后如遇 cordis API 细节差异（如 `attachments.push` 签名），按 dsh-agnes-multimodal 同模式微调即可
- 富产物（HTML 排版 / 封面图 / MP4）只在会话卡片展示，不回传模型（对齐 agnes 插件 "result returns only plain text" 约定）
- 长流水线等待窗口：图文 6 分钟 / 视频 5 分钟，超时后回平台页继续看

## 致谢

插件形态（cordis patch / `ctx.tools.register` / 会话卡片注入 / "plain text to model" 约定）学自 **dsh-agnes-multimodal**（啾灵jiuling，MIT，经 xuan0708191-sketch 镜像分发）与 **dsh-imagegen-video**（Apache-2.0）。本包仅借鉴协议形态，未复制其业务代码。
