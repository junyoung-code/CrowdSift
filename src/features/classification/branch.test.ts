import { describe, expect, it } from "vitest";

import { routeFirstPass, type BranchOutcome } from "./branch";
import type { FirstPassResult } from "./contracts";
import type {
  LunaFirstPass,
  ModerationCategory,
  ModerationResult,
} from "./schemas";

const cleanLuna: LunaFirstPass = {
  candidateLevel: "safe",
  confidence: 0.94,
  feedbackPresent: true,
  locationOrScheduleMention: false,
  sensitiveTopicMatched: false,
  hardRiskFlags: [],
  softRiskFlags: [],
  matchedRules: [],
};

const cleanModeration: ModerationResult = {
  flagged: false,
  categories: [],
  unknownCategories: [],
  categoryScores: {},
};

const firstPass = ({
  luna,
  moderation = cleanModeration,
}: {
  luna?: Partial<LunaFirstPass>;
  moderation?: ModerationResult | null;
}): FirstPassResult => ({
  commentId: "comment-1",
  workspaceId: "workspace-1",
  moderation: moderation
    ? { result: moderation, model: "omni-moderation-latest", latencyMs: 40 }
    : null,
  luna: {
    result: { ...cleanLuna, ...luna },
    run: {
      model: "gpt-5.6-luna",
      responseId: "resp-1",
      latencyMs: 120,
      usage: { inputTokens: 210, outputTokens: 40, totalTokens: 250 },
    },
  },
  promptVersion: "crowdsift-luna-first-pass-v2",
  evaluatedAt: "2026-08-05T00:00:00.000Z",
});

const flagging = (...categories: ModerationCategory[]): ModerationResult => ({
  flagged: true,
  categories,
  unknownCategories: [],
  categoryScores: Object.fromEntries(
    categories.map((category) => [category, 0.9]),
  ),
});

const verifyOutcome = (outcome: BranchOutcome) => {
  if (outcome.kind !== "verify") {
    throw new Error(`expected a verify outcome, got ${outcome.kind}`);
  }

  return outcome;
};

describe("first pass routing", () => {
  it("ends on safe only when every condition holds", () => {
    const outcome = routeFirstPass(firstPass({}));

    expect(outcome).toEqual({
      kind: "instant_safe",
      level: "safe",
      basis: "luna_safe",
      confidence: 0.94,
    });
  });

  it("sends a caution or danger candidate on regardless of confidence", () => {
    for (const candidateLevel of ["caution", "danger"] as const) {
      const outcome = verifyOutcome(
        routeFirstPass(firstPass({ luna: { candidateLevel, confidence: 1 } })),
      );

      expect(outcome.reasons).toContain(`luna_${candidateLevel}`);
    }
  });

  it("sends a safe candidate on when the model was not sure", () => {
    const outcome = verifyOutcome(
      routeFirstPass(firstPass({ luna: { confidence: 0.84 } })),
    );

    expect(outcome.reasons).toEqual(["luna_low_confidence"]);
  });

  it("lets a safe candidate through at exactly the pass mark", () => {
    expect(routeFirstPass(firstPass({ luna: { confidence: 0.85 } })).kind).toBe(
      "instant_safe",
    );
  });

  it("treats a missing filter result differently from a clean one", () => {
    const outage = verifyOutcome(
      routeFirstPass(firstPass({ moderation: null })),
    );

    // Reading an outage as "nothing risky found" would let harmful comments
    // through for as long as the filter stays down.
    expect(outage.reasons).toEqual(["moderation_unavailable"]);
    expect(routeFirstPass(firstPass({})).kind).toBe("instant_safe");
  });

  it("sends a safe candidate on when the free filter disagrees", () => {
    const outcome = verifyOutcome(
      routeFirstPass(firstPass({ moderation: flagging("harassment") })),
    );

    expect(outcome.reasons).toEqual(["moderation_flagged"]);
  });

  it("distrusts a safe candidate that carries risk flags", () => {
    const outcome = verifyOutcome(
      routeFirstPass(firstPass({ luna: { softRiskFlags: ["profanity"] } })),
    );

    expect(outcome.reasons).toContain("risk_flag_on_safe_candidate");
  });

  it("stops a location hint from taking the instant lane", () => {
    const outcome = verifyOutcome(
      routeFirstPass(firstPass({ luna: { locationOrScheduleMention: true } })),
    );

    expect(outcome.reasons).toEqual(["location_or_schedule_mention"]);
  });

  it("stops a sensitive topic from taking the instant lane", () => {
    // "오늘 얼굴이 좀 안 좋아 보이네요" on a channel that flagged appearance.
    const outcome = verifyOutcome(
      routeFirstPass(firstPass({ luna: { sensitiveTopicMatched: true } })),
    );

    expect(outcome.reasons).toEqual(["sensitive_topic"]);
  });

  it("records every reason, not just the first one", () => {
    const outcome = verifyOutcome(
      routeFirstPass(
        firstPass({
          luna: { candidateLevel: "danger", hardRiskFlags: ["threat"] },
          moderation: flagging("harassment/threatening"),
        }),
      ),
    );

    expect(outcome.reasons).toEqual(["luna_danger", "moderation_flagged"]);
  });

  describe("protection while the verdict is pending", () => {
    it("hides the source for a category that means immediate harm", () => {
      const outcome = verifyOutcome(
        routeFirstPass(
          firstPass({ moderation: flagging("harassment/threatening") }),
        ),
      );

      expect(outcome.protection.hideSourceBeforeVerdict).toBe(true);
      expect(outcome.protection.moderationMinimumLevel).toBe("danger");
    });

    it("keeps the source visible for a category that decides nothing", () => {
      // Horror game and film talk lands on violence constantly.
      const outcome = verifyOutcome(
        routeFirstPass(firstPass({ moderation: flagging("violence") })),
      );

      expect(outcome.protection.hideSourceBeforeVerdict).toBe(false);
      expect(outcome.protection.moderationMinimumLevel).toBeNull();
    });

    it("takes the strongest protection when several categories hit", () => {
      const outcome = verifyOutcome(
        routeFirstPass(
          firstPass({
            moderation: flagging("harassment", "harassment/threatening"),
          }),
        ),
      );

      expect(outcome.protection.moderationMinimumLevel).toBe("danger");
      expect(outcome.protection.hideSourceBeforeVerdict).toBe(true);
    });

    it("marks a self-harm signal for the verifier to place", () => {
      const outcome = verifyOutcome(
        routeFirstPass(firstPass({ moderation: flagging("self-harm/intent") })),
      );

      // Whether the writer is describing their own distress or telling the
      // creator to act is a judgement the verifier makes.
      expect(outcome.protection.maySignalSelfHarmCase).toBe(true);
      expect(outcome.protection.moderationMinimumLevel).toBeNull();
    });

    it("runs an unrecognised category through the default treatment", () => {
      const outcome = verifyOutcome(
        routeFirstPass(
          firstPass({
            moderation: {
              flagged: true,
              categories: [],
              unknownCategories: ["brand-new/category"],
              categoryScores: { "brand-new/category": 0.8 },
            },
          }),
        ),
      );

      expect(outcome.reasons).toEqual(["moderation_flagged"]);
      expect(outcome.protection.moderationMinimumLevel).toBeNull();
    });

    it("claims no protection when the filter never answered", () => {
      const outcome = verifyOutcome(
        routeFirstPass(firstPass({ moderation: null })),
      );

      expect(outcome.protection).toEqual({
        hideSourceBeforeVerdict: false,
        moderationMinimumLevel: null,
        maySignalSelfHarmCase: false,
      });
    });
  });
});
