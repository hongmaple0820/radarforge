# Worklog

---
Task ID: 1
Agent: 主 Agent (Z.ai)
Task: 腾讯元宝搜索 × CSDN 征文参赛作品——开发「AI 资讯雷达」Web 应用并撰写征文

Work Log:
- 调研元宝搜索征文活动与 SearchPro API 文档（cloud.tencent.com/product/1806），确认接入方式、参数、错误码
- AskUserQuestion 确认方向：资讯追踪 / Web 应用 / 已有 Key / 项目复盘型 / ~5500字 / Markdown / 四类配图
- fullstack-dev skill 初始化 Next.js 16 项目环境
- 开发应用：Prisma+SQLite 话题持久化、/api/search 服务端 Key 代理（真实/演示双模式）、/api/topics CRUD、/api/briefing LLM 早报（z-ai-web-dev-sdk）
- 前端：话题栏、控制面板（Freshness/Mode/Industry/Cnt 四参数联动）、资讯卡片流、信源统计、AI 早报面板；teal 配色、响应式、骨架屏
- 修复：SQLite createMany 不支持 skipDuplicates；话题删除按钮 className 笔误
- agent-browser 端到端验证：话题切换、早报生成、模式过滤、添加话题、移动端布局、footer 贴底——全部通过
- VLM 检查截图质量：主界面/移动端/架构图/数据图表/封面均验收通过
- charts skill 生成架构流程图（Playwright+CSS Layout C 分层纵向、蓝灰同色系）
- 收集参数行为数据（scripts/collect_data.py），matplotlib 生成 Freshness/Mode 两张实验图表（Sarasa Mono SC 中文字体、低饱和配色、防重叠）
- image-generation 生成封面题图（雷达扫描主题，1344x768）
- 撰写 CSDN 征文 Markdown（9 章、~6800 字正文、6 图、4 代码块、2 表格），标题符合「【元宝搜索征文】」规范

Stage Summary:
- 交付物：
  1. 可运行 Web 应用：/home/z/my-project（Next.js 16，演示模式开箱即用，.env 填 WSA_API_KEY 即切换真实调用）
  2. 征文：/home/z/my-project/download/元宝搜索征文-AI资讯雷达.md
  3. 配图素材：/home/z/my-project/download/assets/（cover、architecture、app-main、app-full、app-mobile、chart-freshness、chart-mode）
  4. 可复用脚本：/home/z/my-project/scripts/（arch-flow.html、render_arch.py、collect_data.py、gen_charts.py）
- 关键决策：服务端代理保 Key 安全；无 Key 演示模式保证开箱可用；早报 prompt 强制信源编号实现可溯源闭环
- 待用户操作：将 API KEY 填入 .env → 发布征文到 CSDN（上传 assets 图片）→ 回报名表提交链接

---
Task ID: 2
Agent: 主 Agent (Z.ai)
Task: 用户提供 ***REDACTED-TENCENT-SECRETID***，配置并切换真实数据模式

Work Log:
- curl 直接测试 SearchPro（Bearer / X-Api-Key / Token / body 四种鉴权变体）：全部返回 UnauthorizedOperation
- 查官方文档确认：元宝搜索服务 API KEY 为 sk- 开头（示例 sk-209b****e23d），在「元宝搜索控制台 → 概览 → 服务 API KEY 方式」创建
- 诊断结论：用户提供的 AKID 开头字符串是腾讯云访问管理(CAM)的 SecretId，非元宝搜索专用 Key，无法用于 Bearer 鉴权
- 决策：不将无效 Key 写入 .env（避免应用从演示模式变成报错模式），仅更新 .env 注释指明正确 Key 格式与获取路径
- 官方 Key 创建特性：仅创建时弹窗显示一次明文，需立即复制或下载 CSV；每个 subuin 最多 3 个；子账号需主账号授予 WSA 全读写权限

Stage Summary:
- 应用仍处于演示模式开箱可用状态，等正确的 sk- Key 即可切换
- 用户需要重新获取：元宝搜索控制台 → 概览 → 服务 API KEY 方式 → 创建 API KEY → 复制 sk- 开头明文
- 收到正确 Key 后计划：写入 .env → 重启 dev server → 验证真实数据 → 真实数据重截图 → 更新征文素材
