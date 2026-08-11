import { describe, expect, it } from "vitest";

import type { BranchOutcome } from "./branch";
import {
  toBranchRow,
  toStageRunRow,
  toVerdictRow,
  type ClassificationStorageItem,
  type ClassificationVerdictForStorage,
} from "./storage";

const item: ClassificationStorageItem = {
  id: "item-1",
  rawCommentId: "comment-1",
  workspaceId: "workspace-1",
};

describe("classification storage mappers", () => {
  it("preserves a Luna run's structured output and usage", () => {
    const row = toStageRunRow({
      item,
      stage: "luna",
      provider: "openai",
      modelIdentifier: "gpt-5.6-luna",
      providerResponseId: "resp-luna",
      idempotencyKey: "item-1:luna:v1",
      promptVersion: "luna-v1",
      schemaVersion: "classification-v1",
      policyVersion: 1,
      latencyMs: 420,
      usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
      status: "succeeded",
      output: {
        candidateLevel: "caution",
        certainty: "borderline",
        feedbackPresent: true,
      },
      errorCode: null,
    });

    expect(row).toEqual({
      workspace_id: "workspace-1",
      raw_comment_id: "comment-1",
      analysis_job_item_id: "item-1",
      stage: "luna",
      provider: "openai",
      model_identifier: "gpt-5.6-luna",
      provider_response_id: "resp-luna",
      idempotency_key: "item-1:luna:v1",
      prompt_version: "luna-v1",
      schema_version: "classification-v1",
      policy_version: 1,
      latency_ms: 420,
      usage: { inputTokens: 120, outputTokens: 30, totalTokens: 150 },
      status: "succeeded",
      output: {
        candidateLevel: "caution",
        certainty: "borderline",
        feedbackPresent: true,
      },
      error_code: null,
    });
  });

  it("stores the deterministic Terra routing reasons and protection", () => {
    const branch: BranchOutcome = {
      kind: "verify",
      reasons: ["luna_caution", "moderation_flagged"],
      protection: {
        hideSourceBeforeVerdict: true,
        moderationMinimumLevel: "caution",
        maySignalSelfHarmCase: false,
      },
    };

    expect(toBranchRow({ item, branch })).toEqual({
      workspace_id: "workspace-1",
      raw_comment_id: "comment-1",
      analysis_job_item_id: "item-1",
      outcome: "verify",
      reasons: ["luna_caution", "moderation_flagged"],
      protection: {
        hideSourceBeforeVerdict: true,
        moderationMinimumLevel: "caution",
        maySignalSelfHarmCase: false,
      },
    });
  });

  it("maps classifier danger to the product risk level", () => {
    const verdict: ClassificationVerdictForStorage = {
      status: "decided",
      level: "danger",
      basis: "danger_in_either",
      agreedWithFirstPass: false,
      allowRewrite: false,
      hideSource: true,
      recommendedActions: ["hide_source", "consider_delete"],
      safetyCase: false,
      raisedByModeration: false,
    };

    expect(
      toVerdictRow({
        item,
        verdict,
        reasonCodes: ["personal_attack"],
        feedbackType: "none",
        feedbackCore: null,
      }),
    ).toMatchObject({
      status: "decided",
      level: "risk",
      basis: "danger_in_either",
      agreed_with_first_pass: false,
      hide_source: true,
      reason_codes: ["personal_attack"],
    });
  });

  it("keeps a review-queue verdict level null", () => {
    const verdict: ClassificationVerdictForStorage = {
      status: "review_queue",
      level: null,
      basis: "verifier_uncertain",
      agreedWithFirstPass: false,
      allowRewrite: false,
      hideSource: true,
      recommendedActions: ["hide_source"],
      safetyCase: false,
      raisedByModeration: false,
    };

    expect(
      toVerdictRow({
        item,
        verdict,
        reasonCodes: [],
        feedbackType: "none",
        feedbackCore: null,
      }),
    ).toMatchObject({ status: "review_queue", level: null });
  });
});
