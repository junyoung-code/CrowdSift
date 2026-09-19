import { activeHarms, remainingClaims, type SemanticAnalysis } from "./semantic-contracts";
import { detectSpam } from "./spam-rules";

export type SemanticLevel = "safe" | "caution" | "risk" | "hold";
export type SemanticVerdict = {
  level: SemanticLevel; basis: string; hideSource: boolean; allowRewrite: boolean;
  remainingValueAfterHarmRemoval: boolean; remainingFeedbackClaimIds: string[];
  criticalHarm: boolean; harmSeverity: "none" | "low" | "medium" | "high" | "critical";
  otherTargetHarm: boolean; spamSignals: string[];
};
const nonCreatorTargets = new Set(["content", "other_commenter", "third_party", "self", "general"]);
const severities = ["none", "low", "medium", "high", "critical"] as const;

/** Severity and confidence never participate in the classification decision. */
export function classifySemanticAnalysis(analysis: SemanticAnalysis, source = ""): SemanticVerdict {
  const harms = activeHarms(analysis);
  const creatorHarms = harms.filter(h => h.target === "creator");
  const unclearTargetHarms = harms.filter(h => h.target === "unknown");
  const claims = remainingClaims(analysis);
  const level: SemanticLevel = !analysis.meaningClear
    ? "hold"
    : creatorHarms.length > 0
      ? claims.length > 0 ? "caution" : "risk"
      : unclearTargetHarms.length > 0
        ? "hold"
        : "safe";
  const basis = !analysis.meaningClear
    ? "semantic_meaning_unrecoverable"
    : level === "hold"
      ? "semantic_harm_target_unclear"
      : { safe: "semantic_no_creator_harm", caution: "semantic_feedback_survives", risk: "semantic_harm_without_feedback" }[level];
  return {
    level,
    basis,
    hideSource: level !== "safe" || harms.length > 0,
    allowRewrite: level === "caution",
    remainingValueAfterHarmRemoval: claims.length > 0,
    remainingFeedbackClaimIds: claims.map(c => c.id),
    criticalHarm: harms.some(h => h.criticalHarm),
    harmSeverity: severities[Math.max(0, ...harms.map(h => severities.indexOf(h.severity)))],
    otherTargetHarm: harms.some(h => nonCreatorTargets.has(h.target)),
    spamSignals: detectSpam(source)?.signals ?? [],
  };
}
export const ClassificationPolicy = { classify: classifySemanticAnalysis };
