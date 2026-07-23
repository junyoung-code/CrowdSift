import type { Json } from "@/types/database";

import type { AnalysisRepository } from "./analysis-service";

type StageTwoAnalysisInput = Parameters<
  NonNullable<AnalysisRepository["insertStageTwoAnalysis"]>
>[0];

type SanitizedFeedbackInput = Parameters<
  NonNullable<AnalysisRepository["insertSanitizedFeedback"]>
>[0];

export const toStageTwoAnalysisRow = (input: StageTwoAnalysisInput) => ({
  workspace_id: input.item.workspaceId,
  raw_comment_id: input.item.rawCommentId,
  analysis_job_item_id: input.item.id,
  model_run_id: input.modelRunId,
  rule_evaluation_id: input.ruleEvaluationId,
  stage: input.stage,
  stage_one_analysis_id: input.stageOneAnalysisId,
  category: input.category,
  confidence: input.confidence,
  review_level: input.reviewLevel,
  toxicity: input.toxicity,
  spam: input.spam,
  phishing: input.phishing,
  actionable_feedback: input.actionableFeedback,
  recommended_action: input.recommendedAction,
  manual_review: input.manualReview,
  evidence_review: input.evidenceReview,
  explanation: input.explanation,
  policy_version: input.policyVersion,
  retrieved_feedback: input.retrievedFeedback as Json,
  provenance: input.provenance as Json,
});

export const toSanitizedFeedbackRow = (input: SanitizedFeedbackInput) => ({
  workspace_id: input.workspaceId,
  analysis_id: input.analysisId,
  neutral_text: input.neutralText,
  normalized_question: input.normalizedQuestion,
  no_signal: input.noSignal,
});
