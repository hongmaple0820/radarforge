# 比赛文章图包说明

## 目录结构

```
比赛文章/
├── article.md              # 文章正文（约 4000 字，15 处图片引用）
├── README.md               # 本说明
└── images/                 # 全部演示素材（19 个文件）
    ├── 00-cover-header.png     # AI 生成头图（1344×768）——文章封面
    ├── 01-intel-home.png       # 情报中心首页全景（1440×900 retina）
    ├── 02-intel-search-real.png    # [备用] 搜索触发瞬间
    ├── 03-intel-search-results.png # 真实搜索结果流（百度百科/腾讯/今日头条）
    ├── 04-studio-run-detail.png    # 创作台 run 详情·六步流水线状态
    ├── 05-studio-article-cover.png # 成稿正文 + AI 封面
    ├── 06-video-panel.png      # 视频线工作台总览
    ├── 07-video-storyboard.png # 分镜脚本 + 指着改入口
    ├── 08-video-final-versions.png # 成片播放器 + v1/v2 版本树
    ├── 09-plugins.png          # 插件生态·Skills 热加载
    ├── 10-plugins-mcp.png      # [备用] MCP 连接管理
    ├── 11-settings-hub.png     # 设置中心·供应商注册表
    ├── 12-settings-agnes.png   # Agnes 多账号池配置
    ├── 13-settings-video-style.png # 视频通道 + 风格定位
    ├── 14-mobile-375.png       # 移动端 375px 首页
    ├── 15-mobile-375-scroll.png   # [备用] 移动端滚动视图
    ├── gif-search-demo.gif     # 动图：输入检索词 → 真实搜索出结果（5.5s）
    ├── gif-pipeline-demo.gif   # 动图：run 看板 → 六步流水线走查（6.5s）
    └── demo-final-video.mp4    # 真实成片（720P · 2MB）——流水线原始输出
```

## 发布指引

**发到掘金 / CSDN 等社区**：
1. 打开文章编辑器，把 `article.md` 全文粘贴进 Markdown 编辑器
2. 按文中出现的顺序，把 `images/` 里对应的图片逐一上传到引用处（`![xx](images/xxx)` 的位置）
3. GIF 按普通图片上传（掘金/CSDN 均支持动图）
4. `demo-final-video.mp4` 用编辑器的「视频上传」插入到第四章末尾

**作为提交文件**：整个 `比赛文章/` 目录打包 zip 提交即可，`article.md` 内的相对路径在本地 Markdown 预览（Typora / VS Code）中可直接渲染。

## 素材真实性

- 全部截图与 GIF 于 2026-10-30 从运行实例实时截取（1440×900 @2x retina 视口）
- 截图中的「真实」徽章、信源列表、成稿字数、封面文件均为流水线运行时落库的真实数据
- `demo-final-video.mp4` 为视频流水线的原始产物，未做后期剪辑
