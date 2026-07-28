import { getRuleReviewFloor } from "@/features/rules/route-review-level";
import type { RuleEvaluation } from "@/features/rules/types";

import type { ReviewLevel, Stage1Output } from "./contracts";
import {
  shouldRunSecondPass,
  type SecondPassReason,
} from "./second-pass";

const reviewRank: Record<ReviewLevel, number> = {
  safe: 0,
  caution: 1,
  risk: 2,
};

const maxReviewLevel = (
  left: ReviewLevel,
  right: ReviewLevel,
): ReviewLevel =>
  reviewRank[left] >= reviewRank[right] ? left : right;

const getCategoryFloor = (
  category: Stage1Output["category"],
): ReviewLevel => {
  if (
    category === "phishing" ||
    category === "threat_or_serious_risk"
  ) {
    return "risk";
  }

  if (
    category !== "positive" &&
    category !== "neutral" &&
    category !== "question"
  ) {
    return "caution";
  }

  return "safe";
};

export const enforceReviewLevelFloor = (
  modelLevel: ReviewLevel,
  minimumReviewLevel: ReviewLevel,
): ReviewLevel => maxReviewLevel(modelLevel, minimumReviewLevel);

export const routeStageOne = ({
  contextSensitive,
  ruleSignals,
  stageOne,
}: {
  stageOne: Stage1Output;
  ruleSignals: RuleEvaluation["signals"];
  contextSensitive: boolean;
}): {
  minimumReviewLevel: ReviewLevel;
  finalReviewLevel: ReviewLevel;
  runSecondPass: boolean;
  reasons: SecondPassReason[];
} => {
  let minimumReviewLevel = maxReviewLevel(
    getCategoryFloor(stageOne.category),
    getRuleReviewFloor(ruleSignals),
  );

  if (
    stageOne.confidence < 0.85 ||
    stageOne.needsSecondPass ||
    contextSensitive
  ) {
    minimumReviewLevel = maxReviewLevel(
      minimumReviewLevel,
      "caution",
    );
  }

  const secondPass = shouldRunSecondPass({
    stage1: stageOne,
    ruleSignals,
    bestSimilarity: null,
    contextSensitive,
  });

  return {
    minimumReviewLevel,
    finalReviewLevel: enforceReviewLevelFloor(
      stageOne.reviewLevel,
      minimumReviewLevel,
    ),
    runSecondPass: secondPass.run,
    reasons: secondPass.reasons,
  };
};
