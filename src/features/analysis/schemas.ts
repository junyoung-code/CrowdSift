import { z } from "zod";

export const CommentCategorySchema = z.enum([
  "positive",
  "neutral",
  "question",
  "constructive_feedback",
  "toxic_but_actionable",
  "abusive_no_signal",
  "spam_advertisement",
  "phishing",
  "harassment",
  "threat_or_serious_risk",
  "uncertain",
]);

export const ReviewLevelSchema = z.enum(["safe", "caution", "risk"]);

export const RecommendedActionSchema = z.enum([
  "none",
  "review",
  "hold_for_review",
  "publish",
  "reject",
]);

export const Stage1OutputSchema = z
  .object({
    category: CommentCategorySchema,
    confidence: z.number().min(0).max(1),
    reviewLevel: ReviewLevelSchema,
    toxicity: z.number().min(0).max(1),
    spam: z.number().min(0).max(1),
    phishing: z.number().min(0).max(1),
    actionableFeedback: z.boolean(),
    needsSecondPass: z.boolean(),
    secondPassReasons: z.array(z.string().min(1).max(160)).max(8),
    recommendedAction: RecommendedActionSchema,
    explanation: z.string().min(1).max(600),
  })
  .strict();

export const Stage2OutputSchema = Stage1OutputSchema.omit({
  needsSecondPass: true,
  secondPassReasons: true,
})
  .extend({
    sanitizedFeedback: z.string().min(1).max(1000).nullable(),
    normalizedQuestion: z.string().min(1).max(500).nullable(),
    manualReview: z.boolean(),
    evidenceReview: z.boolean(),
  })
  .strict();

export const DashboardSummaryOutputSchema = z
  .object({
    summary: z.string().min(1).max(500),
  })
  .strict();
