import {
  NON_NEGOTIABLE_RISK_FLAGS,
  type RecommendedAction,
  type RiskLevel,
  type TerraVerdict,
} from "./schemas";

/**
 * 3단계 뒤의 최종 등급 확정.
 *
 * 모델을 부르지 않는다. Luna 후보와 Terra 판단, 그리고 모더레이션 정책이 함의하는
 * 최소 등급을 규칙으로 합친다. 두 모델 어느 쪽도 최종 등급을 정하지 않는다.
 */

export type VerdictBasis =
  /** Terra 가 완화 불가 신호를 확인했다. 다른 무엇보다 앞선다. */
  | "non_negotiable_risk_confirmed"
  /** Terra 가 이 댓글만으로는 정할 수 없다고 했다. */
  | "verifier_uncertain"
  /** 두 판단이 같았다. */
  | "both_agreed"
  /** 한쪽이 위험이라 높은 쪽을 택했다. */
  | "danger_in_either"
  /** 안전과 주의가 갈렸고 Terra 가 근거를 대며 정했다. */
  | "verifier_decided_boundary"
  /** 안전과 주의가 갈렸는데 Terra 도 확신하지 못해 보호 쪽으로 두었다. */
  | "protective_on_boundary";

export type Verdict = {
  /** 검토 대기는 등급이 아니라 상태다. 그래서 등급 칸이 비는 경우가 있다. */
  status: "decided" | "review_queue";
  /** 검토 대기이면 null 이다. 안전으로 읽히지 않도록 0 이나 safe 를 넣지 않는다. */
  level: RiskLevel | null;
  basis: VerdictBasis;
  /** Luna 후보와 Terra 판단이 같았는지. 로그와 검토 화면에 그대로 남는다. */
  agreedWithFirstPass: boolean;
  /** 4단계 순화를 부를지. 부르지 않을 이유가 하나라도 있으면 false 다. */
  allowRewrite: boolean;
  hideSource: boolean;
  /** Terra 의 제안. 실행이 아니다. 삭제·차단·신고는 사용자 확인을 거친다. */
  recommendedActions: RecommendedAction[];
  safetyCase: boolean;
  /** 모더레이션 정책이 등급을 끌어올렸는지. */
  raisedByModeration: boolean;
};

const levelRank: Record<RiskLevel, number> = {
  safe: 0,
  caution: 1,
  danger: 2,
};

const higher = (left: RiskLevel, right: RiskLevel): RiskLevel =>
  levelRank[left] >= levelRank[right] ? left : right;

/**
 * 완화 불가 신호를 Terra 가 확인했는지.
 *
 * 확인한 쪽만 본다. Luna 가 붙였지만 Terra 가 떼어낸 신호는 불일치이며, 아래 불일치
 * 규칙이 다룬다. 이 규칙은 그것과 달리 Terra 자신의 등급까지 덮어쓴다.
 */
const confirmedNonNegotiableRisk = (terra: TerraVerdict): boolean =>
  terra.hardRiskFlags.some((flag) => NON_NEGOTIABLE_RISK_FLAGS.has(flag));

/**
 * 두 판단이 갈렸을 때. 위험이 걸렸는지로 나눈다.
 *
 * 무조건 높은 쪽으로 올리면 등급이 영원히 내려가지 않아, 2차 검증의 목적 중 하나인
 * "채널 밈을 악성으로 오해했는지 확인" 이 할 수 있는 일이 없어진다. 그렇다고 위험까지
 * 내리게 두면 협박을 놓친다. 두 실수의 무게가 다르므로 나눠서 다룬다.
 */
const resolveDisagreement = (
  candidateLevel: RiskLevel,
  terra: TerraVerdict,
): { level: RiskLevel; basis: VerdictBasis } => {
  if (candidateLevel === "danger" || terra.verdictLevel === "danger") {
    return { level: "danger", basis: "danger_in_either" };
  }

  // 남은 것은 안전과 주의뿐이다. 여기서만 Terra 가 등급을 내릴 수 있다.
  if (terra.certainty === "clear") {
    return { level: terra.verdictLevel, basis: "verifier_decided_boundary" };
  }

  return {
    level: higher(candidateLevel, terra.verdictLevel),
    basis: "protective_on_boundary",
  };
};

export const decideVerdict = ({
  candidateLevel,
  terra,
  moderationMinimumLevel,
}: {
  /** Luna 의 후보 등급. Terra 는 이것을 보지 못한 채 판단했다. */
  candidateLevel: RiskLevel;
  terra: TerraVerdict;
  /** 걸린 모더레이션 범주가 함의하는 최소 등급. 없으면 null. */
  moderationMinimumLevel: RiskLevel | null;
}): Verdict => {
  const agreedWithFirstPass = candidateLevel === terra.verdictLevel;

  const shared = {
    agreedWithFirstPass,
    recommendedActions: terra.recommendedActions,
    safetyCase: terra.safetyCase,
  };

  // 확인된 협박·스토킹·성희롱·개인정보·자해 유도·혐오는 무엇으로도 낮추지 않는다.
  // 확신하지 못했다는 이유로 대기열에 두지도 않는다. 지금 보호해야 한다.
  if (confirmedNonNegotiableRisk(terra)) {
    return {
      ...shared,
      status: "decided",
      level: "danger",
      basis: "non_negotiable_risk_confirmed",
      allowRewrite: false,
      hideSource: true,
      raisedByModeration: false,
    };
  }

  // 마지막 판단자가 정하지 못했으면 등급을 만들어내지 않는다. 사람이 본다.
  if (terra.certainty === "unclear") {
    return {
      ...shared,
      status: "review_queue",
      level: null,
      basis: "verifier_uncertain",
      allowRewrite: false,
      hideSource: true,
      raisedByModeration: false,
    };
  }

  const resolved = agreedWithFirstPass
    ? { level: terra.verdictLevel, basis: "both_agreed" as const }
    : resolveDisagreement(candidateLevel, terra);

  const level = moderationMinimumLevel
    ? higher(resolved.level, moderationMinimumLevel)
    : resolved.level;

  return {
    ...shared,
    status: "decided",
    level,
    basis: resolved.basis,
    // 순화는 주의에만 있다. 위험 댓글은 피드백이 섞여 있어도 개별 전달하지 않는다.
    allowRewrite: level === "caution" && terra.feedbackActionable,
    hideSource: level !== "safe",
    raisedByModeration: level !== resolved.level,
  };
};
