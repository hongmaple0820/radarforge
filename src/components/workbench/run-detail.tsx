'use client'

/**
 * Run 详情 Dialog：六步流水线留痕 + claims 账本 + 五维审稿 + 排版预览（iframe 手机模拟）
 * + 人工改稿（触发编辑飞轮）+ 一稿多发 + 发布三级降级
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import {
  CheckCircle2, CircleDashed, Loader2, MinusCircle, XCircle, ExternalLink,
  Copy, Download, Sparkles, Send, PenLine, BookOpenCheck, RefreshCw,
} from 'lucide-react'
import {
  CLAIM_TYPE_NAMES, PERSONA_NAMES, REVIEW_DIMENSION_NAMES, STATUS_BADGES,
  type RunDetail, type StepRecord,
} from './types'

const STEP_ICONS: Record<string, string> = {
  brief: '任务书', research: '取证', draft: '初稿', review: '审稿', cover: '封面', layout: '排版',
}

function StepIcon({ status }: { status: StepRecord['status'] }) {
  if (status === 'done') return <CheckCircle2 className="h-4 w-4 text-emerald-600" />
  if (status === 'running') return <Loader2 className="h-4 w-4 animate-spin text-teal-600" />
  if (status === 'failed') return <XCircle className="h-4 w-4 text-red-500" />
  if (status === 'skipped') return <MinusCircle className="h-4 w-4 text-slate-300" />
  return <CircleDashed className="h-4 w-4 text-slate-300" />
}

function ScoreBar({ name, score }: { name: string; score: number }) {
  const pct = Math.max(0, Math.min(100, score * 10))
  const color = score >= 8 ? 'bg-emerald-500' : score >= 6 ? 'bg-teal-500' : 'bg-amber-500'
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 shrink-0 text-[11px] text-slate-500">{name}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 shrink-0 text-right font-mono text-[11px] text-slate-600">{score.toFixed(1)}</span>
    </div>
  )
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

export function RunDetailDialog({
  runId, open, onClose, onChanged,
}: {
  runId: string | null
  open: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const { toast } = useToast()
  const [detail, setDetail] = useState<RunDetail | null>(null)
  const [loading, setLoading] = useState(false)
  const [editText, setEditText] = useState('')
  const [editOpen, setEditOpen] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [learnResult, setLearnResult] = useState<{ diffSummary: string; rules: Array<{ id: string; ruleText: string }>; skipped?: string } | null>(null)
  const [rewriteContent, setRewriteContent] = useState<{ target: string; content: string } | null>(null)

  const load = useCallback(async () => {
    if (!runId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/runs/${runId}`)
      const data = await res.json()
      if (data.ok) setDetail(data.run as RunDetail)
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [runId])

  useEffect(() => {
    if (open && runId) {
      setLearnResult(null)
      setRewriteContent(null)
      setEditOpen(false)
      load()
    }
  }, [open, runId, load])

  // 运行中每 4s 轮询
  useEffect(() => {
    if (!open || !detail) return
    if (!['running', 'pending'].includes(detail.status)) return
    const t = setInterval(load, 4000)
    return () => clearInterval(t)
  }, [open, detail, load])

  const latestWechat = useMemo(
    () => detail?.articles.filter((a) => a.target === 'wechat').sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [detail]
  )
  const running = detail ? ['running', 'pending'].includes(detail.status) : false

  async function doAction(action: string, payload: Record<string, unknown> = {}, label: string) {
    if (!runId) return null
    setBusy(action)
    try {
      const res = await fetch(`/api/runs/${runId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: `${label}失败`, description: data.message || '请稍后重试', variant: 'destructive' })
        return null
      }
      onChanged()
      return data
    } catch (e) {
      toast({ title: `${label}失败`, description: (e as Error)?.message || '网络异常', variant: 'destructive' })
      return null
    } finally {
      setBusy(null)
    }
  }

  async function handleSaveEdit() {
    const data = await doAction('edit', { content: editText }, '保存改稿')
    if (!data) return
    setLearnResult(data.learn ?? null)
    setEditOpen(false)
    toast({ title: '改稿已保存', description: data.learn?.rules?.length ? `提炼出 ${data.learn.rules.length} 条写作规则，待确认` : '已重新排版' })
    load()
  }

  async function handleRewrite(target: 'csdn' | 'xiaohongshu') {
    const data = await doAction('rewrite', { target }, target === 'csdn' ? 'CSDN 改写' : '小红书改写')
    if (!data) return
    setRewriteContent({ target, content: data.article.content })
    toast({ title: '改写完成', description: `${data.article.chars} 字 · 可直接复制发布` })
  }

  async function handlePublish(channel: 'wechat' | 'csdn' | 'xiaohongshu') {
    const data = await doAction('publish', { channel }, '发布')
    if (!data) return
    const p = data.publish
    if (p.mode === 'local-paste' && p.html) {
      const ok = await copyText(p.html)
      toast({
        title: ok ? '加固 HTML 已复制到剪贴板' : '已生成加固 HTML',
        description: `${p.note}——直接粘贴进${channel === 'wechat' ? '公众号编辑器' : '平台编辑器'}即可`,
      })
    } else if (p.mode === 'local-paste' && p.markdown) {
      const ok = await copyText(p.markdown)
      toast({ title: ok ? '改写版已复制' : '改写版已就绪', description: p.note })
    } else if (p.mode === 'draft-api') {
      toast({ title: '已推送微信草稿箱', description: p.note })
    }
    load()
  }

  function handleDownloadHtml() {
    if (!latestWechat?.html) return
    const blob = new Blob([latestWechat.html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${detail?.title.slice(0, 30) || 'article'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const statusBadge = detail ? STATUS_BADGES[detail.status] : null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[92vh] w-[min(96vw,1080px)] overflow-y-auto p-0 sm:rounded-xl">
        <DialogHeader className="border-b border-slate-100 px-5 py-4 sm:px-6">
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6 text-base sm:text-lg">
            <span className="line-clamp-1">{detail?.title ?? '加载中…'}</span>
            {statusBadge && (
              <Badge variant="outline" className={`shrink-0 text-[10px] ${statusBadge.cls}`}>{statusBadge.label}</Badge>
            )}
            {running && <Loader2 className="h-4 w-4 animate-spin text-teal-600" />}
          </DialogTitle>
          {detail && (
            <p className="text-[11px] text-slate-500">
              人格 {PERSONA_NAMES[detail.persona] ?? detail.persona} · 主题 {detail.theme} · {detail.claims.length} 条主张 · {detail.articles.length} 个版本
            </p>
          )}
        </DialogHeader>

        {loading && !detail ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> 读取运行详情…
          </div>
        ) : detail ? (
          <div className="space-y-5 px-5 py-5 sm:px-6">
            {/* 失败原因 */}
            {detail.status === 'failed' && detail.error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                失败原因：{detail.error}
              </div>
            )}

            {/* 步骤时间线 */}
            <section aria-label="流水线步骤">
              <h3 className="mb-2.5 text-xs font-bold text-slate-500">流水线留痕（Agent 运行时）</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
                {(detail.steps ?? []).map((s) => (
                  <div
                    key={s.key}
                    className={`rounded-lg border px-3 py-2.5 ${
                      s.status === 'done' ? 'border-emerald-100 bg-emerald-50/60'
                      : s.status === 'failed' ? 'border-red-100 bg-red-50/60'
                      : s.status === 'running' ? 'border-teal-200 bg-teal-50/60'
                      : 'border-slate-100 bg-slate-50/60'
                    }`}
                    title={s.detail}
                  >
                    <div className="flex items-center gap-1.5">
                      <StepIcon status={s.status} />
                      <span className="text-[11px] font-semibold text-slate-700">{STEP_ICONS[s.key] ?? s.label}</span>
                      {s.latencyMs != null && s.status === 'done' && (
                        <span className="ml-auto font-mono text-[9px] text-slate-400">{(s.latencyMs / 1000).toFixed(1)}s</span>
                      )}
                    </div>
                    {s.detail && <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-slate-500">{s.detail}</p>}
                  </div>
                ))}
              </div>
            </section>

            {/* claims 账本 */}
            {detail.claims.length > 0 && (
              <section aria-label="主张账本">
                <h3 className="mb-2.5 flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <BookOpenCheck className="h-3.5 w-3.5" /> 主张账本（元宝搜索取证 · claims 留痕）
                </h3>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <ScrollArea className="max-h-56">
                    <table className="w-full text-left text-[11px]">
                      <thead className="sticky top-0 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="w-10 px-2.5 py-2 font-medium">#</th>
                          <th className="w-14 px-2 py-2 font-medium">类型</th>
                          <th className="px-2 py-2 font-medium">主张</th>
                          <th className="w-44 px-2 py-2 font-medium">来源</th>
                          <th className="w-16 px-2 py-2 font-medium">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.claims.map((c, i) => {
                          const src = (c.sourceJson ?? [])[0]
                          return (
                            <tr key={c.id} className="border-t border-slate-100 align-top">
                              <td className="px-2.5 py-2 font-mono text-slate-400">[{i + 1}]</td>
                              <td className="px-2 py-2">
                                <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-slate-600">{CLAIM_TYPE_NAMES[c.claimType] ?? c.claimType}</Badge>
                              </td>
                              <td className="px-2 py-2 leading-relaxed text-slate-700">{c.text}</td>
                              <td className="px-2 py-2">
                                {src?.url ? (
                                  <a href={src.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 flex items-start gap-1 text-teal-700 hover:underline">
                                    <span className="line-clamp-2">{src.site}：{src.title}</span>
                                    <ExternalLink className="mt-0.5 h-3 w-3 shrink-0" />
                                  </a>
                                ) : (
                                  <span className="text-slate-400">未检索到直接来源</span>
                                )}
                              </td>
                              <td className="px-2 py-2">
                                {c.verified === true ? (
                                  <Badge variant="outline" className="border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[9px] text-emerald-700">已核实</Badge>
                                ) : c.verified === false ? (
                                  <Badge variant="outline" className="border-red-200 bg-red-50 px-1.5 py-0 text-[9px] text-red-600">未证实</Badge>
                                ) : (
                                  <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-slate-400">免核/降级</Badge>
                                )}
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </ScrollArea>
                </div>
              </section>
            )}

            {/* 审稿报告 */}
            {detail.reviews.length > 0 && (
              <section aria-label="审稿报告">
                <h3 className="mb-2.5 text-xs font-bold text-slate-500">五维审稿（{detail.reviews[0].verdict === 'pass' ? '通过' : '修订后通过'}）</h3>
                <div className="rounded-lg border border-slate-200 bg-white p-4">
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-5">
                    {REVIEW_DIMENSION_NAMES.map((d) => (
                      <ScoreBar key={d.key} name={d.name} score={detail.reviews[0].scores[d.key] ?? 0} />
                    ))}
                  </div>
                  <p className="mt-3 border-t border-slate-100 pt-2.5 text-xs leading-relaxed text-slate-600">{detail.reviews[0].summary}</p>
                  {detail.reviews[0].suggestions?.length > 0 && (
                    <ul className="mt-2 space-y-1">
                      {detail.reviews[0].suggestions.map((s, i) => (
                        <li key={i} className="flex gap-1.5 text-[11px] leading-relaxed text-slate-500">
                          <span className="font-mono text-slate-400">{i + 1}.</span>{s}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            )}

            {/* 成稿区 */}
            {latestWechat && (
              <section aria-label="成稿">
                <Tabs defaultValue="preview" className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <TabsList className="h-8 rounded-lg border border-slate-200 bg-white p-0.5">
                      <TabsTrigger value="preview" className="h-7 rounded-md px-3 text-[11px] data-[state=active]:bg-slate-800 data-[state=active]:text-white">微信预览</TabsTrigger>
                      <TabsTrigger value="source" className="h-7 rounded-md px-3 text-[11px] data-[state=active]:bg-slate-800 data-[state=active]:text-white">Markdown</TabsTrigger>
                      <TabsTrigger value="multi" className="h-7 rounded-md px-3 text-[11px] data-[state=active]:bg-slate-800 data-[state=active]:text-white">一稿多发</TabsTrigger>
                    </TabsList>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700" disabled={busy === 'edit'} onClick={() => { setEditText(latestWechat.content); setEditOpen(true); setLearnResult(null) }}>
                        <PenLine className="h-3 w-3" /> 改稿（喂飞轮）
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700" disabled={!latestWechat.html} onClick={async () => { const ok = await copyText(latestWechat.html ?? ''); toast({ title: ok ? '加固 HTML 已复制' : '复制失败', description: ok ? '粘贴进公众号编辑器，样式保留' : '请改用下载' }) }}>
                        <Copy className="h-3 w-3" /> 复制加固 HTML
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700" disabled={!latestWechat.html} onClick={handleDownloadHtml}>
                        <Download className="h-3 w-3" /> 下载
                      </Button>
                      <Button size="sm" className="h-7 gap-1 bg-teal-600 px-3 text-[11px] hover:bg-teal-700" disabled={busy === 'publish'} onClick={() => handlePublish('wechat')}>
                        <Send className="h-3 w-3" /> 发布公众号
                      </Button>
                    </div>
                  </div>

                  <TabsContent value="preview" className="space-y-2">
                    {latestWechat.html ? (
                      <div className="flex justify-center rounded-lg border border-slate-200 bg-slate-100 p-4">
                        <iframe
                          title="微信排版预览"
                          srcDoc={latestWechat.html}
                          className="h-[560px] w-full max-w-[390px] rounded-lg border border-slate-300 bg-white shadow-sm"
                          sandbox="allow-same-origin"
                        />
                      </div>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-300 py-10 text-center text-xs text-slate-400">排版产物待生成</div>
                    )}
                  </TabsContent>

                  <TabsContent value="source">
                    <ScrollArea className="h-[480px] rounded-lg border border-slate-200 bg-white">
                      <pre className="whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-slate-700">{latestWechat.content}</pre>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="multi" className="space-y-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700" disabled={busy === 'rewrite'} onClick={() => handleRewrite('csdn')}>
                        <RefreshCw className={`h-3 w-3 ${busy === 'rewrite' ? 'animate-spin' : ''}`} /> 生成 CSDN 版
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700" disabled={busy === 'rewrite'} onClick={() => handleRewrite('xiaohongshu')}>
                        <RefreshCw className={`h-3 w-3 ${busy === 'rewrite' ? 'animate-spin' : ''}`} /> 生成小红书版
                      </Button>
                      {rewriteContent && (
                        <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700" onClick={async () => { const ok = await copyText(rewriteContent.content); toast({ title: ok ? '改写版已复制' : '复制失败' }) }}>
                          <Copy className="h-3 w-3" /> 复制{rewriteContent.target === 'csdn' ? 'CSDN' : '小红书'}版
                        </Button>
                      )}
                    </div>
                    {rewriteContent ? (
                      <ScrollArea className="h-[420px] rounded-lg border border-slate-200 bg-white">
                        <pre className="whitespace-pre-wrap p-4 font-mono text-[11px] leading-relaxed text-slate-700">{rewriteContent.content}</pre>
                      </ScrollArea>
                    ) : (
                      <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-xs leading-relaxed text-slate-400">
                        同一成稿可改写为 CSDN 博客（技术向 Markdown）与小红书笔记（口语化短文）——一稿多发，各自适配平台语感
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </section>
            )}

            {/* 发布留痕 */}
            {detail.publishes.length > 0 && (
              <section aria-label="发布留痕">
                <h3 className="mb-2.5 text-xs font-bold text-slate-500">发布留痕（三级降级链）</h3>
                <div className="space-y-1.5">
                  {detail.publishes.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px]">
                      <Badge variant="outline" className="px-1.5 py-0 text-[9px] text-slate-600">{p.platform}</Badge>
                      <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[9px] text-amber-700">{p.mode}</Badge>
                      <span className="text-slate-500">{p.note}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        ) : null}
      </DialogContent>

      {/* 人工改稿 Sheet（触发编辑飞轮） */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] w-[min(94vw,860px)] p-0 sm:rounded-xl">
          <DialogHeader className="border-b border-slate-100 px-5 py-3.5">
            <DialogTitle className="flex items-center gap-2 text-sm">
              <Sparkles className="h-4 w-4 text-teal-600" /> 人工改稿 · 保存后自动提炼写作规则（编辑飞轮）
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 px-5 py-4">
            <Textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              className="min-h-[420px] resize-y font-mono text-[12px] leading-relaxed"
              placeholder="修改 Markdown 正文…你的每一次修改都会被归纳为可复用的写作偏好"
            />
            {learnResult && (
              <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3 text-xs">
                <p className="font-semibold text-teal-800">{learnResult.diffSummary}</p>
                {learnResult.rules.length > 0 ? (
                  <ul className="mt-1.5 space-y-1 text-teal-700">
                    {learnResult.rules.map((r) => (
                      <li key={r.id} className="flex gap-1.5"><Sparkles className="mt-0.5 h-3 w-3 shrink-0" />{r.ruleText}<span className="text-teal-500">（待确认）</span></li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-teal-600">{learnResult.skipped ?? '未提炼出规则'}</p>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setEditOpen(false)}>取消</Button>
              <Button size="sm" className="h-8 gap-1 bg-teal-600 text-xs hover:bg-teal-700" disabled={busy === 'edit' || editText.trim().length < 50} onClick={handleSaveEdit}>
                {busy === 'edit' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PenLine className="h-3.5 w-3.5" />}
                保存并提炼规则
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  )
}
