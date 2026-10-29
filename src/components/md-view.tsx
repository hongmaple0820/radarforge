"use client"

import ReactMarkdown from "react-markdown"
import { Badge } from "@/components/ui/badge"

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
