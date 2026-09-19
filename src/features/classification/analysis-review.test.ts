import { describe, expect, it } from "vitest";
import { ClassificationSchemaError } from "./luna-first-pass";
import { reviewForAnalysisError } from "./analysis-review";

describe("invalid AI results go to human review", () => {
  it.each(["luna", "terra"])("keeps %s validation errors ungraded with the source hidden", stage => {
    const review = reviewForAnalysisError(new ClassificationSchemaError("Invalid classification evidence", { cause: new Error("classification_evidence_not_in_source") }), stage);
    expect(review).toMatchObject({ verdict: { status: "review_queue", level: null, basis: "classification_evidence_not_in_source", hideSource: true, allowRewrite: false, recommendedActions: [] }, feedbackCore: null });
  });
  it("defers missing or unparsable model output", () => {
    expect(reviewForAnalysisError(new ClassificationSchemaError("Luna returned no parsed output"), "luna")?.verdict.status).toBe("review_queue");
    expect(reviewForAnalysisError(new SyntaxError("unexpected JSON"), "terra")?.verdict.status).toBe("review_queue");
  });
  it.each([{ status: 429 }, { name: "APIConnectionTimeoutError" }, { code: "23505" }, new Error("unknown failure")])("leaves infrastructure failures retryable/failed", error => {
    expect(reviewForAnalysisError(error, "luna")).toBeNull();
  });
  it("never treats DB or stored-state validation as an AI judgement", () => {
    expect(reviewForAnalysisError(new ClassificationSchemaError("Invalid classification evidence"), "save_verdict")).toBeNull();
  });
});
