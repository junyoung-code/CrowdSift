import { ANALYSIS_REVIEW_LABELS } from "@/features/classification/failure-label";
import { CaretDown } from "@phosphor-icons/react/dist/ssr";

import type {
  InboxClassificationStageTrace,
  InboxClassificationTrace,
} from "./inbox-query";

const LEVEL_LABELS: Record<string, string> = {
  safe: "안전",
  caution: "주의",
  danger: "위험",
  risk: "위험",
};

/**
 * 어떻게 그 등급에 이르렀는지.
 *
 * 이유 코드는 Terra 가 낸 것만 담긴다. 두 판단이 갈려 위험이 된 댓글은 Terra 가
 * 위험이라고 하지 않았으므로 이유 코드가 비고, 화면에는 근거 없이 위험만 남는다.
 * 그 빈자리를 메우는 것이 이 문장이다.
 */
export const BASIS_LABELS: Record<string, string> = {
  semantic_meaning_unrecoverable: "댓글의 의미 자체를 복원할 수 없음",
  semantic_harm_target_unclear: "공격 대상을 확인할 수 없음",
  semantic_no_creator_harm: "크리에이터 대상 공격 없음",
  semantic_feedback_survives: "공격 제거 후 전달할 피드백이 남음",
  semantic_harm_without_feedback: "공격 제거 후 전달할 피드백이 남지 않음",
  ...ANALYSIS_REVIEW_LABELS,
  instant_safe: "1차에서 바로 안전으로 통과",
  non_negotiable_risk_confirmed: "낮출 수 없는 신호를 2차가 확인",
  verifier_uncertain: "2차가 정하지 못해 사람에게 넘김",
  both_safe_despite_uncertainty: "2차가 확신하지 못했지만 둘 다 안전이라 확정",
  both_agreed: "두 판단이 같음",
  danger_in_either: "두 판단이 갈려 높은 쪽을 택함",
  verifier_decided_boundary: "안전·주의 경계를 2차가 근거를 대고 정함",
  protective_on_boundary: "경계에서 확신이 없어 보호 쪽으로 둠",
  ambiguous_sarcasm: "칭찬인지 비꼼인지 판단할 문맥이 부족해 보류",
  ambiguous_slang: "은어가 감탄인지 공격인지 분명하지 않아 보류",
  missing_context: "대화 맥락이 부족해 보류",
  danger_disagreement: "위험 여부에 대한 두 판단이 달라 보류",
};

const stringArray = (value: unknown) =>
  Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];

const stringValue = (value: unknown) =>
  typeof value === "string" ? value : null;

const recordValue = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const ModerationValues = ({
  stage,
}: {
  stage: InboxClassificationStageTrace | null;
}) => {
  if (!stage) return <p>호출 결과 없음</p>;
  if (stage.status !== "succeeded") {
    return <p>호출 실패 · {stage.errorCode ?? "원인 확인 필요"}</p>;
  }

  const categories = stringArray(stage.output.categories);
  const scores = recordValue(stage.output.categoryScores);
  return (
    <p>
      {categories.length === 0
        ? "감지 항목 없음"
        : categories
            .map((category) => {
              const score = scores[category];
              return `${category} · ${typeof score === "number" ? score.toFixed(2) : "—"}`;
            })
            .join(", ")}
    </p>
  );
};

const ModelValues = ({
  kind,
  stage,
  instantSafe = false,
}: {
  instantSafe?: boolean;
  kind: "luna" | "terra";
  stage: InboxClassificationStageTrace | null;
}) => {
  if (!stage) {
    return <p>{kind === "terra" ? instantSafe ? "안전 즉시 통과로 생략" : "2차 검증 결과 없음" : "결과 없음"}</p>;
  }
  if (stage.status !== "succeeded") {
    return <p>호출 실패 · {stage.errorCode ?? "원인 확인 필요"}</p>;
  }
  const level = stringValue(
    kind === "luna"
      ? stage.output.candidateLevel
      : stage.output.verdictLevel,
  );
  const certainty = stringValue(stage.output.certainty);
  const signals = [
    ...stringArray(stage.output.hardRiskFlags),
    ...stringArray(stage.output.softRiskFlags),
    ...stringArray(stage.output.reasonCodes),
  ];

  return (
    <>
      <p>
        {level ? LEVEL_LABELS[level] ?? level : "등급 없음"} · {certainty ?? "확실성 없음"}
      </p>
      <small>{signals.length > 0 ? signals.join(" · ") : "감지 신호 없음"}</small>
    </>
  );
};

