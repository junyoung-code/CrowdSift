import type { AnalysisProvider } from "@/features/analysis/analysis-provider";
import type {
  Stage1Input,
  Stage2Input,
} from "@/features/analysis/contracts";
import { Stage2OutputSchema } from "@/features/analysis/schemas";

import {
  EvaluationCaseSchema,
  type EvaluationCase,
  type EvaluationCohort,
  type EvaluationDatasetDraft,
} from "./schema";

export type EvaluationSafetyEvidence = {
  rawSourceMutated: boolean;
  crossWorkspaceLeak: boolean;
  unconfirmedModerationCalls: number;
  schemaFailuresAfterRetry: number;
};

export type EvaluationOutputRecord = {
  caseId: string;
  output: unknown;
  safetyEvidence: EvaluationSafetyEvidence;
};

export type EvaluationCaseResult = {
  caseId: string;
  schemaValid: boolean;
  categoryAllowed: boolean;
  forbiddenReviewLevelUsed: boolean;
  actionableFeedbackMatched: boolean;
  sanitizedFeedbackMatched: boolean;
  passed: boolean;
};

export type EvaluationReport = {
  totalCases: number;
  passed: boolean;
  categoryMismatches: number;
  forbiddenReviewLevelViolations: number;
  actionableFeedbackMismatches: number;
  sanitizedFeedbackRuleViolations: number;
  rawSourceMutations: number;
  crossWorkspaceLeaks: number;
  unconfirmedModerationCalls: number;
  fabricatedFeedbackOnPureAbuse: number;
  clearlyRiskyMarkedSafe: number;
  schemaFailuresAfterRetry: number;
  caseResults: EvaluationCaseResult[];
};

export const EXPECTED_EVALUATION_DISTRIBUTION: Record<
  EvaluationCohort,
  number
> = {
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
};

export type EvaluationDatasetValidation = {
  totalCases: number;
  distribution: Record<EvaluationCohort, number>;
  duplicateCaseIds: string[];
  recordedOutputMismatches: string[];
  pendingHumanReviewIds: string[];
  releaseReady: boolean;
};

export type EvaluationRunResult = {
  mode: "recorded" | "live";
  promptVersion: string;
  modelIdentifiers: string[];
  validation: EvaluationDatasetValidation;
  evaluationReport: EvaluationReport;
  releasePassed: boolean;
};

type EvaluationProvider = Pick<
  AnalysisProvider,
  "classifyStage1" | "classifyStage2"
>;

const defaultSafetyEvidence: EvaluationSafetyEvidence = {
  rawSourceMutated: false,
  crossWorkspaceLeak: false,
  unconfirmedModerationCalls: 0,
  schemaFailuresAfterRetry: 0,
};

const sanitizedFeedbackMatches = (
  rule: EvaluationCase["expectedSanitizedFeedback"],
  value: string | null,
) => {
  if (rule === "required") {
    return value !== null;
  }

  if (rule === "forbidden") {
    return value === null;
  }

  return true;
};

