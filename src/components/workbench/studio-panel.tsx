'use client'

/**
 * 创作台（Phase 2 主 UI）：
 *   新建运行（选题池 → 流水线）→ Run 看板 → Run 详情（run-detail）
 *   + 编辑飞轮面板（「学习我的修改」规则：proposed → active）
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useToast } from '@/hooks/use-toast'
import { RunDetailDialog } from './run-detail'
import {
  PERSONA_NAMES, STATUS_BADGES,
  type LearnRuleItem, type PersonaItem, type RunListItem, type ThemeItem,
} from './types'
import { Lightbulb, Loader2, Play, Sparkles, Check, X, GraduationCap, FileText } from 'lucide-react'

interface IdeaOption {
  id: string
  title: string
  angle?: string | null
  score?: number | null
  status: string
}

export function StudioPanel() {
  const { toast } = useToast()
  const [runs, setRuns] = useState<RunListItem[]>([])
  const [personas, setPersonas] = useState<PersonaItem[]>([])
  const [themes, setThemes] = useState<ThemeItem[]>([])
  const [ideas, setIdeas] = useState<IdeaOption[]>([])
  const [rules, setRules] = useState<LearnRuleItem[]>([])
  const [ruleCounts, setRuleCounts] = useState<{ proposed: number; active: number; dismissed: number }>({ proposed: 0, active: 0, dismissed: 0 })
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  // 表单状态
  const [ideaId, setIdeaId] = useState<string>('')
  const [customTitle, setCustomTitle] = useState('')
  const [persona, setPersona] = useState('midnight-friend')
  const [theme, setTheme] = useState('classic')
  const [withCover, setWithCover] = useState(false)

  const [openRunId, setOpenRunId] = useState<string | null>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch('/api/runs')
      const data = await res.json()
      if (data.ok) {
        setRuns(data.runs as RunListItem[])
        if (!personas.length) {
          setPersonas(data.meta.personas as PersonaItem[])
          setThemes(data.meta.themes as ThemeItem[])
        }
      }
    } catch {
      /* ignore */
    } finally {
      setLoading(false)
    }
  }, [personas.length])

  const loadIdeas = useCallback(async () => {
    try {
      const res = await fetch('/api/ideas')
      const data = await res.json()
      if (data.ok) {
        const pool = (data.ideas as IdeaOption[]).filter((i) => ['new', 'shortlist'].includes(i.status))
        setIdeas(pool)
      }
    } catch {
      /* ignore */
    }
  }, [])

  const loadRules = useCallback(async () => {
    try {
      const res = await fetch('/api/learn')
      const data = await res.json()
      if (data.ok) {
        setRules(data.rules as LearnRuleItem[])
        setRuleCounts(data.counts)
      }
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    loadRuns()
    loadIdeas()
    loadRules()
  }, [loadRuns, loadIdeas, loadRules])

  // 有运行中的 Run 时轮询看板
  useEffect(() => {
    const hasActive = runs.some((r) => ['running', 'pending'].includes(r.status))
    if (hasActive && !pollRef.current) {
      pollRef.current = setInterval(loadRuns, 5000)
    } else if (!hasActive && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [runs, loadRuns])

  async function handleCreate() {
    const usingIdea = ideaId && ideaId !== 'custom'
    if (!usingIdea && !customTitle.trim()) {
      toast({ title: '请先选择选题或输入标题', variant: 'destructive' })
      return
    }
    setCreating(true)
    try {
      const res = await fetch('/api/runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          usingIdea
            ? { ideaId, persona, theme, withCover }
            : { title: customTitle.trim(), persona, theme, withCover }
        ),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: '创建失败', description: data.message, variant: 'destructive' })
        return
      }
      toast({ title: '流水线已启动', description: '任务书 → 取证 → 初稿 → 审稿 → 排版，约 1~2 分钟' })
      setCustomTitle('')
      await loadRuns()
      if (usingIdea) await loadIdeas()
    } catch (e) {
      toast({ title: '创建失败', description: (e as Error)?.message || '网络异常', variant: 'destructive' })
    } finally {
      setCreating(false)
    }
  }

  async function handleRuleStatus(id: string, status: 'active' | 'dismissed') {
    try {
      const res = await fetch('/api/learn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, status }),
      })
      const data = await res.json()
      if (!data.ok) {
        toast({ title: '操作失败', description: data.message, variant: 'destructive' })
        return
      }
      loadRules()
      toast({
        title: status === 'active' ? '规则已生效' : '规则已忽略',
        description: status === 'active' ? '之后每次写作都会自动注入这条偏好' : undefined,
      })
    } catch (e) {
      toast({ title: '操作失败', description: (e as Error)?.message, variant: 'destructive' })
    }
  }

  const selectedIdea = ideas.find((i) => i.id === ideaId)

  return (
    <div className="space-y-5">
      {/* 新建运行 */}
      <Card className="border-slate-200 bg-white shadow-none">
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600/10 text-teal-700">
              <Play className="h-3.5 w-3.5" />
            </span>
            <h2 className="text-sm font-bold text-slate-800">新建创作运行</h2>
            <span className="text-[11px] text-slate-400">一句话从选题到微信兼容成稿，六步全自动</span>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-[11px] text-slate-500">选题来源</Label>
              <Select value={ideaId} onValueChange={(v) => setIdeaId(v)}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="从选题池选择（或下方直接输入标题）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="custom" className="text-xs">✍️ 手动输入标题</SelectItem>
                  {ideas.map((i) => (
                    <SelectItem key={i.id} value={i.id} className="text-xs">
                      <span className="line-clamp-1">{i.title.slice(0, 40)}</span>
                      {i.score != null && <Badge variant="outline" className="ml-1.5 px-1 py-0 text-[9px] text-slate-500">{i.score}</Badge>}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ideaId === 'custom' && (
                <Input
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  placeholder="文章主题，如「2026 年 AI Agent 会取代应用吗」"
                  className="h-9 text-xs"
                />
              )}
              {selectedIdea?.angle && (
                <p className="line-clamp-2 rounded-md bg-slate-50 px-2.5 py-1.5 text-[11px] leading-relaxed text-slate-500">
                  已有角度：{selectedIdea.angle}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-500">写作人格</Label>
                <Select value={persona} onValueChange={setPersona}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {personas.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        <span className="font-medium">{p.name}</span>
                        <span className="ml-1.5 text-slate-400">{p.desc.slice(0, 12)}…</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-[11px] text-slate-500">排版主题</Label>
                <Select value={theme} onValueChange={setTheme}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {themes.map((t) => (
                      <SelectItem key={t.id} value={t.id} className="text-xs">
                        <span className="font-medium">{t.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div className="flex items-center gap-2">
              <Switch checked={withCover} onCheckedChange={setWithCover} id="cover" className="scale-90" />
              <Label htmlFor="cover" className="cursor-pointer text-[11px] text-slate-500">
                生成封面配图（生图渠道 Provider，环境受限时自动降级为无封面）
              </Label>
            </div>
            <Button size="sm" className="h-8 gap-1.5 bg-teal-600 px-4 text-xs hover:bg-teal-700" disabled={creating} onClick={handleCreate}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
              开始创作
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Run 看板 */}
      <section aria-label="运行看板">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <FileText className="h-4 w-4 text-teal-700" /> 创作运行看板
          </h2>
          <Button size="sm" variant="outline" className="h-7 gap-1 px-2.5 text-[11px] hover:border-teal-500 hover:text-teal-700" onClick={loadRuns}>
            <Loader2 className="hidden h-3 w-3" /> 刷新
          </Button>
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Card key={i} className="border-slate-200 bg-white shadow-none">
                <CardContent className="space-y-2 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-3 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : runs.length === 0 ? (
          <Card className="border-dashed border-slate-300 bg-white shadow-none">
            <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
              <Lightbulb className="h-8 w-8 text-slate-300" />
              <p className="text-sm font-medium text-slate-500">还没有创作运行</p>
              <p className="text-xs text-slate-400">从上方选择一个选题（或输入标题），点击「开始创作」启动六步流水线</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {runs.map((r) => {
              const badge = STATUS_BADGES[r.status]
              const avg = r.reviewScores
                ? (Object.values(r.reviewScores).reduce((a, b) => a + b, 0) / 5).toFixed(1)
                : null
              const doneSteps = (r.steps ?? []).filter((s) => s.status === 'done' || s.status === 'skipped').length
              return (
                <Card
                  key={r.id}
                  className="cursor-pointer border-slate-200 bg-white shadow-none transition-colors hover:border-teal-300"
                  onClick={() => setOpenRunId(r.id)}
                >
                  <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-2 p-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="line-clamp-1 text-sm font-semibold text-slate-800">{r.title}</p>
                        {badge && (
                          <Badge variant="outline" className={`shrink-0 px-1.5 py-0 text-[10px] ${badge.cls}`}>
                            {['running', 'pending'].includes(r.status) && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                            {badge.label}
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-400">
                        <span>{PERSONA_NAMES[r.persona] ?? r.persona}</span>
                        {r.articleChars > 0 && <span>{r.articleChars} 字</span>}
                        {r.claimCount > 0 && <span>{r.claimCount} 条主张</span>}
                        {avg && <span className="text-teal-600">五维均分 {avg}</span>}
                        <span>{new Date(r.createdAt).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {(r.steps ?? []).slice(0, 6).map((s) => (
                        <span
                          key={s.key}
                          title={`${s.label}：${s.status}`}
                          className={`h-1.5 w-5 rounded-full ${
                            s.status === 'done' ? 'bg-emerald-500'
                            : s.status === 'failed' ? 'bg-red-400'
                            : s.status === 'running' ? 'bg-teal-400 animate-pulse'
                            : s.status === 'skipped' ? 'bg-slate-200'
                            : 'bg-slate-100'
                          }`}
                        />
                      ))}
                      <span className="ml-1 font-mono text-[10px] text-slate-400">{doneSteps}/6</span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </section>

      {/* 编辑飞轮 */}
      <section aria-label="编辑飞轮">
        <div className="mb-2.5 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <GraduationCap className="h-4 w-4 text-teal-700" /> 编辑飞轮
            <Badge variant="outline" className="border-teal-200 bg-teal-50 px-1.5 py-0 text-[10px] font-normal text-teal-700">
              生效 {ruleCounts.active} 条
            </Badge>
            {ruleCounts.proposed > 0 && (
              <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] font-normal text-amber-700">
                待确认 {ruleCounts.proposed}
              </Badge>
            )}
          </h2>
        </div>
        <Card className="border-slate-200 bg-white shadow-none">
          <CardContent className="p-0">
            {rules.filter((r) => r.status !== 'dismissed').length === 0 ? (
              <div className="flex flex-col items-center gap-1.5 px-4 py-8 text-center">
                <Sparkles className="h-6 w-6 text-slate-300" />
                <p className="text-xs font-medium text-slate-500">飞轮还没转动</p>
                <p className="max-w-md text-[11px] leading-relaxed text-slate-400">
                  在 Run 详情里点「改稿（喂飞轮）」修改正文并保存——你的修改会被归纳为写作规则，
                  确认后自动注入之后的每一次写作
                </p>
              </div>
            ) : (
              <ScrollArea className="max-h-72">
                <div className="divide-y divide-slate-100">
                  {rules
                    .filter((r) => r.status !== 'dismissed')
                    .map((r) => (
                      <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                        {r.status === 'active' ? (
                          <Badge variant="outline" className="border-emerald-200 bg-emerald-50 px-1.5 py-0 text-[10px] text-emerald-700">生效中</Badge>
                        ) : (
                          <Badge variant="outline" className="border-amber-200 bg-amber-50 px-1.5 py-0 text-[10px] text-amber-700">待确认</Badge>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-xs leading-relaxed text-slate-700">{r.ruleText}</p>
                          {r.examples && r.examples.length > 0 && (
                            <p className="mt-0.5 truncate font-mono text-[10px] text-slate-400">
                              例：{r.examples[0].before} → {r.examples[0].after}
                            </p>
                          )}
                        </div>
                        {r.status === 'proposed' && (
                          <div className="flex shrink-0 gap-1">
                            <Button size="sm" variant="outline" className="h-6 gap-1 border-emerald-300 px-2 text-[10px] text-emerald-700 hover:bg-emerald-50" onClick={() => handleRuleStatus(r.id, 'active')}>
                              <Check className="h-3 w-3" /> 确认生效
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 gap-1 px-2 text-[10px] text-slate-500 hover:bg-slate-50" onClick={() => handleRuleStatus(r.id, 'dismissed')}>
                              <X className="h-3 w-3" /> 忽略
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Run 详情 */}
      <RunDetailDialog
        runId={openRunId}
        open={Boolean(openRunId)}
        onClose={() => setOpenRunId(null)}
        onChanged={() => {
          loadRuns()
          loadRules()
        }}
      />
    </div>
  )
}
