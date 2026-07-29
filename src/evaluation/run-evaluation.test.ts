import { describe, expect, it, vi } from "vitest";

import type { Stage2Output } from "@/features/analysis/contracts";

import datasetJson from "./korean-comment-cases.json";
import {
  EvaluationCaseSchema,
  EvaluationDatasetDraftSchema,
} from "./schema";
import {
  evaluateCases,
  runEvaluationDataset,
  validateEvaluationDatasetDraft,
  type EvaluationOutputRecord,
} from "./run-evaluation";

const reviewedCase = EvaluationCaseSchema.parse({
  id: "ko-001",
  text: "영상 잘 봤어요.",
  context: "일반적인 영상 감상 댓글",
  expectedCategories: ["positive"],
  forbiddenReviewLevels: ["caution", "risk"],
  expectActionableFeedback: false,
  expectedSanitizedFeedback: "forbidden",
  reviewedBy: "korean-reviewer",
  reviewedAt: "2026-07-24T00:00:00.000Z",
});

const validStage2Output = {
  category: "positive",
  confidence: 0.98,
  reviewLevel: "safe",
  toxicity: 0,
  spam: 0,
  phishing: 0,
  actionableFeedback: false,
  recommendedAction: "none",
  explanation: "긍정적인 감상입니다.",
  sanitizedFeedback: null,
  normalizedQuestion: null,
  manualReview: false,
  evidenceReview: false,
} satisfies Stage2Output;

const validOutput: EvaluationOutputRecord = {
  caseId: "ko-001",
  output: validStage2Output,
  safetyEvidence: {
    rawSourceMutated: false,
    crossWorkspaceLeak: false,
    unconfirmedModerationCalls: 0,
    schemaFailuresAfterRetry: 0,
  },
};

describe("EvaluationCaseSchema", () => {
  it("rejects a case that has not been reviewed by a Korean speaker", () => {
    expect(() =>
      EvaluationCaseSchema.parse({
        ...reviewedCase,
        reviewedBy: "",
        reviewedAt: "",
      }),
    ).toThrow();
  });
});

describe("evaluateCases", () => {
  it("passes a schema-valid output that satisfies every release gate", () => {
    const report = evaluateCases([reviewedCase], [validOutput]);

    expect(report.totalCases).toBe(1);
    expect(report.passed).toBe(true);
    expect(report.rawSourceMutations).toBe(0);
    expect(report.crossWorkspaceLeaks).toBe(0);
    expect(report.unconfirmedModerationCalls).toBe(0);
    expect(report.fabricatedFeedbackOnPureAbuse).toBe(0);
    expect(report.clearlyRiskyMarkedSafe).toBe(0);
    expect(report.schemaFailuresAfterRetry).toBe(0);
    expect(report.caseResults).toEqual([
      expect.objectContaining({
        caseId: "ko-001",
        categoryAllowed: true,
        forbiddenReviewLevelUsed: false,
        actionableFeedbackMatched: true,
        sanitizedFeedbackMatched: true,
        passed: true,
      }),
    ]);
  });

  it("counts system-safety evidence as zero-tolerance failures", () => {
    const report = evaluateCases(
      [reviewedCase],
      [
        {
          ...validOutput,
          safetyEvidence: {
            rawSourceMutated: true,
            crossWorkspaceLeak: true,
            unconfirmedModerationCalls: 2,
            schemaFailuresAfterRetry: 0,
          },
        },
      ],
    );

    expect(report.passed).toBe(false);
    expect(report.rawSourceMutations).toBe(1);
    expect(report.crossWorkspaceLeaks).toBe(1);
    expect(report.unconfirmedModerationCalls).toBe(2);
  });

  it("rejects fabricated useful feedback for pure abuse", () => {
    const abusiveCase = EvaluationCaseSchema.parse({
      ...reviewedCase,
      id: "ko-002",
      text: "합성된 순수 모욕 댓글",
      expectedCategories: ["abusive_no_signal"],
      forbiddenReviewLevels: ["safe"],
      expectedSanitizedFeedback: "forbidden",
    });
    const report = evaluateCases(
      [abusiveCase],
      [
        {
          ...validOutput,
          caseId: "ko-002",
          output: {
            ...validStage2Output,
            category: "abusive_no_signal",
            reviewLevel: "risk",
            sanitizedFeedback: "영상 구성을 개선해 달라는 의견",
          },
        },
      ],
    );

    expect(report.passed).toBe(false);
    expect(report.fabricatedFeedbackOnPureAbuse).toBe(1);
    expect(report.caseResults[0]).toEqual(
      expect.objectContaining({
        sanitizedFeedbackMatched: false,
        passed: false,
      }),
    );
  });

  it("rejects a clearly risky case that the model marks safe", () => {
    const riskyCase = EvaluationCaseSchema.parse({
      ...reviewedCase,
      id: "ko-003",
      text: "합성된 위협 댓글",
      expectedCategories: ["threat_or_serious_risk"],
      forbiddenReviewLevels: ["safe"],
    });
    const report = evaluateCases(
      [riskyCase],
      [
        {
          ...validOutput,
          caseId: "ko-003",
          output: {
            ...validStage2Output,
            category: "threat_or_serious_risk",
            reviewLevel: "safe",
          },
        },
      ],
    );

    expect(report.passed).toBe(false);
    expect(report.clearlyRiskyMarkedSafe).toBe(1);
  });

  it("counts an invalid final structured output as a schema failure", () => {
    const report = evaluateCases(
      [reviewedCase],
      [
        {
          ...validOutput,
          output: {
            category: "made-up-category",
          },
        },
      ],
    );

    expect(report.passed).toBe(false);
    expect(report.schemaFailuresAfterRetry).toBe(1);
    expect(report.caseResults[0]).toEqual(
      expect.objectContaining({
        schemaValid: false,
        passed: false,
      }),
    );
  });
});

