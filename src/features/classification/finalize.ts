import type { BranchOutcome } from "./branch";
import type { FirstPassResult } from "./contracts";
import type { RecommendedAction, RiskLevel, TerraVerdict } from "./schemas";
import type { SpamFinding, SpamSignal } from "./spam-rules";
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
  /** 코드 규칙이 스팸으로 보아 등급을 올렸는지. */
  raisedBySpam: boolean;
  /** 무엇을 보고 스팸으로 보았는지. 비어 있으면 규칙이 걸리지 않은 것이다. */
  spamSignals: SpamSignal[];
};

const levelRank: Record<RiskLevel, number> = { safe: 0, caution: 1, danger: 2 };

/**
 * 스팸 규칙이 낸 최소 등급을 얹는다.
 *
 * 검토 대기는 건드리지 않는다. 마지막 판단자가 정하지 못했다는 뜻이고, 사람이 어차피
 * 본다. 거기에 등급을 얹으면 사람이 볼 이유가 사라진다.
 *
 * 올라간 댓글은 순화하지 않는다. 스팸을 다듬어 크리에이터에게 전할 이유가 없다.
 */
const raiseForSpam = (
  verdict: FinalClassificationVerdict,
  spam: SpamFinding,
): FinalClassificationVerdict => {
  if (verdict.status !== "decided" || !verdict.level) {
    return { ...verdict, spamSignals: spam.signals };
  }
  if (levelRank[verdict.level] >= levelRank[spam.level]) {
    return { ...verdict, spamSignals: spam.signals };
  }

  return {
    ...verdict,
    level: spam.level,
    allowRewrite: false,
    hideSource: spam.level !== "safe",
    raisedBySpam: true,
    spamSignals: spam.signals,
  };
};

export const finalizeClassification = ({
  branch,
  firstPass,
  spam = null,
  terra,
}: {
  firstPass: FirstPassResult;
  branch: BranchOutcome;
  terra: TerraVerdict | null;
  /** 코드 규칙이 본 스팸 신호. 등급 기준은 크리에이터를 향한 공격만 다루므로,
   *  아무도 공격하지 않는 스팸은 여기서만 걸린다. */
  spam?: SpamFinding | null;
}): FinalClassificationVerdict => {
  const base: FinalClassificationVerdict =
    branch.kind === "instant_safe"
      ? {
          status: "decided",
          level: "safe",
          basis: "instant_safe",
          agreedWithFirstPass: null,
          allowRewrite: false,
          hideSource: false,
          recommendedActions: ["show_source"],
          safetyCase: false,
          raisedByModeration: false,
          raisedBySpam: false,
          spamSignals: [],
        }
      : (() => {
          if (!terra) {
            throw new Error("terra_result_required");
          }
          return {
            ...decideVerdict({
              candidateLevel: firstPass.luna.result.candidateLevel,
              terra,
              moderationMinimumLevel: branch.protection.moderationMinimumLevel,
            }),
            raisedBySpam: false,
            spamSignals: [] as SpamSignal[],
          };
        })();

  return spam ? raiseForSpam(base, spam) : base;
};
