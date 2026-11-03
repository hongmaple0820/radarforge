// ============================================================
// GET /api/settings/dependencies —— 本地渲染依赖自检（P0-1）
// 逐项返回 { name, resolved, path, source, version, hint }：
//   ffmpeg / ffprobe 的解析路径（env → which → known → static 四层链）、
//   真实版本号；缺失项给三条修复路径指引而非运行时原始报错。
// 供健康中心与程序化巡检使用；设置中心按钮走 POST /api/settings/test
// 的 scope=dependencies（同一 getBinaryReport 数据源）。
// ============================================================

import { NextResponse } from "next/server"
import { getBinaryReport } from "@/lib/media/binaries"

export async function GET() {
  try {
    const items = await getBinaryReport()
    return NextResponse.json({
      ok: items.every((i) => i.resolved && i.version),
      items,
      checkedAt: new Date().toISOString(),
    })
  } catch (e) {
    return NextResponse.json({ ok: false, items: [], error: (e as Error).message.slice(0, 140) }, { status: 200 })
  }
}