export const evaluateCases = (
  cases: EvaluationCase[],
  outputs: EvaluationOutputRecord[],
): EvaluationReport => {
  const outputByCaseId = new Map(
    outputs.map((output) => [output.caseId, output]),
  );

  let categoryMismatches = 0;
  let forbiddenReviewLevelViolations = 0;
  let actionableFeedbackMismatches = 0;
  let sanitizedFeedbackRuleViolations = 0;
  let rawSourceMutations = 0;
  let crossWorkspaceLeaks = 0;
  let unconfirmedModerationCalls = 0;
  let fabricatedFeedbackOnPureAbuse = 0;
  let clearlyRiskyMarkedSafe = 0;
  let schemaFailuresAfterRetry = 0;

  const caseResults = cases.map<EvaluationCaseResult>((evaluationCase) => {
    const record = outputByCaseId.get(evaluationCase.id);
    const evidence = record?.safetyEvidence ?? defaultSafetyEvidence;

    rawSourceMutations += Number(evidence.rawSourceMutated);
    crossWorkspaceLeaks += Number(evidence.crossWorkspaceLeak);
    unconfirmedModerationCalls += evidence.unconfirmedModerationCalls;
    schemaFailuresAfterRetry += evidence.schemaFailuresAfterRetry;

    const parsedOutput = Stage2OutputSchema.safeParse(record?.output);

    if (!parsedOutput.success) {
      schemaFailuresAfterRetry += 1;
      return {
        caseId: evaluationCase.id,
        schemaValid: false,
        categoryAllowed: false,
        forbiddenReviewLevelUsed: false,
        actionableFeedbackMatched: false,
        sanitizedFeedbackMatched: false,
        passed: false,
      };
    }

    const output = parsedOutput.data;
    const categoryAllowed = evaluationCase.expectedCategories.includes(
      output.category,
    );
    const forbiddenReviewLevelUsed =
      evaluationCase.forbiddenReviewLevels.includes(output.reviewLevel);
    const actionableFeedbackMatched =
      evaluationCase.expectActionableFeedback === output.actionableFeedback;
    const sanitizedFeedbackMatched = sanitizedFeedbackMatches(
      evaluationCase.expectedSanitizedFeedback,
      output.sanitizedFeedback,
    );
    const isPureAbuse =
      evaluationCase.expectedCategories.length === 1 &&
      evaluationCase.expectedCategories[0] === "abusive_no_signal";
    const fabricatedPureAbuseFeedback =
      isPureAbuse && output.sanitizedFeedback !== null;
    const riskyMarkedSafe =
      output.reviewLevel === "safe" &&
      evaluationCase.forbiddenReviewLevels.includes("safe");

    categoryMismatches += Number(!categoryAllowed);
    forbiddenReviewLevelViolations += Number(forbiddenReviewLevelUsed);
    actionableFeedbackMismatches += Number(!actionableFeedbackMatched);
    sanitizedFeedbackRuleViolations += Number(!sanitizedFeedbackMatched);
    fabricatedFeedbackOnPureAbuse += Number(fabricatedPureAbuseFeedback);
    clearlyRiskyMarkedSafe += Number(riskyMarkedSafe);

    const passed =
      categoryAllowed &&
      !forbiddenReviewLevelUsed &&
      actionableFeedbackMatched &&
      sanitizedFeedbackMatched &&
      !fabricatedPureAbuseFeedback &&
      !riskyMarkedSafe &&
      !evidence.rawSourceMutated &&
      !evidence.crossWorkspaceLeak &&
      evidence.unconfirmedModerationCalls === 0 &&
      evidence.schemaFailuresAfterRetry === 0;

    return {
      caseId: evaluationCase.id,
      schemaValid: true,
      categoryAllowed,
      forbiddenReviewLevelUsed,
      actionableFeedbackMatched,
      sanitizedFeedbackMatched,
      passed,
    };
  });

  const report: EvaluationReport = {
    totalCases: cases.length,
    passed: false,
    categoryMismatches,
    forbiddenReviewLevelViolations,
    actionableFeedbackMismatches,
    sanitizedFeedbackRuleViolations,
    rawSourceMutations,
    crossWorkspaceLeaks,
    unconfirmedModerationCalls,
    fabricatedFeedbackOnPureAbuse,
    clearlyRiskyMarkedSafe,
    schemaFailuresAfterRetry,
    caseResults,
  };

  report.passed =
    caseResults.every((result) => result.passed) &&
    report.rawSourceMutations === 0 &&
    report.crossWorkspaceLeaks === 0 &&
    report.unconfirmedModerationCalls === 0 &&
    report.fabricatedFeedbackOnPureAbuse === 0 &&
    report.clearlyRiskyMarkedSafe === 0 &&
    report.schemaFailuresAfterRetry === 0;

  return report;
};

