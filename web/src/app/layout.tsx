import type { Metadata } from "next";
import { AntdRegistry } from "@ant-design/nextjs-registry";
import "./globals.css";
import "./admin.css";
import "./header.css";
import "katex/dist/katex.min.css";
export const metadata: Metadata = {
  title: "ASTRAL",
  description: "人机交互天文发现平台",
};
export const viewport = { themeColor: "#1F2C7E" };
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body>
        <AntdRegistry>{children}</AntdRegistry>
      </body>
    </html>
  );
}
