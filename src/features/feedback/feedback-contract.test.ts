import { describe, expect, it } from "vitest";

import { parseCreatorCorrectionForm } from "./feedback-contract";

describe("creator correction form", () => {
  it("keeps personalization and training consent separate", () => {
    const formData = new FormData();
    formData.set("rawCommentId", "11111111-1111-4111-8111-111111111111");
    formData.set("analysisId", "22222222-2222-4222-8222-222222222222");
    formData.set("decision", "corrected");
    formData.set("correctedCategory", "constructive_feedback");
    formData.set("correctedReviewLevel", "caution");
    formData.set("correctedRecommendedAction", "review");
    formData.set("editedSanitizedFeedback", "  자막을 더 크게 해 주세요.  ");
    formData.set("useForTraining", "true");

    expect(parseCreatorCorrectionForm(formData)).toEqual({
      rawCommentId: "11111111-1111-4111-8111-111111111111",
      analysisId: "22222222-2222-4222-8222-222222222222",
      decision: "corrected",
      correctedCategory: "constructive_feedback",
      correctedReviewLevel: "caution",
      correctedRecommendedAction: "review",
      editedSanitizedFeedback: "자막을 더 크게 해 주세요.",
      useForPersonalization: false,
      useForTraining: true,
    });
  });

  it("rejects unknown categories", () => {
    const formData = new FormData();
    formData.set("rawCommentId", "11111111-1111-4111-8111-111111111111");
    formData.set("analysisId", "22222222-2222-4222-8222-222222222222");
    formData.set("decision", "corrected");
    formData.set("correctedCategory", "made_up");
    formData.set("correctedReviewLevel", "caution");
    formData.set("correctedRecommendedAction", "review");

    expect(() => parseCreatorCorrectionForm(formData)).toThrow();
  });
});
