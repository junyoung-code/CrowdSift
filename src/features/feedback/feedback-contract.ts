import { z } from "zod";

import {
  CommentCategorySchema,
  RecommendedActionSchema,
  ReviewLevelSchema,
} from "@/features/analysis/schemas";

const CreatorCorrectionFormSchema = z.object({
  rawCommentId: z.string().uuid(),
  analysisId: z.string().uuid(),
  sourceImportJobId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "corrected"]),
  correctedCategory: CommentCategorySchema,
  correctedOutcome: z.union([
    ReviewLevelSchema,
    z.literal("review_queue"),
  ]),
  correctedRecommendedAction: RecommendedActionSchema,
  editedSanitizedFeedback: z.string().trim().max(2_000).nullable(),
  correctionReason: z.string().trim().max(2000).nullable(),
  applicationContext: z.string().trim().max(2000).nullable(),
  useForPersonalization: z.boolean(),
  useForTraining: z.boolean(),
});

export const parseCreatorCorrectionForm = (formData: FormData) => {
  const parsed = CreatorCorrectionFormSchema.parse({
    rawCommentId: formData.get("rawCommentId"),
    analysisId: formData.get("analysisId"),
    sourceImportJobId: formData.get("sourceImportJobId"),
    decision: formData.get("decision"),
    correctedCategory: formData.get("correctedCategory"),
    correctedOutcome: formData.get("correctedOutcome"),
    correctedRecommendedAction: formData.get(
      "correctedRecommendedAction",
    ),
    editedSanitizedFeedback:
      String(formData.get("editedSanitizedFeedback") ?? "").trim() || null,
    correctionReason: String(formData.get("correctionReason") ?? "").trim() || null,
    applicationContext: String(formData.get("applicationContext") ?? "").trim() || null,
    useForPersonalization: formData.get("useForPersonalization") === "true",
    useForTraining: formData.get("useForTraining") === "true",
  });

  const { correctedOutcome, ...correction } = parsed;
  return {
    ...correction,
    correctedClassificationStatus:
      correctedOutcome === "review_queue" ? "review_queue" : "decided",
    correctedReviewLevel:
      correctedOutcome === "review_queue" ? null : correctedOutcome,
  } as const;
};
