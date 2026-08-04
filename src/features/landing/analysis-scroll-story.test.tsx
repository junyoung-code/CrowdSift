import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { setElementIntersection } from "@/test/setup";

const motionState = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();

  return {
    ...actual,
    useReducedMotion: () => motionState.reducedMotion,
  };
});

import {
  ANALYSIS_AUTOPLAY_MS,
  ANALYSIS_MANUAL_PAUSE_MS,
  AnalysisScrollStory,
  analysisWalkthroughReducer,
} from "./analysis-scroll-story";

describe("analysisWalkthroughReducer", () => {
  it("wraps advance and resets to the first step", () => {
    expect(
      analysisWalkthroughReducer({ activeStep: 3 }, { type: "advance" }),
    ).toEqual({ activeStep: 0 });
    expect(
      analysisWalkthroughReducer({ activeStep: 2 }, { type: "reset" }),
    ).toEqual({ activeStep: 0 });
  });
});

describe("AnalysisScrollStory", () => {
  afterEach(() => {
    motionState.reducedMotion = false;
    vi.useRealTimers();
  });

  it("keeps every analysis stage available and lets a creator select a stage", async () => {
    const user = userEvent.setup();
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

    const contextButton = screen.getByRole("button", {
      name: /크리에이터 문맥/,
    });
    await user.click(contextButton);

    expect(contextButton).toHaveAttribute("aria-current", "step");
    expect(screen.getByText("정책과 과거 수정 3건")).toBeInTheDocument();
  });

  it("autoplays, pauses after a manual choice, and then resumes", async () => {
    vi.useFakeTimers();
    render(<AnalysisScrollStory />);

    await act(async () => vi.advanceTimersByTimeAsync(ANALYSIS_AUTOPLAY_MS));
    expect(
      screen.getByRole("button", { name: /크리에이터 문맥/ }),
    ).toHaveAttribute("aria-current", "step");

    fireEvent.click(screen.getByRole("button", { name: /사용자 확인/ }));
    await act(async () =>
      vi.advanceTimersByTimeAsync(ANALYSIS_MANUAL_PAUSE_MS),
    );
    expect(screen.getByRole("button", { name: /사용자 확인/ })).toHaveAttribute(
      "aria-current",
      "step",
    );

    await act(async () => vi.advanceTimersByTimeAsync(ANALYSIS_AUTOPLAY_MS));
    expect(screen.getByRole("button", { name: /1차 분석/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });

  it("resumes autoplay after hover leaves the walkthrough", async () => {
    vi.useFakeTimers();
    render(<AnalysisScrollStory />);

    fireEvent.mouseEnter(screen.getByRole("region", { name: "두 단계 분석 과정" }));
    await act(async () => vi.advanceTimersByTimeAsync(ANALYSIS_AUTOPLAY_MS));

    expect(screen.getByRole("button", { name: /1차 분석/ })).toHaveAttribute(
      "aria-current",
      "step",
    );

    fireEvent.mouseLeave(
      screen.getByRole("region", { name: "두 단계 분석 과정" }),
    );
    await act(async () => vi.advanceTimersByTimeAsync(ANALYSIS_AUTOPLAY_MS));

    expect(
      screen.getByRole("button", { name: /크리에이터 문맥/ }),
    ).toHaveAttribute("aria-current", "step");
  });

  it("resumes autoplay after focus leaves the walkthrough", async () => {
    vi.useFakeTimers();
    render(<AnalysisScrollStory />);

    fireEvent.focusIn(screen.getByRole("button", { name: /크리에이터 문맥/ }));
    await act(async () => vi.advanceTimersByTimeAsync(ANALYSIS_AUTOPLAY_MS));

    expect(screen.getByRole("button", { name: /1차 분석/ })).toHaveAttribute(
      "aria-current",
      "step",
    );

    fireEvent.focusOut(
      screen.getByRole("button", { name: /크리에이터 문맥/ }),
      { relatedTarget: null },
    );
    await act(async () => vi.advanceTimersByTimeAsync(ANALYSIS_AUTOPLAY_MS));

    expect(
      screen.getByRole("button", { name: /크리에이터 문맥/ }),
    ).toHaveAttribute("aria-current", "step");
  });

  it("resets on viewport exit, clears a pending manual pause, and autoplays after re-entry", async () => {
    vi.useFakeTimers();
    render(<AnalysisScrollStory />);

    fireEvent.click(screen.getByRole("button", { name: /사용자 확인/ }));
    await act(async () => vi.advanceTimersByTimeAsync(1000));

    const story = screen.getByRole("region", { name: "두 단계 분석 과정" });
    await act(async () => setElementIntersection(story, false));

    expect(screen.getByRole("button", { name: /1차 분석/ })).toHaveAttribute(
      "aria-current",
      "step",
    );

    await act(async () => setElementIntersection(story, true));
    await act(async () => vi.advanceTimersByTimeAsync(ANALYSIS_AUTOPLAY_MS));

    expect(
      screen.getByRole("button", { name: /크리에이터 문맥/ }),
    ).toHaveAttribute("aria-current", "step");
  });

  it("re-enters result rows horizontally with a restrained check scale", () => {
    render(<AnalysisScrollStory />);

    fireEvent.click(screen.getByRole("button", { name: /2차 분석/ }));

    const sourceRow = screen.getByText("댓글 원문").closest("li");
    expect(sourceRow).toHaveStyle({ transform: "translateX(8px)" });
    expect(sourceRow?.querySelector(":scope > svg")).toHaveStyle({
      transform: "scale(0.94)",
    });
  });

  it("removes row and check transforms under reduced motion", () => {
    motionState.reducedMotion = true;
    render(<AnalysisScrollStory />);

    const sourceRow = screen.getByText("댓글 원문").closest("li");
    expect(sourceRow).not.toHaveStyle({ transform: "translateX(8px)" });
    expect(sourceRow?.querySelector(":scope > svg")).not.toHaveStyle({
      transform: "scale(0.94)",
    });
  });

  it("does not autoplay when reduced motion is requested", async () => {
    motionState.reducedMotion = true;
    vi.useFakeTimers();
    render(<AnalysisScrollStory />);

    await act(async () =>
      vi.advanceTimersByTimeAsync(ANALYSIS_AUTOPLAY_MS * 3),
    );

    expect(screen.getByRole("button", { name: /1차 분석/ })).toHaveAttribute(
      "aria-current",
      "step",
    );
  });
});
