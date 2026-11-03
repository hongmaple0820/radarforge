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
# 从 GitHub Release 安装（推荐——发布产物，pnpm 原生支持 https tarball）
dsh plugin --profile web add https://github.com/hongmaple0820/radarforge/releases/download/v0.2.0-dsh-plugin/dsh-plugin-radar.tgz

# 或本地包安装
# dsh plugin --profile web add ./dsh-plugin-radar.tgz
```

安装后重启 `dsh web`。命令行方式装完需在插件页手动打开开关（与 dsh-agnes-multimodal 同语义）。

## 配置

| 项 | 方式 | 默认 |
|---|---|---|
| 平台地址 | dsh 设置层 `radarBase`（Schemastery Config）或宿主环境变量 `RADAR_BASE` | `http://localhost:3000` |

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

## 规范对齐（v0.2.0）

对齐 @deepseek-ai/dsh-tools 官方 defineTool 契约：

- `defineTool()` + `parameters` 类型化参数 schema（缺必填/类型错/额外键在执行前被官方校验器拦截）
- `output` 声明（schema + render，注册表强制校验输出规范 JSON）
- Schemastery `Config` 导出 `radarBase`（配置层可改，环境变量作回落）
- `name` 导出（加载失败诊断定位）+ `engines.dsh >= 0.2.1-rc.5`
- 协作取消：`execute(args, exec)` 观测 `exec.signal`（官方约定）
- 依赖钉住与宿主对齐的 `@deepseek-ai/dsh-tools@0.2.1-rc.5`（rc 间破坏兼容实测教训：旧版 0.0.1-rc.1 与宿主 0.2.1-rc.5 不兼容）

## 已知边界（诚实声明）

- **实测通过于 dsh 0.2.1-rc.5**（2026-11-03）：真实宿主全链路——pnpm 安装 → `--dump-config` 插件树（radar-plugin 行）→ 挂载日志（radar_article + radar_video）→ `radar_article` 实调六步流水线（249s·六步全绿·纯文本回传）→ 协作取消契约（已中止 signal → 立即报「已取消」）；回归证据：仓库 `scripts/test-dsh-plugin.mjs`（33 断言）
- LLM 驱动的模型自主调工具（DeepSeek 模型在对话里决定调 radar_article）需宿主侧 LLM 凭证，沙箱内未验——协议链路已全验，模型行为属 dsh 宿主侧
- 富产物（HTML 排版 / 封面图 / MP4）只在会话卡片展示，不回传模型（对齐 agnes 插件 "result returns only plain text" 约定）
- 长流水线等待窗口：图文 6 分钟 / 视频 5 分钟，超时后回平台页继续看

## 致谢

插件形态（cordis patch / `ctx.tools.register` / 会话卡片注入 / "plain text to model" 约定）学自 **dsh-agnes-multimodal**（啾灵jiuling，MIT，经 xuan0708191-sketch 镜像分发）与 **dsh-imagegen-video**（Apache-2.0）。本包仅借鉴协议形态，未复制其业务代码。
