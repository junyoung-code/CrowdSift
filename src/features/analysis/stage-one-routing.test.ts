import { describe, expect, it } from "vitest";

import type { Stage1Output } from "./contracts";
import { routeStageOne } from "./stage-one-routing";

const safeStageOne: Stage1Output = {
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
  explanation: "No concerning signal.",
};

const route = (
  stageOneOverrides: Partial<Stage1Output>,
  ruleSignals: Parameters<typeof routeStageOne>[0]["ruleSignals"] = [],
) =>
  routeStageOne({
    stageOne: { ...safeStageOne, ...stageOneOverrides },
    ruleSignals,
    contextSensitive: false,
  });

describe("stage-one routing", () => {
  it.each([
    [{ category: "uncertain", confidence: 0.99 }, "caution"],
    [{ category: "neutral", confidence: 0.84 }, "caution"],
    [{ category: "neutral", confidence: 0.99, needsSecondPass: true }, "caution"],
    [{ category: "phishing", confidence: 0.99 }, "risk"],
    [{ category: "threat_or_serious_risk", confidence: 0.99 }, "risk"],
  ] as const)(
    "enforces the code routing floor for %o",
    (stageOne, minimumReviewLevel) => {
      const result = route(stageOne);

      expect(result.minimumReviewLevel).toBe(minimumReviewLevel);
      expect(result.runSecondPass).toBe(true);
    },
  );

  it("routes a blocked phrase alone to caution, never risk", () => {
    expect(
      route({}, [
        { kind: "blocked_phrase", ruleId: "rule-1", severity: 2 },
      ]),
    ).toMatchObject({
      minimumReviewLevel: "caution",
      runSecondPass: true,
    });
  });

  it.each(["allowed_phrase", "context_exception"] as const)(
    "keeps a clean comment safe when only %s provenance matched",
    (kind) => {
      expect(
        route({}, [{ kind, ruleId: "rule-1", severity: 0 }]),
      ).toMatchObject({
        minimumReviewLevel: "safe",
        finalReviewLevel: "safe",
        runSecondPass: false,
      });
    },
  );

  it("skips stage two for a clean high-confidence question", () => {
    expect(route({ category: "question", confidence: 0.85 })).toMatchObject({
      minimumReviewLevel: "safe",
      finalReviewLevel: "safe",
      runSecondPass: false,
    });
  });

  it("does not let a model lower the code-owned floor", () => {
    expect(
      route({
        category: "phishing",
        reviewLevel: "safe",
        confidence: 0.99,
      }).finalReviewLevel,
    ).toBe("risk");
  });
});
