# 공개 댓글 작업 복구와 진단

- 개발자 도구는 URL의 `job` 또는 현재 workspace의 최근 공개 URL 작업을 복원한다.
- 수집은 한 번에 YouTube 댓글/답글 한 페이지를 처리한다. 원문, 집계, 다음 페이지 커서를 한 DB 트랜잭션에 저장한다. 페이지 저장 실패 시 이전 커서가 유지되어 미완료 페이지부터 다시 시도한다. 이미 저장한 댓글 ID는 건너뛴다.
- 수집 중 새로고침하거나 페이지를 다시 열면 저장된 커서부터 계속한다. 정상 요청의 잠금은 즉시 해제하며 서버가 강제 종료된 경우 수집 잠금 만료까지 최대 5분 기다린다.
- 분석은 기존 `analysis_job_items`와 단계별 저장 결과를 재사용한다. 완료된 댓글은 claim하지 않는다. 1차 결과가 있으면 2차부터, 최종 판정이 있으면 후처리부터 계속한다. 강제 종료된 분석 worker는 기존 15분 claim 만료 후 회수된다.
- 브라우저가 닫힌 동안 새 batch를 실행하는 상시 worker를 추가한 것은 아니다. 서비스와 페이지를 다시 실행하면 자동으로 이어진다.
- 실패 재시도는 같은 분석 작업의 `failed` 항목만 `pending`으로 바꾼다. 이전 오류·시도 횟수는 감사 로그에 보존하며 단계별 성공 결과와 완료 항목은 그대로 둔다.
- `audit_logs`에 `classification.item_failed`, `classification.retry_requested`, `public_import.page_saved`, `public_import.interrupted` 이벤트를 저장한다. 실패 로그에는 단계, 허용된 오류 메시지/원인, schema 경로와 provider response ID를 남긴다. 원문·프롬프트·API 키·provider 응답 본문은 로그에 복사하지 않는다.
- 화면에서 현재 완료/실패/대기 건수, 최근 작업 로그를 확인하고 JSON 로그를 다운로드할 수 있다. API는 현재 workspace 소유권을 확인한다. 다운로드는 항목별 상태 전체와 최근 감사 이벤트 100개를 포함하며 전체 감사 이력은 DB에 보존된다.

## 2026-09-16 실제 실패 재시도 결과

영상 `cGfAtpp0st8`, 분석 작업 `d46bb630-535f-4416-a5c7-a0cf3d8c3081`의 실패 8개만 재시도했다. 최초 성공 94개의 상태·완료 시각·시도 횟수가 바뀌지 않았음을 대조했다.

- 3개 추가 성공 → 최종 97개 완료, 5개 실패.
- Luna: `classification_safe_with_attack_flags` 2개, `classification_context_inconsistent` 2개.
- Terra: `classification_evidence_not_in_source` 1개.
- 위 오류는 재시도에서 확인된 원인이다. 기존 최초 실패의 상세 원인은 당시 저장되지 않았으므로 소급해 확정하지 않는다.
- 불일치 결과를 성공 처리하거나 검증 기준을 완화하지 않았다. 해당 5개는 상세 원인을 보존한 실패 상태다.
