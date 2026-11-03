# 来源与署名

## 原始作品

| 项 | 内容 |
|---|---|
| 插件名 | `dsh-agnes-multimodal` |
| 原始作者 | 啾灵jiuling（B 站） |
| 原始出处 | https://www.bilibili.com/video/BV1vUpw6oEQk |
| 作者主页 | https://space.bilibili.com/475337911 |
| 发布渠道 | npm 包 [`dsh-agnes-multimodal`](https://www.npmjs.com/package/dsh-agnes-multimodal) v1.0.0 |
| 许可 | MIT |

## 本仓库的定位

本仓库是上述插件的**镜像分发仓库，不是原创作品**。

原作者没有公开源码仓库（npm 包 manifest 中 `repository` 与 `homepage` 字段均为空），源码只随 npm 发布。本仓库的存在是为了：

1. **留档**：保存一份可检索的源码快照，避免 npm 包下架后彻底无法获取。
2. **中文化**：原包只有一份简洁 README，本仓库补充完整的安装、配置、排错文档。
3. **面向 AI 分发**：提供 [`INSTALL.md`](INSTALL.md)，让其他 AI 助手读完就能在用户机器上完成安装——这是本仓库最主要的增量。
4. **补齐许可**：原包声明 MIT 但未附带 `LICENSE` 文件，也没有 `author` 字段；本仓库补上完整的 MIT 文本与双版权行。

## 源码改动情况

**没有改动。**

`lib/index.js`、`lib/client.js`、`cordis.patch.yml` 与原 npm 包 v1.0.0 内容一致，逐字节相同。原包的 `README.md` 保存在于 [`README.original.md`](README.original.md)，未经修改，供对照。

本仓库新增的文件只有：

- `README.md`（重写，中文）
- `INSTALL.md`（新增）
- `NOTICE.md`（新增，即本文件）
- `LICENSE`（新增）
- `package.json`（仅补充 `author`、`contributors`、`repository` 三个字段，其余字段未动）

## 版权

原插件版权归 **啾灵jiuling** 所有，按 MIT 协议授权使用、复制、修改与再分发。

本仓库新增的文档与打包工作由 **袁子轩** 完成，同样以 MIT 协议发布。

MIT 协议要求保留版权声明——本仓库的 [`LICENSE`](LICENSE) 中同时保留了原作者与本仓库的两行版权，任何再分发者请一并保留。
