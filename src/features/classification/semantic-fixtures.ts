import type { SemanticAnalysis, SemanticProviders } from "./semantic-contracts";

/** Deterministic TEST FIXTURE only; never a production classification fallback. */
export function fixtureSemanticAnalysis(source: string): SemanticAnalysis {
  const analysis: SemanticAnalysis = { meaningClear: true, uninterpretableReason: null, coreMeaning: "TEST FIXTURE 댓글 분석", target: "content", feedbackClaims: [], harms: [], remainingFeedbackClaimIds: [], confidence: 1, uncertainties: [] };
  if (/숨소리씹는랑비슷/.test(source)) { analysis.meaningClear = false; analysis.uninterpretableReason = "TEST FIXTURE: 문장의 의미를 복원할 수 없음"; }
  const claimPatterns: [RegExp, string][] = [
    [/자막[^.!?\n]*/, "자막에 대한 불편을 전달한다."], [/소리[^.!?\n]*/, "소리에 대한 개선을 요청한다."],
    [/옛날 모습이 그립네요/, "예전 모습을 더 선호한다."], [/이번 영상은 전보다 재미없어요/, "이번 영상이 이전보다 재미없다는 의견이다."],
  ];
  for (const [pattern, content] of claimPatterns) {
    const match = source.match(pattern)?.[0];
    if (match) { const id = `claim-${analysis.feedbackClaims.length + 1}`; analysis.feedbackClaims.push({ id, content, kind: "preference", evidence: [match] }); analysis.remainingFeedbackClaimIds.push(id); }
  }
  const harm = source.match(/찾아가서[^.!?\n]*|죽어|멍청[^.!?\n]*|돈을 벌면 사람들은 변하나봐요|굴정액|source harmful text/);
  if (harm) {
    const threat = /찾아가서|죽어/.test(harm[0]);
    analysis.harms.push({ id: "harm-1", type: threat ? "threat" : /돈을/.test(harm[0]) ? "motive_speculation" : /굴정액/.test(harm[0]) ? "sexual_degradation" : "personal_attack", target: /악플러/.test(source) ? "other_commenter" : "creator", content: "TEST FIXTURE 공격 신호", severity: threat ? "critical" : "medium", criticalHarm: threat, evidence: [harm[0]], expression: /무시하세요/.test(source) ? "rejected" : "asserted" });
  }
  return analysis;
}
export function createFixtureSemanticProviders(): SemanticProviders {
  const run = { model: "fixture-semantic-v1", responseId: "fixture", latencyMs: 0, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 } };
  return {
    analyzer: { async analyze(context) { return { result: fixtureSemanticAnalysis(context.sourceText), run }; } },
    rewriter: { async rewrite({ claims }) { return { result: { text: claims.map(c => c.content).join(" "), preservedClaimIds: claims.map(c => c.id) }, run }; } },
    validator: { async validate() { return { result: { harmRemoved: true, claimsPreserved: true, intensityPreserved: true, nothingAdded: true, issues: [] }, run }; } },
  };
}
