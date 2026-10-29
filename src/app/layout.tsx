import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI 资讯雷达 · 自媒体工作流平台 2.0",
  description:
    "话题雷达 + AI 早报 + Agent 运行时（Skills 热加载 / 工具注册表 / MCP / 插件化模型网关）",
  keywords: ["AI 资讯雷达", "Agent", "Skills", "MCP", "模型网关", "自媒体工作流"],
  authors: [{ name: "Z.ai Team" }],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  openGraph: {
    title: "AI 资讯雷达 · 工作流平台 2.0",
    description: "Agent 运行时 + 插件化模型网关 + MCP",
    siteName: "AI 资讯雷达",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
