"use client"

import ReactMarkdown from "react-markdown"
import { Badge } from "@/components/ui/badge"
import { splitMarkdownSections } from "@/lib/runtime/skills/radar-rewrite"
import { MousePointerClick } from "lucide-react"

export function MdView({ content, onCite }: { content: string; onCite?: (n: number) => void }) {
  return (
    <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none leading-relaxed [&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-amber-400 [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:bg-muted [&_code]:px-1 [&_code]:rounded [&_strong]:text-foreground">
      <ReactMarkdown
        components={{
          // [n] 引用渲染为琥珀色徽标（可点击溯源）
          text({ children }) {
            const raw = String(children)
            const parts = raw.split(/(\[\d{1,2}\])/g)
            return (
              <>
                {parts.map((p, i) => {
                  const m = p.match(/^\[(\d{1,2})\]$/)
                  if (m && onCite) {
                    return (
                      <button key={i} onClick={() => onCite(Number(m[1]))} className="inline-flex align-super">
                        <Badge variant="outline" className="mx-0.5 px-1 py-0 text-[10px] leading-none border-amber-400 text-amber-600 dark:text-amber-400 cursor-pointer hover:bg-amber-50 dark:hover:bg-amber-950">
                          {m[1]}
                        </Badge>
                      </button>
                    )
                  }
                  return <span key={i}>{p}</span>
                })}
              </>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}

// ============================================================
// SectionedMdView —— 指着改 · 图文选段容器（P1 交互三件套 · 抓手 5）
// 视频线「指着改」平移到图文：按 ## 小节分块渲染，hover 高亮 +
// 浮动「指着改」按钮，点击回调由上层接入选段改写面板。
// ============================================================

export function SectionedMdView({
  content,
  onRewrite,
  onCite,
}: {
  content: string
  onRewrite?: (sectionIndex: number, heading: string) => void
  onCite?: (n: number) => void
}) {
  if (!onRewrite) return <MdView content={content} onCite={onCite} />
  const sections = splitMarkdownSections(content)
  if (sections.length <= 1) {
    // 单节文章没有「选段」意义，但至少允许整体指着改（第 0 节）
    return (
      <SectionBlock index={0} heading="" onRewrite={onRewrite}>
        <MdView content={content} onCite={onCite} />
      </SectionBlock>
    )
  }
  return (
    <div className="space-y-1">
      {sections.map((s) => (
        <SectionBlock key={s.index} index={s.index} heading={s.heading} onRewrite={onRewrite}>
          <MdView content={s.text} onCite={onCite} />
        </SectionBlock>
      ))}
    </div>
  )
}

function SectionBlock({
  index,
  heading,
  onRewrite,
  children,
}: {
  index: number
  heading: string
  onRewrite: (sectionIndex: number, heading: string) => void
  children: React.ReactNode
}) {
  return (
    <div className="group relative rounded-lg -mx-1.5 px-1.5 py-0.5 transition-colors hover:bg-amber-50/60 dark:hover:bg-amber-950/20">
      {onRewrite && (
        <button
          onClick={() => onRewrite(index, heading)}
          title={`指着改：只重写${heading ? `「${heading}」` : index === 0 ? "开篇前言" : "本节"}，其余不动`}
          className="absolute right-0 top-0 z-10 flex items-center gap-1 text-[10px] rounded-full border border-amber-300 bg-background/95 px-2 py-0.5 text-amber-600 dark:text-amber-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shadow-sm hover:bg-amber-50 dark:hover:bg-amber-950/40"
        >
          <MousePointerClick className="h-3 w-3" />
          指着改
        </button>
      )}
      {children}
    </div>
  )
}
