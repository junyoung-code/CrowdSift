export const ANALYSIS_REVIEW_LABELS = {
  classification_evidence_missing: "AI 판단 근거가 없어 보류",
  classification_evidence_not_in_source: "AI가 인용한 근거가 원문에 없어 보류",
  classification_attack_evidence_missing: "위험 판단을 뒷받침할 원문 근거가 없어 보류",
  classification_context_inconsistent: "AI의 맥락 판단이 서로 모순되어 보류",
  classification_missing_context_unspecified: "부족한 맥락에 대한 설명이 없어 보류",
  classification_safe_with_attack_flags: "안전 판정과 공격 신호가 서로 모순되어 보류",
  classification_output_invalid: "AI 응답을 검증할 수 없어 보류",
} as const;

export function classificationFailureLabel(code: string): string {
  const labels: Record<string, string> = {
    semantic_output_invalid: "의미 분석 출력 검증 실패 · 재시도 대상",
    "classification.rewrite_retry": "피드백 정리 재시도",
    "classification.rewrite_rejected": "피드백 의미 보존 검증 실패",
    "classification.pipeline_replaced": "새 의미 분석 작업으로 이관",
    classification_safe_with_attack_flags: "안전 판정과 공격 신호가 서로 모순됨",
    classification_context_inconsistent: "맥락이 명확하다는 판단과 불확실성 신호가 서로 모순됨",
    classification_evidence_not_in_source: "AI가 인용한 판단 근거가 댓글 원문에 없음",
    classification_attack_evidence_missing: "위험 판단을 뒷받침할 원문 근거가 없음",
    classification_missing_context_unspecified: "부족한 맥락에 대한 설명이 없음",
    "public_import.page_saved": "댓글 페이지 저장 완료",
    "classification.review_queued": "AI 응답 검증 오류로 판단 보류 처리",
    "classification.retry_requested": "실패한 댓글 재시도 요청",
  };
  return labels[code] ?? code;
}
