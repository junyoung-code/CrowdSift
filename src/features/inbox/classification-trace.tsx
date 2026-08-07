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
}: {
  kind: "luna" | "terra";
  stage: InboxClassificationStageTrace | null;
}) => {
  if (!stage) {
    return <p>{kind === "terra" ? "안전 즉시 통과로 생략" : "결과 없음"}</p>;
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
  return (
    <section className="classification-trace" aria-label="단계별 판단 과정">
      <h3>판단 과정</h3>
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
          <ModelValues kind="terra" stage={trace.terra} />
        </li>
        <li>
          <strong>최종 판정</strong>
          <p>
            {trace.final?.status === "review_queue"
              ? "판단 보류"
              : trace.final?.level
                ? LEVEL_LABELS[trace.final.level]
                : "결과 없음"}
            {trace.final?.basis ? ` · ${trace.final.basis}` : ""}
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
              <div key={`${stage.modelIdentifier}:${stage.providerResponseId}`}>
                <dt>{stage.modelIdentifier}</dt>
                <dd>
                  {stage.latencyMs ?? 0}ms · 입력 {stage.usage.inputTokens ?? 0} · 출력 {stage.usage.outputTokens ?? 0}
                </dd>
              </div>
            ))}
        </dl>
      </details>
    </section>
  );
}
