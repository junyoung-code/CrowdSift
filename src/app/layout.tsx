import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CommentHawk",
  description: "크리에이터를 위한 AI 댓글 관리 도구",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" data-scroll-behavior="smooth">
      <body>{children}</body>
    </html>
  );
}