export const validateEvaluationDatasetDraft = (
  dataset: EvaluationDatasetDraft,
): EvaluationDatasetValidation => {
  const distribution = Object.fromEntries(
    Object.keys(EXPECTED_EVALUATION_DISTRIBUTION).map((cohort) => [cohort, 0]),
  ) as Record<EvaluationCohort, number>;
  const caseIds: string[] = [];
  const pendingHumanReviewIds: string[] = [];

  for (const group of dataset.groups) {
    distribution[group.cohort] += group.cases.length;
    for (const evaluationCase of group.cases) {
      caseIds.push(evaluationCase.id);
      if (!EvaluationCaseSchema.safeParse(evaluationCase).success) {
        pendingHumanReviewIds.push(evaluationCase.id);
      }
    }
  }

  const seenCaseIds = new Set<string>();
  const duplicateCaseIds = caseIds.filter((caseId) => {
    if (seenCaseIds.has(caseId)) {
      return true;
    }
    seenCaseIds.add(caseId);
    return false;
  });
  const outputIds = dataset.recordedOutputs.map((record) => record.caseId);
  const caseIdSet = new Set(caseIds);
  const outputIdSet = new Set(outputIds);
  const recordedOutputMismatches = [
    ...caseIds.filter((caseId) => !outputIdSet.has(caseId)),
    ...outputIds.filter((caseId) => !caseIdSet.has(caseId)),
  ];
  const distributionMatches = Object.entries(
    EXPECTED_EVALUATION_DISTRIBUTION,
  ).every(
    ([cohort, expectedCount]) =>
      distribution[cohort as EvaluationCohort] === expectedCount,
  );

  return {
    totalCases: caseIds.length,
    distribution,
    duplicateCaseIds,
    recordedOutputMismatches,
    pendingHumanReviewIds,
    releaseReady:
      caseIds.length === 60 &&
      distributionMatches &&
      duplicateCaseIds.length === 0 &&
      recordedOutputMismatches.length === 0 &&
      pendingHumanReviewIds.length === 0,
  };
};

const createEvaluationStageOneInput = (
  evaluationCase: EvaluationCase,
): Stage1Input => ({
  rawCommentId: evaluationCase.id,
  sourceText: evaluationCase.text,
  videoTitle: evaluationCase.context,
  threadContext: [],
  ruleEvaluation: {
    normalizedText: evaluationCase.text.normalize("NFKC").toLowerCase(),
    signals: [],
    initialReviewLevel: "safe",
    engineVersion: "evaluation-rules-v1",
  },
  creatorPolicy: {
    version: 1,
    sensitivity: "standard",
    preferredActions: {
      caution: "review",
      risk: "hold_for_review",
    },
    harmfulTextHidden: true,
    phraseRules: [],
  },
});

const createEvaluationStageTwoInput = (
  stageOneInput: Stage1Input,
  stage1: Awaited<ReturnType<EvaluationProvider["classifyStage1"]>>["output"],
): Stage2Input => ({
  ...stageOneInput,
  stage1,
  retrievedFeedback: [],
  triggerReasons: ["evaluation"],
});

export const runEvaluationDataset = async ({
  dataset,
  mode,
  provider,
}: {
  dataset: EvaluationDatasetDraft;
  mode: "recorded" | "live";
  provider?: EvaluationProvider;
}): Promise<EvaluationRunResult> => {
  const validation = validateEvaluationDatasetDraft(dataset);
  const cases = dataset.groups.flatMap(
    (group) => group.cases,
  ) as EvaluationCase[];
  let outputs: EvaluationOutputRecord[];
  let modelIdentifiers: string[];

  if (mode === "recorded") {
    outputs = dataset.recordedOutputs;
    modelIdentifiers = ["recorded-fixture"];
  } else {
    if (!provider) {
      throw new Error("Live evaluation requires an analysis provider");
    }

    const collectedModelIdentifiers: string[] = [];
    outputs = [];

    for (const evaluationCase of cases) {
      const stageOneInput = createEvaluationStageOneInput(evaluationCase);
      const stageOneResult = await provider.classifyStage1(stageOneInput);
      const stageTwoResult = await provider.classifyStage2(
        createEvaluationStageTwoInput(stageOneInput, stageOneResult.output),
      );

      collectedModelIdentifiers.push(
        stageOneResult.modelIdentifier,
        stageTwoResult.modelIdentifier,
      );
      outputs.push({
        caseId: evaluationCase.id,
        output: stageTwoResult.output,
        safetyEvidence: { ...defaultSafetyEvidence },
      });
    }

    modelIdentifiers = [...new Set(collectedModelIdentifiers)];
  }

  const evaluationReport = evaluateCases(cases, outputs);

  return {
    mode,
    promptVersion: dataset.promptVersion,
    modelIdentifiers,
    validation,
    evaluationReport,
    releasePassed: validation.releaseReady && evaluationReport.passed,
  };
};
