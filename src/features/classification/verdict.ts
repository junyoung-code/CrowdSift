import {
  NON_NEGOTIABLE_RISK_FLAGS,
  type HardRiskFlag,
  type RecommendedAction,
  type RiskLevel,
  type SoftRiskFlag,
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
  /**
   * Terra 가 확신하지 못했지만, 두 판단이 모두 안전이고 어느 쪽도 위험 신호를
   * 달지 않았다. 사람이 볼 것이 없어 그대로 확정한다.
   */
  | "both_safe_despite_uncertainty"
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
 *
 * 한때 **Luna 만 위험이라 했을 때** Terra 가 주의까지 낮추도록 열어 본 적이 있다.
 * 완화 불가 신호가 없고 Terra 가 clear 일 때만 걸리게 좁혔는데도, 실측 69건에서 세 번
 * 걸렸고 셋 다 오지랖이었다 — 「이제 결혼할 나이 아니에요?」 「부모님이 걱정하시겠어요」
 * 「그건 님 눈이 나쁜 거」. 기준은 사생활 참견을 공격으로 본다. 그 셋을 위험으로 읽은
 * 쪽은 Luna 였고 Terra 는 조언으로 읽었다.
 *
 * 즉 여기서 갈리는 것은 「1차가 채널 밈을 악플로 오해했다」가 아니라 「2차가 기준 하나를
 * 적용하지 않는다」였다. 그 상태에서 2차에 거부권을 주면 2차의 맹점이 그대로 최종
 * 등급이 된다. 아래 규칙은 낭비가 아니라 그 구멍을 메우고 있었다.
 *
 * 2차가 오지랖을 읽게 만드는 것은 프롬프트가 할 일이지 이 함수가 할 일이 아니다.
 */
const resolveDisagreement = (
  candidate: CandidateJudgement,
  terra: TerraVerdict,
): { level: RiskLevel; basis: VerdictBasis } => {
  if (candidate.level === "danger" || terra.verdictLevel === "danger") {
    return { level: "danger", basis: "danger_in_either" };
  }

  // 남은 것은 안전과 주의뿐이다. 여기서만 Terra 가 등급을 내릴 수 있다.
  if (terra.certainty === "clear") {
    return { level: terra.verdictLevel, basis: "verifier_decided_boundary" };
  }

  return {
    level: higher(candidate.level, terra.verdictLevel),
    basis: "protective_on_boundary",
  };
};

/**
 * 1차가 낸 것 중 확정에 필요한 부분.
 *
 * 등급만으로는 부족하다. Terra 가 위험을 낮출 수 있는지, 확신 부족을 넘길 수 있는지가
 * 1차가 어떤 신호를 달았는지에 달려 있다.
 */
export type CandidateJudgement = {
  level: RiskLevel;
  hardRiskFlags: HardRiskFlag[];
  softRiskFlags: SoftRiskFlag[];
};

/** 어느 쪽도 위험·주의 신호를 달지 않았는지. */
const noRiskSignals = (candidate: CandidateJudgement, terra: TerraVerdict) =>
  candidate.hardRiskFlags.length === 0 &&
  candidate.softRiskFlags.length === 0 &&
  terra.hardRiskFlags.length === 0 &&
  terra.softRiskFlags.length === 0;

export const decideVerdict = ({
  candidate,
  terra,
  moderationMinimumLevel,
}: {
  /** Luna 의 후보 판단. Terra 는 이것을 보지 못한 채 판단했다. */
  candidate: CandidateJudgement;
  terra: TerraVerdict;
  /** 걸린 모더레이션 범주가 함의하는 최소 등급. 없으면 null. */
  moderationMinimumLevel: RiskLevel | null;
}): Verdict => {
  const agreedWithFirstPass = candidate.level === terra.verdictLevel;

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

  // 확신하지 못한 것과 볼 것이 없는 것은 다르다.
  //
  // 「ㅋㅋㅋㅋㅋ」이나 「ㅇㅇ」에 Terra 가 확신을 내지 못하는 것은 판단이 어려워서가
  // 아니라 판단할 거리가 없어서다. 그것까지 사람에게 넘기면, 크리에이터는 웃음소리를
  // 확인하려고 검토 대기를 비우게 된다. 두 판단이 모두 안전이고, 어느 쪽도 신호를
  // 달지 않았고, 무료 필터도 걸지 않았다면 넘길 것이 없다.
  if (
    terra.certainty === "unclear" &&
    candidate.level === "safe" &&
    terra.verdictLevel === "safe" &&
    !moderationMinimumLevel &&
    noRiskSignals(candidate, terra)
  ) {
    return {
      ...shared,
      status: "decided",
      level: "safe",
      basis: "both_safe_despite_uncertainty",
      allowRewrite: false,
      hideSource: false,
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
    : resolveDisagreement(candidate, terra);

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
