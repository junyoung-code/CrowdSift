import { describe, expect, it } from "vitest";

import {
  DashboardSummaryOutputSchema,
  Stage1OutputSchema,
  Stage2OutputSchema,
} from "./schemas";

const validStage1 = {
  category: "neutral",
  confidence: 0.8,
  reviewLevel: "safe",
  toxicity: 0,
  spam: 0,
  phishing: 0,
  actionableFeedback: false,
  needsSecondPass: false,
  secondPassReasons: [],
  recommendedAction: "none",
  explanation: "No harmful or actionable signal was identified.",
} as const;

describe("Stage1OutputSchema", () => {
  it("rejects a confidence outside zero and one", () => {
    expect(() =>
      Stage1OutputSchema.parse({
        ...validStage1,
        confidence: 1.1,
      }),
    ).toThrow();
  });

  it("rejects a category outside the approved enum", () => {
    expect(() =>
      Stage1OutputSchema.parse({
        ...validStage1,
        category: "sarcasm",
      }),
    ).toThrow();
  });

  it("accepts an exact stage-one result", () => {
    expect(Stage1OutputSchema.parse(validStage1)).toEqual(validStage1);
  });
});

describe("Stage2OutputSchema", () => {
  it("accepts nullable sanitized feedback and normalized question", () => {
    expect(
      Stage2OutputSchema.parse({
        category: "abusive_no_signal",
        confidence: 0.91,
        reviewLevel: "caution",
        toxicity: 0.93,
        spam: 0,
        phishing: 0,
        actionableFeedback: false,
        recommendedAction: "review",
        explanation: "Abusive language without an actionable request.",
        sanitizedFeedback: null,
        normalizedQuestion: null,
        manualReview: true,
        evidenceReview: false,
      }),
    ).toMatchObject({
      sanitizedFeedback: null,
      normalizedQuestion: null,
    });
  });
});

describe("DashboardSummaryOutputSchema", () => {
  it("rejects an empty summary", () => {
    expect(() => DashboardSummaryOutputSchema.parse({ summary: "" })).toThrow();
  });
});
