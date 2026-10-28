/**
 * radar-rewrite —— 一稿多发 skill（wewrite 一稿多发的自研版）
 *
 * 同一成稿按平台特性改写：
 *  - csdn：技术向 Markdown，结构化标题 + 代码块友好，标题前缀规范
 *  - xiaohongshu：口语化短句 + emoji 适度 + #话题标签，500 字内
 */

import type { ChatMessage } from '@/lib/gateway/types'

export type RewriteTarget = 'csdn' | 'xiaohongshu'

export const REWRITE_TARGETS: Array<{ id: RewriteTarget; name: string; desc: string }> = [
  { id: 'csdn', name: 'CSDN 博客', desc: '技术向 Markdown：结构化标题、代码块、目录友好' },
  { id: 'xiaohongshu', name: '小红书笔记', desc: '口语化短句、适度 emoji、结尾 #话题标签、500 字内' },
]

export function buildRewriteMessages(args: {
  title: string
  markdown: string
  target: RewriteTarget
  personaName: string
}): ChatMessage[] {
  const targetSpec =
    args.target === 'csdn'
      ? `CSDN 博客版改写要求：
- 保留 Markdown 格式，标题层级规范（## 小节、### 子节）
- 开头加一段 2~3 行的「本文速览」（TL;DR），用 > 引用块
- 技术步骤用有序列表；命令与配置用代码块
- 保留 [n] 参考来源编号，文末列参考列表（链接以纯文本给出）
- 标题改写为 CSDN 风格：具体、含关键词、不用标题党
- 语气可以更工程化，但不要丢掉原文的核心判断`
      : `小红书笔记版改写要求：
- 全文 350~500 字，短句为主，每段不超过 3 行
- 开头 2 句必须制造共鸣或钩子（「你是不是也……」）
- emoji 适度使用（每段最多 1~2 个，贴语境）
- 关键句用【】或独立短行强调
- 删除全部 [n] 编号与参考来源区（小红书不放链接）
- 结尾给 3~6 个 #话题标签，用空格分隔
- 标题 20 字内，口语化`

  return [
    {
      role: 'system',
      content: `你是多平台内容运营，正在把一篇公众号成稿改写为 ${args.target === 'csdn' ? 'CSDN 博客' : '小红书笔记'}。保持原文核心判断与事实准确性（${args.personaName} 人格的立场不变），只改变结构与语感。只输出改写后的正文（${args.target === 'csdn' ? 'Markdown' : '纯文本'}），第一行输出改写后的标题（格式：# 标题），不要任何解释。`,
    },
    {
      role: 'user',
      content: `${targetSpec}

原文标题：${args.title}

原文（公众号 Markdown）：
${args.markdown}`,
    },
  ]
}
