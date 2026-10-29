"use client"

// ============================================================
// eco-panel —— 插件生态（社区技能 + 插件中心合并 Tab）
// 两块能力同属「可扩展生态」心智：Skills 加载 / Provider 注册表
// / 工具注册表 / MCP 接入，内层切换不再各占一个顶级 Tab。
// ============================================================

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { AgentPanel } from "./agent-panel"
import { PluginsPanel } from "./plugins-panel"
import { Bot, Puzzle } from "lucide-react"

export function EcoPanel() {
  return (
    <Tabs defaultValue="skills" className="space-y-3">
      <TabsList className="grid grid-cols-2 w-full max-w-sm h-9">
        <TabsTrigger value="skills" className="gap-1.5 text-xs">
          <Bot className="h-3.5 w-3.5" />社区技能
        </TabsTrigger>
        <TabsTrigger value="plugins" className="gap-1.5 text-xs">
          <Puzzle className="h-3.5 w-3.5" />插件中心
        </TabsTrigger>
      </TabsList>
      <TabsContent value="skills" className="mt-0">
        <AgentPanel />
      </TabsContent>
      <TabsContent value="plugins" className="mt-0">
        <PluginsPanel />
      </TabsContent>
    </Tabs>
  )
}
