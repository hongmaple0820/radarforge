"use client"

// ============================================================
// command-palette.tsx —— ⌘K 命令面板（P1 交互三件套 · 抓手 4）
// 跨线快捷动作：新图文 / 新视频 / 新图组 / 切主区 / 最近 Run
// 直达。功能密度高的产品配命令面板是标准解。联动方式：全部走
// props 回调（页面层状态，确定性渲染，不依赖事件时序）。
// ============================================================

import { useEffect, useMemo, useRef, useState } from "react"
import { CommandDialog, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem, CommandSeparator, CommandShortcut } from "@/components/ui/command"
import { Radar, PenLine, Clapperboard, ImageIcon, FileText, Puzzle, Settings2, Newspaper, Loader2, CornerDownLeft } from "lucide-react"

interface RunLite { id: string; ideaTitle: string; status: string; createdAt: string }

const STATUS_TINT: Record<string, string> = {
  done: "text-emerald-600",
  running: "text-amber-500",
  error: "text-red-500",
}

export function CommandPalette({
  open,
  setOpen,
  onNavigate,
}: {
  open: boolean
  setOpen: (v: boolean) => void
  onNavigate: (mainTab: string, lineTab?: string, extra?: { runId?: string; wizard?: boolean }) => void
}) {
  const [runs, setRuns] = useState<RunLite[]>([])
  const [loaded, setLoaded] = useState(false)

  const loadedRef = useRef(false)
  // 打开时才拉取最近 run（懒加载；setState 全部走回调，避免级联渲染）
  useEffect(() => {
    if (!open || loadedRef.current) return
    loadedRef.current = true
    fetch("/api/runs")
      .then((x) => x.json())
      .then((j) => {
        setRuns((j.runs ?? []).slice(0, 8))
        setLoaded(true)
      })
      .catch(() => setLoaded(true))
  }, [open])

  const fire = (fn: () => void) => {
    setOpen(false)
    fn()
  }

  const recentRuns = useMemo(() => runs.slice(0, 6), [runs])

  return (
    <CommandDialog open={open} onOpenChange={setOpen} title="命令面板" description="搜索动作或 Run，回车执行" className="sm:max-w-lg">
      <CommandInput placeholder="输入动作 / 选题关键词 / Run 标题…" />
      <CommandList className="max-h-[420px]">
        <CommandEmpty>没有匹配的命令</CommandEmpty>

        <CommandGroup heading="创作动作">
          <CommandItem onSelect={() => fire(() => onNavigate("studio", "article", { wizard: true }))}>
            <FileText className="text-amber-500" />
            <span>新图文 · 九步流水线</span>
            <CommandShortcut>⌘1</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => fire(() => onNavigate("studio", "video"))}>
            <Clapperboard className="text-rose-500" />
            <span>新视频 · 选题直出 / 从文章出片</span>
            <CommandShortcut>⌘2</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => fire(() => onNavigate("studio", "image"))}>
            <ImageIcon className="text-violet-500" />
            <span>新图组 · 生图 / 版式卡</span>
            <CommandShortcut>⌘3</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => fire(() => onNavigate("intel"))}>
            <Newspaper className="text-sky-500" />
            <span>生成早报 / RSS 信源刷新</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="导航">
          <CommandItem onSelect={() => fire(() => onNavigate("intel"))}>
            <Radar className="text-muted-foreground" />
            <span>情报中心</span>
          </CommandItem>
          <CommandItem onSelect={() => fire(() => onNavigate("studio"))}>
            <PenLine className="text-muted-foreground" />
            <span>创作台</span>
          </CommandItem>
          <CommandItem onSelect={() => fire(() => onNavigate("eco"))}>
            <Puzzle className="text-muted-foreground" />
            <span>插件生态</span>
          </CommandItem>
          <CommandItem onSelect={() => fire(() => onNavigate("settings"))}>
            <Settings2 className="text-muted-foreground" />
            <span>设置中心</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading={`最近 Run${loaded ? "" : "（读取中）"}`}>
          {!loaded && (
            <div className="flex items-center gap-2 px-2 py-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />读取中…
            </div>
          )}
          {loaded && recentRuns.length === 0 && (
            <div className="px-2 py-2 text-xs text-muted-foreground">还没有 Run——用「新图文」启动第一条流水线</div>
          )}
          {recentRuns.map((r) => (
            <CommandItem
              key={r.id}
              value={`run ${r.ideaTitle} ${r.status}`}
              onSelect={() => fire(() => onNavigate("studio", "article", { runId: r.id }))}
            >
              <CornerDownLeft className="text-muted-foreground" />
              <span className="truncate max-w-[320px]">{r.ideaTitle}</span>
              <span className={`ml-auto text-[10px] font-mono shrink-0 ${STATUS_TINT[r.status] ?? "text-muted-foreground"}`}>{r.status}</span>
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
