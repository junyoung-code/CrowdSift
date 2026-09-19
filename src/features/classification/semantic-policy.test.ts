import { describe, expect, it } from "vitest";
import { validateSemanticAnalysis, type SemanticAnalysis } from "./semantic-contracts";
import { classifySemanticAnalysis } from "./semantic-policy";
import { fixtureSemanticAnalysis } from "./semantic-fixtures";

describe("semantic policy", () => {
  it.each([
    ["오늘도 잘 봤어요", "safe"], ["이번 영상은 전보다 재미없어요", "safe"],
    ["자막이 작아요", "safe"], ["미친ㅋㅋ 진짜 개웃기네", "safe"],
    ["옛날 모습이 그립네요. 돈을 벌면 사람들은 변하나봐요", "caution"],
    ["자막이 작다. 찾아가서 때리겠다", "caution"], ["찾아가서 때리겠다", "risk"],
    ["크림 아니고 굴정액", "risk"], ["악플러 너는 멍청하다", "safe"],
    ["죽어 라는 댓글은 무시하세요", "safe"], ["숨소리씹는랑비슷", "hold"],
    ["무료 이벤트 bit.ly/example", "safe"],
  ])("%s → %s", (source, expected) => {
    const analysis = validateSemanticAnalysis(fixtureSemanticAnalysis(source), source);
    expect(classifySemanticAnalysis(analysis, source).level).toBe(expected);
  });
  it("protects SAFE sources with third-party harm and separates critical severity", () => {
    expect(classifySemanticAnalysis(fixtureSemanticAnalysis("악플러 너는 멍청하다"))).toMatchObject({ level: "safe", hideSource: true, otherTargetHarm: true });
    const source = "자막이 작다. 찾아가서 때리겠다";
    expect(classifySemanticAnalysis(fixtureSemanticAnalysis(source))).toMatchObject({ level: "caution", criticalHarm: true, harmSeverity: "critical", remainingValueAfterHarmRemoval: true });
  });
  it("never uses confidence/severity to upgrade or HOLD", () => {
    const analysis = fixtureSemanticAnalysis("자막이 작다. 찾아가서 때리겠다");
    for (const confidence of [0, 0.62, 1]) for (const severity of ["low", "medium", "high", "critical"] as const) {
      analysis.confidence = confidence; analysis.harms[0].severity = severity;
      expect(classifySemanticAnalysis(analysis).level).toBe("caution");
    }
  });
  it("excludes quoted/rejected harms and holds active unknown-target harms", () => {
    const analysis = fixtureSemanticAnalysis("찾아가서 때리겠다");
    analysis.harms[0].target = "unknown";
    for (const expression of ["asserted", "endorsed", "quoted", "rejected"] as const) {
      analysis.harms[0].expression = expression;
      const verdict = classifySemanticAnalysis(analysis);
      expect(verdict.level).toBe(["quoted", "rejected"].includes(expression) ? "safe" : "hold");
      if (!["quoted", "rejected"].includes(expression)) expect(verdict.basis).toBe("semantic_harm_target_unclear");
    }
  });
  it("applies every meaning / target / remaining claim combination in priority order", () => {
    for (const meaningClear of [true, false]) for (const hasClaim of [true, false]) for (const target of ["creator", "content", "other_commenter", "third_party", "self", "unknown", "general"] as const) {
      const analysis = fixtureSemanticAnalysis("자막이 작다. 찾아가서 때리겠다");
      analysis.meaningClear = meaningClear;
      analysis.harms[0].target = target;
      if (!hasClaim) analysis.remainingFeedbackClaimIds = [];
      const expected = !meaningClear ? "hold" : target === "creator" ? hasClaim ? "caution" : "risk" : target === "unknown" ? "hold" : "safe";
      expect(classifySemanticAnalysis(analysis).level).toBe(expected);
    }
  });
  it("keeps a creator-supporting comment safe when its mockery targets other people", () => {
    const source = "사람들 피곤하네 사네… 할일이 얼마나 없으면 ㅎㅎ 언니 이뻐여";
    const analysis: SemanticAnalysis = {
      meaningClear: true,
      uninterpretableReason: null,
      coreMeaning: "다른 사람들을 비꼬면서 크리에이터를 칭찬한다.",
      target: "general",
      feedbackClaims: [],
      harms: [{ id: "h1", type: "mockery", target: "general", content: "다른 사람들을 비꼰다.", severity: "low", criticalHarm: false, evidence: ["할일이 얼마나 없으면 ㅎㅎ"], expression: "asserted" }],
      remainingFeedbackClaimIds: [],
      confidence: 0.91,
      uncertainties: [],
    };
    const verdict = classifySemanticAnalysis(validateSemanticAnalysis(analysis, source));
    expect(verdict).toMatchObject({ level: "safe", basis: "semantic_no_creator_harm", hideSource: true, otherTargetHarm: true });
  });
  it("preserves creator harm when a comment also attacks another person", () => {
    const analysis = fixtureSemanticAnalysis("자막이 작다. 찾아가서 때리겠다");
    analysis.harms.push({ ...analysis.harms[0], id: "other", target: "other_commenter" });
    expect(classifySemanticAnalysis(analysis)).toMatchObject({level:"caution",otherTargetHarm:true});
  });
  it("uses actual surviving claims, not model booleans", () => {
    const analysis = fixtureSemanticAnalysis("자막이 작다. 찾아가서 때리겠다");
    analysis.remainingFeedbackClaimIds = [];
    expect(classifySemanticAnalysis(analysis).level).toBe("risk");
  });
  it.each([
    (a: SemanticAnalysis) => { a.remainingFeedbackClaimIds = ["invented"]; },
    (a: SemanticAnalysis) => { a.feedbackClaims[0].evidence = ["not in source"]; },
    (a: SemanticAnalysis) => { a.feedbackClaims.push(a.feedbackClaims[0]); },
    (a: SemanticAnalysis) => { a.uninterpretableReason = "borderline"; },
  ])("rejects invalid evidence as an error, not HOLD", mutate => {
    const source = "자막이 작다"; const analysis = fixtureSemanticAnalysis(source); mutate(analysis);
    expect(() => validateSemanticAnalysis(analysis, source)).toThrow();
  });
});
