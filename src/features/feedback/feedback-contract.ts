import { z } from "zod";

import {
  CommentCategorySchema,
  RecommendedActionSchema,
  ReviewLevelSchema,
} from "@/features/analysis/schemas";

const CreatorCorrectionFormSchema = z.object({
  rawCommentId: z.string().uuid(),
  analysisId: z.string().uuid(),
  decision: z.enum(["approved", "rejected", "corrected"]),
  correctedCategory: CommentCategorySchema,
  correctedReviewLevel: ReviewLevelSchema,
  correctedRecommendedAction: RecommendedActionSchema,
  editedSanitizedFeedback: z.string().trim().max(2_000).nullable(),
  useForPersonalization: z.boolean(),
  useForTraining: z.boolean(),
});

export const parseCreatorCorrectionForm = (formData: FormData) =>
  CreatorCorrectionFormSchema.parse({
    rawCommentId: formData.get("rawCommentId"),
    analysisId: formData.get("analysisId"),
    decision: formData.get("decision"),
    correctedCategory: formData.get("correctedCategory"),
    correctedReviewLevel: formData.get("correctedReviewLevel"),
    correctedRecommendedAction: formData.get(
      "correctedRecommendedAction",
    ),
    editedSanitizedFeedback:
      String(formData.get("editedSanitizedFeedback") ?? "").trim() || null,
    useForPersonalization: formData.get("useForPersonalization") === "true",
    useForTraining: formData.get("useForTraining") === "true",
  });
