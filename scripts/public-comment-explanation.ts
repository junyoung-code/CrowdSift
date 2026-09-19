import { ANALYSIS_REVIEW_LABELS } from "../src/features/classification/failure-label";
import type { BranchReason } from "../src/features/classification/branch";
import type { StoredClassificationState } from "../src/features/classification/classification-service";
import type { FinalClassificationVerdict } from "../src/features/classification/finalize";
import type { AmbiguityReason, Certainty, CommentIntent, CommentTarget, HardRiskFlag, SoftRiskFlag } from "../src/features/classification/schemas";

export const LEVEL_NAMES: Record<string, string> = {
  safe: "안전", caution: "주의", danger: "위험", review_queue: "판단 보류",
  failed: "실패", pending: "대기", running: "진행 중",
};
const SIGNALS: Record<HardRiskFlag | SoftRiskFlag, string> = {
  threat: "협박", stalking: "스토킹·반복 접근", sexual_harassment: "성희롱",
  personal_info: "개인정보 노출", self_harm_or_death: "자해·죽음 유도",
  hate_speech: "혐오 표현", personal_attack: "개인에 대한 공격",
  appearance_attack: "외모·신체에 대한 공격", family_attack: "가족·지인에 대한 공격",
  profanity: "욕설", vulgarity: "비속어", mockery: "조롱", sarcasm: "비꼼", harsh_criticism: "거친 비난",
};
const INTENTS: Record<CommentIntent, string> = { praise: "칭찬", neutral: "중립적인 반응", question: "질문", criticism: "비판", attack: "공격", ambiguous: "의도가 모호한 말" };
const TARGETS: Record<CommentTarget, string> = { content: "영상 내용", creator_behavior: "크리에이터의 행동", creator_person: "크리에이터 개인", third_party: "제3자", self: "댓글 작성자 자신", none: "특정 대상 없음", unclear: "대상 불분명" };
const CERTAINTIES: Record<Certainty, string> = { clear: "확실하다고 응답", borderline: "등급 경계에 있다고 응답", unclear: "확신하기 어렵다고 응답" };
const AMBIGUITIES: Record<AmbiguityReason, string> = { possible_sarcasm: "칭찬인지 비꼼인지 불분명", unclear_slang_polarity: "은어가 감탄인지 공격인지 불분명", missing_context: "대화 문맥 부족" };
const ROUTING: Record<BranchReason, string> = {
  luna_caution: "1차 AI가 주의로 판단함", luna_danger: "1차 AI가 위험으로 판단함",
  luna_uncertain: "1차 AI가 안전 후보를 확신하지 못함", moderation_flagged: "유해성 필터가 신호를 감지함",
  moderation_unavailable: "유해성 필터 결과를 받지 못함", risk_flag_on_safe_candidate: "1차 AI가 안전이라고 하면서 위험 신호도 기록함",
  location_or_schedule_mention: "위치·일정 언급 신호가 기록됨", sensitive_topic: "민감한 주제에 해당한다고 기록됨",
};
const BASES: Record<FinalClassificationVerdict["basis"], string> = {
  ...ANALYSIS_REVIEW_LABELS,
  instant_safe: "1차 AI가 안전으로 판단했고 추가 검증 조건에 걸리지 않아 바로 안전으로 확정했습니다.",
  both_agreed: "두 AI의 등급 판단이 같아 그 등급을 채택했습니다. 두 모델의 동의가 판단의 정확성을 보장하지는 않습니다.",
  danger_disagreement: "한 AI는 위험으로, 다른 AI는 다르게 판단했습니다. 코드가 위험을 확정하지 않고 사람의 검토를 기다리도록 보류했습니다.",
  ambiguous_slang: "어느 한 AI가 남긴 은어의 모호함을 코드가 유지해 보류했습니다. 2차 AI가 안전으로 보아도 1차의 모호함 표시가 자동으로 지워지지는 않습니다.",
  ambiguous_sarcasm: "칭찬인지 비꼼인지 불분명하다는 표시가 남아 있어 코드가 보류했습니다.",
  missing_context: "대화 문맥이 부족하다는 표시가 남아 있어 코드가 보류했습니다.",
  non_negotiable_risk_confirmed: "2차 AI가 협박·스토킹 등 완화할 수 없는 위험 신호를 기록해 코드가 위험으로 확정했습니다.",
  verifier_uncertain: "2차 AI도 판단을 확신하지 못해 코드가 보류했습니다.",
  both_safe_despite_uncertainty: "두 AI가 모두 안전으로 보았고 위험 신호 없는 단순 반응이어서, 확신이 낮아도 안전으로 확정했습니다.",
  danger_in_either: "두 AI 중 하나가 위험으로 보아 높은 등급을 선택한 기록입니다.",
  verifier_decided_boundary: "두 AI의 판단이 달랐지만 2차 검증이 처리 등급을 결정해 그 결과를 채택했습니다.",
  protective_on_boundary: "안전과 주의의 경계에서 판단이 갈려 더 보호적인 등급을 선택했습니다.",
};

