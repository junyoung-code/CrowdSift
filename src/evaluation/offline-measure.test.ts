/**
 * OFFLINE measurement of the DETERMINISTIC safety net (no API key needed).
 * For each of the 60 Korean cases it computes what the non-LLM layer does on its own:
 *   - rule-engine signals + review floor
 *   - context-sensitive (sarcasm/irony) detection
 *   - whether a second pass is GUARANTEED regardless of the model's answer
 * Goal: find which cohorts have a deterministic backstop vs. rely 100% on the LLM.
 *
 *   OFFLINE_EVAL=1 npx vitest run src/evaluation/offline-measure.test.ts
 */
import { describe, it } from "vitest";

import { evaluateComment } from "@/features/rules/evaluate-comment";
import { getRuleReviewFloor } from "@/features/rules/route-review-level";
import { detectContextSensitivePattern } from "@/features/analysis/second-pass";
import { normalizeForMatching } from "@/features/rules/normalize-korean";

import datasetJson from "./korean-comment-cases.json";

type Case = {
  id: string; text: string; context: string;
  expectedCategories: string[]; forbiddenReviewLevels: string[];
};
type Dataset = { groups: { cohort: string; cases: Case[] }[] };

// second-pass rule kinds that force deeper review independent of the model
// (must mirror secondPassRuleKinds in src/features/analysis/second-pass.ts)
const secondPassRuleKinds = new Set([
  "blocked_phrase", "repetition", "suspicious_url", "phishing_pattern",
  "abuse_lexicon", "spam_lexicon",
]);

// cohorts where a comment SHOULD end up caution/risk (safe is forbidden) -> harmful cohorts
const HARMFUL_COHORTS = new Set([
  "toxic_but_actionable", "pure_abuse", "sarcasm_indirect_attack",
  "spacing_repeated_variants", "ads_repetition_phishing", "harassment_threat",
]);

describe.skipIf(!process.env.OFFLINE_EVAL)("OFFLINE deterministic safety-net measurement", () => {
  it("measures deterministic backstop coverage over all 60 cases", () => {
    const dataset = datasetJson as Dataset;

    type Row = {
      id: string; cohort: string; text: string; harmful: boolean;
      signalKinds: string[]; ruleFloor: string; contextSensitive: boolean;
      guaranteedSecondPass: boolean; deterministicBackstop: boolean;
    };
    const rows: Row[] = [];

    for (const group of dataset.groups) {
      for (const c of group.cases) {
        const ruleEval = evaluateComment({ text: c.text, phraseRules: [], engineVersion: "rules-v1" });
        const signalKinds = ruleEval.signals.map((s) => s.kind);
        const ruleFloor = getRuleReviewFloor(ruleEval.signals);
        const contextSensitive = detectContextSensitivePattern({ sourceText: c.text });
        const hasSecondPassRule = ruleEval.signals.some((s) => secondPassRuleKinds.has(s.kind));
        const guaranteedSecondPass = contextSensitive || hasSecondPassRule;
        // does ANYTHING other than the model push this case above "safe" / into review?
        const deterministicBackstop = ruleFloor !== "safe" || contextSensitive;
        rows.push({
          id: c.id, cohort: group.cohort, text: c.text,
          harmful: HARMFUL_COHORTS.has(group.cohort),
          signalKinds, ruleFloor, contextSensitive,
          guaranteedSecondPass, deterministicBackstop,
        });
      }
    }

    // ---- report ----
    console.log("\n=== 코호트별 결정적 안전망 커버리지 ===");
    console.log("(backstop = 모델 답과 무관하게 rule/context가 safe 위로 끌어올림)\n");
    const byCohort = new Map<string, Row[]>();
    for (const r of rows) (byCohort.get(r.cohort) ?? byCohort.set(r.cohort, []).get(r.cohort)!).push(r);
    for (const [cohort, rs] of byCohort) {
      const bs = rs.filter((r) => r.deterministicBackstop).length;
      const gp = rs.filter((r) => r.guaranteedSecondPass).length;
      const mark = HARMFUL_COHORTS.has(cohort) ? "⚠️" : "  ";
      console.log(`${mark} ${cohort.padEnd(26)} backstop ${bs}/${rs.length}, 2차강제 ${gp}/${rs.length}`);
    }

    const harmful = rows.filter((r) => r.harmful);
    const harmfulNoBackstop = harmful.filter((r) => !r.deterministicBackstop);
    console.log(`\n=== 핵심 지표 ===`);
    console.log(`유해 코호트 총 ${harmful.length}건 중 결정적 backstop 있는 건: ${harmful.length - harmfulNoBackstop.length}`);
    console.log(`→ 100% LLM 의존(결정적 backstop 없음): ${harmfulNoBackstop.length}건 (${((harmfulNoBackstop.length / harmful.length) * 100).toFixed(0)}%)`);

    console.log(`\n=== 결정적 backstop이 전혀 없는 유해 케이스 (모델이 틀리면 그대로 통과) ===`);
    for (const r of harmfulNoBackstop) {
      console.log(`   ${r.id} [${r.cohort}] "${r.text}"`);
    }

    console.log(`\n=== 규칙 신호가 실제로 발생한 케이스 ===`);
    const withSignals = rows.filter((r) => r.signalKinds.length > 0);
    if (withSignals.length === 0) console.log("   (없음 — phraseRules 미설정 + URL 없음 상태에서 규칙 엔진이 아무 신호도 못 냄)");
    for (const r of withSignals) console.log(`   ${r.id} [${r.cohort}] signals=${r.signalKinds.join(",")} floor=${r.ruleFloor}`);

    console.log(`\n=== 비꼼(sarcasm) 코호트 문맥 감지 결과 ===`);
    for (const r of rows.filter((r) => r.cohort === "sarcasm_indirect_attack")) {
      console.log(`   ${r.id} contextSensitive=${r.contextSensitive} "${r.text}"`);
    }

    console.log(`\n=== 한국어 정규화 변형 확인 (spacing/repeated) ===`);
    for (const r of rows.filter((r) => r.cohort === "spacing_repeated_variants")) {
      console.log(`   ${r.id} "${r.text}"`);
      console.log(`      → normalized: ${normalizeForMatching(r.text)}`);
    }
  });
});
