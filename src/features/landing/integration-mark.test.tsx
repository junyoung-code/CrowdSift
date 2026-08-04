import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const motionState = vi.hoisted(() => ({ reducedMotion: false }));

vi.mock("motion/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("motion/react")>();

  return {
    ...actual,
    useReducedMotion: () => motionState.reducedMotion,
  };
});

import { IntegrationMark } from "./integration-mark";

describe("IntegrationMark", () => {
  afterEach(() => {
    motionState.reducedMotion = false;
  });

  it("renders as a decorative mark without an interactive control", () => {
    const { container } = render(<IntegrationMark />);

    expect(container.querySelector(".youtube-mark")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("omits inline parallax transforms when reduced motion is requested", () => {
    motionState.reducedMotion = true;

    const { container } = render(<IntegrationMark />);

    expect(container.querySelector(".youtube-mark")).not.toHaveStyle({
      transform: expect.anything(),
    });
  });
});
