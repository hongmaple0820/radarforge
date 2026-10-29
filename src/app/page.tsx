"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IntelPanel } from "@/components/intel-panel"
import { StudioPanel } from "@/components/studio-panel"
import { VideoPanel } from "@/components/video-panel"
import { EcoPanel } from "@/components/eco-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { Radar, PenLine, Clapperboard, Puzzle, Settings2, FileText } from "lucide-react"

export default function Home() {
  // 情报中心「去创作」动线：选题种子 → 主 Tab 创作台 → 内层图文线自动填入
  const [mainTab, setMainTab] = useState("intel")
  const [lineTab, setLineTab] = useState("article")
  const [createSeed, setCreateSeed] = useState<{ title: string; angle: string } | null>(null)

  const goCreate = (title: string, angle: string) => {
    setCreateSeed({ title, angle })
    setLineTab("article")
    setMainTab("studio")
  }

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-background">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md">
        <div className="max-w-[1440px] mx-auto px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0 shadow-md shadow-amber-500/20">
              <Radar className="h-5 w-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold leading-tight truncate">AI 资讯雷达 · 自媒体工作流平台</h1>
              <p className="text-[11px] text-muted-foreground truncate">AI 搜索情报底座 → 图文/视频双生产线 → 发布 → 飞轮</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800 rounded-full px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40">
              双生产线 · 图文六步 + 视频三通道
            </span>
            <span className="text-[10px] font-mono text-muted-foreground border rounded-full px-2 py-0.5">
              18 主题 · wewrite · art-motion · Agnes
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 py-4">
        <Tabs value={mainTab} onValueChange={setMainTab} className="space-y-4">
          <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full max-w-2xl h-10">
            <TabsTrigger value="intel" className="gap-1.5 text-xs sm:text-sm">
              <Radar className="h-3.5 w-3.5" />情报中心
            </TabsTrigger>
            <TabsTrigger value="studio" className="gap-1.5 text-xs sm:text-sm">
              <PenLine className="h-3.5 w-3.5" />创作台
            </TabsTrigger>
            <TabsTrigger value="eco" className="gap-1.5 text-xs sm:text-sm">
              <Puzzle className="h-3.5 w-3.5" />插件生态
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-1.5 text-xs sm:text-sm">
              <Settings2 className="h-3.5 w-3.5" />设置中心
            </TabsTrigger>
          </TabsList>

          <TabsContent value="intel" className="mt-0">
            <IntelPanel onGoCreate={goCreate} />
          </TabsContent>

          <TabsContent value="studio" className="mt-0">
            {/* 双生产线：图文线 / 视频线（交互拆分核心） */}
            <Tabs value={lineTab} onValueChange={setLineTab} className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <TabsList className="grid grid-cols-2 w-full max-w-xs h-9">
                  <TabsTrigger value="article" className="gap-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5" />图文线
                  </TabsTrigger>
                  <TabsTrigger value="video" className="gap-1.5 text-xs">
                    <Clapperboard className="h-3.5 w-3.5" />视频线
                  </TabsTrigger>
                </TabsList>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  图文：brief → claims → 初稿 → 审稿 → 封面 → 排版（18 主题）｜视频：分镜 → 三通道渲染 → 成片
                </span>
              </div>
              <TabsContent value="article" className="mt-0">
                <StudioPanel seed={createSeed} />
              </TabsContent>
              <TabsContent value="video" className="mt-0">
                <VideoPanel />
              </TabsContent>
            </Tabs>
          </TabsContent>

          <TabsContent value="eco" className="mt-0">
            <EcoPanel />
          </TabsContent>

          <TabsContent value="settings" className="mt-0">
            <SettingsPanel />
          </TabsContent>
        </Tabs>
      </main>

      {/* Footer（sticky bottom） */}
      <footer className="mt-auto border-t bg-background">
        <div className="max-w-[1440px] mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>AI 资讯雷达 2.0 · 图文六步流水线 · 视频三通道 · 18 主题排版（wewrite）· Agnes 多账号供应商 · Skills/MCP 插件体系</span>
          <span className="font-mono">数据可溯源：brief · claims 账本 · [n] 引用</span>
        </div>
      </footer>
    </div>
  )
}
