import { describe, expect, it } from "vitest";
import { decideVerdict } from "./verdict";
import { StoredTerraVerdictSchema, TerraVerdictApiSchema, type TerraVerdict } from "./schemas";
import { validateAssessment } from "./assessment";

const verifier: TerraVerdict = {
  verdictLevel: "safe", certainty: "clear", intent: "praise", target: "creator_person",
  ambiguityReasons: [], reasonCodes: [], hardRiskFlags: [], softRiskFlags: [],
  feedbackType: "none", feedbackActionable: false, feedbackCore: null,
  recommendedActions: ["show_source"], safetyCase: false,
  assessment: { excerpt: "결혼 축하드려요", explanation: "결혼을 축하하며 비하나 지시가 없다.", contextResolution: "resolved", missingContext: null },
};
const decide = (terra = verifier, strong = false) => decideVerdict({
  candidate: { level: "danger", hardRiskFlags: strong ? ["threat"] : ["personal_attack"], softRiskFlags: [], ambiguityReasons: ["missing_context"] },
  terra, moderationMinimumLevel: null,
});

describe("evidence-based second pass", () => {
  it("resolves a first-pass personal attack false positive", () => {
    expect(decide()).toMatchObject({ status: "decided", level: "safe", hideSource: false });
  });
  it("resolves stale slang ambiguity when both models consider praise safe", () => {
    expect(decideVerdict({ candidate: { level: "safe", hardRiskFlags: [], softRiskFlags: [], ambiguityReasons: ["unclear_slang_polarity"] }, terra: verifier, moderationMinimumLevel: null })).toMatchObject({ level: "safe", status: "decided" });
  });
  it("accepts a resolved rude remark as caution despite a danger candidate", () => {
    expect(decide({ ...verifier, verdictLevel: "caution", intent: "criticism", certainty: "borderline", softRiskFlags: ["mockery"], assessment: { ...verifier.assessment!, excerpt: "영감탱이", explanation: "낮춰 부르는 거친 표현이다." } })).toMatchObject({ level: "caution", status: "decided" });
  });
  it("does not dismiss a disputed explicit threat from the first pass", () => {
    expect(decide(verifier, true).status).toBe("review_queue");
  });
  it("keeps material unresolved context for human review", () => {
    expect(decide({ ...verifier, certainty: "unclear", ambiguityReasons: ["missing_context"], assessment: { ...verifier.assessment!, contextResolution: "missing", missingContext: "인정이라는 답글이 동조하는 부모 댓글이 없어 공격 동조인지 일상 공감인지 가를 수 없다." } }).status).toBe("review_queue");
  });
  it("does not apply the legacy empty-reaction exception to explicit missing evidence", () => {
    expect(decideVerdict({
      candidate: { level: "safe", hardRiskFlags: [], softRiskFlags: [], intent: "neutral", target: "none" },
      terra: { ...verifier, intent: "neutral", target: "none", certainty: "unclear", ambiguityReasons: ["missing_context"], assessment: { ...verifier.assessment!, contextResolution: "missing", missingContext: "동조 대상인 부모 댓글이 필요하다." } },
      moderationMinimumLevel: null,
    }).status).toBe("review_queue");
  });
  it("still protects a confirmed threat and moderation floor", () => {
    expect(decide({ ...verifier, verdictLevel: "danger", hardRiskFlags: ["threat"] }).level).toBe("danger");
    expect(decideVerdict({ candidate: { level: "safe", hardRiskFlags: [], softRiskFlags: [] }, terra: verifier, moderationMinimumLevel: "danger" })).toMatchObject({ level: "danger", raisedByModeration: true });
  });
  it("preserves legacy recordings, requiring evidence only for new API outputs", () => {
    const legacy = { ...verifier };
    delete legacy.assessment;
    expect(StoredTerraVerdictSchema.safeParse(legacy).success).toBe(true);
    expect(TerraVerdictApiSchema.safeParse(legacy).success).toBe(false);
    expect(decide(legacy).status).toBe("review_queue");
  });
  it("rejects invented quotes and unexplained missing context", () => {
    expect(() => validateAssessment(verifier, "결혼 축하드려요~!")).not.toThrow();
    expect(() => validateAssessment(verifier, "다른 댓글")).toThrow("not_in_source");
    expect(() => validateAssessment({ ...verifier, assessment: { ...verifier.assessment!, contextResolution: "missing" } }, "결혼 축하드려요")).toThrow("unspecified");
  });
});
