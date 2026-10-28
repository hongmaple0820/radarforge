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
  title: "AI 资讯雷达 · 基于腾讯元宝搜索的资讯追踪",
  description:
    "AI 资讯雷达：基于腾讯云元宝搜索 SearchPro API 构建的资讯追踪与早报生成应用，支持话题追踪、时效过滤、权威信源与 AI 早报汇总。",
  keywords: ["元宝搜索", "资讯追踪", "AI早报", "腾讯云", "SearchPro", "Next.js"],
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
