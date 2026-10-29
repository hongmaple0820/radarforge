// ============================================================
// wechat.ts —— 三级降级发布链路
// Level 1: 草稿箱 API（需认证服务号 + WECHAT_APP_ID/SECRET）
// Level 2: 粘贴加固 HTML（默认路径——复制进公众号编辑器不掉样式）
// Level 3: 长图导出（预留）
// 每次发布 PublishRecord 留痕，降级原因诚实记录
// ============================================================

import { db } from "@/lib/db"

export interface PublishOutcome {
  level: number
  levelName: string
  reason: string
  html: string
  htmlLength: number
  externalUrl: string
  instruction: string // 用户操作指引
}

interface WechatDraftResponse {
  media_id?: string
  errmsg?: string
  errcode?: number
}

/** Level 1: 微信草稿箱 API（完整实现，等待服务号授权后即可用） */
async function tryWechatDraft(title: string, html: string, thumbMediaId: string): Promise<WechatDraftResponse | null> {
  const appId = process.env.WECHAT_APP_ID
  const secret = process.env.WECHAT_APP_SECRET
  if (!appId || !secret) return null
  try {
    // 1) access_token
    const tokenRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${secret}`,
      { signal: AbortSignal.timeout(8000) },
    )
    const tokenJson = (await tokenRes.json()) as { access_token?: string; errmsg?: string }
    if (!tokenJson.access_token) return tokenJson
    // 2) 草稿箱
    const draftRes = await fetch(
      `https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${tokenJson.access_token}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articles: [
            {
              title,
              author: "AI 资讯雷达",
              content: html,
              thumb_media_id: thumbMediaId, // 封面素材 id（需先上传素材）
              need_open_comment: 1,
            },
          ],
        }),
        signal: AbortSignal.timeout(10000),
      },
    )
    return (await draftRes.json()) as WechatDraftResponse
  } catch (e) {
    return { errcode: -1, errmsg: (e as Error).message }
  }
}

export async function publishWechat(runId: string): Promise<PublishOutcome> {
  const article = await db.article.findFirst({ where: { runId }, orderBy: { version: "desc" } })
  if (!article || !article.formatted) {
    throw new Error("没有可发布的成稿（排版步骤未完成）")
  }
  const cover = await db.asset.findFirst({ where: { runId, role: "cover", path: { not: "" } } })

  // Level 1: 草稿箱 API
  const draft = await tryWechatDraft(article.title, article.formatted, cover?.path ?? "")
  if (draft?.media_id) {
    const outcome: PublishOutcome = {
      level: 1,
      levelName: "草稿箱 API",
      reason: "服务号已授权，草稿已推送",
      html: article.formatted,
      htmlLength: article.formatted.length,
      externalUrl: `wechat:draft/${draft.media_id}`,
      instruction: "已推送至公众号草稿箱，请在公众号后台「草稿箱」查看并群发。",
    }
    await db.publishRecord.create({
      data: {
        runId, platform: "wechat", level: 1, levelName: outcome.levelName,
        reason: outcome.reason, externalUrl: outcome.externalUrl, htmlLength: outcome.htmlLength,
      },
    })
    return outcome
  }

  // Level 2: 粘贴加固（默认路径）
  const reason = !process.env.WECHAT_APP_ID
    ? "未配置 WECHAT_APP_ID/SECRET（需认证服务号，个人订阅号不可用）→ 降级为粘贴加固"
    : `草稿箱 API 调用失败（${draft?.errmsg ?? "未知错误"}）→ 降级为粘贴加固`
  const outcome: PublishOutcome = {
    level: 2,
    levelName: "粘贴加固 HTML",
    reason,
    html: article.formatted,
    htmlLength: article.formatted.length,
    externalUrl: "",
    instruction: "复制下方 HTML 渲染结果（用预览区「复制」按钮），粘贴进公众号编辑器即可保留全部样式。",
  }
  await db.publishRecord.create({
    data: {
      runId, platform: "wechat", level: 2, levelName: outcome.levelName,
      reason: outcome.reason, htmlLength: outcome.htmlLength,
    },
  })
  return outcome
}
