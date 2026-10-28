'use client'

import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { CalendarClock, Layers, FolderTree, Hash } from 'lucide-react'

export interface SearchControls {
  freshness: string
  mode: number
  industry: string
  cnt: number
}

/**
 * 搜索控制面板 —— 每个控件都一一对应元宝搜索 SearchPro 的真实参数:
 * Freshness 时效 / Mode 信源模式 / Industry 垂直领域 / Cnt 条数
 */
export function ControlPanel({
  controls,
  onChange,
}: {
  controls: SearchControls
  onChange: (next: SearchControls) => void
}) {
  const set = (patch: Partial<SearchControls>) => onChange({ ...controls, ...patch })

  return (
    <div className="flex flex-wrap items-end gap-x-6 gap-y-4">
      {/* Freshness: 搜索时效范围 */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs font-medium text-slate-500">
          <CalendarClock className="h-3.5 w-3.5" />
          时效范围
          <code className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400">Freshness</code>
        </Label>
        <ToggleGroup
          type="single"
          value={controls.freshness}
          onValueChange={(v) => v && set({ freshness: v })}
          className="gap-1"
        >
          <ToggleGroupItem value="d1" className="h-8 px-3 text-xs data-[state=on]:bg-teal-600 data-[state=on]:text-white">
            今天
          </ToggleGroupItem>
          <ToggleGroupItem value="d3" className="h-8 px-3 text-xs data-[state=on]:bg-teal-600 data-[state=on]:text-white">
            3 天
          </ToggleGroupItem>
          <ToggleGroupItem value="d7" className="h-8 px-3 text-xs data-[state=on]:bg-teal-600 data-[state=on]:text-white">
            一周
          </ToggleGroupItem>
          <ToggleGroupItem value="d30" className="h-8 px-3 text-xs data-[state=on]:bg-teal-600 data-[state=on]:text-white">
            一月
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Mode: 返回结果类型 */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs font-medium text-slate-500">
          <Layers className="h-3.5 w-3.5" />
          信源模式
          <code className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400">Mode</code>
        </Label>
        <ToggleGroup
          type="single"
          value={String(controls.mode)}
          onValueChange={(v) => v && set({ mode: Number(v) })}
          className="gap-1"
        >
          <ToggleGroupItem value="0" className="h-8 px-3 text-xs data-[state=on]:bg-teal-600 data-[state=on]:text-white">
            全网网页
          </ToggleGroupItem>
          <ToggleGroupItem value="1" className="h-8 px-3 text-xs data-[state=on]:bg-teal-600 data-[state=on]:text-white">
            权威垂类
          </ToggleGroupItem>
          <ToggleGroupItem value="2" className="h-8 px-3 text-xs data-[state=on]:bg-teal-600 data-[state=on]:text-white">
            混合
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Industry: 垂直领域 */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs font-medium text-slate-500">
          <FolderTree className="h-3.5 w-3.5" />
          垂直领域
          <code className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400">Industry</code>
        </Label>
        <Select value={controls.industry || 'all'} onValueChange={(v) => set({ industry: v === 'all' ? '' : v })}>
          <SelectTrigger className="h-8 w-[120px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">不限</SelectItem>
            <SelectItem value="news">新闻</SelectItem>
            <SelectItem value="gov">政府</SelectItem>
            <SelectItem value="acad">学术</SelectItem>
            <SelectItem value="finance">财经</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Cnt: 返回条数 */}
      <div className="space-y-1.5">
        <Label className="flex items-center gap-1 text-xs font-medium text-slate-500">
          <Hash className="h-3.5 w-3.5" />
          条数
          <code className="rounded bg-slate-100 px-1 font-mono text-[10px] text-slate-400">Cnt</code>
        </Label>
        <Select value={String(controls.cnt)} onValueChange={(v) => set({ cnt: Number(v) })}>
          <SelectTrigger className="h-8 w-[88px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="10">10 条</SelectItem>
            <SelectItem value="20">20 条</SelectItem>
            <SelectItem value="30">30 条</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
