# INSTALL.md — 给 AI 助手的安装指令

> **本文件是写给 AI 助手读的。** 如果你是人类用户，请直接看 [README.md](README.md)。
>
> 目标读者：Claude / GPT / Gemini / DeepSeek 等任何具备本机 shell 与文件读写能力的助手。
> 任务：把 `dsh-agnes-multimodal` 装进用户本机的 **DeepSeek Harness 桌面版**，并**证明它真的加载成功**。

---

## 0. 先读完这一节，别急着动手

以下是实测踩坑得出的硬约束，跳过它们你会在同一个地方卡住三次：

| 约束 | 说明 |
|---|---|
| **desktop profile 由 App 独占** | `dsh plugin --profile desktop ...` 会被直接拒绝：`profile "desktop" is managed exclusively by the Electron application`。从 0.2.0-rc.2 起，只有 App 自己的载体进程能调它，且要求 App 完全退出（它会锁 profile 的 `package.json` 120 秒）。 |
| **市场不能装非注册表包** | `dshmarket` 的路由只接受 curated registry 里的包，遇非注册表包返回 400 `plugin is not in the curated registry`。 |
| **唯一官方门是 GUI** | 设置 → 插件 → 输入包名。这是最可靠的路径。如果用户能点鼠标，**优先让他点**。 |
| **别在服务运行期改依赖树** | 会触发 `E2007`。固定顺序：**停服 → 动包管理 → 回填 → 启服**。 |
| **`dsh.profile.bundles` 是挂载清单** | 包进了 `dependencies` **不等于**会被加载。必须同时出现在 `dsh.profile.bundles` 数组里，否则加载器根本不看它。 |
| **判断是否注册，只看数组本身** | 不要用整份 `package.json` 的全文去匹配包名——`dependencies` 里本来就有这个字符串，会误判成「已注册」。 |

---

## 1. 认识目标环境

以 Windows 为例，关键路径（macOS / Linux 把 `C:\Users\<user>` 换成 `$HOME` 即可）：

```
DSH_HOME            C:\Users\<user>\.dsh
profile 目录        %DSH_HOME%\profiles\desktop
主清单              %DSH_HOME%\profiles\desktop\package.json
挂载补丁            %DSH_HOME%\profiles\desktop\cordis.patch.yml
包安装位置          %DSH_HOME%\profiles\desktop\node_modules\dsh-agnes-multimodal
应用可执行文件      C:\Users\<user>\AppData\Local\Programs\DeepSeek Harness\DeepSeek Harness.exe
```

`package.json` 里两个字段决定一切：

```jsonc
{
  "dependencies": {
    "dsh-agnes-multimodal": "^1.0.0"     // ← 包存在
  },
  "dsh": {
    "profile": {
      "bundles": [
        "dsh-agnes-multimodal"            // ← 包被加载（两者缺一不可）
      ]
    }
  }
}
```

`cordis.yml` 是空数组，它的注释写得很清楚：**树由 patches 组合** —— 先遍历 `dsh.profile.bundles` 里每个包自带的 `cordis.patch.yml`，再叠加 profile 自己的 `cordis.patch.yml`。所以**不需要**手动往 profile 的 patch 里加行（除非包不自带 patch）。

---

## 2. 路线 A：让用户点 GUI（首选）

告诉用户：

1. 打开 DeepSeek Harness 桌面版
2. **设置 → 插件**
3. 输入 `dsh-agnes-multimodal`，安装
4. **新开一个对话**再试

结束。这条路线不需要你做任何文件操作。

---

## 3. 路线 B：全自动（用户明确要求时）

> ⚠️ 只有用户明确要求「你自己装，别让我点」时走这条。它会**重启用户的 App**，必须提前告知。

### 3.1 顺序

```
备份 → 停服 → pnpm add → 回填 bundles → 启服 → 验证
```

### 3.2 关键命令

**找 pnpm 和 node。** 不要假设 `%ProgramFiles%\nodejs\node.exe` 存在，也不要假设 App 的 `resources\runtime\bin\` 下有 `node.exe`（实测该目录下**只有** `node` 与 `node.cmd` 两个包装脚本，真正的 `node.exe` 路径藏在 App 进程的环境变量 `DSH_DESKTOP_NODE_EXECUTABLE` 里，外部 shell 拿不到）。用系统 PATH 里的 node：

```powershell
$node = (Get-Command node).Source
$pnpm = (Get-Command pnpm).Source      # 或 npm i -g pnpm
```

**在隔离目录里先自测**（这一步能把失败代价降到零）：

```powershell
$test = "$env:PUBLIC\agnes-selftest"
New-Item -ItemType Directory -Force -Path $test | Out-Null
'{ "name": "selftest", "private": true }' | Set-Content "$test\package.json" -Encoding UTF8
Push-Location $test
& $node $pnpm add dsh-agnes-multimodal --reporter=append-only
Pop-Location
```

自测不过就**立刻停手**，别动用户的 App。

**停服。** 只按显式 PID 杀，绝不做命令行文本匹配：

```powershell
$pids = Get-CimInstance Win32_Process -Filter "Name='DeepSeek Harness.exe'" |
        Where-Object { $_.CommandLine -notmatch '--type=' } |
        Select-Object -ExpandProperty ProcessId