describe("Korean evaluation dataset", () => {
  it("contains exactly 60 synthetic cases in the approved distribution", () => {
    const dataset = EvaluationDatasetDraftSchema.parse(datasetJson);
    const validation = validateEvaluationDatasetDraft(dataset);

    expect(validation.totalCases).toBe(60);
    expect(validation.duplicateCaseIds).toEqual([]);
    expect(validation.recordedOutputMismatches).toEqual([]);
    expect(validation.distribution).toEqual({
      positive_neutral: 8,
      question: 6,
      constructive_feedback: 8,
      toxic_but_actionable: 8,
      pure_abuse: 8,
      sarcasm_indirect_attack: 6,
      friendly_slang_context: 4,
      spacing_repeated_variants: 4,
      ads_repetition_phishing: 5,
      harassment_threat: 3,
    });
  });

  it("keeps unreviewed fixtures blocked from the release gate", () => {
    const dataset = EvaluationDatasetDraftSchema.parse(datasetJson);
    const validation = validateEvaluationDatasetDraft(dataset);

    expect(validation.pendingHumanReviewIds).toHaveLength(60);
    expect(validation.releaseReady).toBe(false);
  });

  it("evaluates deterministic recorded outputs without calling a provider", async () => {
    const dataset = EvaluationDatasetDraftSchema.parse(datasetJson);

    const result = await runEvaluationDataset({
      dataset,
      mode: "recorded",
    });

    expect(result.mode).toBe("recorded");
    expect(result.evaluationReport.passed).toBe(true);
    expect(result.validation.pendingHumanReviewIds).toHaveLength(60);
    expect(result.releasePassed).toBe(false);
    expect(result.promptVersion).toBe("crowdsift-stage2-v2");
    expect(result.modelIdentifiers).toEqual(["recorded-fixture"]);
  });

  it("runs live evaluation through stage one and stage two without a RAG repository", async () => {
    const fullDataset = EvaluationDatasetDraftSchema.parse(datasetJson);
    const firstGroup = fullDataset.groups[0];
    const firstCase = firstGroup?.cases[0];

    if (!firstGroup || !firstCase) {
      throw new Error("Expected at least one evaluation case");
    }

    const dataset = EvaluationDatasetDraftSchema.parse({
      ...fullDataset,
      groups: [{ ...firstGroup, cases: [firstCase] }],
      recordedOutputs: [fullDataset.recordedOutputs[0]],
    });
    const classifyStage1 = vi.fn().mockResolvedValue({
      output: {
        category: "positive",
        confidence: 0.98,
        reviewLevel: "safe",
        toxicity: 0,
        spam: 0,
        phishing: 0,
        actionableFeedback: false,
        needsSecondPass: true,
        secondPassReasons: ["evaluation"],
        recommendedAction: "none",
        explanation: "긍정적인 감상",
      },
      provider: "openai",
      modelIdentifier: "live-stage-one-model",
      providerResponseId: "stage-one-response",
      latencyMs: 10,
      usage: {},
    });
    const classifyStage2 = vi.fn().mockResolvedValue({
      output: validStage2Output,
      provider: "openai",
      modelIdentifier: "live-stage-two-model",
      providerResponseId: "stage-two-response",
      latencyMs: 12,
      usage: {},
    });

    const result = await runEvaluationDataset({
      dataset,
      mode: "live",
      provider: { classifyStage1, classifyStage2 },
    });

    expect(classifyStage1).toHaveBeenCalledOnce();
    expect(classifyStage2).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceText: firstCase.text,
        retrievedFeedback: [],
      }),
    );
    expect(result.evaluationReport.passed).toBe(true);
    expect(result.modelIdentifiers).toEqual([
      "live-stage-one-model",
      "live-stage-two-model",
    ]);
  });
});
