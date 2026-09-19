import { describe, expect, it } from "vitest";
import { validateSemanticAnalysis, type SemanticAnalysis } from "./semantic-contracts";
import { classifySemanticAnalysis } from "./semantic-policy";

// Authored analyses exercise policy behavior, not a claim that a model understands these texts.
const source = "자막이 너무 영포티같아요. 자막이 작아서 읽기 어려워요.";
function analysis(): SemanticAnalysis {
  return { meaningClear: true, uninterpretableReason: null, coreMeaning: "자막을 통한 제작자 나이 조롱과 가독성 불만", target: "content", confidence: .5, uncertainties: [],
    feedbackClaims: [{ id: "readability", kind: "experience", content: "자막이 작아서 읽기 어렵다", evidence: ["자막이 작아서 읽기 어려워요"] }],
    remainingFeedbackClaimIds: ["readability"],
    harms: [{ id: "age", type: "mockery", target: "creator", content: "자막을 통해 제작자의 나이를 조롱한다", severity: "medium", criticalHarm: false, evidence: ["자막이 너무 영포티같아요"], expression: "asserted" }],
  };
}
describe("context boundary policy contracts", () => {
  it("separates the surface topic from the actual harm target and uses surviving claims", () => {
    const a = validateSemanticAnalysis(analysis(), source);
    expect(a.target).toBe("content");
    expect(a.harms[0].target).toBe("creator");
    expect(classifySemanticAnalysis(a)).toMatchObject({ level: "caution", remainingFeedbackClaimIds: ["readability"] });
    a.feedbackClaims = []; a.remainingFeedbackClaimIds = [];
    expect(classifySemanticAnalysis(a).level).toBe("risk");
  });
  it("keeps rough content harm out of the creator grade while protecting the source", () => {
    const a = analysis(); a.harms[0].type = "insult"; a.harms[0].target = "content";
    expect(classifySemanticAnalysis(a)).toMatchObject({ level: "safe", hideSource: true, otherTargetHarm: true });
    a.harms = [];
    expect(classifySemanticAnalysis(a).level).toBe("safe");
  });
  it("protects other-commenter attacks without raising the creator grade", () => {
    const a = analysis(); a.harms[0].target = "other_commenter";
    expect(classifySemanticAnalysis(a)).toMatchObject({ level: "safe", hideSource: true, otherTargetHarm: true });
    a.harms.push({ ...a.harms[0], id: "creator", target: "creator" });
    expect(classifySemanticAnalysis(a).level).toBe("caution");
  });
  it("does not turn rejected slang into an attack, but includes actual endorsement", () => {
    const a = analysis(); a.harms[0].expression = "rejected";
    expect(classifySemanticAnalysis(a).level).toBe("safe");
    a.harms[0].expression = "endorsed";
    expect(classifySemanticAnalysis(a).level).toBe("caution");
  });
  it("does not use extracted but excluded appearance claims as remaining value", () => {
    const a = analysis(); a.harms[0].type = "appearance_attack";
    a.remainingFeedbackClaimIds = [];
    expect(classifySemanticAnalysis(a)).toMatchObject({ level: "risk", remainingValueAfterHarmRemoval: false, allowRewrite: false });
  });
});
