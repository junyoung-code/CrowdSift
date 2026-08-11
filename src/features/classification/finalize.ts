import type { BranchOutcome } from "./branch";
import type { FirstPassResult } from "./contracts";
import type { RecommendedAction, RiskLevel, TerraVerdict } from "./schemas";
import { decideVerdict, type VerdictBasis } from "./verdict";

export type FinalClassificationVerdict = {
  status: "decided" | "review_queue";
  level: RiskLevel | null;
  basis: VerdictBasis | "instant_safe";
  agreedWithFirstPass: boolean | null;
  allowRewrite: boolean;
  hideSource: boolean;
  recommendedActions: RecommendedAction[];
  safetyCase: boolean;
  raisedByModeration: boolean;
};

export const finalizeClassification = ({
  branch,
  firstPass,
  terra,
}: {
  firstPass: FirstPassResult;
  branch: BranchOutcome;
  terra: TerraVerdict | null;
}): FinalClassificationVerdict => {
  if (branch.kind === "instant_safe") {
    return {
      status: "decided",
      level: "safe",
      basis: "instant_safe",
      agreedWithFirstPass: null,
      allowRewrite: false,
      hideSource: false,
      recommendedActions: ["show_source"],
      safetyCase: false,
      raisedByModeration: false,
    };
  }

  if (!terra) {
    throw new Error("terra_result_required");
  }

  return decideVerdict({
    candidateLevel: firstPass.luna.result.candidateLevel,
    terra,
    moderationMinimumLevel: branch.protection.moderationMinimumLevel,
  });
};
