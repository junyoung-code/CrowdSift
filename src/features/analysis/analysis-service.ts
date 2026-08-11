import { withRetry } from "@/lib/retry";
import { evaluateComment } from "@/features/rules/evaluate-comment";
import type { PhraseRule, RuleEvaluation } from "@/features/rules/types";

import type { AnalysisProvider } from "./analysis-provider";
import { AnalysisSchemaError } from "./analysis-errors";
import type {
  CreatorPolicySnapshot,
  ModelResult,
  RetrievedFeedback,
  Stage1Output,
  Stage2Output,
} from "./contracts";
import { buildAnalysisIdempotencyKey } from "./idempotency";
import {
  COMMENT_ANALYSIS_SCHEMA_VERSION,
  STAGE_1_PROMPT_VERSION,
  STAGE_2_PROMPT_VERSION,
} from "./prompts";
import {
  detectContextSensitivePattern,
  shouldRunSecondPass,
} from "./second-pass";
import {
  enforceReviewLevelFloor,
  routeStageOne,
} from "./stage-one-routing";

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
    result: ModelResult<Stage1Output | Stage2Output>;
    idempotencyKey: string;
    promptVersion: string;
    schemaVersion: string;
    policyVersion: number;
    stage: 1 | 2;
  }): Promise<string>;
  insertFailedModelRun(input: {
    item: AnalysisWorkItem;
    idempotencyKey: string;
    promptVersion: string;
    schemaVersion: string;
    policyVersion: number;
    stage: 1 | 2;
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
  insertStageTwoAnalysis?(input: {
    item: AnalysisWorkItem;
    modelRunId: string;
    ruleEvaluationId: string;
    stage: 2;
    stageOneAnalysisId: string;
    category: Stage2Output["category"];
    confidence: number;
    reviewLevel: Stage2Output["reviewLevel"];
    toxicity: number;
    spam: number;
    phishing: number;
    actionableFeedback: boolean;
    recommendedAction: Stage2Output["recommendedAction"];
    manualReview: boolean;
    evidenceReview: boolean;
    explanation: string;
    policyVersion: number;
    retrievedFeedback: RetrievedFeedback[];
    provenance: {
      promptVersion: string;
      schemaVersion: string;
      ruleEngineVersion: string;
      triggerReasons: string[];
    };
  }): Promise<string>;
  insertSanitizedFeedback?(input: {
    workspaceId: string;
    analysisId: string;
    neutralText: string | null;
    normalizedQuestion: string | null;
    noSignal: boolean;
  }): Promise<void>;
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

const callWithSchemaRetry = async <T>({
  operation,
  retryBaseDelayMs,
}: {
  operation: () => Promise<T>;
  retryBaseDelayMs: number;
}) => {
  const callProvider = () =>
    withRetry(operation, {
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
  retrieveCreatorExamples,
  stageTwoModelVersion = modelVersion,
}: {
  provider: AnalysisProvider;
  repository: AnalysisRepository;
  modelVersion: string;
  stageTwoModelVersion?: string;
  retryBaseDelayMs?: number;
  retrieveCreatorExamples?: (input: {
    workspaceId: string;
    text: string;
    threshold: number;
    limit: number;
  }) => Promise<
    | RetrievedFeedback[]
    | {
        examples: RetrievedFeedback[];
        embeddingUsage: {
          inputTokens: number;
          model: string;
        };
      }
  >;
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
      let failureContext: {
        idempotencyKey: string;
        promptVersion: string;
        stage: 1 | 2;
      } | null = {
        idempotencyKey,
        promptVersion: STAGE_1_PROMPT_VERSION,
        stage: 1,
      };
      const ruleEvaluationId = await repository.insertRuleEvaluation({
        item,
        evaluation,
      });

      try {
        const stage1Input = {
          rawCommentId: item.rawCommentId,
          sourceText: item.sourceText,
          videoTitle: item.videoTitle,
          threadContext: item.threadContext,
          ruleEvaluation: evaluation,
          creatorPolicy: item.policy,
        };
        const result = await callWithSchemaRetry({
          operation: () => provider.classifyStage1(stage1Input),
          retryBaseDelayMs,
        });
        const contextSensitive = detectContextSensitivePattern({
          sourceText: item.sourceText,
        });
        const route = routeStageOne({
          stageOne: result.output,
          ruleSignals: evaluation.signals,
          contextSensitive,
        });
        const modelRunId = await repository.insertModelRun({
          item,
          result,
          idempotencyKey,
          promptVersion: STAGE_1_PROMPT_VERSION,
          schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
          policyVersion: item.policy.version,
          stage: 1,
        });

        const stageOneAnalysisId = await repository.insertAnalysis({
          item,
          modelRunId,
          ruleEvaluationId,
          stage: 1,
          category: result.output.category,
          confidence: result.output.confidence,
          reviewLevel: route.finalReviewLevel,
          toxicity: result.output.toxicity,
          spam: result.output.spam,
          phishing: result.output.phishing,
          actionableFeedback: result.output.actionableFeedback,
          recommendedAction: result.output.recommendedAction,
          manualReview: route.runSecondPass,
          evidenceReview: route.finalReviewLevel === "risk",
          explanation: result.output.explanation,
          policyVersion: item.policy.version,
          provenance: {
            promptVersion: STAGE_1_PROMPT_VERSION,
            schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
            ruleEngineVersion: evaluation.engineVersion,
          },
        });

        if (
          retrieveCreatorExamples &&
          repository.insertStageTwoAnalysis &&
          repository.insertSanitizedFeedback &&
          route.runSecondPass
        ) {
          const stageTwoIdempotencyKey =
            buildAnalysisIdempotencyKey({
              rawCommentId: item.rawCommentId,
              policyVersion: item.policy.version,
              promptVersion: STAGE_2_PROMPT_VERSION,
              modelVersion: stageTwoModelVersion,
              schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
            });
          failureContext = {
            idempotencyKey: stageTwoIdempotencyKey,
            promptVersion: STAGE_2_PROMPT_VERSION,
            stage: 2,
          };
          const retrieval = await retrieveCreatorExamples({
            workspaceId: item.workspaceId,
            text: item.sourceText,
            threshold: 0.78,
            limit: 5,
          });
          const retrievedFeedback = (
            Array.isArray(retrieval) ? retrieval : retrieval.examples
          ).slice(0, 5);
          const embeddingInputTokens = Array.isArray(retrieval)
            ? 0
            : retrieval.embeddingUsage.inputTokens;
          const secondPass = shouldRunSecondPass({
            stage1: result.output,
            ruleSignals: evaluation.signals,
            bestSimilarity: retrievedFeedback[0]?.similarity ?? null,
            contextSensitive,
          });

          if (secondPass.run) {
            const triggerReasons = [
              ...secondPass.reasons,
              ...route.reasons,
              ...result.output.secondPassReasons,
            ].filter(
              (reason, index, allReasons) =>
                allReasons.indexOf(reason) === index,
            ).slice(0, 8);
            const stageTwoResult = await callWithSchemaRetry({
              operation: () =>
                provider.classifyStage2({
                  ...stage1Input,
                  stage1: result.output,
                  retrievedFeedback,
                  triggerReasons,
                }),
              retryBaseDelayMs,
            });
            const storedStageTwoResult = {
              ...stageTwoResult,
              usage: {
                ...stageTwoResult.usage,
                embeddingInputTokens,
              },
            };
            const stageTwoReviewLevel = enforceReviewLevelFloor(
              stageTwoResult.output.reviewLevel,
              route.minimumReviewLevel,
            );
            const stageTwoModelRunId =
              await repository.insertModelRun({
                item,
                result: storedStageTwoResult,
                idempotencyKey: stageTwoIdempotencyKey,
                promptVersion: STAGE_2_PROMPT_VERSION,
                schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
                policyVersion: item.policy.version,
                stage: 2,
              });
            const stageTwoAnalysisId =
              await repository.insertStageTwoAnalysis({
                item,
                modelRunId: stageTwoModelRunId,
                ruleEvaluationId,
                stage: 2,
                stageOneAnalysisId,
                category: stageTwoResult.output.category,
                confidence: stageTwoResult.output.confidence,
                reviewLevel: stageTwoReviewLevel,
                toxicity: stageTwoResult.output.toxicity,
                spam: stageTwoResult.output.spam,
                phishing: stageTwoResult.output.phishing,
                actionableFeedback:
                  stageTwoResult.output.actionableFeedback,
                recommendedAction:
                  stageTwoResult.output.recommendedAction,
                manualReview: stageTwoResult.output.manualReview,
                evidenceReview:
                  stageTwoResult.output.evidenceReview ||
                  stageTwoReviewLevel === "risk",
                explanation: stageTwoResult.output.explanation,
                policyVersion: item.policy.version,
                retrievedFeedback,
                provenance: {
                  promptVersion: STAGE_2_PROMPT_VERSION,
                  schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
                  ruleEngineVersion: evaluation.engineVersion,
                  triggerReasons,
                },
              });
            const neutralText =
              stageTwoResult.output.category ===
              "abusive_no_signal"
                ? null
                : stageTwoResult.output.sanitizedFeedback;
            const normalizedQuestion =
              stageTwoResult.output.category ===
              "abusive_no_signal"
                ? null
                : stageTwoResult.output.normalizedQuestion;

            await repository.insertSanitizedFeedback({
              workspaceId: item.workspaceId,
              analysisId: stageTwoAnalysisId,
              neutralText,
              normalizedQuestion,
              noSignal:
                neutralText === null &&
                normalizedQuestion === null,
            });
          }
          failureContext = null;
        } else {
          failureContext = null;
        }
        await repository.completeItem(item.id);
      } catch (error) {
        const errorCode = toFailureCode(error);
        if (failureContext) {
          await repository.insertFailedModelRun({
            item,
            idempotencyKey: failureContext.idempotencyKey,
            promptVersion: failureContext.promptVersion,
            schemaVersion: COMMENT_ANALYSIS_SCHEMA_VERSION,
            policyVersion: item.policy.version,
            stage: failureContext.stage,
            errorCode,
          });
        }
        await repository.failItem(item.id, errorCode);
      }
    }

    return repository.refreshJobProgress(jobId);
  },
});
