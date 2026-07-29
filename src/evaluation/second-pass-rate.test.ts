/**
 * Measures how many comments trigger the EXPENSIVE second pass, and which condition
 * in shouldRunSecondPass() is responsible for it. Costs nothing to run: it reuses the
 * recorded model answers instead of calling OpenAI.
 *
 *   SECOND_PASS_RATE=1 npx vitest run src/evaluation/second-pass-rate.test.ts
 *
 * Caveat: recordedOutputs are Stage2Output records and carry no needsSecondPass flag,
 * so the "model_requested" trigger is treated as false here. The real second-pass rate
 * can therefore only be HIGHER than what this reports, never lower.
 */
import { describe, it } from "vitest";

import { evaluateComment } from "@/features/rules/evaluate-comment";
import {
  detectContextSensitivePattern,
  shouldRunSecondPass,
  type SecondPassReason,
} from "@/features/analysis/second-pass";
import { routeStageOne } from "@/features/analysis/stage-one-routing";
import { DEFAULT_PRICING } from "@/features/analysis/cost-estimator";
import type { Stage1Output } from "@/features/analysis/contracts";

import datasetJson from "./korean-comment-cases.json";

type Case = {
  id: string;
  text: string;
  context: string;
  forbiddenReviewLevels: string[];
  expectedSanitizedFeedback: "required" | "forbidden" | "optional";
};
type RecordedOutput = {
  caseId: string;
  output: {
    category: Stage1Output["category"];
    confidence: number;
    reviewLevel: Stage1Output["reviewLevel"];
  };
};
type Dataset = {
  groups: { cohort: string; cases: Case[] }[];
  recordedOutputs: RecordedOutput[];
};

// Token assumptions mirror DEFAULT_ESTIMATE_ASSUMPTIONS in cost-estimator.ts.
const TOKENS = {
  stage1In: { low: 220, high: 500 },
  stage1Out: { low: 50, high: 120 },
  stage2In: { low: 420, high: 900 },
  stage2Out: { low: 90, high: 220 },
  embedIn: { low: 40, high: 160 },
} as const;

const costFor = (commentCount: number, secondPassShare: number) => {
  const perMillion = (tokens: number, price: number) =>
    (tokens / 1_000_000) * price;
  const secondPassCount = Math.ceil(commentCount * secondPassShare);
  const at = (band: "low" | "high") =>
    perMillion(
      commentCount * TOKENS.stage1In[band],
      DEFAULT_PRICING.stageOne.inputPerMillion,
    ) +
    perMillion(
      commentCount * TOKENS.stage1Out[band],
      DEFAULT_PRICING.stageOne.outputPerMillion,
    ) +
    perMillion(
      secondPassCount * TOKENS.stage2In[band],
      DEFAULT_PRICING.stageTwo.inputPerMillion,
    ) +
    perMillion(
      secondPassCount * TOKENS.stage2Out[band],
      DEFAULT_PRICING.stageTwo.outputPerMillion,
    ) +
    perMillion(
      secondPassCount * TOKENS.embedIn[band],
      DEFAULT_PRICING.embedding.inputPerMillion,
    );
  return { low: at("low"), high: at("high") };
};

const usd = (value: number) => `$${value.toFixed(2)}`;
const krw = (value: number) =>
  `약 ${Math.round((value * 1400) / 100) * 100}원`;

