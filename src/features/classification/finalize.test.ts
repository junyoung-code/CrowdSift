import { describe, expect, it } from "vitest";

import type { BranchOutcome } from "./branch";
import type { FirstPassResult } from "./contracts";
import { finalizeClassification } from "./finalize";
import type { TerraVerdict } from "./schemas";

const firstPass: FirstPassResult = {
  commentId: "comment-1",
  workspaceId: "workspace-1",
  moderation: {
    result: {
      flagged: false,
      categories: [],
      unknownCategories: [],
      categoryScores: {},
    },
    model: "omni-moderation-latest",
    latencyMs: 10,
  },
  luna: {
    result: {
      candidateLevel: "safe",
      certainty: "clear",
      feedbackPresent: false,
      locationOrScheduleMention: false,
      sensitiveTopicMatched: false,
      hardRiskFlags: [],
      softRiskFlags: [],
      matchedRules: [],
    },
    run: {
      model: "gpt-5.6-luna",
      responseId: "resp-luna",
      latencyMs: 20,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
    },
  },
  promptVersion: "luna-v1",
  evaluatedAt: "2026-08-07T00:00:00.000Z",
};

const instantSafe: BranchOutcome = {
  kind: "instant_safe",
  level: "safe",
  basis: "luna_safe",
  certainty: "clear",
};

const verify: BranchOutcome = {
  kind: "verify",
  reasons: ["luna_danger"],
  protection: {
    hideSourceBeforeVerdict: true,
    moderationMinimumLevel: null,
    maySignalSelfHarmCase: false,
  },
};

const terraDanger: TerraVerdict = {
  verdictLevel: "danger",
  certainty: "clear",
  reasonCodes: ["personal_attack"],
  hardRiskFlags: ["personal_attack"],
  softRiskFlags: [],
  feedbackType: "none",
  feedbackActionable: false,
  feedbackCore: null,
  recommendedActions: ["hide_source", "consider_delete"],
  safetyCase: false,
};

describe("finalizeClassification", () => {
  it("creates an explicit final safe verdict when Terra is skipped", () => {
    expect(
      finalizeClassification({ firstPass, branch: instantSafe, terra: null }),
    ).toEqual({
      status: "decided",
      level: "safe",
      basis: "instant_safe",
      agreedWithFirstPass: null,
      allowRewrite: false,
      hideSource: false,
      recommendedActions: ["show_source"],
      safetyCase: false,
      raisedByModeration: false,
    });
  });

  it("refuses to invent a verified result without Terra", () => {
    expect(() =>
      finalizeClassification({ firstPass, branch: verify, terra: null }),
    ).toThrow("terra_result_required");
  });

  it("keeps a verified danger result until the storage boundary", () => {
    expect(
      finalizeClassification({
        firstPass: {
          ...firstPass,
          luna: {
            ...firstPass.luna,
            result: {
              ...firstPass.luna.result,
              candidateLevel: "danger",
              certainty: "clear",
              hardRiskFlags: ["personal_attack"],
            },
          },
        },
        branch: verify,
        terra: terraDanger,
      }),
    ).toMatchObject({
      status: "decided",
      level: "danger",
      basis: "both_agreed",
      agreedWithFirstPass: true,
    });
  });
});
