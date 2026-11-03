# dsh-agnes-multimodal

> ## ⚠️ 来源声明
>
> 本仓库是 **啾灵jiuling** 开发的 DeepSeek Harness 插件 `dsh-agnes-multimodal` 的**镜像分发仓库**，**源码未作任何修改**，按 MIT 协议转载。
>
> - 原始出处：[B 站视频 BV1vUpw6oEQk](https://www.bilibili.com/video/BV1vUpw6oEQk)
> - 原始发布：npm 包 [`dsh-agnes-multimodal`](https://www.npmjs.com/package/dsh-agnes-multimodal) v1.0.0
> - 本仓库贡献：中文文档、面向 AI 的安装说明 [`INSTALL.md`](INSTALL.md)、补齐 `LICENSE`
> - 详细署名与改动说明见 [`NOTICE.md`](NOTICE.md)
>
> **这不是我写的插件**，我只是给它做了中文适配和分发。喜欢的话请去 B 站给原作者点赞。

---

在 DeepSeek Harness 的对话框里直接出图、出片 —— 一个插件包同时提供生图、生视频和账号配置三件事。

| 组成 | 在哪 | 干什么 |
|---|---|---|
| **多模态配置** | 设置 → 多模态配置 | Agnes AI 账号池（地区 + API 密钥），持久化到 `$DSH_HOME/ag-multimodal.json` |
| **`generate_image`** | 模型工具 | 文生图、图片编辑（改图）、多图融合 |
| **`generate_video`** | 模型工具 | 文生视频、首帧生视频、参考图生视频，4–12 秒 720P |

生成的图片直接落进对话界面（带全屏灯箱、缩略图条、键盘翻页），视频是可播放的 MP4 网格。

融合自原作者早前的三个独立包 `dsh-agconfig` + `dsh-agimage` + `dsh-agvideo`。

---

## 快速开始

### 1. 获取 Agnes API Key

1. 打开 **中国站平台**：<https://platform.agnes-ai.cn>，注册或登录
2. 进入**开发者控制台 → API Key 管理**
3. 点**创建密钥**，**立刻复制保存** —— 完整密钥只在创建时显示一次

> 密钥分站：中国站的 key 只能配中国站端点，国际站要另外注册。两边各自计费与限流。

### 2. 安装插件

**推荐方式** —— 打开 DeepSeek Harness 桌面版，**设置 → 插件**，在安装框里输入包名：

```
dsh-agnes-multimodal
```

安装器会自动启用它。

**命令行方式**（需要先完全退出桌面版）：

```powershell
dsh plugin --profile desktop add dsh-agnes-multimodal
```

> ⚠️ 命令行装完**不会**自动写入 `dsh.profile.bundles`，需要回插件页手动打开开关，或者重启 App 让插件管理器补登记。

> ⚠️ 如果你此前手工挂载过 `dsh-agconfig` / `dsh-agimage` / `dsh-agvideo`，**必须先删掉那三行**再装本包。`- insert:` 行不按 id 去重，重复挂载会让插件注册两次。

### 3. 配置密钥

打开 **设置 → 多模态配置**（设置侧栏里的独立一页，不在「插件」页里面），添加一行账号：

| 字段 | 值 |
|---|---|
| 站点 | 国内站 |
| 端点 | `https://api.agnes-ai.cn/v1` |
| 密钥 | 第 1 步拿到的 key |

填完点该行的**「测试」**按钮 —— 它会发一个 `GET /models`，**零成本**校验密钥是否有效。

> 国际站端点是 `https://apihub.agnes-ai.cn/v1`。
> 所有行都留空时，插件会回退到内置的共享演示密钥 —— 能用，但是公开的，随时可能失效，建议自己配一个。

### 4. 开始使用

在新会话里直接说人话就行：

```
生成一张图，一只橘猫在窗台上晒太阳
把这张图改成水彩风格          # 先发图，再说这句话
用这三张图合成一张新图
生成一段 8 秒的视频：海浪拍打礁石
```

---

## 费用说明

截至 2026-10-15，Agnes 中国站的以下模型**现价均为 ¥0**（官方标注为阶段性优惠，结束时间未公布）：

| 模型 | 计费项 | 现价 | 刊例价（优惠结束后） |
|---|---|---|---|
| `agnes-image-2.0/2.1/2.5-flash` | 图片 1K–4K 输出 | ¥0 | ¥70–160 / 千张 |
| `agnes-video-2.5-flash` | 视频全部计费项 | ¥0 | 720P ¥0.15 / 秒 |
| `agnes-2.5-flash` / `agnes-3.0-flash` | 文本输入+输出 | ¥0 | ¥0.35 / M 输入 |

**注册后不需要充值就能用**，但免费档的 RPM 限制比较紧：

| 分辨率 | 免费用户 RPM | Token Plan 用户 RPM |
|---|---|---|
| 图片 1K | 10 | 100 |
| 图片 2K | 5 | 80 |
| 图片 3K / 4K | 1 | 1 |

> 官方 FAQ 明确说明：**同一个账号创建多个 Key 不会叠加 RPM 或配额**。想提高并发需要多个 Agnes **账号**，每个账号一个 Key，插件会把它们当作独立的限流槽位轮询（N 个号 = 视频 N 次/分钟、图片并发 10×N）。

---

## 常见问题

**装完了但没有 `generate_image` 工具？**
当前会话的工具表是在插件加载前建立的。**新开一个对话**即可，或重启 App。

**「测试」按钮报 401？**
密钥和站点不匹配。中国站的 key 配 `api.agnes-ai.cn`，国际站配 `apihub.agnes-ai.cn`。

**图片生成卡住或报限流？**
免费档 2K 只有 5 RPM、3K/4K 各 1 RPM。降低分辨率，或加账号。

**命令行 `dsh plugin --profile desktop` 报错？**
从 0.2.0-rc.2 起，desktop profile 由桌面应用独占管理 —— 只有在 App 完全退出、由它自己的载体进程调用时才允许。日常请用 App 的「设置 → 插件」。

---

## 技术细节

<details>
<summary>展开</summary>

### 与旧三包的差异

- 视频传输层从 PowerShell 子进程重写为 **Node 原生 fetch** —— 不再依赖 pwsh，也没有 shell 转义问题；创建 → 轮询 → 下载 MP4 全在 Node 内完成。
- 图片与视频共用一个账号池、一个状态文件、一个日志（`$DSH_HOME/agnes-multimodal.log`）。
- HTTP 路由只保留 `/agnes/api`（配置 API）。生成的图片走 DSH 自带的附件通道，不再需要插件自己起图片字节路由。

### 模型上下文规则

图片工具把 PNG 存进 DSH 的持久化附件库，并在 `render` 里以 `{ type: "image", attachment, offloaded: true }` 随结果返回。`offloaded` 是 DSH 自带机制：请求投影会把它换成占位文本，所以**模型上下文里仍然只有文本**，而对话界面照常渲染图片。视频的 `render` 是纯文本，播放器直接读返回的 MP4 URL。

### UI

- **图片卡**：自适应网格 + 编号角标 + 悬停浮起；单击进全屏灯箱，支持 ←/→ 翻页、底部缩略图条、下载、ESC 关闭。单图上限 240px 且不放大；超过 12 张折叠为预览 + 「展开全部」。
- **视频卡**：可播放 MP4 网格，带编号与两行提示词摘要，单项上限 240px。
- **配置页**：`settings.section` 注册，独立成页；顶部状态卡实时显示可用账号数、图片并发上限、视频速率；密钥默认掩码，可逐行显示/隐藏。
- **侧栏图标**：shell 的 `navIcon(id)` 是硬编码映射，未注册 id 会回退成通用齿轮。本插件自行绘制 mark（`data-am-nav` + `currentColor` mask），跟随主题明暗。

### 包结构

```
dsh-agnes-multimodal/
├── lib/
│   ├── index.js        # 插件主体：账号池、HTTP 路由、generate_image、generate_video
│   └── client.js       # 前端：配置页、图片灯箱、视频卡、侧栏图标
├── cordis.patch.yml    # 挂载声明（insert 一行 agnes-multimodal）
├── package.json
├── README.md
└── LICENSE
```

`dsh` 字段声明了 `bundle.patch` 与 `client`（platform: web, immediately），peerDependencies 是 `@deepseek-ai/cordis ^4.0.1` 与 `react ^18.2.0`。

</details>

---

## 许可

[MIT](LICENSE) —— 版权归原作者 **啾灵jiuling** 所有；本仓库的文档与打包工作由 **袁子轩** 完成。

再分发时请保留 [`LICENSE`](LICENSE) 中的两行版权声明。
