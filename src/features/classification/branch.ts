import type { FirstPassResult } from "./contracts";
import {
  CERTAINTY_ALLOWING_INSTANT_PASS,
  treatmentForCategory,
  type ModerationTreatment,
} from "./policy";
import type { Certainty, RiskLevel } from "./schemas";

/**
 * 2. 우선 분기.
 *
 * 모델을 부르지 않는다. 1단계가 남긴 두 답을 규칙으로 조합해, 여기서 끝낼지
 * Terra 로 보낼지만 정한다. 끝나는 경우는 안전 하나뿐이다.
 */

export type BranchReason =
  /** Luna 가 주의로 봤다. */
  | "luna_caution"
  /** Luna 가 위험으로 봤다. */
  | "luna_danger"
  /** Luna 가 안전이라 했지만 스스로 확신하지 못했다. */
  | "luna_uncertain"
  /** 무료 필터가 무언가를 걸었다. */
  | "moderation_flagged"
  /** 무료 필터를 부르지 못했다. 걸린 게 없는 것과 다르다. */
  | "moderation_unavailable"
  /** 안전 후보인데 위험 신호가 함께 왔다. 앞뒤가 맞지 않는다. */
  | "risk_flag_on_safe_candidate"
  /** 크리에이터의 위치나 일정을 안다고 내비쳤다. */
  | "location_or_schedule_mention"
  /** 채널이 민감하다고 등록한 주제를 건드렸다. */
  | "sensitive_topic";

/**
 * Terra 가 답하기 전까지 지켜야 할 것.
 *
 * 검증을 기다리는 동안에도 원문이 보이면 안 되는 댓글이 있어, 판단이 끝나지 않았어도
 * 최소한의 보호는 지금 정해 둔다.
 */
export type PendingProtection = {
  /** Terra 판단 전에도 원문을 감출지. */
  hideSourceBeforeVerdict: boolean;
  /** 모더레이션 정책이 함의하는 최소 보호 등급. Terra 입력으로 넘어간다. */
  moderationMinimumLevel: RiskLevel | null;
  /** 크리에이터를 향한 공격이 아니라 작성자 본인의 위기일 수 있는지. */
  maySignalSelfHarmCase: boolean;
};

export type BranchOutcome =
  | {
      kind: "instant_safe";
      level: "safe";
      /** 무엇을 근거로 검증 없이 확정했는지. 로그에 그대로 남는다. */
      basis: "luna_safe";
      certainty: Certainty;
    }
  | {
      kind: "verify";
      reasons: BranchReason[];
      protection: PendingProtection;
    };

const levelRank: Record<RiskLevel, number> = {
  safe: 0,
  caution: 1,
  danger: 2,
};

/**
 * 걸린 범주가 여럿이면 가장 강한 보호를 택한다. 분기표의 "높은 보호 등급 우선".
 */
const combineTreatments = (
  treatments: ModerationTreatment[],
): PendingProtection =>
  treatments.reduce<PendingProtection>(
    (combined, treatment) => ({
      hideSourceBeforeVerdict:
        combined.hideSourceBeforeVerdict || treatment.hideSourceBeforeVerdict,
      moderationMinimumLevel:
        treatment.minimumCandidate &&
        (!combined.moderationMinimumLevel ||
          levelRank[treatment.minimumCandidate] >
            levelRank[combined.moderationMinimumLevel])
          ? treatment.minimumCandidate
          : combined.moderationMinimumLevel,
      maySignalSelfHarmCase:
        combined.maySignalSelfHarmCase || treatment.maySignalSelfHarmCase,
    }),
    {
      hideSourceBeforeVerdict: false,
      moderationMinimumLevel: null,
      maySignalSelfHarmCase: false,
    },
  );

const protectionFor = (
  moderation: FirstPassResult["moderation"],
): PendingProtection => {
  if (!moderation) {
    return combineTreatments([]);
  }

  return combineTreatments([
    ...moderation.result.categories.map(treatmentForCategory),
    // 정책에 없는 범주도 그냥 지나치지 않는다. 기본 처리를 거쳐 Terra 로 간다.
    ...moderation.result.unknownCategories.map(treatmentForCategory),
  ]);
};

/**
 * 안전으로 끝낼 수 있는지. 기준 문서의 "안전 즉시 통과 조건" 여섯 가지를 그대로 옮겼다.
 * 하나라도 어긋나면 이유를 남긴다.
 */
const reasonsToVerify = (first: FirstPassResult): BranchReason[] => {
  const luna = first.luna.result;
  const reasons: BranchReason[] = [];

  if (luna.candidateLevel === "caution") {
    reasons.push("luna_caution");
  }

  if (luna.candidateLevel === "danger") {
    reasons.push("luna_danger");
  }

  if (
    luna.candidateLevel === "safe" &&
    !CERTAINTY_ALLOWING_INSTANT_PASS.has(luna.certainty)
  ) {
    reasons.push("luna_uncertain");
  }

  // 결과가 없는 것과 깨끗한 것은 다르다. 부르지 못한 것을 무해로 읽으면
  // 필터가 죽은 동안 위험한 댓글이 그대로 나간다.
  if (!first.moderation) {
    reasons.push("moderation_unavailable");
  } else if (first.moderation.result.flagged) {
    reasons.push("moderation_flagged");
  }

  // 안전이라면서 위험 신호를 함께 내놓은 경우. 모델이 스스로 어긋난 것이므로 믿지 않는다.
  if (
    luna.candidateLevel === "safe" &&
    (luna.hardRiskFlags.length > 0 || luna.softRiskFlags.length > 0)
  ) {
    reasons.push("risk_flag_on_safe_candidate");
  }

  if (luna.locationOrScheduleMention) {
    reasons.push("location_or_schedule_mention");
  }

  if (luna.sensitiveTopicMatched) {
    reasons.push("sensitive_topic");
  }

  return reasons;
};

export const routeFirstPass = (first: FirstPassResult): BranchOutcome => {
  const reasons = reasonsToVerify(first);

  if (reasons.length === 0) {
    return {
      kind: "instant_safe",
      level: "safe",
      basis: "luna_safe",
      certainty: first.luna.result.certainty,
    };
  }

  return {
    kind: "verify",
    reasons,
    protection: protectionFor(first.moderation),
  };
};
