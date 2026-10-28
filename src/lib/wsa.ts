/**
 * 腾讯云元宝搜索（WSA）客户端封装
 *
 * 接口文档: https://cloud.tencent.com/document/product/1806/121811
 * 请求方式: POST https://api.wsa.cloud.tencent.com/SearchPro
 * 鉴权方式: Authorization: Bearer <WSA_API_KEY>
 *
 * 双模式设计:
 *  - 配置了环境变量 WSA_API_KEY 时走真实调用
 *  - 未配置时降级为高保真演示数据（UI 会明确标识"演示模式"）
 */

const WSA_ENDPOINT = 'https://api.wsa.cloud.tencent.com/SearchPro'

/** SearchPro 入参 */
export interface WsaSearchParams {
  /** 搜索词，必填，UTF-8 字节数不超过 1500 */
  query: string
  /** 返回结果类型: 0 公开网页 / 1 优质权威垂类信源(VR卡) / 2 混合 */
  mode?: number
  /** 返回条数: 10/20/30/40/50 */
  cnt?: number
  /** 垂直领域: gov 政府 / news 新闻 / acad 学术 / finance 财经 */
  industry?: string
  /** 时效范围: d[N] 最近N天 / m[N] 最近N月 / y[N] 最近N年 */
  freshness?: string
  /** 站点过滤，如 zhihu.com 或 exclude:qq.com|sohu.com */
  site?: string
}

/** 单条搜索结果（Pages 数组内 JSON 字符串解析后的结构） */
export interface WsaPage {
  title: string
  url: string
  date: string
  passage: string
  content?: string
  site: string
  favicon?: string
  score: number
  pics?: { caption: string; origin_url: string }[]
}

/** 搜索接口统一返回 */
export interface WsaSearchResponse {
  query: string
  pages: WsaPage[]
  version: string
  requestId: string
  latencyMs: number
  /** true = 演示数据（未配置 Key）；false = 元宝搜索真实返回 */
  mock: boolean
}

/** 是否已配置真实 Key */
export function hasApiKey(): boolean {
  return Boolean(process.env.WSA_API_KEY && process.env.WSA_API_KEY.trim().length > 0)
}

/** 元宝搜索官方错误码 → 用户可读提示 */
const ERROR_MESSAGES: Record<string, string> = {
  UnauthorizedOperation: '鉴权失败：请检查 WSA_API_KEY 是否正确或已被删除',
  ResourceNotFound: '服务未开通：请先在元宝搜索控制台开通服务（需几分钟生效）',
  ResourceUnavailable: '服务不可用：请检查腾讯云账号是否欠费',
  RequestLimitExceeded: '请求超过频率限制：请稍后重试或降低并发',
  InvalidParameter: '参数错误：请检查 Query / Mode / Freshness 等取值',
  InternalError: '元宝搜索内部错误，请稍后重试',
}

export class WsaApiError extends Error {
  code: string
  constructor(code: string, message?: string) {
    super(message || ERROR_MESSAGES[code] || `元宝搜索调用失败: ${code}`)
    this.code = code
  }
}

/**
 * 调用元宝搜索 SearchPro 接口
 * 无 Key 时自动降级为演示数据，保证应用开箱可用
 */
export async function searchWsa(params: WsaSearchParams): Promise<WsaSearchResponse> {
  const started = Date.now()

  if (!hasApiKey()) {
    // 演示模式：返回高保真模拟数据
    const { generateMockPages } = await import('./mock-data')
    const pages = generateMockPages(params)
    // 模拟真实接口 300~600ms 的网络+检索耗时
    await new Promise((r) => setTimeout(r, 320 + Math.random() * 280))
    return {
      query: params.query,
      pages,
      version: 'standard',
      requestId: `mock-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      latencyMs: Date.now() - started,
      mock: true,
    }
  }

  // 真实调用
  const body: Record<string, unknown> = { Query: params.query }
  if (params.mode !== undefined) body.Mode = params.mode
  if (params.cnt !== undefined) body.Cnt = params.cnt
  if (params.industry) body.Industry = params.industry
  if (params.freshness) body.Freshness = params.freshness
  if (params.site) body.Site = params.site

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 15000)

  try {
    const resp = await fetch(WSA_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Authorization: `Bearer ${process.env.WSA_API_KEY}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: 'no-store',
    })

    const data = await resp.json().catch(() => null)

    // 元宝搜索错误结构: { Response: { Error: { Code, Message } } }
    const err = data?.Response?.Error
    if (err) {
      throw new WsaApiError(err.Code, err.Message || ERROR_MESSAGES[err.Code])
    }
    if (!resp.ok || !data?.Response?.Pages) {
      throw new WsaApiError('InternalError', `HTTP ${resp.status}，响应结构异常`)
    }

    // Pages 是 JSON 字符串数组，需要二次解析
    const pages: WsaPage[] = []
    for (const raw of data.Response.Pages as string[]) {
      try {
        const page = JSON.parse(raw) as WsaPage
        if (page && page.title) pages.push(page)
      } catch {
        // 单条解析失败跳过，不影响整体
      }
    }

    return {
      query: data.Response.Query ?? params.query,
      pages,
      version: data.Response.Version ?? 'standard',
      requestId: data.Response.RequestId ?? '',
      latencyMs: Date.now() - started,
      mock: false,
    }
  } catch (e) {
    if (e instanceof WsaApiError) throw e
    if ((e as Error)?.name === 'AbortError') {
      throw new WsaApiError('InternalError', '请求超时（15s），请检查网络后重试')
    }
    throw new WsaApiError('InternalError', `网络异常: ${(e as Error)?.message || 'unknown'}`)
  } finally {
    clearTimeout(timeout)
  }
}
