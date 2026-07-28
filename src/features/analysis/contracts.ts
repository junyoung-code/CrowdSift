import type { RuleEvaluation } from "@/features/rules/types";

import type {
  CommentCategorySchema,
  DashboardSummaryOutputSchema,
  RecommendedActionSchema,
  ReviewLevelSchema,
  Stage1OutputSchema,
  Stage2OutputSchema,
} from "./schemas";
import type { z } from "zod";

export type CommentCategory = z.infer<typeof CommentCategorySchema>;
export type ReviewLevel = z.infer<typeof ReviewLevelSchema>;
export type RecommendedAction = z.infer<typeof RecommendedActionSchema>;
export type Stage1Output = z.infer<typeof Stage1OutputSchema>;
export type Stage2Output = z.infer<typeof Stage2OutputSchema>;
export type DashboardSummaryOutput = z.infer<
  typeof DashboardSummaryOutputSchema
>;
export type ModelProvider = "openai" | "fixture";

export type CreatorPolicySnapshot = {
  version: number;
  sensitivity: "low" | "standard" | "high";
  preferredActions: {
    caution: RecommendedAction;
    risk: RecommendedAction;
  };
  harmfulTextHidden: boolean;
  phraseRules: Array<{
    kind: "blocked" | "allowed" | "context_exception";
    phrase: string;
    contextNote: string | null;
  }>;
};

export type Stage1Input = {
  rawCommentId: string;
  sourceText: string;
  videoTitle: string;
  threadContext: string[];
  ruleEvaluation: RuleEvaluation;
  creatorPolicy: CreatorPolicySnapshot;
};

export type RetrievedFeedback = {
  feedbackId: string;
  similarity: number;
  decision: "approved" | "rejected" | "corrected";
  correctedCategory: CommentCategory | null;
  correctedReviewLevel: ReviewLevel | null;
  editedSanitizedFeedback: string | null;
};

export type Stage2Input = Stage1Input & {
  stage1: Stage1Output;
  retrievedFeedback: RetrievedFeedback[];
  triggerReasons: string[];
};

export type ModelResult<T> = {
  output: T;
  provider: ModelProvider;
  modelIdentifier: string;
  providerResponseId: string;
  latencyMs: number;
  usage: Record<string, number>;
};

export type EmbeddingResult = {
  vector: number[];
  model: string;
  usage: {
    inputTokens: number;
    totalTokens: number;
  };
};