export function ClassificationTrace({
  trace,
}: {
  trace: InboxClassificationTrace;
}) {
  if (trace.semantic) {
    const semantic = trace.semantic;
    const targets: Record<string,string> = { creator:"크리에이터", content:"콘텐츠", other_commenter:"다른 시청자", third_party:"제3자", self:"작성자 자신", general:"일반 대상", unknown:"대상 불명" };
    const harms: Record<string, string> = { personal_attack:"인격 공격", mockery:"조롱", sexual_degradation:"성적 비하", appearance_attack:"외모 공격", threat:"위협", dehumanization:"비인간화", motive_speculation:"동기 추측", harassment:"괴롭힘", insult:"모욕", hate:"혐오", personal_info:"개인정보 노출" };
    const severity: Record<string,string> = { none:"없음", low:"낮음", medium:"중간", high:"높음", critical:"매우 높음" };
    return <details className="classification-trace" aria-label="단계별 판단 과정">
      <summary><span><strong>판단 과정</strong><small>의미 분석과 피드백 보존 기준</small></span><CaretDown aria-hidden="true" /></summary>
      <div className="classification-trace-body"><ol>
        <li><strong>의미</strong><p>{semantic.meaningClear ? "의미 해석 가능" : "의미 복원 어려움"}</p></li>
        <li><strong>대상</strong><p>{targets[semantic.target] ?? "대상 불명"}</p></li>
        <li><strong>피드백</strong><p>추출 {semantic.feedbackClaimCount}개 · 공격 제거 후 남는 정보 {semantic.remainingClaimCount}개</p></li>
        <li><strong>공격 신호</strong><p>{semantic.harms.length ? semantic.harms.map(h=>`${harms[h.type] ?? h.type} · ${targets[h.target] ?? h.target} · ${severity[h.severity] ?? h.severity}`).join(" / ") : "확인된 공격 없음"}</p>
          <small>심각도: {severity[semantic.harmSeverity] ?? semantic.harmSeverity} · {semantic.criticalHarm ? "중대한 공격 신호 있음" : "중대한 공격 신호 없음"}. 분류 등급과 별도로 기록합니다.</small></li>
        <li><strong>적용 정책</strong><p>{BASIS_LABELS[trace.final?.basis ?? ""] ?? "의미 기반 분류"}</p></li>
        <li><strong>피드백 정리</strong><p>{{pending:"검증 중",accepted:"의미 보존 검증 완료",failed:"피드백 정리 실패 · 재시도 필요",not_required:"재작성 대상 아님"}[semantic.rewriteStatus]}</p></li>
      </ol>{semantic.spamSignals.length ? <p>스팸 의심 신호: {semantic.spamSignals.join(" · ")} · 등급과 별도</p> : null}
      <small>분석 확신도 {Math.round(semantic.confidence*100)}% · 모델 자기보고 값</small></div>
    </details>;
  }
  return (
    <details className="classification-trace" aria-label="단계별 판단 과정">
      <summary>
        <span>
          <strong>판단 과정</strong>
          <small>Moderation부터 최종 판정까지 확인</small>
        </span>
        <CaretDown aria-hidden="true" weight="bold" />
      </summary>
      <div className="classification-trace-body">
        <ol>
          <li>
            <strong>Moderation</strong>
            <ModerationValues stage={trace.moderation} />
          </li>
          <li>
            <strong>Luna 1차 분석</strong>
            <ModelValues kind="luna" stage={trace.luna} />
          </li>
          <li>
            <strong>코드 분기</strong>
            <p>
              {trace.branch?.outcome === "instant_safe"
                ? "안전 즉시 통과"
                : trace.branch?.reasons.join(" · ") || "분기 정보 없음"}
            </p>
          </li>
          <li>
            <strong>Terra 2차 검증</strong>
            <ModelValues kind="terra" stage={trace.terra} instantSafe={trace.final?.basis === "instant_safe"} />
          </li>
          <li>
            <strong>최종 판정</strong>
            <p>
              {trace.final?.status === "review_queue"
                ? "판단 보류"
                : trace.final?.level
                  ? LEVEL_LABELS[trace.final.level]
                  : "결과 없음"}
              {trace.final?.basis
                ? ` · ${BASIS_LABELS[trace.final.basis] ?? trace.final.basis}`
                : ""}
            </p>
          </li>
        </ol>

        <details>
          <summary>기술 정보 보기</summary>
          <dl>
            {[trace.moderation, trace.luna, trace.terra]
              .filter(
                (stage): stage is InboxClassificationStageTrace =>
                  stage !== null,
              )
              .map((stage) => (
                <div
                  key={`${stage.modelIdentifier}:${stage.providerResponseId}`}
                >
                  <dt>{stage.modelIdentifier}</dt>
                  <dd>
                    {stage.latencyMs ?? 0}ms · 입력 {stage.usage.inputTokens ?? 0}
                    · 출력 {stage.usage.outputTokens ?? 0}
                  </dd>
                </div>
              ))}
          </dl>
        </details>
      </div>
    </details>
  );
}
