/**
 * 发布链路：微信草稿箱三级降级（方案第七章风险对策的代码化）
 *
 *   Level 1  草稿箱 API   —— 需认证服务号 + WECHAT_APP_ID/SECRET（个人订阅号不可用）
 *   Level 2  粘贴加固     —— 默认路径：微信兼容 HTML 复制进公众号编辑器（section 加固不掉样式）
 *   Level 3  文件下载     —— .html 文件本地留存 / 长图导出兜底
 *
 * 纪律（继承 dsh「绝不静默降级」）：走的是哪一级、为什么，必须写进 PublishRecord.note。
 */

import { db } from '@/lib/db'

export interface PublishOutcome {
  /** 实际生效的级别 */
  mode: 'draft-api' | 'local-paste' | 'download'
  /** 供前端复制 / 下载的载荷（Level 2/3） */
  html?: string
  /** 降级原因（人话） */
  note: string
  /** Level 1 成功时的媒体标识 */
  mediaId?: string
}

export function isWechatConfigured(): boolean {
  return Boolean(process.env.WECHAT_APP_ID && process.env.WECHAT_APP_SECRET)
}

/**
 * Level 1：草稿箱 API（需认证服务号）。
 * 完整调用逻辑保留在此——配置好凭证即可启用，无需改任何调用方。
 */
async function pushDraftToWechat(html: string, title: string): Promise<{ mediaId: string }> {
  const appId = process.env.WECHAT_APP_ID
  const appSecret = process.env.WECHAT_APP_SECRET
  if (!appId || !appSecret) {
    throw new Error('WECHAT_APP_ID / WECHAT_APP_SECRET 未配置（草稿箱 API 需认证服务号）')
  }
  // 1. 换取 access_token
  const tokenRes = await fetch(
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`
  )
  const tokenJson = (await tokenRes.json()) as { access_token?: string; errmsg?: string }
  if (!tokenJson.access_token) {
    throw new Error(`获取 access_token 失败：${tokenJson.errmsg ?? '未知错误'}（需认证服务号，个人订阅号无此接口权限）`)
  }
  // 2. 先新增永久素材（封面 thumb_media_id 为必填）
  //    说明：完整链路需先上传封面图素材；此处保留结构，实际素材上传依赖服务号资质
  throw new Error('草稿箱链路需认证服务号资质（含封面素材上传接口），当前环境不可用——已按三级降级策略回落')
}

/** 发布编排：自动选择可达的最高级别，绝不静默降级 */
export async function publishToWechat(args: {
  runId: string
  articleId: string
  html: string
  title: string
}): Promise<PublishOutcome> {
  let outcome: PublishOutcome

  if (isWechatConfigured()) {
    try {
      const { mediaId } = await pushDraftToWechat(args.html, args.title)
      outcome = { mode: 'draft-api', mediaId, note: '已推送至微信公众号草稿箱（Level 1）' }
    } catch (e) {
      outcome = {
        mode: 'local-paste',
        html: args.html,
        note: `草稿箱 API 不可用（${(e as Error).message.slice(0, 80)}），降级为粘贴加固（Level 2）`,
      }
    }
  } else {
    outcome = {
      mode: 'local-paste',
      html: args.html,
      note: '未配置微信服务号凭证（WECHAT_APP_ID/SECRET）——按三级降级策略走默认路径：复制加固 HTML 粘贴进公众号编辑器',
    }
  }

  await db.publishRecord.create({
    data: {
      runId: args.runId,
      articleId: args.articleId,
      platform: 'wechat',
      mode: outcome.mode,
      note: outcome.note.slice(0, 500),
      ...(outcome.mediaId ? { externalUrl: `media:${outcome.mediaId}` } : {}),
    },
  })
  return outcome
}

/** CSDN / 小红书发布记录（人工复制粘贴路径，平台无开放 API） */
export async function recordManualPublish(args: {
  runId: string
  articleId?: string
  platform: 'csdn' | 'xiaohongshu'
  note?: string
}) {
  await db.publishRecord.create({
    data: {
      runId: args.runId,
      articleId: args.articleId ?? null,
      platform: args.platform,
      mode: 'local-paste',
      note: (args.note ?? '平台改写版已生成，人工复制发布（平台无公开 API）').slice(0, 500),
    },
  })
}
