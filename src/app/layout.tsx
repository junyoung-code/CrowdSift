import type { Metadata } from "next";

import { ProductThemeScript } from "@/features/theme/product-theme-script";

import "./globals.css";

export const metadata: Metadata = {
  title: "CrowdSift",
  description: "크리에이터를 위한 AI 댓글 관리 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      data-scroll-behavior="smooth"
      data-theme="light"
      suppressHydrationWarning
    >
      <head>
        <ProductThemeScript />
      </head>
      <body>{children}</body>
    </html>
  );
}
