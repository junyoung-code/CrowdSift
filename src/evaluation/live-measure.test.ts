/**
 * Live end-to-end measurement of the REAL analysis pipeline against the 60 Korean cases.
 * Guarded by LIVE_EVAL=1 so it never runs in the normal suite (it makes real OpenAI calls).
 *
 *   LIVE_EVAL=1 npx vitest run src/evaluation/live-measure.test.ts
 *
 * Mirrors analysis-service.ts: rules -> stage1 -> routing floor -> conditional stage2 (no RAG).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, it } from "vitest";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import { evaluateComment } from "@/features/rules/evaluate-comment";
import { detectContextSensitivePattern } from "@/features/analysis/second-pass";
import {
  enforceReviewLevelFloor,
  routeStageOne,
} from "@/features/analysis/stage-one-routing";
import {
  STAGE_1_SYSTEM_PROMPT,
  STAGE_2_SYSTEM_PROMPT,
} from "@/features/analysis/prompts";
import { Stage1OutputSchema, Stage2OutputSchema } from "@/features/analysis/schemas";
import type { Stage1Output, Stage2Output } from "@/features/analysis/contracts";

import datasetJson from "./korean-comment-cases.json";

type Case = {
  id: string;
  text: string;
  context: string;
  expectedCategories: string[];
  forbiddenReviewLevels: string[];
  expectActionableFeedback: boolean;
  expectedSanitizedFeedback: "required" | "forbidden" | "optional";
};
type Dataset = { groups: { cohort: string; cases: Case[] }[] };

const loadEnv = () => {
  for (const raw of readFileSync(resolve(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
  }
};

const sanitizedOk = (rule: Case["expectedSanitizedFeedback"], v: string | null) =>
  rule === "required" ? v !== null : rule === "forbidden" ? v === null : true;

describe.skipIf(!process.env.LIVE_EVAL)("LIVE pipeline measurement", () => {
  it(
    "runs the real pipeline over all 60 cases",
    async () => {
      loadEnv();
      const stage1Model = process.env.OPENAI_STAGE1_MODEL!;
      const stage2Model = process.env.OPENAI_STAGE2_MODEL!;
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const callStage1 = async (input: unknown): Promise<Stage1Output> => {
        const res = await client.responses.parse({
          model: stage1Model,
          input: [
            { role: "system", content: STAGE_1_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(input) },
          ],
          text: { format: zodTextFormat(Stage1OutputSchema, "comment_stage_1") },
        });
        return Stage1OutputSchema.parse(res.output_parsed);
      };
      const callStage2 = async (input: unknown): Promise<Stage2Output> => {
        const res = await client.responses.parse({
          model: stage2Model,
          input: [
            { role: "system", content: STAGE_2_SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(input) },
          ],
          text: { format: zodTextFormat(Stage2OutputSchema, "comment_stage_2") },
        });
        return Stage2OutputSchema.parse(res.output_parsed);
      };

      const policy = {
        version: 1,
        sensitivity: "standard" as const,
        preferredActions: { caution: "review" as const, risk: "hold_for_review" as const },
        harmfulTextHidden: true,
        phraseRules: [],
      };

      const dataset = datasetJson as Dataset;
      type Row = {
        id: string; cohort: string; text: string; expected: string[];
        finalCategory: string; finalReviewLevel: string; ranSecondPass: boolean;
        actionable: boolean; sanitized: string | null;
        categoryOk: boolean; reviewLevelOk: boolean; actionableOk: boolean; sanitizedOk: boolean;
        pass: boolean; s1conf: number; s1cat: string;
      };
      const rows: Row[] = [];

      for (const group of dataset.groups) {
        for (const c of group.cases) {
          const ruleEval = evaluateComment({ text: c.text, phraseRules: [], engineVersion: "rules-v1" });
          const stage1Input = {
            rawCommentId: c.id, sourceText: c.text, videoTitle: c.context,
            threadContext: [] as string[], ruleEvaluation: ruleEval, creatorPolicy: policy,
          };
          let stage1: Stage1Output;
          try {
            stage1 = await callStage1(stage1Input);
          } catch (e) {
            console.error(`STAGE1 FAIL ${c.id}: ${(e as Error).message}`);
            continue;
          }
          const contextSensitive = detectContextSensitivePattern({ sourceText: c.text });
          const route = routeStageOne({ stageOne: stage1, ruleSignals: ruleEval.signals, contextSensitive });

          let finalCategory = stage1.category as string;
          let finalReviewLevel = route.finalReviewLevel as string;
          let actionable = stage1.actionableFeedback;
          let sanitized: string | null = null;
          let ranSecondPass = false;

          if (route.runSecondPass) {
            ranSecondPass = true;
            try {
              const s2 = await callStage2({ ...stage1Input, stage1, retrievedFeedback: [], triggerReasons: route.reasons });
              finalCategory = s2.category;
              finalReviewLevel = enforceReviewLevelFloor(s2.reviewLevel, route.minimumReviewLevel);
              actionable = s2.actionableFeedback;
              sanitized = s2.category === "abusive_no_signal" ? null : s2.sanitizedFeedback;
            } catch (e) {
              console.error(`STAGE2 FAIL ${c.id}: ${(e as Error).message}`);
            }
          }

          const categoryOk = c.expectedCategories.includes(finalCategory);
          const reviewLevelOk = !c.forbiddenReviewLevels.includes(finalReviewLevel);
          const actionableOk = actionable === c.expectActionableFeedback;
          const sOk = sanitizedOk(c.expectedSanitizedFeedback, sanitized);
          rows.push({
            id: c.id, cohort: group.cohort, text: c.text, expected: c.expectedCategories,
            finalCategory, finalReviewLevel, ranSecondPass, actionable, sanitized,
            categoryOk, reviewLevelOk, actionableOk, sanitizedOk: sOk,
            pass: categoryOk && reviewLevelOk && actionableOk && sOk,
            s1conf: stage1.confidence, s1cat: stage1.category,
          });
          process.stdout.write(rows[rows.length - 1].pass ? "." : "X");
        }
      }
      console.log("\n");

      const byCohort = new Map<string, Row[]>();
      for (const r of rows) (byCohort.get(r.cohort) ?? byCohort.set(r.cohort, []).get(r.cohort)!).push(r);

      console.log("=== 코호트별 정확도 ===");
      let totalPass = 0;
      for (const [cohort, rs] of byCohort) {
        const p = rs.filter((r) => r.pass).length;
        totalPass += p;
        const catP = rs.filter((r) => r.categoryOk).length;
        const rlP = rs.filter((r) => r.reviewLevelOk).length;
        const acP = rs.filter((r) => r.actionableOk).length;
        console.log(`${cohort.padEnd(26)} pass ${p}/${rs.length}  (cat ${catP}/${rs.length}, review ${rlP}/${rs.length}, action ${acP}/${rs.length})`);
      }
      console.log(`\n총 통과: ${totalPass}/${rows.length} (${((totalPass / rows.length) * 100).toFixed(1)}%)`);

      const riskyMarkedSafe = rows.filter((r) => r.finalReviewLevel === "safe" && !r.reviewLevelOk);
      console.log(`\n[안전 치명] 위험 댓글을 safe로 통과: ${riskyMarkedSafe.length}건`);
      for (const r of riskyMarkedSafe) console.log(`   - ${r.id} [${r.cohort}] "${r.text}" -> ${r.finalCategory}`);

      console.log("\n=== 실패 케이스 상세 ===");
      for (const r of rows.filter((r) => !r.pass)) {
        const flags = [
          !r.categoryOk ? `category[exp:${r.expected.join("|")} got:${r.finalCategory}]` : "",
          !r.reviewLevelOk ? `reviewLevel[got:${r.finalReviewLevel}]` : "",
          !r.actionableOk ? `actionable[got:${r.actionable}]` : "",
          !r.sanitizedOk ? `sanitized[got:${r.sanitized === null ? "null" : "present"}]` : "",
        ].filter(Boolean).join(" ");
        console.log(`${r.id} [${r.cohort}] "${r.text}"`);
        console.log(`   -> ${flags} | s1cat=${r.s1cat} s1conf=${r.s1conf} s2ran=${r.ranSecondPass}`);
      }
    },
    600_000,
  );
});