if ($pids) { Stop-Process -Id $pids -Force }
# 轮询等进程清零 + 端口 19387 释放（最多 90 秒）
```

**装包：**

```powershell
Push-Location "$env:DSH_HOME\profiles\desktop"
& $node $pnpm add dsh-agnes-multimodal --reporter=append-only
Pop-Location
```

若报 `minimumReleaseAge` / `fresh-release` 相关错误，把包名追加到 `pnpm-workspace.yaml` 的 `minimumReleaseAgeExclude` 列表后重试一次。

**回填 bundles** —— 用 `[regex]::Replace` 精确替换数组尾项，并且**必须对数组本身做判断**：

```powershell
$json = Get-Content "$env:DSH_HOME\profiles\desktop\package.json" -Raw | ConvertFrom-Json
if ($json.dsh.profile.bundles -notcontains 'dsh-agnes-multimodal') {
  # 用文本替换把新条目插到数组末尾（保留原缩进与换行）
  $raw = Get-Content "$env:DSH_HOME\profiles\desktop\package.json" -Raw
  $last = $json.dsh.profile.bundles[-1]
  $raw = [regex]::Replace($raw, ('("' + [regex]::Escape($last) + '"\s*)\](?=[^]]*$)', ('$1,' + "`n        " + '"dsh-agnes-multimodal"' + "`n      ]")), 1)
  Set-Content "$env:DSH_HOME\profiles\desktop\package.json" -Value $raw -Encoding UTF8 -NoNewline
}
```

**启服：**

```powershell
Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe)
# 轮询等端口 19387 起来（最多 70 秒 × 3 次退避）
```

### 3.3 ⚠️ PowerShell 的三个坑

这一节是血泪，务必照做：

1. **`Start-Process -ArgumentList` 不做引号转义** —— 它只是把数组用空格拼起来。路径里只要有一个空格（`...\DeepSeek Harness\...`），参数就会在空格处被拆开。**用 `&` 调用运算符**代替，它走 `CreateProcessW`，自己处理引号。
2. **Windows PowerShell 5.1 传原生命令行参数走 ANSI** —— 中文路径会变成乱码（`华为` → `鍗庝负`）。**整条链改跑 pwsh 7**（`C:\Program Files\PowerShell\7\pwsh.exe`）。
3. **从 AI 的 shell 里 `Start-Process` 起子进程不可靠** —— 需要脱离进程树时，用 **Windows 计划任务**拉起一个 ASCII 路径的 `.cmd` 包装器：

```
schtasks /Create /TN DshAgnesRestart /TR "C:\Users\Public\dsh-restart.cmd" /SC ONCE /ST 23:59 /F
schtasks /Run /TN DshAgnesRestart
```

> `schtasks /TR` **不做引号解析**，且**含中文的命令行会被 ANSI 误编码成 `??`** —— 任务会报 `Last Result: 0`（成功）但脚本根本没跑。所以 `.cmd` 路径必须纯 ASCII，`.ps1` 里再写中文路径。

---

## 4. 验证（不要跳过）

装完不等于加载。按可靠性从高到低：

### 4.1 权威方法：读 App 首页的模块清单

DSH 服务端在渲染首页 HTML 时会内联一份 Client 模块清单，形如 `plugins/??a,b,c/client.js&rev=<hash>`。**这份清单反映真实加载结果，不是照抄配置文件**——被 `disabled: true` 的包不会出现在里面。

```powershell
$html = Invoke-WebRequest -Uri 'http://127.0.0.1:19387/' -UseBasicParsing
if ($html.Content -match 'dsh-agnes-multimodal') { "LOADED" } else { "NOT LOADED" }
```

> 需要认证。详见本仓库同目录的 `mem-skill-dsh-http-api-browser-session-dsh-auth-*` 技能，或让用户在浏览器里登录后自行查看。

**对照组技巧**：找一个你已知被禁用的插件，确认它不在清单里。如果它也不在、而目标包在，说明清单可信。

### 4.2 辅助方法

- `GET /dsh-market/installed` 返回的 `installed` 字典里应出现目标包 —— 但这只证明**装了**，不证明**加载了**。
- 检查 `node_modules\<包名>\package.json` 是否存在。
- 查 `%DSH_HOME%\<插件名>.log`（如果该插件会写日志）与 `%DSH_HOME%\storages\` 下的新目录。

### 4.3 最终确认

**让用户新开一个对话**，然后问助手「你现在有 `generate_image` 工具吗」。

当前会话的工具表是在插件加载前建立的快照，**不会热更新**。别把「我这个会话里没有这个工具」误判成安装失败。

---

## 5. 回滚

动手前把 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml`、`cordis.patch.yml` 备份到 `_backup-<时间戳>-before-<用途>\`。

出问题时：

1. 用备份覆盖 `package.json` 与 `cordis.patch.yml`
2. 重启 App
3. 还不行就 `pnpm remove dsh-agnes-multimodal`，或直接删 `node_modules` 下的包目录
4. App 起不来就手动双击它的可执行文件

---

## 6. 装完之后

插件装好只是第一步，**它还需要一个 Agnes API Key 才能工作**。密钥获取步骤见 [README.md](README.md#1-获取-agnes-api-key)。

配置入口：**设置 → 多模态配置**，填端点 `https://api.agnes-ai.cn/v1` 与密钥，点该行的「测试」按钮（`GET /models`，零成本）确认有效。

---

## 7. 一句话总结

> **能点鼠标就让用户点 GUI**。必须自动化时：备份 → 停服 → PATH 里的 node+pnpm 自测并安装 → **用数组判断**回填 `dsh.profile.bundles` → 计划任务启服 → **用首页模块清单验证加载** → 提醒用户新开会话。
