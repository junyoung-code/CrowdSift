import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ProductPreview } from "./product-preview";

function setReducedMotion(matches: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches,
      media: "(prefers-reduced-motion)",
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
}

describe("ProductPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("cycles example states while visible and pauses after manual selection", async () => {
    render(<ProductPreview />);

    expect(screen.getByRole("tab", { name: "댓글 수집" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4500);
    });

    expect(screen.getByRole("tab", { name: "1차 분류" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: "최종 추천" }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(screen.getByRole("tab", { name: "최종 추천" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("disables autoplay when reduced motion is requested", async () => {
    setReducedMotion(true);
    render(<ProductPreview />);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(9000);
    });

    expect(screen.getByRole("tab", { name: "댓글 수집" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("synchronizes metrics, review priority, and AI summary with the selected state", () => {
    render(<ProductPreview />);

    const analyzedMetric = screen.getByText("분석 완료").closest("article");

    expect(within(analyzedMetric!).getByText("—")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "1차 분류" }));

    expect(within(analyzedMetric!).getByText("241")).toBeInTheDocument();
    expect(screen.getByText("주의 · 78%")).toBeInTheDocument();
    expect(screen.getByTestId("review-level-caution")).toHaveAttribute(
      "data-emphasized",
      "true",
    );

    fireEvent.click(screen.getByRole("tab", { name: "최종 추천" }));

    expect(screen.getByTestId("review-level-risk")).toHaveAttribute(
      "data-emphasized",
      "true",
    );
    expect(screen.getByText("사용자 검토 필요")).toBeInTheDocument();
  });
});
