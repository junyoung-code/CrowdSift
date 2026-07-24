import { z } from "zod";

import {
  CommentCategorySchema,
  ReviewLevelSchema,
  Stage2OutputSchema,
} from "@/features/analysis/schemas";

const EvaluationCaseBaseSchema = z.object({
    id: z.string().regex(/^ko-\d{3}$/),
    text: z.string().min(1),
    context: z.string(),
    expectedCategories: z.array(CommentCategorySchema).min(1),
    forbiddenReviewLevels: z.array(ReviewLevelSchema),
    expectActionableFeedback: z.boolean(),
    expectedSanitizedFeedback: z.enum([
      "required",
      "forbidden",
      "optional",
    ]),
  });

export const EvaluationCaseSchema = EvaluationCaseBaseSchema.extend({
    reviewedBy: z.string().min(1),
    reviewedAt: z.iso.datetime(),
  })
  .strict();

export const EvaluationCaseDraftSchema = EvaluationCaseBaseSchema.extend({
  reviewedBy: z.string(),
  reviewedAt: z.union([z.literal(""), z.iso.datetime()]),
}).strict();

export const EvaluationCohortSchema = z.enum([
  "positive_neutral",
  "question",
  "constructive_feedback",
  "toxic_but_actionable",
  "pure_abuse",
  "sarcasm_indirect_attack",
  "friendly_slang_context",
  "spacing_repeated_variants",
  "ads_repetition_phishing",
  "harassment_threat",
]);

export const EvaluationSafetyEvidenceSchema = z
  .object({
    rawSourceMutated: z.boolean(),
    crossWorkspaceLeak: z.boolean(),
    unconfirmedModerationCalls: z.number().int().min(0),
    schemaFailuresAfterRetry: z.number().int().min(0),
  })
  .strict();

export const EvaluationOutputRecordSchema = z
  .object({
    caseId: z.string().regex(/^ko-\d{3}$/),
    output: Stage2OutputSchema,
    safetyEvidence: EvaluationSafetyEvidenceSchema,
  })
  .strict();

export const EvaluationDatasetDraftSchema = z
  .object({
    schemaVersion: z.literal("korean-comment-evaluation-v1"),
    promptVersion: z.string().min(1),
    source: z.literal("synthetic"),
    groups: z.array(
      z
        .object({
          cohort: EvaluationCohortSchema,
          cases: z.array(EvaluationCaseDraftSchema),
        })
        .strict(),
    ),
    recordedOutputs: z.array(EvaluationOutputRecordSchema),
  })
  .strict();

export type EvaluationCase = z.infer<typeof EvaluationCaseSchema>;
export type EvaluationCaseDraft = z.infer<typeof EvaluationCaseDraftSchema>;
export type EvaluationCohort = z.infer<typeof EvaluationCohortSchema>;
export type EvaluationDatasetDraft = z.infer<
  typeof EvaluationDatasetDraftSchema
>;
export type ParsedEvaluationOutputRecord = z.infer<
  typeof EvaluationOutputRecordSchema
>;
