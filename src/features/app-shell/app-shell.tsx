import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import type { ReactNode } from "react";

import { SignOutButton } from "@/features/auth/sign-out-button";
import { ThemeToggle } from "@/features/theme/theme-toggle";

import { AppNavigation } from "./app-navigation";

export function AppShell({
  children,
  fixtureMode = false,
}: {
  children: ReactNode;
  fixtureMode?: boolean;
}) {
  return (
    <div className="product-shell">
      <aside className="product-sidebar">
        <Link className="product-brand" href="/app" aria-label="CrowdSift 개요">
          <span className="product-brand-mark" aria-hidden="true">
            <ShieldCheck weight="fill" />
          </span>
          <strong>CrowdSift</strong>
        </Link>

        <AppNavigation />

        <div className="product-sidebar-footer">
          <p>현재 단계</p>
          <strong>YouTube 댓글 관리</strong>
          <Link href="/app/settings/data">데이터 설정</Link>
          <SignOutButton />
        </div>
      </aside>

      <div className="product-workspace">
        <header className="product-topbar">
          <div>
            <p>CREATOR WORKSPACE</p>
            <strong>내 CrowdSift</strong>
          </div>
          <div className="product-topbar-actions">
            {fixtureMode ? (
              <div className="product-fixture-status" role="status">
                <strong>TEST FIXTURE</strong>
                <span>로컬 테스트 데이터 · 실제 YouTube 데이터 아님</span>
              </div>
            ) : (
              <span className="product-status">
                <span aria-hidden="true" />
                실제 연결 데이터만 표시
              </span>
            )}
            <ThemeToggle />
          </div>
        </header>
        <main className="product-main">{children}</main>
      </div>
    </div>
  );
}
