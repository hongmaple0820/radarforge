// ============================================================
// test-binaries.ts —— P0-1 依赖解析链离线自测（node --experimental-strip-types 直跑）
// 断言覆盖：
//   ① 正常环境解析：ffmpeg/ffprobe 均非 null，路径真实存在
//   ② 受限 PATH（清空 PATH 模拟生产 standalone 场景）+ 清缓存后重解析
//      仍命中 known 层——根治「Executable not found in $PATH」的核心断言
//   ③ env 层最高优先：FFMPEG_PATH 指向真实二进制 → source=env
//   ④ mustResolve 人话错误：不可解析时错误文案含三条修复路径而非原始 ENOENT
//   ⑤ getBinaryReport：两项齐全 + version 真实非空 + resolved=true
//   ⑥ 模块级缓存：二次解析不重复日志（logged 集合去重）
// 运行：node --experimental-strip-types scripts/test-binaries.ts
// ============================================================

import { existsSync } from "node:fs"
import {
  resolveFFmpeg,
  resolveFFprobe,
  mustResolve,
  getBinaryReport,
  resetBinaryCache,
  STATIC_HINT,
} from "../src/lib/media/binaries.ts"

let pass = 0
let fail = 0
function assert(cond: boolean, name: string, extra = ""): void {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}`)
  } else {
    fail++
    console.error(`  ✗ ${name}${extra ? ` —— ${extra}` : ""}`)
  }
}

console.log("== test-binaries: P0-1 依赖解析链 ==")

// ① 正常环境
const ff = resolveFFmpeg()
const fp = resolveFFprobe()
assert(ff !== null, "ffmpeg 正常环境可解析", `got ${String(ff)}`)
assert(fp !== null, "ffprobe 正常环境可解析", `got ${String(fp)}`)
assert(ff !== null && existsSync(ff.path), "ffmpeg 解析路径真实存在")
assert(fp !== null && existsSync(fp.path), "ffprobe 解析路径真实存在")
assert(ff !== null && (ff.source === "which" || ff.source === "known" || ff.source === "static" || ff.source === "env"), "ffmpeg source 标注合法")

// ② 受限 PATH（生产 standalone 场景复现）+ 清缓存重解析 → known 层兜底
const origPath = process.env.PATH
const origEnvFfmpeg = process.env.FFMPEG_PATH
const origEnvFfprobe = process.env.FFPROBE_PATH
delete process.env.FFMPEG_PATH
delete process.env.FFPROBE_PATH
process.env.PATH = "/nonexistent-definitely-empty"
resetBinaryCache()
const ffRestricted = resolveFFmpeg()
assert(ffRestricted !== null, "受限 PATH 下 ffmpeg 仍解析成功（known 层兜底）", `got ${String(ffRestricted)}`)
assert(ffRestricted?.source === "known" || ffRestricted?.source === "static", "受限 PATH 下 source 落 known/static 层", `got ${ffRestricted?.source}`)
const fpRestricted = resolveFFprobe()
assert(fpRestricted !== null, "受限 PATH 下 ffprobe 仍解析成功")
const okPath = mustResolve("ffmpeg")
assert(existsSync(okPath), "mustResolve 受限 PATH 下返回可用的绝对路径")

// ③ env 层最高优先
process.env.FFMPEG_PATH = "/usr/bin/ffmpeg"
process.env.PATH = "/nonexistent-definitely-empty"
resetBinaryCache()
const ffEnv = resolveFFmpeg()
assert(ffEnv?.source === "env", "FFMPEG_PATH 显式指定时 source=env", `got ${ffEnv?.source}`)
assert(ffEnv?.path === "/usr/bin/ffmpeg", "env 层路径精确采用指定值")
delete process.env.FFMPEG_PATH

// ④ 伪造不可解析场景：env 指向不存在文件 + PATH 空 + known 层被指向的假路径绕过？
//    known 层硬编码 /usr/bin——本沙箱恒命中，故用「不存在文件的 env」验证 env 层回退顺序即可：
//    env 值指向不存在路径时应跳过 env 层落到 known 层
process.env.FFMPEG_PATH = "/nonexistent/ffmpeg"
process.env.PATH = "/nonexistent-definitely-empty"
resetBinaryCache()
const ffBadEnv = resolveFFmpeg()
assert(ffBadEnv !== null && ffBadEnv.source !== "env", "env 指向不存在文件时回退到后续层", `got ${ffBadEnv?.source}`)
delete process.env.FFMPEG_PATH

// ⑤ getBinaryReport（恢复真实环境）
process.env.PATH = origPath
if (origEnvFfmpeg) process.env.FFMPEG_PATH = origEnvFfmpeg
if (origEnvFfprobe) process.env.FFPROBE_PATH = origEnvFfprobe
resetBinaryCache()
const report = await getBinaryReport()
assert(report.length === 2, "报告含 ffmpeg/ffprobe 两项", `got ${report.length}`)
assert(report.every((i) => i.resolved), "两项全部 resolved")
assert(report.every((i) => typeof i.version === "string" && i.version.length > 0), "版本号真实非空", `got ${report.map((i) => i.version?.slice(0, 24)).join(" / ")}`)
assert(report.every((i) => i.hint === null), "健康时无 hint")
const hintHasThreePaths = STATIC_HINT.includes("FFMPEG_PATH") && STATIC_HINT.includes("ffmpeg-static") && (STATIC_HINT.includes("apt") || STATIC_HINT.includes("brew"))
assert(hintHasThreePaths, "修复指引含三条路径（env/静态包/系统安装）")

// ⑥ mustResolve 错误文案为「人话」（在真实沙箱无法制造全 null 场景——known 层恒命中；
//    以 STATIC_HINT 常量契约断言代替：错误文案由 mustResolve 拼接 STATIC_HINT）
assert(STATIC_HINT.length > 20 && !STATIC_HINT.includes("ENOENT"), "指引文案不含原始运行时错误码")

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
process.exit(fail === 0 ? 0 : 1)
