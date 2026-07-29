import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/app",
  useRouter: () => ({
    refresh: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { AppShell } from "./app-shell";

describe("AppShell", () => {
  it("shows only the approved first-slice navigation", () => {
    render(
      <AppShell>
        <h1>대시보드 내용</h1>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: "개요" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "댓글 Inbox" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "영상" })).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "YouTube 연결" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "운영 기준" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("결제")).not.toBeInTheDocument();
    expect(screen.queryByText("Instagram")).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "로그아웃" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("group", { name: "화면 테마" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "라이트 모드 사용" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "다크 모드 사용" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "대시보드 내용" }),
    ).toBeInTheDocument();
  });

  it("labels fixture mode instead of presenting test data as a real connection", () => {
    render(
      <AppShell fixtureMode>
        <h1>테스트 대시보드</h1>
      </AppShell>,
    );

    expect(screen.getByText("TEST FIXTURE")).toBeInTheDocument();
    expect(
      screen.getByText("로컬 테스트 데이터 · 실제 YouTube 데이터 아님"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("실제 연결 데이터만 표시"),
    ).not.toBeInTheDocument();
  });
});
