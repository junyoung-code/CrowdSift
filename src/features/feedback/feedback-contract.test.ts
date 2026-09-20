import { describe, expect, it } from "vitest";

import { parseCreatorCorrectionForm } from "./feedback-contract";

describe("creator correction form", () => {
  it("keeps personalization and training consent separate", () => {
    const formData = new FormData();
    formData.set("rawCommentId", "11111111-1111-4111-8111-111111111111");
    formData.set("analysisId", "22222222-2222-4222-8222-222222222222");
    formData.set(
      "sourceImportJobId",
      "33333333-3333-4333-8333-333333333333",
    );
    formData.set("decision", "corrected");
    formData.set("correctedCategory", "constructive_feedback");
    formData.set("correctedOutcome", "caution");
    formData.set("correctedRecommendedAction", "review");
    formData.set("editedSanitizedFeedback", "  자막을 더 크게 해 주세요.  ");
    formData.set("useForTraining", "true");

    expect(parseCreatorCorrectionForm(formData)).toEqual({
      rawCommentId: "11111111-1111-4111-8111-111111111111",
      analysisId: "22222222-2222-4222-8222-222222222222",
      sourceImportJobId: "33333333-3333-4333-8333-333333333333",
      decision: "corrected",
      correctedCategory: "constructive_feedback",
      correctedClassificationStatus: "decided",
      correctedReviewLevel: "caution",
      correctedRecommendedAction: "review",
      editedSanitizedFeedback: "자막을 더 크게 해 주세요.",
      correctionReason: null,
      applicationContext: null,
      useForPersonalization: false,
      useForTraining: true,
    });
  });

  it("keeps a creator hold distinct from the three review levels", () => {
    const formData = new FormData();
    formData.set("rawCommentId", "11111111-1111-4111-8111-111111111111");
    formData.set("analysisId", "22222222-2222-4222-8222-222222222222");
    formData.set(
      "sourceImportJobId",
      "33333333-3333-4333-8333-333333333333",
    );
    formData.set("decision", "corrected");
    formData.set("correctedCategory", "uncertain");
    formData.set("correctedOutcome", "review_queue");
    formData.set("correctedRecommendedAction", "review");
    formData.set("correctionReason", "맥락이 부족해 직접 확인이 필요함");

    expect(parseCreatorCorrectionForm(formData)).toEqual(
      expect.objectContaining({
        correctedClassificationStatus: "review_queue",
        correctedReviewLevel: null,
        correctionReason: "맥락이 부족해 직접 확인이 필요함",
      }),
    );
  });

  it("rejects unknown categories", () => {
    const formData = new FormData();
    formData.set("rawCommentId", "11111111-1111-4111-8111-111111111111");
    formData.set("analysisId", "22222222-2222-4222-8222-222222222222");
    formData.set(
      "sourceImportJobId",
      "33333333-3333-4333-8333-333333333333",
    );
    formData.set("decision", "corrected");
    formData.set("correctedCategory", "made_up");
    formData.set("correctedOutcome", "caution");
    formData.set("correctedRecommendedAction", "review");

    expect(() => parseCreatorCorrectionForm(formData)).toThrow();
  });
});
