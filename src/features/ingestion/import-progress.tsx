type ImportProgressSummary = {
  requestedTopLevelCount: number;
  fetchedCount: number;
  storedCount: number;
  updatedCount: number;
  duplicateCount: number;
  failedCount: number;
  status:
    | "pending"
    | "running"
    | "partially_succeeded"
    | "succeeded"
    | "failed";
};

const statusLabels: Record<ImportProgressSummary["status"], string> = {
  pending: "대기 중",
  running: "가져오는 중",
  partially_succeeded: "일부 완료",
  succeeded: "가져오기 완료",
  failed: "가져오기 실패",
};

const countItems = [
  ["requestedTopLevelCount", "요청한 상위 댓글"],
  ["fetchedCount", "확인한 전체 댓글"],
  ["storedCount", "신규 저장"],
  // 「이미 저장됨」과 나눠 둔다. 다시 읽어서 뭐가 달라졌는지가 여기에만 보인다.
  ["updatedCount", "상태 갱신"],
  ["duplicateCount", "이미 저장됨"],
  ["failedCount", "저장 실패"],
] as const;

export function ImportProgress({
  summary,
}: {
  summary: ImportProgressSummary;
}) {
  return (
    <section
      className="import-progress-card"
      aria-label="최근 댓글 가져오기 결과"
    >
      <div className="import-progress-heading">
        <div>
          <p>최근 가져오기</p>
          <h2>댓글 수집 결과</h2>
        </div>
        <span data-status={summary.status}>{statusLabels[summary.status]}</span>
      </div>
      <dl className="import-progress-grid">
        {countItems.map(([key, label]) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>{summary[key].toLocaleString("ko-KR")}</dd>
          </div>
        ))}
      </dl>
      <p className="import-progress-note">
        상위 댓글 수에는 답글이 포함되지 않습니다. 답글은 확인한 전체 댓글 수에
        함께 집계됩니다.
      </p>
    </section>
  );
}
