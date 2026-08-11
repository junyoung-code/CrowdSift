import type { Certainty, ModerationCategory, RiskLevel } from "./schemas";

/**
 * 분류 보완 기준 v0.2 의 수치와 정책표를 코드로 옮긴 것.
 *
 * 판단 로직이 아니라 판단이 참조할 자료다. 분기 단계가 이 값들을 읽는다.
 */

export const CLASSIFICATION_POLICY_VERSION = "crowdsift-classification-v0.2";

/**
 * Luna 후보가 안전이면서 이 확신도일 때만 2차 검증 없이 통과한다.
 *
 * 문턱값이 아니라 목록이다. 세 단계 중 어느 것이 통과해도 되는지는 등급을 나누는
 * 것과 같은 종류의 결정이라, 부등호 뒤에 숨기지 않고 이름으로 적는다.
 */
export const CERTAINTY_ALLOWING_INSTANT_PASS: ReadonlySet<Certainty> = new Set([
  "clear",
]);

/**
 * Terra 확신도가 이 값에 못 미치면 등급을 확정하지 않고 사람이 보게 넘긴다.
 * 두 모델 모두 확신하지 못한 댓글을 원문 그대로 내보내지 않기 위한 마지막 문턱이다.
 *
 * Terra 는 아직 없다. Luna 를 3단으로 바꾼 결과를 보고 Terra 도 같은 형태로 갈지
 * 정한다. 그때까지는 v0.2 에 적힌 소수 문턱을 그대로 둔다.
 */
export const TERRA_REVIEW_QUEUE_CONFIDENCE = 0.6;

/**
 * 모더레이션 범주 하나가 걸렸을 때 그것이 무엇을 의미하는지.
 *
 * 어떤 범주든 걸리면 Terra 를 호출하므로 "검증 필요" 항목은 따로 두지 않는다.
 * 여기 담긴 것은 Terra 가 판단하기 전까지 지켜야 할 최소한이다.
 */
export type ModerationTreatment = {
  /** Terra 가 뒤집기 전까지 최소한 이 등급으로 본다. null 이면 등급을 함의하지 않는다. */
  minimumCandidate: RiskLevel | null;
  /** Terra 판단을 기다리는 동안 원문을 감출지. */
  hideSourceBeforeVerdict: boolean;
  /** 크리에이터를 향한 공격이 아니라 작성자 본인의 위기일 수 있는지. */
  maySignalSelfHarmCase: boolean;
};

const treatment = (
  minimumCandidate: RiskLevel | null,
  options: {
    hideSourceBeforeVerdict?: boolean;
    maySignalSelfHarmCase?: boolean;
  } = {},
): ModerationTreatment => ({
  minimumCandidate,
  hideSourceBeforeVerdict: options.hideSourceBeforeVerdict ?? false,
  maySignalSelfHarmCase: options.maySignalSelfHarmCase ?? false,
});

export const MODERATION_CATEGORY_POLICY: Record<
  ModerationCategory,
  ModerationTreatment
> = {
  harassment: treatment("caution"),
  "harassment/threatening": treatment("danger", {
    hideSourceBeforeVerdict: true,
  }),
  hate: treatment(null),
  "hate/threatening": treatment("danger", { hideSourceBeforeVerdict: true }),
  // 자해를 유도하는 쪽은 크리에이터를 향한 공격이다.
  "self-harm/instructions": treatment("danger", {
    hideSourceBeforeVerdict: true,
  }),
  // 작성자 본인의 위기 표현일 수 있다. 대상 판정은 Terra 가 한다.
  "self-harm/intent": treatment(null, { maySignalSelfHarmCase: true }),
  "self-harm": treatment(null, { maySignalSelfHarmCase: true }),
  // 성적 주제 자체와 크리에이터 대상 성희롱은 다르다.
  sexual: treatment(null),
  "sexual/minors": treatment("danger", { hideSourceBeforeVerdict: true }),
  // 영화·게임·뉴스 감상일 수 있어 자동으로 위험이 되지 않는다.
  violence: treatment(null),
  "violence/graphic": treatment(null, { hideSourceBeforeVerdict: true }),
  illicit: treatment(null),
  "illicit/violent": treatment("danger", { hideSourceBeforeVerdict: true }),
};

/**
 * 정책에 없는 범주가 걸렸을 때 적용할 기본값.
 * 등급을 함의하지는 않지만 Terra 는 반드시 거친다.
 */
export const UNKNOWN_MODERATION_CATEGORY_TREATMENT: ModerationTreatment =
  treatment(null);

export const treatmentForCategory = (
  category: string,
): ModerationTreatment =>
  MODERATION_CATEGORY_POLICY[category as ModerationCategory] ??
  UNKNOWN_MODERATION_CATEGORY_TREATMENT;