describe.skipIf(!process.env.SECOND_PASS_RATE)(
  "second pass rate measurement",
  () => {
    it("measures the second-pass trigger rate and its cost impact", () => {
      const dataset = datasetJson as unknown as Dataset;
      const recordedById = new Map(
        dataset.recordedOutputs.map((record) => [record.caseId, record.output]),
      );

      type Row = {
        id: string;
        cohort: string;
        text: string;
        reasons: SecondPassReason[];
        reasonsWithReplies: SecondPassReason[];
        finalReviewLevel: string;
        reviewLevelSafe: boolean;
        sanitizedLost: boolean;
      };
      const rows: Row[] = [];

      for (const group of dataset.groups) {
        for (const evaluationCase of group.cases) {
          const recorded = recordedById.get(evaluationCase.id);
          if (!recorded) continue;

          const ruleEvaluation = evaluateComment({
            text: evaluationCase.text,
            phraseRules: [],
            engineVersion: "rules-v1",
          });
          // recordedOutputs omit needsSecondPass, so assume the model did not ask.
          const stage1 = {
            ...recorded,
            needsSecondPass: false,
          } as Stage1Output;

          const evaluate = (threadContext: string[]) =>
            shouldRunSecondPass({
              stage1,
              ruleSignals: ruleEvaluation.signals,
              bestSimilarity: null,
              contextSensitive: detectContextSensitivePattern({
                sourceText: evaluationCase.text,
                threadContext,
              }),
            }).reasons;

          const reasons = evaluate([]);
          // Review level the pipeline lands on, whether or not stage 2 runs: the floor
          // from rules + category is applied to the model answer either way.
          const route = routeStageOne({
            stageOne: stage1,
            ruleSignals: ruleEvaluation.signals,
            contextSensitive: detectContextSensitivePattern({
              sourceText: evaluationCase.text,
              threadContext: [],
            }),
          });

          rows.push({
            id: evaluationCase.id,
            cohort: group.cohort,
            text: evaluationCase.text,
            reasons,
            reasonsWithReplies: evaluate(["대댓글 1개"]),
            finalReviewLevel: route.finalReviewLevel,
            reviewLevelSafe: !evaluationCase.forbiddenReviewLevels.includes(
              route.finalReviewLevel,
            ),
            // sanitizedFeedback only ever comes out of stage 2, so skipping it on a case
            // that requires the sanitized text means the feature is silently lost.
            sanitizedLost:
              evaluationCase.expectedSanitizedFeedback === "required" &&
              reasons.length === 0,
          });
        }
      }

      const total = rows.length;
      const triggered = rows.filter((row) => row.reasons.length > 0);
      const share = triggered.length / total;

      console.log(`\n${"=".repeat(64)}`);
      console.log("2차 분석(Stage 2) 실행 비율 측정");
      console.log("=".repeat(64));
      console.log(
        `\n전체 ${total}건 중 2차 실행: ${triggered.length}건 (${(share * 100).toFixed(1)}%)`,
      );
      console.log(
        `1차만으로 끝난 건: ${total - triggered.length}건 (${(((total - triggered.length) / total) * 100).toFixed(1)}%)`,
      );

      // ---- which condition fires how often ----
      console.log("\n=== 트리거별 발동 횟수 (중복 포함) ===");
      const reasonCounts = new Map<SecondPassReason, number>();
      for (const row of rows) {
        for (const reason of row.reasons) {
          reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
        }
      }
      for (const [reason, count] of [...reasonCounts.entries()].sort(
        (left, right) => right[1] - left[1],
      )) {
        const bar = "█".repeat(Math.round((count / total) * 40));
        console.log(
          `  ${reason.padEnd(22)} ${String(count).padStart(3)}건 ${bar}`,
        );
      }

      // ---- which condition is load-bearing (sole reason) ----
      console.log("\n=== 이 트리거가 '유일한' 이유인 건 (=끄면 1차로 끝남) ===");
      const soleCounts = new Map<SecondPassReason, number>();
      for (const row of rows) {
        if (row.reasons.length === 1) {
          const reason = row.reasons[0];
          soleCounts.set(reason, (soleCounts.get(reason) ?? 0) + 1);
        }
      }
      if (soleCounts.size === 0) {
        console.log("  (없음 — 모든 2차 실행 건이 두 개 이상의 이유로 걸림)");
      }
      for (const [reason, count] of [...soleCounts.entries()].sort(
        (left, right) => right[1] - left[1],
      )) {
        console.log(
          `  ${reason.padEnd(22)} ${String(count).padStart(3)}건 → 제거 시 비율 ${(((triggered.length - count) / total) * 100).toFixed(1)}%로 하락`,
        );
      }

      // ---- cohort breakdown ----
      console.log("\n=== 코호트별 2차 실행 비율 ===");
      const byCohort = new Map<string, Row[]>();
      for (const row of rows) {
        const bucket = byCohort.get(row.cohort);
        if (bucket) bucket.push(row);
        else byCohort.set(row.cohort, [row]);
      }
      for (const [cohort, cohortRows] of byCohort) {
        const hit = cohortRows.filter((row) => row.reasons.length > 0).length;
        const pct = ((hit / cohortRows.length) * 100).toFixed(0);
        console.log(
          `  ${cohort.padEnd(26)} ${hit}/${cohortRows.length} (${pct}%)`,
        );
      }

      // ---- the threadContext lever ----
      const withReplies = rows.filter(
        (row) => row.reasonsWithReplies.length > 0,
      ).length;
      console.log("\n=== 대댓글이 달린 경우 (threadContext 있음) ===");
      console.log(
        `  2차 실행: ${withReplies}/${total} (${((withReplies / total) * 100).toFixed(1)}%)`,
      );
      const flipped = rows.filter(
        (row) => row.reasons.length === 0 && row.reasonsWithReplies.length > 0,
      );
      console.log(
        `  → 대댓글 때문에 추가로 2차를 타게 된 건: ${flipped.length}건`,
      );
      for (const row of flipped.slice(0, 5)) {
        console.log(`      ${row.id} "${row.text.slice(0, 30)}..."`);
      }

      // ---- simulation only: not applied to production code ----
      // If thread presence stopped forcing the second pass (stage 1 already receives
      // threadContext in its input), how many of the flipped cases would stay 1-pass?
      const sarcasmOnly = rows.filter(
        (row) =>
          row.reasonsWithReplies.filter(
            (reason) => reason !== "context_sensitive",
          ).length > 0,
      ).length;
      console.log(
        `  [시뮬레이션] 대댓글만으로는 2차를 강제하지 않을 경우: ${sarcasmOnly}/${total} (${((sarcasmOnly / total) * 100).toFixed(1)}%)`,
      );

      // ---- safety: skipping stage 2 must not weaken the outcome ----
      console.log("\n=== 🔒 안전성 검증 ===");
      const levelViolations = rows.filter((row) => !row.reviewLevelSafe);
      console.log(
        `  금지된 등급으로 떨어진 건: ${levelViolations.length}건 ${levelViolations.length === 0 ? "✅" : "❌"}`,
      );
      for (const row of levelViolations) {
        console.log(
          `      ❌ ${row.id} [${row.cohort}] → ${row.finalReviewLevel} "${row.text.slice(0, 30)}"`,
        );
      }
      const sanitizedLosses = rows.filter((row) => row.sanitizedLost);
      console.log(
        `  정제 피드백이 필요한데 2차를 안 타는 건: ${sanitizedLosses.length}건 ${sanitizedLosses.length === 0 ? "✅" : "❌"}`,
      );
      for (const row of sanitizedLosses) {
        console.log(
          `      ❌ ${row.id} [${row.cohort}] "${row.text.slice(0, 30)}"`,
        );
      }

      // ---- cost projection ----
      console.log("\n=== 댓글 10,000개 기준 예상 비용 ===");
      const scenarios: Array<[string, number]> = [
        ["측정된 현재 비율", share],
        ["전부 대댓글 있는 경우", withReplies / total],
        ["참고: 추정 최저(15%)", 0.15],
        ["참고: 추정 최고(50%)", 0.5],
      ];
      for (const [label, scenarioShare] of scenarios) {
        const cost = costFor(10_000, scenarioShare);
        console.log(
          `  ${label.padEnd(24)} 2차 ${(scenarioShare * 100).toFixed(0).padStart(3)}%  ${usd(cost.low)}~${usd(cost.high)}  (${krw(cost.low)}~${krw(cost.high)})`,
        );
      }
      console.log("");
    });
  },
);
