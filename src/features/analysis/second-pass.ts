import type { RuleEvaluation } from "@/features/rules/types";

import type { Stage1Output } from "./contracts";

export type SecondPassReason =
  | "review_level"
  | "low_confidence"
  | "rule_signal"
  | "creator_similarity"
  | "toxic_but_actionable"
  | "context_sensitive";

export const shouldRunSecondPass = ({
  bestSimilarity,
  contextSensitive,
  ruleSignals,
  stage1,
}: {
  stage1: Stage1Output;
  ruleSignals: RuleEvaluation["signals"];
  bestSimilarity: number | null;
  contextSensitive: boolean;
}) => {
  const reasons: SecondPassReason[] = [];

  if (stage1.reviewLevel === "caution" || stage1.reviewLevel === "risk") {
    reasons.push("review_level");
  }
  if (stage1.confidence < 0.85) {
    reasons.push("low_confidence");
  }
  if (ruleSignals.length > 0) {
    reasons.push("rule_signal");
  }
  if (bestSimilarity !== null && bestSimilarity >= 0.78) {
    reasons.push("creator_similarity");
  }
  if (stage1.category === "toxic_but_actionable") {
    reasons.push("toxic_but_actionable");
  }
  if (contextSensitive) {
    reasons.push("context_sensitive");
  }

  return {
    run: reasons.length > 0,
    reasons,
  };
};

const contextSensitivePattern =
  /(비꼬|반어|진짜\s+잘도|참\s+잘|ㅋ{2,}|\^\^|눈치|우리끼리)/iu;

export const detectContextSensitivePattern = ({
  sourceText,
  threadContext,
}: {
  sourceText: string;
  threadContext: string[];
}) =>
  threadContext.length > 0 ||
  contextSensitivePattern.test(sourceText.normalize("NFKC"));
