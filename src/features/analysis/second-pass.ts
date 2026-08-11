import type { RuleEvaluation } from "@/features/rules/types";

import type { Stage1Output } from "./contracts";

export type SecondPassReason =
  | "review_level"
  | "low_confidence"
  | "model_requested"
  | "uncertain"
  | "rule_signal"
  | "creator_similarity"
  | "toxic_but_actionable"
  | "sensitive_category"
  | "context_sensitive";

const secondPassRuleKinds = new Set<
  RuleEvaluation["signals"][number]["kind"]
>([
  "blocked_phrase",
  "repetition",
  "suspicious_url",
  "phishing_pattern",
  "abuse_lexicon",
  "spam_lexicon",
]);

const directSafeCategories = new Set<Stage1Output["category"]>([
  "positive",
  "neutral",
  "question",
]);

// Rule signals that argue for a different label than "abuse with no useful signal":
// a credential lure or a link points at phishing or spam, so the second pass still runs.
const abuseLabelContradictions = new Set<
  RuleEvaluation["signals"][number]["kind"]
>(["phishing_pattern", "suspicious_url"]);

// The second pass exists to produce sanitizedFeedback and normalizedQuestion, and
// STAGE_2_SYSTEM_PROMPT forbids sanitizedFeedback for abuse that carries no useful
// request — so a confidently labelled abusive_no_signal has nothing to gain from it.
// getCategoryFloor() already holds this category at caution or above, so skipping the
// pass cannot lower the review level.
const isSettledAbuse = ({
  ruleSignals,
  stage1,
}: {
  stage1: Stage1Output;
  ruleSignals: RuleEvaluation["signals"];
}) =>
  stage1.category === "abusive_no_signal" &&
  stage1.confidence >= 0.85 &&
  !stage1.needsSecondPass &&
  !ruleSignals.some((signal) =>
    abuseLabelContradictions.has(signal.kind),
  );

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

  if (isSettledAbuse({ stage1, ruleSignals })) {
    return { run: false, reasons };
  }

  if (stage1.reviewLevel === "caution" || stage1.reviewLevel === "risk") {
    reasons.push("review_level");
  }
  if (stage1.confidence < 0.85) {
    reasons.push("low_confidence");
  }
  if (stage1.needsSecondPass) {
    reasons.push("model_requested");
  }
  if (stage1.category === "uncertain") {
    reasons.push("uncertain");
  }
  if (
    ruleSignals.some((signal) =>
      secondPassRuleKinds.has(signal.kind),
    )
  ) {
    reasons.push("rule_signal");
  }
  if (bestSimilarity !== null && bestSimilarity >= 0.78) {
    reasons.push("creator_similarity");
  }
  if (stage1.category === "toxic_but_actionable") {
    reasons.push("toxic_but_actionable");
  } else if (!directSafeCategories.has(stage1.category)) {
    reasons.push("sensitive_category");
  }
  if (contextSensitive) {
    reasons.push("context_sensitive");
  }

  return {
    run: reasons.length > 0,
    reasons,
  };
};

// Laughter such as ㅋㅋ is deliberately NOT a trigger: it occurs in both friendly
// and mocking comments, so a deterministic rule cannot tell them apart — that call
// belongs to the model. (It was also silently dead here anyway, because
// normalize("NFKC") rewrites the compatibility jamo ㅋ U+314B to the conjoining
// form U+110F, which the literal ㅋ in the pattern never matched.)
const contextSensitivePattern =
  /(비꼬|반어|진짜\s+잘도|참\s+잘|\^\^|눈치|우리끼리)/iu;

// Thread context is already part of the stage 1 input, so a reply existing is not by
// itself a reason to distrust the stage 1 answer — the model read the thread and still
// reached its verdict. What does warrant the deeper pass is wording whose literal
// reading is likely to mislead, which the pattern above looks for.
export const detectContextSensitivePattern = ({
  sourceText,
}: {
  sourceText: string;
}) => contextSensitivePattern.test(sourceText.normalize("NFKC"));
