#!/usr/bin/env bash
# =============================================================
# github-release.sh —— dsh 插件 GitHub Release 发布（P1-3 分发）
# 用法：GHP=<token> bash scripts/github-release.sh
# 做三件事（幂等，可重复执行）：
#   ① 给仓库打 dsh-plugin topic（进入官方发现通道）
#   ② 创建/更新 Release v0.2.0（dsh-plugin-radar.tgz 附产物）
#   ③ 输出 README 安装命令应指向的 Release 直链
# 前置：本地已跑 scripts/test-dsh-plugin.mjs 全绿；tgz 已在 download/。
# 令牌缺省时明确退出（不静默跳过）。
# =============================================================
set -euo pipefail
cd /home/z/my-project

TOKEN="${GHP:?需要 GHP 环境变量传入 GitHub 令牌（用户消息提供）}"
REPO="hongmaple0820/radarforge"
TAG="v0.2.0-dsh-plugin"
TGZ="download/dsh-plugin-radar.tgz"

api() { # $1=method $2=path $3=json(可选)
  if [ -n "${3:-}" ]; then
    curl -sS --fail -X "$1" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      -H "Content-Type: application/json" \
      -d "$3" \
      "https://api.github.com/repos/${REPO}/$2"
  else
    curl -sS --fail -X "$1" \
      -H "Authorization: Bearer ${TOKEN}" \
      -H "Accept: application/vnd.github+json" \
      "https://api.github.com/repos/${REPO}/$2"
  fi
}

echo "── ① 打 dsh-plugin topic（官方发现机制：GitHub topic，无中心注册表）"
TOPICS=$(api GET topics -H "Accept: application/vnd.github.mercy-preview+json" 2>/dev/null | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{console.log(JSON.parse(d).names.join(','))}catch{console.log('')}})" || echo "")
if ! echo ",${TOPICS}," | grep -q ",dsh-plugin,"; then
  NEW=$(node -e "const t='${TOPICS}'.split(',').filter(Boolean);t.push('dsh-plugin','dsh','ai-radar');console.log(JSON.stringify({names:[...new Set(t)].slice(0,20)}))")
  api PUT topics "$NEW" > /dev/null
  echo "    ✓ topic 已加：dsh-plugin"
else
  echo "    ✓ topic 已存在（幂等跳过）"
fi

echo "── ② 创建/更新 Release ${TAG}"
NOTES='dsh-plugin-radar v0.2.0 —— 规范对齐版

**实测通过于 dsh 0.2.1-rc.5**（真实宿主全链路：pnpm 安装 → dump-config 插件树 → 挂载日志 → radar_article 实调六步流水线 → 纯文本回传；回归证据见仓库 scripts/test-dsh-plugin.mjs）。

本版对齐官方插件指南四步：defineTool 参数 schema + Schemastery Config + name 导出 + engines.dsh；协作取消观测 exec.signal。

安装：
```
dsh plugin --profile web add https://github.com/hongmaple0820/radarforge/releases/download/'"${TAG}"'/dsh-plugin-radar.tgz
```
配置：dsh 设置层 radarBase（默认 http://localhost:3000）或环境变量 RADAR_BASE。'
# 1. tag 不存在则创建（指向当前 main）
if ! git rev-parse -q --verify "refs/tags/${TAG}" >/dev/null; then
  git tag "${TAG}" origin/main 2>/dev/null || git tag "${TAG}" HEAD
  git push origin "refs/tags/${TAG}" 2>/dev/null || echo "    （tag 推送走 push-retry.sh final 后重跑）"
fi
# 2. Release upsert
RELEASE_JSON=$(printf '{"tag_name":"%s","name":"%s","body":%s,"prerelease":true}' "$TAG" "$TAG" "$(node -e "console.log(JSON.stringify(process.argv[1]))" "$NOTES")")
REL_ID=$(api POST releases "$RELEASE_JSON" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const r=JSON.parse(d);console.log(r.id??'')}catch{console.log('')}})" || echo "")
if [ -z "$REL_ID" ]; then
  # 已存在则取 id（幂等更新）
  REL_ID=$(api GET "releases/tags/${TAG}" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{try{const r=JSON.parse(d);console.log(r.id??'')}catch{console.log('')}})" || echo "")
  [ -n "$REL_ID" ] && api PATCH "releases/${REL_ID}" "$RELEASE_JSON" > /dev/null && echo "    ✓ Release 已更新（id=${REL_ID}）"
else
  echo "    ✓ Release 已创建（id=${REL_ID}，prerelease）"
fi

echo "── ③ 上传 tgz 产物"
if [ -n "$REL_ID" ]; then
  # 删旧资产（同名覆盖需先删）
  api GET "releases/${REL_ID}/assets" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);for(const x of a)if(x.name==='dsh-plugin-radar.tgz')console.log(x.id)}" | while read -r AID; do
    [ -n "$AID" ] && curl -sS --fail -X DELETE -H "Authorization: Bearer ${TOKEN}" "https://api.github.com/repos/${REPO}/releases/assets/${AID}" && echo "    ✓ 旧资产已删（${AID}）"
  done
  curl -sS --fail -X POST \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/octet-stream" \
    --data-binary @"${TGZ}" \
    "https://uploads.github.com/repos/${REPO}/releases/${REL_ID}/assets?name=dsh-plugin-radar.tgz" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const a=JSON.parse(d);console.log('    ✓ tgz 已上传：'+(a.browser_download_url||'未知'))})"
fi

echo ""
echo "━━━ 完成。README 安装命令指向："
echo "  dsh plugin --profile web add https://github.com/${REPO}/releases/download/${TAG}/dsh-plugin-radar.tgz"
