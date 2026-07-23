import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
      screen.getByRole("heading", { name: "대시보드 내용" }),
    ).toBeInTheDocument();
  });
});
