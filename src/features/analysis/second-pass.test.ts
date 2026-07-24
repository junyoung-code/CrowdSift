import { describe, expect, it } from "vitest";

import type { Stage1Output } from "./contracts";
import { shouldRunSecondPass } from "./second-pass";

const safeHighConfidence: Stage1Output = {
  category: "neutral",
  confidence: 0.95,
  reviewLevel: "safe",
  toxicity: 0,
  spam: 0,
  phishing: 0,
  actionableFeedback: false,
  needsSecondPass: false,
  secondPassReasons: [],
  recommendedAction: "none",
  explanation: "No actionable signal.",
};

const decide = (
  overrides: Partial<Parameters<typeof shouldRunSecondPass>[0]> = {},
) =>
  shouldRunSecondPass({
    stage1: safeHighConfidence,
    ruleSignals: [],
    bestSimilarity: 0.77,
    contextSensitive: false,
    ...overrides,
  });

describe("shouldRunSecondPass", () => {
  it.each(["caution", "risk"] as const)(
    "runs for a %s review level",
    (reviewLevel) => {
      expect(
        decide({
          stage1: { ...safeHighConfidence, reviewLevel },
        }).run,
      ).toBe(true);
    },
  );

  it("runs below the confidence threshold", () => {
    expect(
      decide({
        stage1: { ...safeHighConfidence, confidence: 0.849 },
      }),
    ).toMatchObject({ run: true });
  });

  it("runs when stage one explicitly requests deeper review", () => {
    expect(
      decide({
        stage1: { ...safeHighConfidence, needsSecondPass: true },
      }),
    ).toMatchObject({ run: true });
  });

  it("runs when stage one cannot determine a category", () => {
    expect(
      decide({
        stage1: { ...safeHighConfidence, category: "uncertain" },
      }),
    ).toMatchObject({ run: true });
  });

  it("runs when a phrase rule signal matched", () => {
    expect(
      decide({
        ruleSignals: [
          { kind: "blocked_phrase", ruleId: "rule-1", severity: 2 },
        ],
      }).run,
    ).toBe(true);
  });

  it("runs at the creator-example similarity threshold", () => {
    expect(decide({ bestSimilarity: 0.78 }).run).toBe(true);
  });

  it("runs for toxic but actionable feedback", () => {
    expect(
      decide({
        stage1: {
          ...safeHighConfidence,
          category: "toxic_but_actionable",
        },
      }).run,
    ).toBe(true);
  });

  it("runs for a context-sensitive pattern", () => {
    expect(decide({ contextSensitive: true }).run).toBe(true);
  });

  it("skips a safe, confident, signal-free comment below threshold", () => {
    expect(decide()).toEqual({ run: false, reasons: [] });
  });

  it("does not run for allowed/context provenance by itself", () => {
    expect(
      decide({
        ruleSignals: [
          { kind: "allowed_phrase", ruleId: "allowed-1", severity: 0 },
          {
            kind: "context_exception",
            ruleId: "context-1",
            severity: 0,
          },
        ],
      }),
    ).toEqual({ run: false, reasons: [] });
  });
});
