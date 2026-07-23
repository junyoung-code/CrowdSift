import type { ReviewLevel, RuleSignal } from "./types";

const reviewRank: Record<ReviewLevel, number> = {
  safe: 0,
  caution: 1,
  risk: 2,
};

const getRuleFloor = (signals: RuleSignal[]): ReviewLevel => {
  if (
    signals.some(
      (signal) =>
        signal.kind === "phishing_pattern" || signal.severity === 3,
    )
  ) {
    return "risk";
  }

  return signals.length > 0 ? "caution" : "safe";
};

export const applyReviewFloor = (
  modelLevel: ReviewLevel,
  signals: RuleSignal[],
): ReviewLevel => {
  const ruleFloor = getRuleFloor(signals);
  return reviewRank[modelLevel] >= reviewRank[ruleFloor]
    ? modelLevel
    : ruleFloor;
};
