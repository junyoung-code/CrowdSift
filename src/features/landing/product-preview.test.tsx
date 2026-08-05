import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setElementIntersection } from "@/test/setup";

import { ProductPreview } from "./product-preview";

function setMotionPreferences({
  mobile = false,
  reducedMotion = false,
}: {
  mobile?: boolean;
  reducedMotion?: boolean;
}) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation((media: string) => ({
      addEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
      matches:
        media === "(prefers-reduced-motion: reduce)"
          ? reducedMotion
          : media === "(max-width: 767px)"
            ? mobile
            : false,
      media,
      onchange: null,
      removeEventListener: vi.fn(),
    })),
  });
}

describe("ProductPreview", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setMotionPreferences({});
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
    setMotionPreferences({ reducedMotion: true });
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

  it("disables scroll transforms on mobile viewports", () => {
    setMotionPreferences({ mobile: true });
    render(<ProductPreview />);

    expect(screen.getByLabelText("제품 예시 화면")).toHaveAttribute(
      "data-scroll-motion",
      "disabled",
    );
  });

  it("resets manual state on viewport exit and resumes autoplay after re-entry", async () => {
    render(<ProductPreview />);

    fireEvent.click(screen.getByRole("tab", { name: "최종 추천" }));
    const preview = screen.getByLabelText("제품 예시 화면");

    await act(async () => setElementIntersection(preview, 0));
    expect(screen.getByRole("tab", { name: "댓글 수집" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await act(async () => setElementIntersection(preview, 1));
    await act(async () => vi.advanceTimersByTimeAsync(4500));

    expect(screen.getByRole("tab", { name: "1차 분류" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("pauses below 25% visibility without resetting and resumes at the threshold", async () => {
    render(<ProductPreview />);

    await act(async () => vi.advanceTimersByTimeAsync(4500));
    const preview = screen.getByLabelText("제품 예시 화면");
    await act(async () => setElementIntersection(preview, 0.1));
    await act(async () => vi.advanceTimersByTimeAsync(4500));

    expect(screen.getByRole("tab", { name: "1차 분류" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await act(async () => setElementIntersection(preview, 0.25));
    await act(async () => vi.advanceTimersByTimeAsync(4500));

    expect(screen.getByRole("tab", { name: "최종 추천" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("rolls metric values vertically on each state change", () => {
    render(<ProductPreview />);

    fireEvent.click(screen.getByRole("tab", { name: "1차 분류" }));

    const analyzedMetric = screen.getByText("분석 완료").closest("article");
    expect(within(analyzedMetric!).getByText("241")).toHaveStyle({
      transform: "translateY(6px)",
    });
  });

  it("removes the metric roll transform under reduced motion", () => {
    setMotionPreferences({ reducedMotion: true });
    render(<ProductPreview />);

    const importedMetric = screen.getByText("가져온 댓글").closest("article");
    expect(within(importedMetric!).getByText("248")).not.toHaveStyle({
      transform: "translateY(6px)",
    });
  });
});
