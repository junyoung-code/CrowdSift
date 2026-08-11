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
      raisedBySpam: false,
      spamSignals: [],
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

  it("raises a spam comment the criteria would call safe", () => {
    // 등급 기준은 크리에이터를 향한 공격만 다룬다. 스팸은 아무도 공격하지 않아
    // 기준대로 읽으면 안전이다. 그래서 코드가 최소 등급을 올린다.
    const verdict = finalizeClassification({
      firstPass,
      branch: instantSafe,
      terra: null,
      spam: { level: "caution", signals: ["promotion", "off_platform_call"] },
    });

    expect(verdict).toMatchObject({
      level: "caution",
      raisedBySpam: true,
      hideSource: true,
      // 스팸을 다듬어 크리에이터에게 전할 이유가 없다.
      allowRewrite: false,
      spamSignals: ["promotion", "off_platform_call"],
    });
  });

  it("leaves a level the models already put higher", () => {
    const verdict = finalizeClassification({
      firstPass,
      branch: verify,
      terra: terraDanger,
      spam: { level: "caution", signals: ["promotion"] },
    });

    expect(verdict).toMatchObject({
      level: "danger",
      raisedBySpam: false,
      spamSignals: ["promotion"],
    });
  });

  it("does not settle a comment the verifier could not settle", () => {
    // 검토 대기는 사람이 본다는 뜻이다. 등급을 얹으면 사람이 볼 이유가 사라진다.
    const verdict = finalizeClassification({
      firstPass,
      branch: verify,
      terra: { ...terraDanger, certainty: "unclear" },
      spam: { level: "caution", signals: ["promotion"] },
    });

    expect(verdict).toMatchObject({
      status: "review_queue",
      level: null,
      raisedBySpam: false,
    });
  });
});
