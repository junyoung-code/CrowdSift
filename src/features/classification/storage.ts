import type { Json } from "@/types/database";

import type { BranchOutcome } from "./branch";
import type {
  FeedbackType,
  ReasonCode,
  RecommendedAction,
  RiskLevel,
} from "./schemas";

export type ClassificationStorageItem = {
  id: string;
  workspaceId: string;
  rawCommentId: string;
};

export type ClassificationVerdictForStorage = {
  status: "decided" | "review_queue";
  level: RiskLevel | null;
  basis: string;
  agreedWithFirstPass: boolean | null;
  allowRewrite: boolean;
  hideSource: boolean;
  recommendedActions: RecommendedAction[];
  safetyCase: boolean;
  raisedByModeration: boolean;
};

export type ClassificationStage = "moderation" | "luna" | "terra";

export const toStageRunRow = (input: {
  item: ClassificationStorageItem;
  stage: ClassificationStage;
  provider: string;
  modelIdentifier: string;
  providerResponseId: string | null;
  idempotencyKey: string;
  promptVersion: string | null;
  schemaVersion: string;
  policyVersion: number;
  latencyMs: number | null;
  usage: Json;
  status: "succeeded" | "failed" | "refused";
  output: Json;
  errorCode: string | null;
}) => ({
  workspace_id: input.item.workspaceId,
  raw_comment_id: input.item.rawCommentId,
  analysis_job_item_id: input.item.id,
  stage: input.stage,
  provider: input.provider,
  model_identifier: input.modelIdentifier,
  provider_response_id: input.providerResponseId,
  idempotency_key: input.idempotencyKey,
  prompt_version: input.promptVersion,
  schema_version: input.schemaVersion,
  policy_version: input.policyVersion,
  latency_ms: input.latencyMs,
  usage: input.usage,
  status: input.status,
  output: input.output,
  error_code: input.errorCode,
});

export const toBranchRow = ({
  branch,
  item,
}: {
  item: ClassificationStorageItem;
  branch: BranchOutcome;
}) => ({
  workspace_id: item.workspaceId,
  raw_comment_id: item.rawCommentId,
  analysis_job_item_id: item.id,
  outcome: branch.kind,
  reasons: (branch.kind === "verify" ? branch.reasons : []) as Json,
  protection:
    branch.kind === "verify"
      ? (branch.protection as unknown as Json)
      : ({} satisfies Json),
});

const toProductLevel = (
  level: RiskLevel | null,
): "safe" | "caution" | "risk" | null =>
  level === "danger" ? "risk" : level;

export const toVerdictRow = ({
  feedbackCore,
  feedbackType,
  item,
  reasonCodes,
  verdict,
}: {
  item: ClassificationStorageItem;
  verdict: ClassificationVerdictForStorage;
  reasonCodes: ReasonCode[];
  feedbackType: FeedbackType;
  feedbackCore: string | null;
}) => ({
  workspace_id: item.workspaceId,
  raw_comment_id: item.rawCommentId,
  analysis_job_item_id: item.id,
  status: verdict.status,
  level: toProductLevel(verdict.level),
  basis: verdict.basis,
  agreed_with_first_pass: verdict.agreedWithFirstPass,
  allow_rewrite: verdict.allowRewrite,
  hide_source: verdict.hideSource,
  recommended_actions: verdict.recommendedActions as Json,
  reason_codes: reasonCodes as Json,
  feedback_type: feedbackType,
  feedback_core: feedbackCore,
  safety_case: verdict.safetyCase,
  raised_by_moderation: verdict.raisedByModeration,
});
