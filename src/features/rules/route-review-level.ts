import type { ReviewLevel, RuleSignal } from "./types";

const reviewRank: Record<ReviewLevel, number> = {
  safe: 0,
  caution: 1,
  risk: 2,
};

const actionableRuleKinds = new Set<RuleSignal["kind"]>([
  "blocked_phrase",
  "repetition",
  "suspicious_url",
  "phishing_pattern",
]);

export const getRuleReviewFloor = (
  signals: RuleSignal[],
): ReviewLevel => {
  if (signals.some((signal) => signal.kind === "phishing_pattern")) {
    return "risk";
  }

  return signals.some((signal) => actionableRuleKinds.has(signal.kind))
    ? "caution"
    : "safe";
};

export const applyReviewFloor = (
  modelLevel: ReviewLevel,
  signals: RuleSignal[],
): ReviewLevel => {
  const ruleFloor = getRuleReviewFloor(signals);
  return reviewRank[modelLevel] >= reviewRank[ruleFloor]
    ? modelLevel
    : ruleFloor;
};
