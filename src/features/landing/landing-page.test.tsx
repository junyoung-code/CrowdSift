import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LandingPage } from "./landing-page";

describe("LandingPage", () => {
  it("renders the complete product story and clearly labels example data", () => {
    render(<LandingPage />);

    expect(screen.getByRole("banner")).toHaveTextContent("CrowdSift");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "댓글의 소음은 줄이고",
    );

    const preview = screen.getByRole("region", { name: "제품 예시 화면" });
    expect(within(preview).getByText("제품 예시 화면")).toBeInTheDocument();

    expect(
      screen.getByRole("heading", {
        name: "댓글이 많아질수록 중요한 신호는 더 쉽게 묻힙니다",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", {
        name: "두 번 분석하고, 마지막 판단은 크리에이터가 합니다",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "먼저 YouTube에서 시작합니다" }),
    ).toBeInTheDocument();
    expect(screen.getByText("YouTube 지원")).toBeInTheDocument();
    expect(screen.queryByText(/Instagram 지원|TikTok 지원/)).not.toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: /시작하기|로그인/ }).length,
    ).toBeGreaterThan(0);
  });

  it("describes the review levels with text instead of color alone", () => {
    render(<LandingPage />);

    const preview = screen.getByRole("region", { name: "제품 예시 화면" });

    expect(within(preview).getByText("안전")).toBeInTheDocument();
    expect(within(preview).getAllByText("주의").length).toBeGreaterThan(0);
    expect(within(preview).getAllByText("위험").length).toBeGreaterThan(0);
  });

  it("preserves semantic sections and sign-in destinations after motion composition", () => {
    render(<LandingPage />);

    const problems = screen.getByRole("region", {
      name: "댓글이 많아질수록 중요한 신호는 더 쉽게 묻힙니다",
    });
    const solutions = screen.getByRole("region", {
      name: "삭제보다 먼저, 이해하고 분리합니다",
    });
    const analysis = screen.getByRole("region", {
      name: "두 번 분석하고, 마지막 판단은 크리에이터가 합니다",
    });

    expect(within(problems).getAllByRole("article")).toHaveLength(3);
    expect(within(solutions).getAllByRole("article")).toHaveLength(3);
    within(problems)
      .getAllByRole("article")
      .forEach((article) => expect(article).toHaveClass("landing-reveal-card"));
    within(solutions)
      .getAllByRole("article")
      .forEach((article) => expect(article).toHaveClass("landing-reveal-card"));

    expect(
      screen.getByRole("region", { name: "제품 예시 화면" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "제품 예시 화면 - AI 분석 데모" }),
    ).toBeInTheDocument();
    expect(within(analysis).getAllByRole("button")).toHaveLength(4);
    expect(
      screen.getByRole("heading", { name: "먼저 YouTube에서 시작합니다" }),
    ).toBeInTheDocument();

    screen
      .getAllByRole("link")
      .filter((link) => /시작|로그인/.test(link.textContent ?? ""))
      .forEach((link) => expect(link).toHaveAttribute("href", "/auth/sign-in"));
  });
});
