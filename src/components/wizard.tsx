"use client"

// ============================================================
// wizard.tsx —— 三步向导（P1 交互三件套 · 抓手 1）
// 新手动线：选题 → 人格与风格（可视化卡片）→ 确认（预览 brief
// 会写什么）。学 mdnice/doocs 的「所见即所得」心智：每一步都
// 给出「下一秒会发生什么」的预期。老手走「高级模式」直达表单。
// ============================================================

import { useEffect, useMemo, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { PenLine, ArrowRight, ArrowLeft, Play, Loader2, Lightbulb, CheckCircle2, Sparkles, BookOpen } from "lucide-react"

interface PersonaInfo { id: string; label: string; desc: string }
interface ThemeInfo { id: string; label: string; category: string; description: string }
interface IdeaItem { id: string; title: string; angle: string; status: string }
interface ExemplarItem { id: string; name: string; words: number }

export interface WizardPayload {
  ideaTitle: string
  ideaAngle: string
  persona: string
  theme: string
  exemplarId: string
}

const STEP_META = [
  { title: "选题", hint: "这篇小说写什么——一句话标题就够，角度可选" },
  { title: "人格与风格", hint: "以谁的身份写、排成什么样式" },
  { title: "确认", hint: "预览任务书要点，然后点火" },
]

/** 人格卡片配色（视觉区分，非语义） */
const PERSONA_TINT: Record<string, string> = {
  "midnight-friend": "from-indigo-50 to-indigo-100/50 dark:from-indigo-950/40 dark:to-indigo-900/20 border-indigo-200 dark:border-indigo-800",
  "cold-analyst": "from-slate-50 to-slate-100/50 dark:from-slate-900/40 dark:to-slate-800/20 border-slate-300 dark:border-slate-700",
  "tech-coder": "from-emerald-50 to-emerald-100/50 dark:from-emerald-950/40 dark:to-emerald-900/20 border-emerald-200 dark:border-emerald-800",
  "sharp-editor": "from-rose-50 to-rose-100/50 dark:from-rose-950/40 dark:to-rose-900/20 border-rose-200 dark:border-rose-800",
  "warm-mentor": "from-amber-50 to-amber-100/50 dark:from-amber-950/40 dark:to-amber-900/20 border-amber-200 dark:border-amber-800",
  "news-anchor": "from-sky-50 to-sky-100/50 dark:from-sky-950/40 dark:to-sky-900/20 border-sky-200 dark:border-sky-800",
  "story-teller": "from-violet-50 to-violet-100/50 dark:from-violet-950/40 dark:to-violet-900/20 border-violet-200 dark:border-violet-800",
}

/** 向导将执行的九步预告（确认页展示，运行前给足预期） */
const NINE_STEPS = [
  { name: "任务书", note: "明确读者/问题/核心判断" },
  { name: "主张取证", note: "搜索检索，落 claims 账本" },
  { name: "大纲先行", note: "JSON 大纲，每节论点+证据编号" },
  { name: "分节初稿", note: "逐节聚焦写作" },
  { name: "跨家族审稿", note: "五维量表，≤2 轮修订" },
  { name: "原子断言", note: "逐条事实核验，无据率门禁" },
  { name: "正文配图", note: "配图位插图（可降级留痕）" },
  { name: "封面", note: "生图封面" },
  { name: "微信排版", note: "18 主题排版成稿" },
]

export function Wizard({
  seed,
  personas,
  themes,
  ideas,
  exemplars,
  starting,
  onStart,
}: {
  seed?: { title: string; angle: string } | null
  personas: PersonaInfo[]
  themes: ThemeInfo[]
  ideas: IdeaItem[]
  exemplars: ExemplarItem[]
  starting: boolean
  onStart: (payload: WizardPayload) => void
}) {
  const [step, setStep] = useState(0)
  const [ideaTitle, setIdeaTitle] = useState("")
  const [ideaAngle, setIdeaAngle] = useState("")
  const [persona, setPersona] = useState("cold-analyst")
  const [theme, setTheme] = useState("professional-clean")
  const [exemplarId, setExemplarId] = useState("")

  // 选题种子（情报中心「去创作」/ ⌘K「新图文」）→ 回第一步并填入；
  // 空标题种子也响应（重置到第一步聚焦输入）
  useEffect(() => {
    if (!seed) return
    setIdeaTitle(seed.title ?? "")
    setIdeaAngle(seed.angle ?? "")
    setStep(0)
  }, [seed])

  const newIdeas = useMemo(() => ideas.filter((i) => i.status === "new").slice(0, 6), [ideas])
  const themeGroups = useMemo(() => {
    return Object.entries(
      themes.reduce<Record<string, ThemeInfo[]>>((acc, t) => {
        ;(acc[t.category] ??= []).push(t)
        return acc
      }, {}),
    )
  }, [themes])
  const selectedPersona = personas.find((p) => p.id === persona)
  const selectedTheme = themes.find((t) => t.id === theme)
  const selectedExemplar = exemplars.find((x) => x.id === exemplarId)

  const canNext = step === 0 ? ideaTitle.trim().length > 0 : true

  return (
    <Card className="border-amber-200/60 dark:border-amber-900/40">
      <CardContent className="pt-5 pb-5">
        {/* 步骤指示器 */}
        <div className="flex items-center gap-2 mb-4">
          <PenLine className="h-4 w-4 text-amber-500 shrink-0" />
          {STEP_META.map((s, i) => (
            <div key={s.title} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                i === step ? "bg-amber-500 text-white" : i < step ? "bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300" : "bg-muted text-muted-foreground"
              }`}>
                {i < step ? <CheckCircle2 className="h-3 w-3" /> : <span className="font-mono">{i + 1}</span>}
                {s.title}
              </div>
              {i < STEP_META.length - 1 && <div className={`h-px w-4 sm:w-8 ${i < step ? "bg-amber-400" : "bg-muted"}`} />}
            </div>
          ))}
          <span className="ml-auto text-[11px] text-muted-foreground truncate hidden sm:inline">{STEP_META[step].hint}</span>
        </div>

        <AnimatePresence mode="wait">
          {/* ---------- Step 1 选题 ---------- */}
          {step === 0 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">选题标题 <span className="text-red-500">*</span></label>
                <Input
                  autoFocus
                  placeholder="一句话说清要写什么，如：具身智能融资观察"
                  value={ideaTitle}
                  onChange={(e) => setIdeaTitle(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && canNext && setStep(1)}
                  className="h-11 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">切入角度（可选）</label>
                <Textarea
                  placeholder="引导任务书生成，如：从成本曲线与落地案例两条线看"
                  value={ideaAngle}
                  onChange={(e) => setIdeaAngle(e.target.value)}
                  rows={2}
                />
              </div>
              {newIdeas.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] text-muted-foreground flex items-center gap-0.5"><Lightbulb className="h-3 w-3" />选题池直达：</span>
                  {newIdeas.map((i) => (
                    <button key={i.id} onClick={() => { setIdeaTitle(i.title); setIdeaAngle(i.angle ?? "") }} className="text-[10px] border rounded-full px-2 py-0.5 hover:border-amber-400 hover:text-amber-600 transition-colors truncate max-w-[220px]">
                      {i.title}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">下一步：为这篇稿子选一个「作者人格」与排版风格 →</p>
            </motion.div>
          )}

          {/* ---------- Step 2 人格与风格 ---------- */}
          {step === 1 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-xs font-medium">写作人格（决定文章的声音）</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {personas.map((p) => {
                    const active = p.id === persona
                    return (
                      <button
                        key={p.id}
                        onClick={() => setPersona(p.id)}
                        className={`text-left rounded-xl border bg-gradient-to-br p-3 space-y-1 transition-all ${PERSONA_TINT[p.id] ?? "border-border from-muted to-background"} ${
                          active ? "ring-2 ring-amber-400 ring-offset-1 dark:ring-offset-background shadow-sm" : "hover:shadow-sm opacity-80 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-bold">{p.label}</span>
                          {active && <CheckCircle2 className="h-3.5 w-3.5 text-amber-500 shrink-0" />}
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-snug">{p.desc}</p>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium">排版主题（成稿的视觉样式，18 选 1）</label>
                <div className="rounded-lg border bg-muted/30 p-2 max-h-36 overflow-y-auto space-y-1.5">
                  {themeGroups.map(([cat, list]) => (
                    <div key={cat} className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[9px] text-muted-foreground w-14 shrink-0 truncate">{cat}</span>
                      {list.map((t) => (
                        <button
                          key={t.id}
                          title={t.description}
                          onClick={() => setTheme(t.id)}
                          className={`text-[10px] border rounded-md px-1.5 py-0.5 transition-colors ${theme === t.id ? "border-amber-400 bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 font-semibold" : "hover:border-amber-300 text-muted-foreground"}`}
                        >
                          {t.id}
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
              {exemplars.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <BookOpen className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-[11px] text-muted-foreground">文风校准：</span>
                  <select value={exemplarId} onChange={(e) => setExemplarId(e.target.value)} className="h-7 text-[11px] border rounded-md bg-background px-2 max-w-[200px]" aria-label="文风校准档案">
                    <option value="">不校准（默认）</option>
                    {exemplars.map((x) => (
                      <option key={x.id} value={x.id}>{x.name}（{x.words} 字）</option>
                    ))}
                  </select>
                  {exemplarId && <span className="text-[10px] text-amber-600">仅校准结构与节奏</span>}
                </div>
              )}
              <p className="text-[10px] text-muted-foreground">下一步：确认任务书要点，预览整条流水线将做什么 →</p>
            </motion.div>
          )}

          {/* ---------- Step 3 确认 ---------- */}
          {step === 2 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-3">
              <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/40 dark:bg-amber-950/20 p-3.5 space-y-2">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                  <Sparkles className="h-3.5 w-3.5" />任务书（brief）将这样写
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-[11px]">
                  <div><span className="text-muted-foreground">选题：</span><span className="font-medium">{ideaTitle.trim()}</span></div>
                  <div><span className="text-muted-foreground">人格：</span><span className="font-medium">{selectedPersona?.label ?? persona}</span></div>
                  <div className="truncate"><span className="text-muted-foreground">主题：</span><span className="font-mono">{theme}</span></div>
                  <div><span className="text-muted-foreground">文风：</span><span className="font-medium">{selectedExemplar ? `${selectedExemplar.name}（结构节奏）` : "不校准"}</span></div>
                  {ideaAngle.trim() && <div className="col-span-full"><span className="text-muted-foreground">角度：</span><span>{ideaAngle.trim()}</span></div>}
                </div>
                <p className="text-[10px] text-muted-foreground leading-snug">{selectedPersona?.desc}</p>
              </div>
              <div className="space-y-1.5">
                <div className="text-[11px] font-semibold">点「启动」后流水线将依次执行（约 4~6 分钟）：</div>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9 gap-1.5">
                  {NINE_STEPS.map((s, i) => (
                    <div key={s.name} className="rounded-md border px-2 py-1.5 space-y-0.5 bg-muted/30">
                      <div className="flex items-center gap-1">
                        <span className="text-[9px] font-mono text-muted-foreground">{i + 1}</span>
                        <span className="text-[10px] font-semibold">{s.name}</span>
                      </div>
                      <p className="text-[9px] text-muted-foreground leading-tight">{s.note}</p>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-muted-foreground">完成后自动排版成稿；发布前有质量门禁（审稿均分 ≥7.0 且断言无据率 ≤30%）</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* 底部导航 */}
        <div className="flex items-center gap-2 mt-4 pt-3 border-t">
          <Button variant="outline" size="sm" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || starting}>
            <ArrowLeft className="h-3.5 w-3.5 mr-1" />上一步
          </Button>
          <span className="text-[10px] text-muted-foreground">{STEP_META[step].title}（{step + 1}/3）</span>
          <div className="flex-1" />
          {step < 2 ? (
            <Button size="sm" onClick={() => setStep((s) => s + 1)} disabled={!canNext} className="bg-amber-500 hover:bg-amber-600 text-white">
              下一步<ArrowRight className="h-3.5 w-3.5 ml-1" />
            </Button>
          ) : (
            <Button size="sm" onClick={() => onStart({ ideaTitle, ideaAngle, persona, theme, exemplarId })} disabled={!ideaTitle.trim() || starting} className="bg-amber-500 hover:bg-amber-600 text-white">
              {starting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Play className="h-4 w-4 mr-1" />}
              启动九步流水线
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
