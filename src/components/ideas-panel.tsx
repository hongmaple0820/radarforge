"use client"

import { useCallback, useEffect, useState } from "react"
import { motion } from "framer-motion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"
import { useToast } from "@/hooks/use-toast"
import { Lightbulb, Plus, Trash2, Star, CircleDot, CheckCheck, Sparkles, Loader2 } from "lucide-react"

interface Idea { id: string; title: string; angle: string; score: number; status: string; createdAt: string; topic?: { name: string } | null }

const STATUS_META: Record<string, { label: string; icon: typeof Lightbulb; className: string }> = {
  new: { label: "新选题", icon: Lightbulb, className: "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-300" },
  picked: { label: "已采纳", icon: CircleDot, className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-300" },
  done: { label: "已完成", icon: CheckCheck, className: "bg-muted text-muted-foreground border-border" },
}

export function IdeasPanel() {
  const { toast } = useToast()
  const [ideas, setIdeas] = useState<Idea[]>([])
  const [newIdea, setNewIdea] = useState({ title: "", angle: "" })
  const [refreshing, setRefreshing] = useState(false)

  const refresh = useCallback(async () => {
    const json = await fetch("/api/ideas").then((x) => x.json())
    setIdeas(json.ideas ?? [])
  }, [])

  useEffect(() => {
    const t = setTimeout(() => void refresh(), 0)
    return () => clearTimeout(t)
  }, [refresh])

  const add = async () => {
    if (!newIdea.title.trim()) return
    // 经工具注册表写入（create_idea 是 Agent 工具链的一部分）
    await fetch("/api/agent/tools", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "create_idea", input: { title: newIdea.title, angle: newIdea.angle } }),
    })
    setNewIdea({ title: "", angle: "" })
    void refresh()
    toast({ title: "选题已入池" })
  }

  const advance = async (idea: Idea) => {
    const next = idea.status === "new" ? "picked" : idea.status === "picked" ? "done" : "new"
    await fetch("/api/ideas", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: idea.id, status: next }) })
    void refresh()
  }

  const remove = async (id: string) => {
    await fetch(`/api/ideas?id=${id}`, { method: "DELETE" })
    void refresh()
  }

  /** AI 刷新灵感：雷达话题 + 近期早报 + 风格定位 → 新选题入池 */
  const refreshIdeas = async () => {
    setRefreshing(true)
    try {
      const res = await fetch("/api/ideas/refresh", { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      toast({ title: json.message ?? "刷新完成", description: json.created ? `新增 ${json.created} 条` : undefined })
      await refresh()
    } catch (e) {
      toast({ title: "刷新失败", description: (e as Error).message, variant: "destructive" })
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <div className="grid lg:grid-cols-[360px_1fr] gap-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base"><Lightbulb className="h-4 w-4 text-amber-500" />选题池</CardTitle>
          <p className="text-[11px] text-muted-foreground">雷达发现 → 选题池 → Agent 执行（也可在插件中心用 create_idea 工具写入）</p>
        </CardHeader>
        <CardContent className="space-y-2">
          <Input placeholder="选题标题" value={newIdea.title} onChange={(e) => setNewIdea({ ...newIdea, title: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Input placeholder="切入角度（可选）" value={newIdea.angle} onChange={(e) => setNewIdea({ ...newIdea, angle: e.target.value })} onKeyDown={(e) => e.key === "Enter" && add()} />
          <Button onClick={add} disabled={!newIdea.title.trim()} className="w-full bg-amber-500 hover:bg-amber-600 text-white">
            <Plus className="h-4 w-4 mr-1" />入池
          </Button>
          <Button onClick={refreshIdeas} disabled={refreshing} variant="outline" className="w-full">
            {refreshing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1 text-amber-500" />}
            AI 刷新灵感
          </Button>
          <p className="text-[10px] text-muted-foreground leading-snug">基于雷达话题 + 近期早报 + 风格定位（设置中心）自动生成新选题；与近 7 天池内选题自动去重</p>
        </CardContent>
      </Card>

      <Card className="min-h-[400px]">
        <CardContent className="pt-4">
          <ScrollArea className="max-h-[640px]">
            <div className="grid md:grid-cols-2 gap-2.5 pr-2">
              {ideas.length === 0 && (
                <div className="col-span-2 flex flex-col items-center py-16 text-muted-foreground">
                  <Lightbulb className="h-8 w-8 mb-2 opacity-30" />
                  <p className="text-sm">选题池为空：左侧手动入池，或跑一次 Agent Run 自动积累</p>
                </div>
              )}
              {ideas.map((idea) => {
                const meta = STATUS_META[idea.status] ?? STATUS_META.new
                const Icon = meta.icon
                return (
                  <motion.div key={idea.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="group rounded-lg border p-3 space-y-2 hover:border-amber-300 transition-colors">
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-semibold leading-snug">{idea.title}</div>
                      <div className="flex items-center gap-0.5 shrink-0">
                        {idea.score > 0 && (
                          <span className="flex items-center gap-0.5 text-[11px] text-amber-600 dark:text-amber-400">
                            <Star className="h-3 w-3 fill-current" />{idea.score}
                          </span>
                        )}
                        <Button variant="ghost" size="icon" className="h-6 w-6 opacity-0 group-hover:opacity-100" onClick={() => remove(idea.id)}><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    {idea.angle && <p className="text-[11px] text-muted-foreground line-clamp-2">{idea.angle}</p>}
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className={`text-[10px] gap-1 ${meta.className}`}>
                        <Icon className="h-3 w-3" />
                        {meta.label}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        {idea.topic?.name && <span className="text-[10px] text-muted-foreground">{idea.topic.name}</span>}
                        <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => advance(idea)}>
                          {idea.status === "new" ? "采纳" : idea.status === "picked" ? "完成" : "重开"}
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  )
}