const describeModel = (result: {
  assessment?: { explanation: string; contextResolution: string; missingContext: string | null };
  intent: CommentIntent; target: CommentTarget; certainty: Certainty;
  hardRiskFlags: HardRiskFlag[]; softRiskFlags: SoftRiskFlag[]; ambiguityReasons: AmbiguityReason[];
}) => {
  const signals = [...new Set([...result.hardRiskFlags, ...result.softRiskFlags])];
  return [
    result.assessment?.explanation ?? "",
    result.assessment?.missingContext ? `추가로 필요한 문맥: ${result.assessment.missingContext}` : "",
    `의도는 ‘${INTENTS[result.intent]}’, 대상은 ‘${TARGETS[result.target]}’으로 해석했습니다.`,
    signals.length ? `판단 근거로 ${signals.map((signal) => `‘${SIGNALS[signal]}’`).join("·")} 신호를 기록했습니다.` : "공격·욕설 등의 위험 신호는 기록하지 않았습니다.",
    result.ambiguityReasons.length ? `남은 모호함: ${result.ambiguityReasons.map((reason) => AMBIGUITIES[reason]).join(" / ")}.` : "",
    `확신 수준: ${CERTAINTIES[result.certainty]}.`,
  ].filter(Boolean).join(" ");
};

export function explainClassification(state: StoredClassificationState | undefined) {
  const luna = state?.firstPass?.luna.result;
  const terra = state?.terra?.result;
  const verdict = state?.verdict?.verdict;
  const moderation = state?.firstPass?.moderation;
  const override = verdict?.raisedBySpam ? " 이후 스팸 규칙이 등급을 더 높였습니다." : verdict?.raisedByModeration ? " 이후 유해성 필터의 최소 보호 등급을 적용해 등급을 더 높였습니다." : "";
  return {
    summary: verdict ? BASES[verdict.basis] + override : "아직 최종 판정 기록이 없습니다.",
    lunaTitle: luna ? `1차 AI · ${LEVEL_NAMES[luna.candidateLevel]}` : "1차 AI · 결과 없음",
    luna: luna ? describeModel(luna) : "저장된 1차 판단이 없습니다.",
    routing: state?.branch?.kind === "verify" ? `${state.branch.reasons.map((reason) => ROUTING[reason]).join(" / ")}. 그래서 2차 검증으로 보냈습니다.` : state?.branch?.kind === "instant_safe" ? "추가 검증 조건에 걸리지 않아 2차 AI를 호출하지 않았습니다." : "분기 기록이 없습니다.",
    terraTitle: terra ? `2차 AI · ${LEVEL_NAMES[terra.verdictLevel]}` : "2차 AI · 미실행",
    terra: terra ? describeModel(terra) : state?.branch?.kind === "instant_safe" ? "1차 판단으로 안전이 확정되어 생략했습니다." : "저장된 2차 판단이 없습니다.",
    moderation: !moderation ? "유해성 필터 결과가 없습니다." : moderation.result.flagged ? "유해성 필터가 검토할 신호를 감지했습니다." : "유해성 필터는 유해 신호를 감지하지 않았습니다. 최종 등급은 별도의 댓글 분류 AI와 코드 규칙이 정합니다.",
  };
}
