import { act, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

let emitProgress: ((value: number) => void) | undefined;

vi.mock("motion/react", () => ({
  useReducedMotion: () => false,
  useScroll: () => ({ scrollYProgress: {} }),
  useMotionValueEvent: (
    _value: unknown,
    _event: string,
    callback: (value: number) => void,
  ) => {
    useEffect(() => {
      emitProgress = callback;
      return () => {
        emitProgress = undefined;
      };
    }, [callback]);
  },
}));

import { AnalysisScrollStory } from "./analysis-scroll-story";

describe("AnalysisScrollStory", () => {
  it("keeps every analysis stage available to assistive technology", () => {
    render(<AnalysisScrollStory />);

    expect(
      screen.getByRole("region", { name: "두 단계 분석 과정" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "1차 분석" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "크리에이터 문맥" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "2차 분석" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "사용자 확인" })).toBeInTheDocument();
    expect(document.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });

  it("reverses the current stage when scroll progress moves upward", () => {
    render(<AnalysisScrollStory />);

    act(() => emitProgress?.(0.8));
    expect(screen.getByRole("heading", { name: "사용자 확인" }).closest("li"))
      .toHaveAttribute("aria-current", "step");

    act(() => emitProgress?.(0.3));
    expect(
      screen.getByRole("heading", { name: "크리에이터 문맥" }).closest("li"),
    ).toHaveAttribute("aria-current", "step");
  });
});
