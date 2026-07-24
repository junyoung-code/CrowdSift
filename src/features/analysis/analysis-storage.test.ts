import { describe, expect, it } from "vitest";

import {
  toSanitizedFeedbackRow,
  toStageTwoAnalysisRow,
} from "./analysis-storage";
import type { AnalysisWorkItem } from "./analysis-service";

const item = {
  id: "item-1",
  workspaceId: "workspace-1",
  rawCommentId: "raw-1",
  sourceText: "원문",
  videoTitle: "영상",
  threadContext: [],
  policy: {
    version: 1,
    sensitivity: "standard",
    preferredActions: {
      caution: "review",
      risk: "hold_for_review",
    },
    harmfulTextHidden: true,
    phraseRules: [],
  },
  phraseRules: [],
} satisfies AnalysisWorkItem;

describe("analysis storage rows", () => {
  it("links stage two to stage one and preserves RAG provenance", () => {
    const row = toStageTwoAnalysisRow({
      item,
      modelRunId: "model-run-2",
      ruleEvaluationId: "rule-1",
      stage: 2,
      stageOneAnalysisId: "analysis-1",
      category: "constructive_feedback",
      confidence: 0.93,
      reviewLevel: "caution",
      toxicity: 0.3,
      spam: 0,
      phishing: 0,
      actionableFeedback: true,
      recommendedAction: "review",
      manualReview: true,
      evidenceReview: false,
      explanation: "자막 개선 요청",
      policyVersion: 1,
      retrievedFeedback: [
        {
          feedbackId: "feedback-1",
          similarity: 0.84,
          decision: "corrected",
          correctedCategory: "constructive_feedback",
          correctedReviewLevel: "caution",
          editedSanitizedFeedback: "자막을 크게 해 달라는 요청",
        },
      ],
      provenance: {
        promptVersion: "commenthawk-stage2-v1",
        schemaVersion: "comment-analysis-v1",
        ruleEngineVersion: "rules-v1",
        triggerReasons: ["review_level", "creator_similarity"],
      },
    });

    expect(row).toMatchObject({
      workspace_id: "workspace-1",
      raw_comment_id: "raw-1",
      stage: 2,
      stage_one_analysis_id: "analysis-1",
      retrieved_feedback: [
        {
          feedbackId: "feedback-1",
          similarity: 0.84,
        },
      ],
      provenance: {
        promptVersion: "commenthawk-stage2-v1",
        triggerReasons: ["review_level", "creator_similarity"],
      },
    });
  });

  it("stores no-signal feedback without fabricating sanitized text", () => {
    expect(
      toSanitizedFeedbackRow({
        workspaceId: "workspace-1",
        analysisId: "analysis-2",
        neutralText: null,
        normalizedQuestion: null,
        noSignal: true,
      }),
    ).toEqual({
      workspace_id: "workspace-1",
      analysis_id: "analysis-2",
      neutral_text: null,
      normalized_question: null,
      no_signal: true,
    });
  });
});
