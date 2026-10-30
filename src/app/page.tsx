"use client"

import { useState } from "react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { IntelPanel } from "@/components/intel-panel"
import { StudioPanel } from "@/components/studio-panel"
import { VideoPanel } from "@/components/video-panel"
import { ImagePanel } from "@/components/image-panel"
import { EcoPanel } from "@/components/eco-panel"
import { SettingsPanel } from "@/components/settings-panel"
import { Radar, PenLine, Clapperboard, Puzzle, Settings2, FileText, ImageIcon } from "lucide-react"

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
              <p className="text-[11px] text-muted-foreground truncate">AI 搜索情报底座 → 图文/视频/纯图三生产线 → 多平台发布 → 飞轮</p>
            </div>
          </div>
          <div className="hidden md:flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 border border-amber-300 dark:border-amber-800 rounded-full px-2 py-0.5 bg-amber-50 dark:bg-amber-950/40">
              三生产线 · 图文九步（大纲先行+断言核验）· 视频选题直出 · 纯图线
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
            {/* 三生产线：图文线 / 视频线 / 纯图线（交互拆分核心） */}
            <Tabs value={lineTab} onValueChange={setLineTab} className="space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <TabsList className="grid grid-cols-3 w-full max-w-md h-9">
                  <TabsTrigger value="article" className="gap-1.5 text-xs">
                    <FileText className="h-3.5 w-3.5" />图文线
                  </TabsTrigger>
                  <TabsTrigger value="video" className="gap-1.5 text-xs">
                    <Clapperboard className="h-3.5 w-3.5" />视频线
                  </TabsTrigger>
                  <TabsTrigger value="image" className="gap-1.5 text-xs">
                    <ImageIcon className="h-3.5 w-3.5" />纯图线
                  </TabsTrigger>
                </TabsList>
                <span className="text-[10px] text-muted-foreground hidden sm:inline">
                  图文：brief → claims → 大纲 → 分节 → 审稿 → 断言 → 配图 → 封面 → 排版｜视频：选题直出/从文章 → 三通道渲染｜纯图：构图 → 批量生图
                </span>
              </div>
              <TabsContent value="article" className="mt-0">
                <StudioPanel seed={createSeed} />
              </TabsContent>
              <TabsContent value="video" className="mt-0">
                <VideoPanel />
              </TabsContent>
              <TabsContent value="image" className="mt-0">
                <ImagePanel />
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
          <span>AI 资讯雷达 2.0 · 图文九步流水线（大纲先行/跨家族审稿/原子断言/正文配图）· 视频选题直出 · 纯图线 · 18 主题排版 · 5 平台导出 · 固定评测集 + 发布门禁</span>
          <span className="font-mono">数据可溯源：brief · claims 账本 · 断言核验 · [n] 引用</span>
        </div>
      </footer>
    </div>
  )
}
