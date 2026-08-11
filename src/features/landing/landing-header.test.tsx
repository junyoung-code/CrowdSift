import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LandingHeader } from "./landing-header";

class ControlledIntersectionObserver implements IntersectionObserver {
  static callback: IntersectionObserverCallback | null = null;

  readonly root = null;
  readonly rootMargin = "0px";
  readonly thresholds = [0];

  constructor(callback: IntersectionObserverCallback) {
    ControlledIntersectionObserver.callback = callback;
  }

  disconnect() {}
  observe() {}
  takeRecords() {
    return [];
  }
  unobserve() {}
}

describe("LandingHeader", () => {
  beforeEach(() => {
    ControlledIntersectionObserver.callback = null;
    vi.stubGlobal("IntersectionObserver", ControlledIntersectionObserver);
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Object.defineProperty(window, "scrollY", { configurable: true, value: 0 });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("changes to the compact sticky state after scrolling", () => {
    render(<LandingHeader />);

    Object.defineProperty(window, "scrollY", { configurable: true, value: 40 });
    fireEvent.scroll(window);

    expect(screen.getByRole("banner")).toHaveClass("landing-header-scrolled");
  });

  it("marks the section crossing the activation band as current", () => {
    render(
      <>
        <div id="problems" />
        <div id="solutions" />
        <div id="analysis" />
        <div id="integration" />
        <LandingHeader />
      </>,
    );

    const solutions = document.getElementById("solutions");
    expect(solutions).not.toBeNull();

    act(() => {
      ControlledIntersectionObserver.callback?.(
        [
          {
            boundingClientRect: solutions!.getBoundingClientRect(),
            intersectionRatio: 0.7,
            intersectionRect: solutions!.getBoundingClientRect(),
            isIntersecting: true,
            rootBounds: null,
            target: solutions!,
            time: 0,
          },
        ],
        {} as IntersectionObserver,
      );
    });

    expect(screen.getByRole("link", { name: "해결 방식" })).toHaveAttribute(
      "aria-current",
      "location",
    );
  });
});
