"use client";

import {
  ChatCircleDots,
  House,
  SlidersHorizontal,
  Video,
  YoutubeLogo,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/app", label: "개요", icon: House },
  { href: "/app/inbox", label: "댓글 Inbox", icon: ChatCircleDots },
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
] as const;

export const isNavigationItemActive = (pathname: string, href: string) =>
  href === "/app"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

export function AppNavigation() {
  const pathname = usePathname() ?? "/app";

  return (
    <nav className="product-navigation" aria-label="CrowdSift 메뉴">
      {navigationItems.map(({ href, icon: Icon, label }) => {
        const active = isNavigationItemActive(pathname, href);

        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "is-active" : undefined}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" weight="duotone" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
