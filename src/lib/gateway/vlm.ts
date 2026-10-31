// ============================================================
// vlm —— 视觉质检（P1：生图后 VLM 读回复核闭环）
// 学 linyuebanzi-skills 的双层校验：生图前按清单自检 prompt
// （并入构图规划提示词）、生图后读回图片视觉复核，不过自动重试。
// 调用：z-ai-web-dev-sdk createVision（base64 图片 + 检查清单）。
// 诚实降级：VLM 本身不可达 → done:false（调用方标「未质检」，
// 不判失败不阻断）；429 瞬时限流 → 一次退避重试。
// ============================================================

import { readFile } from "fs/promises"

export interface VlmCheckInput {
  absPath: string
  /** 画面应表达的概念（生图 prompt 或版式卡文案摘要） */
  concept: string
  /** 图注 */
  caption: string
  /** gen=生成式图片 / layout=代码排版版式卡 */
  kind: "gen" | "layout"
}

export interface VlmCheckResult {
  /** VLM 是否完成判定（false=不可达/限流，诚实标注未质检） */
  done: boolean
  pass: boolean
  issues: string[]
  /** 给重试的改进建议（拼进下一次 prompt） */
  retryHint: string
  error?: string
}

const VLM_PROMPT = (input: VlmCheckInput): string => `你是图片质检员。检查这张图片（预期图注：「${input.caption.slice(0, 30)}」；画面概念：「${input.concept.slice(0, 120)}」）。

检查清单（逐项）：
1. 画面完整无破损：无明显截断、空白大区块、渲染错误、噪点斑块；
2. 文字健康：${input.kind === "layout" ? "排版卡文字必须清晰完整、无溢出容器、无被裁切的行" : "不应出现乱码/无意义字符（模型生成文字本来就不可靠，出现小面积装饰性文字可容忍，但大面积乱码算不过）"}；
3. 主题相关：画面内容与上述概念相符（不要求精确到每个细节，跑题才算不过）；
4. 构图质量：有明确视觉主体，不拥挤不空洞。

只输出 JSON（不要任何其他文字）：
{"pass": true|false, "issues": ["不过的具体原因，每个≤20字"], "advice": "若不过，给一句改进画面的英文/中文建议，≤40字"}`

function parseVlmReply(text: string): { pass: boolean; issues: string[]; advice: string } | null {
  const m = text.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as { pass?: boolean; issues?: unknown; advice?: unknown }
    return {
      pass: Boolean(j.pass),
      issues: Array.isArray(j.issues) ? j.issues.map((x) => String(x).slice(0, 40)).slice(0, 4) : [],
      advice: typeof j.advice === "string" ? j.advice.slice(0, 60) : "",
    }
  } catch {
    return null
  }
}

/**
 * 读回图片做视觉复核。绝不 throw：所有失败都折进结果对象，
 * 由调用方决定「未质检」还是「质检未通过」。
 */
export async function vlmCheckImage(input: VlmCheckInput): Promise<VlmCheckResult> {
  const fail = (error: string): VlmCheckResult => ({ done: false, pass: false, issues: [], retryHint: "", error: error.slice(0, 160) })
  try {
    const b64 = await readFile(input.absPath).then((b) => b.toString("base64"))
    const { default: ZAI } = await import("z-ai-web-dev-sdk")
    const zai = await ZAI.create()
    // 429 退避一次（与 chatRetry 同语义：密集流水线会触顶）
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await zai.chat.completions.createVision({
          model: "glm-4.5v",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: VLM_PROMPT(input) },
                { type: "image_url", image_url: { url: `data:image/png;base64,${b64}` } },
              ],
            },
          ],
          thinking: { type: "disabled" },
        })
        const text = res.choices?.[0]?.message?.content ?? ""
        const parsed = parseVlmReply(text)
        if (!parsed) return { done: false, pass: false, issues: [], retryHint: "", error: `VLM 回复不可解析：${text.slice(0, 80)}` }
        return {
          done: true,
          pass: parsed.pass,
          issues: parsed.issues,
          retryHint: parsed.advice,
        }
      } catch (e) {
        const msg = (e as Error).message ?? ""
        if (attempt === 0 && (msg.includes("429") || msg.toLowerCase().includes("too many requests"))) {
          await new Promise((r) => setTimeout(r, 15_000))
          continue
        }
        return fail(msg)
      }
    }
    return fail("VLM 重试后仍限流")
  } catch (e) {
    return fail((e as Error).message)
  }
}
