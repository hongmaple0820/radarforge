#!/usr/bin/env bash
# =============================================================
# GitHub 推送前安全清洗脚本
# 目标：把密钥文件从 git 全历史中物理清除（仓库从未推送，本地清洗零风险）
# 清除路径：
#   .env          —— 历史版本含 sk-9aae... 真实密钥
#   db/custom.db  —— SQLite 库，SettingKV 表含 4 个供应商密钥配置（历史 blob 含 ey... 密钥串）
#   skill-pool/   —— 本地插件工作区（910 文件，无运行时引用，第三方库不入库）
#   tool-results/ —— 工具临时输出
# 注意：git filter-repo 会重写全部 commit hash（worklog 中旧 hash 引用由 commit-map 映射）
# =============================================================
set -euo pipefail
cd /home/z/my-project

BACKUP=/home/z/my-project/.cleanup-backup
echo ">>> [1/7] 备份将被 filter-repo 从工作区 checkout 掉的文件..."
rm -rf "$BACKUP" && mkdir -p "$BACKUP"
cp .env "$BACKUP/.env"                       2>/dev/null || true
cp db/custom.db "$BACKUP/custom.db"          2>/dev/null || true
cp -r skill-pool "$BACKUP/skill-pool"        2>/dev/null || true
cp -r tool-results "$BACKUP/tool-results"    2>/dev/null || true
echo "    备份完成：$(du -sh "$BACKUP" | cut -f1)"

echo ">>> [2/7] git filter-repo 全历史清除密钥路径..."
git filter-repo --invert-paths \
  --path .env \
  --path db/custom.db \
  --path skill-pool/ \
  --path tool-results/ \
  --force

echo ">>> [3/7] 回收旧对象（物理删除含密钥的旧 blob）..."
git reflog expire --expire=now --all
git gc --prune=now --aggressive --quiet

echo ">>> [4/7] 恢复本地文件（.env / db / skill-pool / tool-results 本地保留，仅不入库）..."
# ⚠️ 教训：filter-repo 会把被清除路径的目录一并 checkout 掉，
# 恢复前必须先重建目录，否则 cp 会静默失败（|| true 吞错）导致 db 丢失
mkdir -p db skill-pool tool-results
cp "$BACKUP/.env" .env                       2>/dev/null || echo "    ⚠️ .env 备份缺失"
cp "$BACKUP/custom.db" db/custom.db          2>/dev/null || echo "    ⚠️ db 备份缺失"
cp -r "$BACKUP/skill-pool/." skill-pool/     2>/dev/null || echo "    ⚠️ skill-pool 备份缺失"
cp -r "$BACKUP/tool-results/." tool-results/ 2>/dev/null || echo "    ⚠️ tool-results 备份缺失"
[ -f db/custom.db ] && echo "    ✓ db/custom.db 已恢复" || echo "    ✗ db/custom.db 恢复失败！"

echo ">>> [5/7] 验证：历史与索引中不再存在密钥路径（应输出 OK）..."
if git log --all --oneline -- .env db/custom.db skill-pool tool-results | grep -q .; then
  echo "    ❌ 历史中仍存在密钥路径！"; exit 1
else
  echo "    OK: 全历史已无 .env / db/custom.db / skill-pool / tool-results"
fi
if git ls-files | grep -qE '^\.env$|^db/custom\.db$|^skill-pool/|^tool-results/'; then
  echo "    ❌ 索引中仍跟踪密钥路径！"; exit 1
else
  echo "    OK: 索引已不再跟踪上述路径"
fi

echo ">>> [6/7] 验证：全部历史中无可检索的密钥特征（应输出 OK）..."
# ⚠️ 教训：切勿在仓库内硬编码真实密钥前缀做定点校验——清洗脚本自己会被 GitHub
# secret scanning 拦截推送（sk-+16 位字符即触发 OpenAI 密钥模式）。改用通用特征扫描：
LEAK=$(git grep -lE 'sk-[a-zA-Z0-9]{16,}|ghp_[a-zA-Z0-9]{30,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[0-9A-Za-z-]{10,}|AIza[0-9A-Za-z_-]{35}' $(git rev-list --all) 2>/dev/null | head -3 || true)
if [ -n "$LEAK" ]; then echo "    ❌ 密钥残留：$LEAK"; exit 1; else echo "    OK: 无密钥残留"; fi

echo ">>> [7/7] 仓库健康度..."
echo "    commit 数：$(git rev-list --count HEAD)"
echo "    跟踪文件数：$(git ls-files | wc -l)"
echo "    仓库体积：$(git count-objects -vH | grep -E '^size-pack' | awk '{print $2, $3}')"
rm -rf "$BACKUP"
echo ">>> 清洗完成 ✓（.cleanup-backup 已删除）"
