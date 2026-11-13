import type { Metadata } from "next";
import "./globals.css";
import "./theme.css";
export const metadata: Metadata = {title:"毫米波研究工作台",description:"连续人体行为理解 × LLM：从雷达流到事件语义的研究工作台",icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="zh-CN"><body>{children}</body></html>}