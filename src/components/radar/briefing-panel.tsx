'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import ReactMarkdown from 'react-markdown'
import { Sparkles, FileText, RefreshCw } from 'lucide-react'

export function BriefingPanel({
  topic,
  briefing,
  loading,
  onGenerate,
}: {
  topic: string
  briefing: string | null
  loading: boolean
  onGenerate: () => void
}) {
  return (
    <Card className="border-slate-200 bg-white shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center justify-between text-sm font-semibold">
          <span className="flex items-center gap-1.5">
            <FileText className="h-4 w-4 text-teal-600" />
            AI 早报
          </span>
          <Button
            size="sm"
            onClick={onGenerate}
            disabled={loading}
            className="h-8 gap-1 bg-teal-600 text-xs hover:bg-teal-700"
          >
            {loading ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {loading ? '汇总中…' : briefing ? '重新生成' : '生成早报'}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2.5">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        ) : briefing ? (
          <div className="space-y-2 text-sm leading-relaxed text-slate-700">
            <ReactMarkdown
              components={{
                h3: ({ children }) => (
                  <h3 className="mt-3 mb-1 text-[13px] font-semibold text-slate-900 first:mt-0">{children}</h3>
                ),
                p: ({ children }) => <p className="text-[13px] leading-relaxed text-slate-600">{children}</p>,
                strong: ({ children }) => <strong className="font-semibold text-teal-800">{children}</strong>,
                ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1 text-[13px] text-slate-600">{children}</ol>,
                ul: ({ children }) => <ul className="ml-4 list-disc space-y-1 text-[13px] text-slate-600">{children}</ul>,
              }}
            >
              {briefing}
            </ReactMarkdown>
            <p className="pt-1 text-[11px] text-slate-400">
              由当前话题「{topic}」的搜索结果汇总，标注 [n] 为信源编号
            </p>
          </div>
        ) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-center">
            <p className="text-xs leading-relaxed text-slate-500">
              一键把当前话题的搜索结果交给大模型，
              <br />
              汇总成带信源编号的「AI 早报」。
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
