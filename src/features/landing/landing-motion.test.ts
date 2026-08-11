import { describe, expect, it } from "vitest";

import { getAnalysisStepFromProgress } from "./landing-motion";

describe("getAnalysisStepFromProgress", () => {
  it.each([
    { progress: -1, expected: 0 },
    { progress: 0, expected: 0 },
    { progress: 0.24, expected: 0 },
    { progress: 0.25, expected: 1 },
    { progress: 0.74, expected: 2 },
    { progress: 0.75, expected: 3 },
    { progress: 1, expected: 3 },
    { progress: 2, expected: 3 },
  ])("maps $progress to step $expected", ({ progress, expected }) => {
    expect(getAnalysisStepFromProgress(progress)).toBe(expected);
  });
});
