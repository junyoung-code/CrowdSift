import { withRetry } from "@/lib/retry";
import { evaluateComment } from "@/features/rules/evaluate-comment";
import { applyReviewFloor } from "@/features/rules/route-review-level";
import type { PhraseRule, RuleEvaluation } from "@/features/rules/types";

import type { AnalysisProvider } from "./analysis-provider";
import { AnalysisSchemaError } from "./analysis-errors";
import type {
  CreatorPolicySnapshot,
  ModelResult,
  Stage1Output,
} from "./contracts";
import { buildAnalysisIdempotencyKey } from "./idempotency";
import {
  COMMENT_ANALYSIS_SCHEMA_VERSION,
  STAGE_1_PROMPT_VERSION,
} from "./prompts";

export type AnalysisJobStatus =
  | "pending"
  | "running"
  | "partially_succeeded"
  | "succeeded"
  | "failed";

export type AnalysisJobProgress = {
  status: AnalysisJobStatus;
  total: number;
  completed: number;
  failed: number;
  remaining: number;
};

export type AnalysisWorkItem = {
  id: string;
  workspaceId: string;
  rawCommentId: string;
  sourceText: string;
  videoTitle: string;
  threadContext: string[];
  policy: CreatorPolicySnapshot;
  phraseRules: readonly PhraseRule[];
};

export interface AnalysisRepository {
  claimPendingItems(
    jobId: string,
    maxItems: number,
  ): Promise<{
    job: {
      id: string;
      workspaceId: string;
      status: AnalysisJobStatus;
      total: number;
      completed: number;
      failed: number;
    };
    items: AnalysisWorkItem[];
  }>;
  insertRuleEvaluation(input: {
    item: AnalysisWorkItem;
    evaluation: RuleEvaluation;
  }): Promise<string>;
  insertModelRun(input: {
    item: AnalysisWorkItem;
    result: ModelResult<Stage1Output>;
    idempotencyKey: string;
    promptVersion: string;
    schemaVersion: string;
    policyVersion: number;
    stage: 1;
  }): Promise<string>;
  insertFailedModelRun(input: {
    item: AnalysisWorkItem;
    idempotencyKey: string;
    promptVersion: string;
    schemaVersion: string;
    policyVersion: number;
    stage: 1;
    errorCode: string;
  }): Promise<void>;
  insertAnalysis(input: {
    item: AnalysisWorkItem;
    modelRunId: string;
    ruleEvaluationId: string;
    stage: 1;
    category: Stage1Output["category"];
    confidence: number;
    reviewLevel: Stage1Output["reviewLevel"];
    toxicity: number;
    spam: number;
    phishing: number;
    actionableFeedback: boolean;
    recommendedAction: Stage1Output["recommendedAction"];
    manualReview: boolean;
    evidenceReview: boolean;
    explanation: string;
    policyVersion: number;
    provenance: {
      promptVersion: string;
      schemaVersion: string;
      ruleEngineVersion: string;
    };
  }): Promise<string>;
  completeItem(itemId: string): Promise<void>;
  failItem(itemId: string, errorCode: string): Promise<void>;
  refreshJobProgress(jobId: string): Promise<AnalysisJobProgress>;
}

const getProviderStatus = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "status" in error &&
  typeof error.status === "number"
    ? error.status
    : null;

const toFailureCode = (error: unknown) => {
  if (error instanceof AnalysisSchemaError) {
    return "SCHEMA_INVALID";
  }

  const status = getProviderStatus(error);
  if (status === 429) {
    return "PROVIDER_QUOTA";
  }
  if (status !== null && status >= 500) {
    return "PROVIDER_TRANSIENT";
  }
  return "INTERNAL";
};

const classifyWithSchemaRetry = async ({
  input,
  provider,
  retryBaseDelayMs,
}: {
  input: Parameters<AnalysisProvider["classifyStage1"]>[0];
  provider: AnalysisProvider;
  retryBaseDelayMs: number;
}) => {
  const callProvider = () =>
    withRetry(() => provider.classifyStage1(input), {
      maxAttempts: 3,
      baseDelayMs: retryBaseDelayMs,
    });

  try {
    return await callProvider();
  } catch (error) {
    if (error instanceof AnalysisSchemaError) {
      return callProvider();
    }
    throw error;
  }
};

export const createAnalysisService = ({
  modelVersion,
  provider,
  repository,
  retryBaseDelayMs = 200,
}: {
  provider: AnalysisProvider;
  repository: AnalysisRepository;
  modelVersion: string;
  retryBaseDelayMs?: number;
}) => ({
  async processAnalysisChunk(
    jobId: string,
    maxItems = 5,
  ): Promise<AnalysisJobProgress> {
    const claimed = await repository.claimPendingItems(
      jobId,
      Math.min(Math.max(maxItems, 1), 5),
    );

    for (const item of claimed.items) {
      const evaluation = evaluateComment({
        text: item.sourceText,
        phraseRules: [...item.phraseRules],
        engineVersion: "rules-v1",
      });
      const idempotencyKey = buildAnalysisIdempotencyKey({
        rawCommentId: item.rawCommentId,
        policyVersion: item.policy.version,
        promptVersion: STAGE_1_PROMPT_VERSION,
        modelVersion,
        schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
      });
      const ruleEvaluationId = await repository.insertRuleEvaluation({
        item,
        evaluation,
      });

      try {
        const result = await classifyWithSchemaRetry({
          input: {
            rawCommentId: item.rawCommentId,
            sourceText: item.sourceText,
            videoTitle: item.videoTitle,
            threadContext: item.threadContext,
            ruleEvaluation: evaluation,
            creatorPolicy: item.policy,
          },
          provider,
          retryBaseDelayMs,
        });
        const reviewLevel = applyReviewFloor(
          result.output.reviewLevel,
          evaluation.signals,
        );
        const modelRunId = await repository.insertModelRun({
          item,
          result,
          idempotencyKey,
          promptVersion: STAGE_1_PROMPT_VERSION,
          schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
          policyVersion: item.policy.version,
          stage: 1,
        });

        await repository.insertAnalysis({
          item,
          modelRunId,
          ruleEvaluationId,
          stage: 1,
          category: result.output.category,
          confidence: result.output.confidence,
          reviewLevel,
          toxicity: result.output.toxicity,
          spam: result.output.spam,
          phishing: result.output.phishing,
          actionableFeedback: result.output.actionableFeedback,
          recommendedAction: result.output.recommendedAction,
          manualReview: result.output.needsSecondPass,
          evidenceReview: reviewLevel === "risk",
          explanation: result.output.explanation,
          policyVersion: item.policy.version,
          provenance: {
            promptVersion: STAGE_1_PROMPT_VERSION,
            schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
            ruleEngineVersion: evaluation.engineVersion,
          },
        });
        await repository.completeItem(item.id);
      } catch (error) {
        const errorCode = toFailureCode(error);
        await repository.insertFailedModelRun({
          item,
          idempotencyKey,
          promptVersion: STAGE_1_PROMPT_VERSION,
          schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
          policyVersion: item.policy.version,
          stage: 1,
          errorCode,
        });
        await repository.failItem(item.id, errorCode);
      }
    }

    return repository.refreshJobProgress(jobId);
  },
});
