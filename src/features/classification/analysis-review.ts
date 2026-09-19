import { ClassificationSchemaError } from "./luna-first-pass";
import type { StoredFinalVerdict } from "./classification-service";

const REVIEW_REASONS = [
  "classification_evidence_missing",
  "classification_evidence_not_in_source",
  "classification_attack_evidence_missing",
  "classification_context_inconsistent",
  "classification_missing_context_unspecified",
  "classification_safe_with_attack_flags",
  "classification_output_invalid",
] as const;
export type ClassificationReviewBasis = typeof REVIEW_REASONS[number];

/** Only invalid model output is a judgement to defer. Infrastructure failures stay failures. */
export function reviewForAnalysisError(error: unknown, stage: string): StoredFinalVerdict | null {
  if (stage !== "luna" && stage !== "terra") return null;
  if (!(error instanceof ClassificationSchemaError) && !(error instanceof SyntaxError) &&
      !(error instanceof Error && ["ZodError", "LengthFinishReasonError", "ContentFilterFinishReasonError"].includes(error.name))) return null;
  const cause = error.cause;
  const reason = cause instanceof Error ? cause.message : "";
  const basis: ClassificationReviewBasis = REVIEW_REASONS.includes(reason as ClassificationReviewBasis)
    ? reason as ClassificationReviewBasis : "classification_output_invalid";
  return {
    verdict: {
      status: "review_queue", level: null, basis,
      agreedWithFirstPass: null, allowRewrite: false, hideSource: true,
      recommendedActions: [], safetyCase: false, raisedByModeration: false,
      raisedBySpam: false, spamSignals: [],
    },
    reasonCodes: [], feedbackType: "none", feedbackCore: null,
  };
}
