import { describe, expect, it } from "vitest";

import {
  DEFAULT_PRICING,
  FIXTURE_PRICING,
  calculateObservedCost,
  estimateAnalysisCost,
  summarizeStoredModelUsage,
} from "./cost-estimator";

describe("analysis cost estimator", () => {
  it("returns a monotonically increasing range for every selectable count", () => {
    const estimates = [20, 50, 100, 1_000].map((commentCount) =>
      estimateAnalysisCost({ commentCount }),
    );

    for (const [index, estimate] of estimates.entries()) {
      expect(estimate.estimatedCostLow).toBeGreaterThan(0);
      expect(estimate.estimatedCostHigh).toBeGreaterThanOrEqual(
        estimate.estimatedCostLow,
      );
      expect(estimate.pricingVersion).toBe(DEFAULT_PRICING.version);
      expect(estimate.disclaimer).toContain("보장");

      if (index > 0) {
        expect(estimate.estimatedCostLow).toBeGreaterThan(
          estimates[index - 1]!.estimatedCostLow,
        );
        expect(estimate.estimatedCostHigh).toBeGreaterThan(
          estimates[index - 1]!.estimatedCostHigh,
        );
      }
    }
  });

  it("reproduces observed cost from stored stage and embedding usage", () => {
    const result = calculateObservedCost({
      stageOne: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      stageTwo: { inputTokens: 1_000_000, outputTokens: 1_000_000 },
      embeddingInputTokens: 1_000_000,
    });

    expect(result).toMatchObject({
      stageOneInputTokens: 1_000_000,
      stageOneOutputTokens: 1_000_000,
      stageTwoInputTokens: 1_000_000,
      stageTwoOutputTokens: 1_000_000,
      embeddingInputTokens: 1_000_000,
      calculatedCost: 6.72,
      pricingVersion: "openai-2026-07-24",
    });
  });

  it("sums persisted model-run usage by stage", () => {
    expect(
      summarizeStoredModelUsage([
        {
          stage: 1,
          usage: { inputTokens: 100, outputTokens: 20 },
        },
        {
          stage: 2,
          usage: {
            inputTokens: 80,
            outputTokens: 30,
            embeddingInputTokens: 12,
          },
        },
      ]),
    ).toEqual({
      stageOne: { inputTokens: 100, outputTokens: 20 },
      stageTwo: { inputTokens: 80, outputTokens: 30 },
      embeddingInputTokens: 12,
    });
  });

  it("records fixture estimates and observed usage at zero cost", () => {
    const estimate = estimateAnalysisCost({
      commentCount: 1_000,
      pricing: FIXTURE_PRICING,
    });
    const observed = calculateObservedCost({
      stageOne: { inputTokens: 0, outputTokens: 0 },
      stageTwo: { inputTokens: 0, outputTokens: 0 },
      embeddingInputTokens: 0,
      pricing: FIXTURE_PRICING,
    });

    expect(estimate).toMatchObject({
      pricingVersion: "fixture-0-cost-v1",
      estimatedCostLow: 0,
      estimatedCostHigh: 0,
    });
    expect(observed).toMatchObject({
      pricingVersion: "fixture-0-cost-v1",
      calculatedCost: 0,
    });
  });
});
