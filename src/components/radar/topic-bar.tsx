'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Plus, X, Radar } from 'lucide-react'

export interface TopicItem {
  id: string
  name: string
}

export function TopicBar({
  topics,
  activeTopic,
  onSelect,
  onDelete,
  onAdd,
}: {
  topics: TopicItem[]
  activeTopic: string
  onSelect: (topic: TopicItem) => void
  onDelete: (topic: TopicItem) => void
  onAdd: (name: string) => Promise<string | null>
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [newTopic, setNewTopic] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleAdd() {
    const name = newTopic.trim()
    if (!name) {
      setError('请输入话题名称')
      return
    }
    setSubmitting(true)
    setError(null)
    const err = await onAdd(name)
    setSubmitting(false)
    if (err) {
      setError(err)
    } else {
      setNewTopic('')
      setDialogOpen(false)
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 hidden items-center gap-1 text-xs font-medium text-slate-500 sm:inline-flex">
        <Radar className="h-3.5 w-3.5 text-teal-600" />
        追踪话题
      </span>

      {topics.map((t) => {
        const active = t.name === activeTopic
        return (
          <span key={t.id} className="relative inline-flex">
            <button
              type="button"
              onClick={() => onSelect(t)}
              className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-teal-600 bg-teal-600 text-white shadow-sm'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-teal-400 hover:text-teal-700'
              }`}
            >
              {t.name}
            </button>
            {topics.length > 1 && (
              <button
                type="button"
                aria-label={`删除话题 ${t.name}`}
                onClick={() => onDelete(t)}
                className={`absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full border border-slate-300 text-slate-400 opacity-0 shadow-sm transition-opacity focus:opacity-100 ${
                  active ? 'bg-white' : 'bg-slate-100'
                }`}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '')}
              >
                <X className="h-2.5 w-2.5" />
              </button>
            )}
          </span>
        )
      })}

      <button
        type="button"
        onClick={() => setDialogOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-sm text-slate-500 transition-colors hover:border-teal-500 hover:text-teal-600"
      >
        <Plus className="h-3.5 w-3.5" />
        新话题
      </button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>添加追踪话题</DialogTitle>
            <DialogDescription>
              话题将作为检索词调用元宝搜索 SearchPro 接口，例如「大模型」「自动驾驶 智驾」「AI Agent」。
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              placeholder="输入话题关键词，如：人形机器人"
              value={newTopic}
              onChange={(e) => {
                setNewTopic(e.target.value)
                setError(null)
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd()
              }}
              maxLength={60}
            />
            {error && (
              <p className="text-xs text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <Badge variant="outline" className="mr-auto border-slate-200 text-slate-400">
              持久化于 SQLite
            </Badge>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAdd} disabled={submitting} className="bg-teal-600 hover:bg-teal-700">
              {submitting ? '添加中…' : '添加并追踪'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
