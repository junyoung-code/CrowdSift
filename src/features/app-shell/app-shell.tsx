import {
  ChatCircleDots,
  House,
  ShieldCheck,
  SlidersHorizontal,
  Video,
  YoutubeLogo,
} from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

const navigationItems = [
  { href: "/app", label: "개요", icon: House },
  { href: "/app/comments", label: "댓글 Inbox", icon: ChatCircleDots },
  { href: "/app/videos", label: "영상", icon: Video },
  {
    href: "/app/connect/youtube",
    label: "YouTube 연결",
    icon: YoutubeLogo,
  },
  {
    href: "/app/settings/moderation",
    label: "운영 기준",
    icon: SlidersHorizontal,
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="product-shell">
      <aside className="product-sidebar">
        <Link className="product-brand" href="/app" aria-label="CommentHawk 개요">
          <span className="product-brand-mark" aria-hidden="true">
            <ShieldCheck weight="fill" />
          </span>
          <strong>CommentHawk</strong>
        </Link>

        <nav className="product-navigation" aria-label="CommentHawk 메뉴">
          {navigationItems.map(({ href, icon: Icon, label }) => (
            <Link href={href} key={href}>
              <Icon aria-hidden="true" weight="duotone" />
              <span>{label}</span>
            </Link>
          ))}
        </nav>

        <div className="product-sidebar-footer">
          <p>현재 단계</p>
          <strong>YouTube 댓글 관리</strong>
          <Link href="/app/settings/data">데이터 설정</Link>
        </div>
      </aside>

      <div className="product-workspace">
        <header className="product-topbar">
          <div>
            <p>CREATOR WORKSPACE</p>
            <strong>내 CommentHawk</strong>
          </div>
          <span className="product-status">
            <span aria-hidden="true" />
            실제 연결 데이터만 표시
          </span>
        </header>
        <main className="product-main">{children}</main>
      </div>
    </div>
  );
}
