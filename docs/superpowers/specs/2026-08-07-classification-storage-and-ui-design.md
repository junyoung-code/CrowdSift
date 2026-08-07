# CrowdSift 댓글 분류 v1 저장 및 UI 연결 설계

## 목적

새로 병합한 댓글 분류 파이프라인을 실제 댓글 가져오기 작업, 데이터베이스, Comment Inbox에 연결한다. 사용자는 댓글을 가져온 직후 안전·주의·위험 분류를 실행하고, 각 댓글에 대해 Moderation, Luna, 코드 분기, Terra, 최종 판정이 어떤 결론을 내렸는지 확인할 수 있어야 한다.

## 결정 사항

- 기존 분석 파이프라인은 더 이상 호출하지 않는다.
- 기존 AI 분석 데이터는 삭제해도 된다.
- YouTube 연결, 영상, 댓글 원문, 댓글 가져오기 작업과 관측 기록은 유지한다.
- Moderation과 Luna는 1차 분석에서 병렬 실행한다.
- 안전 즉시 통과 조건을 충족하지 못한 댓글만 Terra로 보낸다.
- 최종 등급은 모델이 아니라 결정 규칙이 확정한다.
- 모델의 `danger`는 제품 UI와 기존 `review_level`의 `risk`로 표시한다.
- `review_queue`는 안전으로 치환하지 않고 `판단 보류` 상태로 표시한다.
- 주의·위험·판단 보류 댓글의 원문은 기본적으로 숨긴다.
- 삭제·차단·신고는 권장 조치로만 저장하며 자동 실행하지 않는다.
- 새 분류 파이프라인에 아직 없는 순화문 생성은 이번 범위에서 제외한다.

## 범위

### 포함

- 새 분류 파이프라인용 영속 저장 구조
- 기존 AI 분석 데이터 정리
- 댓글 가져오기 이후 새 분류 작업 생성
- 청크 단위 분류 실행 API
- 가져오기 결과 아래 분류 실행 및 진행률 UI
- 안전·주의·위험·판단 보류 집계
- Inbox의 새 최종 판정 조회
- 댓글별 단계 판단 상세 보기
- 모델명, 응답 ID, 처리 시간, 토큰 사용량, 프롬프트·스키마 버전 감사 정보
- 실패 저장과 실패 항목 재시도

### 제외

- Luna 순화문 생성
- 삭제·차단·신고의 자동 실행
- 결제, 다중 플랫폼, 새 대시보드
- 기존 분석 결과와의 비교 또는 이중 실행

## 사용자 흐름

1. 사용자가 YouTube 댓글을 가져온다.
2. 가져오기 결과 아래에 `안전·주의·위험 분류` 패널이 나타난다.
3. 사용자가 `분류 시작`을 누른다. API 비용이 발생하는 작업이므로 명시적 실행을 유지한다.
4. 클라이언트가 한 번에 최대 5개씩 처리 API를 호출한다.
5. 패널은 전체, 완료, 실패, 안전, 주의, 위험, 판단 보류 개수를 갱신한다.
6. 완료 후 사용자는 Comment Inbox로 이동한다.
7. Inbox에서 댓글의 최종 등급을 보고, `판단 과정 보기`를 펼쳐 단계별 결과를 확인한다.
8. 기술 정보는 별도의 접힌 영역에서 확인한다.

공개 URL 가져오기 흐름도 같은 처리 API와 저장 경로를 사용한다. 기존의 자동 진행 UX는 유지하되 처리기는 새 분류기로 교체한다.

## 데이터 모델

기존 `analysis_jobs`와 `analysis_job_items`는 작업 진행률과 항목 클레임에 계속 사용한다. 기존 `model_runs`, `comment_analyses`, `sanitized_feedback`는 새 파이프라인의 쓰기 대상에서 제외한다.

### `classification_stage_runs`

각 외부 모델 호출을 한 행으로 보존한다.

- `workspace_id`, `raw_comment_id`, `analysis_job_item_id`
- `stage`: `moderation | luna | terra`
- `provider`, `model_identifier`, `provider_response_id`
- `idempotency_key` 유일 키
- `prompt_version`, `schema_version`, `policy_version`
- `latency_ms`, `usage`
- `status`: `succeeded | failed | refused`
- `output`: 단계별 구조화 결과 JSON
- `error_code`, `created_at`

Moderation 실패는 실패 실행으로 저장하되 Luna가 성공했다면 작업 전체를 즉시 실패시키지 않는다. Moderation 결과 없음은 깨끗함이 아니므로 Terra 확인 경로로 보낸다.

### `classification_branches`

1차 결과를 조합한 코드 분기를 한 행으로 보존한다.

- `analysis_job_item_id` 유일 키
- `outcome`: `instant_safe | verify`
- `reasons`: Terra 호출 이유 목록
- `protection`: 판정 전 원문 숨김, Moderation 최소 등급, 자해 가능성
- `created_at`

### `classification_verdicts`

사용자 화면과 Inbox가 읽는 최종 판정이다.

- `workspace_id`, `raw_comment_id`, `analysis_job_item_id`
- `status`: `decided | review_queue`
- `level`: `safe | caution | risk | null`
- `basis`: 최종 규칙의 판정 근거
- `agreed_with_first_pass`: Terra 미호출이면 `null`
- `allow_rewrite`, `hide_source`, `safety_case`, `raised_by_moderation`
- `recommended_actions`, `reason_codes`
- `feedback_type`, `feedback_core`
- `created_at`

안전 즉시 통과도 반드시 최종 판정 행을 만든다. Terra가 없다는 이유로 최종 결과를 `null`로 두지 않는다.

### `classification_feedback`

기존 `creator_feedback`는 예전 `comment_analyses`를 참조하므로 새 판정 수정에 재사용하지 않는다. 새 피드백은 다음을 별도 행으로 저장한다.

- `workspace_id`, `raw_comment_id`, `classification_verdict_id`, `actor_user_id`
- `decision`: `approved | rejected | corrected`
- `corrected_level`: `safe | caution | risk | null`
- `edited_feedback_core`
- `use_for_personalization`, `use_for_training`, `created_at`

수정은 모델의 원래 출력이나 최종 판정 행을 덮어쓰지 않는다. Inbox 표시에서 최신 사용자 수정을 별도 오버레이로 적용하고, 원래 AI 판정과 사용자 수정 기록을 모두 남긴다.

### 데이터 정리

새 마이그레이션은 외래 키 순서에 맞춰 기존 AI 파생 데이터를 삭제한다.

- 분석 비용 및 요약 작업·결과
- 개인화용 기존 분석 피드백과 임베딩
- 순화 결과
- 기존 댓글 분석 및 모델 실행 결과
- 규칙 평가
- 기존 분석 작업 항목과 작업

원문 댓글, 댓글 관측, 가져오기 작업, 영상, 채널 연결과 감사 로그는 삭제하지 않는다. 마이그레이션은 삭제 범위를 명시적으로 제한하며 `TRUNCATE ... CASCADE` 같은 광범위한 삭제는 사용하지 않는다.

## 처리 구조

### 작업 생성

댓글 가져오기가 끝나면 `classification-v1` 구성 키로 분석 작업과 댓글별 항목을 생성한다. 구성 키에는 Moderation/Luna/Terra 모델, 프롬프트 버전, 스키마 버전, 정책 버전을 포함한다. 같은 가져오기 작업과 같은 구성에서는 중복 작업을 만들지 않는다.

### 항목 처리

1. 원문, 영상 제목, 채널, 분류 프로필을 로드한다.
2. Moderation과 Luna를 병렬 호출한다.
3. 두 실행 결과를 각각 즉시 저장한다.
4. `routeFirstPass` 결과를 저장한다.
5. `instant_safe`이면 명시적인 안전 최종 판정을 저장한다.
6. `verify`이면 Luna의 후보 등급을 보여주지 않은 채 Terra를 호출한다.
7. Terra 실행을 저장하고 `decideVerdict`로 최종 판정을 만든다.
8. 최종 판정을 저장한 다음 항목을 성공 처리한다.
9. 어느 단계에서든 복구 불가능한 오류가 나면 실패 실행과 오류 코드를 남기고 항목을 실패 처리한다.

### 멱등성과 재시도

- 모델 호출별 키: 작업 항목 + 단계 + 모델 + 프롬프트/스키마 버전
- 최종 판정: 작업 항목당 하나
- 저장 후 응답 전 연결이 끊겨도 재호출 시 저장된 성공 단계를 재사용한다.
- 실패 항목은 사용자가 `실패 항목 재시도`를 눌렀을 때만 다시 대기 상태로 바꾼다.
- 성공 항목에는 모델을 다시 호출하지 않는다.

## API와 화면

### 상태 API

기존 가져오기 상태 응답에 분류 집계를 추가한다.

- 작업 ID와 상태
- 전체, 완료, 실패, 남은 수
- 안전, 주의, 위험, 판단 보류 수

### 처리 API

기존 분석 처리 라우트의 인증과 workspace 소유권 검사는 유지하되, 내부 처리기를 새 분류 서비스로 교체한다. 한 요청은 최대 5개 항목을 처리한다.

### 가져오기 결과 패널

- 분류 전: 처리 대상 수, 예상 호출 구조, `분류 시작`
- 처리 중: 진행 막대, 완료/전체, 현재 단계 안내
- 완료: 등급별 집계와 Inbox 링크
- 일부 실패: 성공 집계, 실패 수, `실패 항목 재시도`

페이지 새로고침 후에도 DB 상태를 읽어 같은 진행 화면을 복원한다.

### Inbox 판단 과정

각 댓글에 다음 순서로 표시한다.

1. Moderation: 감지 여부, 범주, 점수 또는 호출 실패
2. Luna: 후보 등급, 확실성, 위험 신호, 적용 규칙
3. 코드 분기: 즉시 안전 또는 Terra 호출, 분기 이유
4. Terra: 검증 등급, 확실성, 사유 코드, 피드백 핵심, 권장 조치. 미호출이면 `안전 즉시 통과로 생략` 표시
5. 최종 판정: 등급/판단 보류, 판정 기준, 원문 숨김 여부

모델명, 응답 ID, 지연 시간, 토큰 사용량, 프롬프트/스키마 버전은 `기술 정보 보기` 안에 둔다.

## 원문 보호

- `hide_source = true`이거나 최종 판정 전이면 큐 목록과 상세 화면에서 원문을 기본 숨김 처리한다.
- 사용자가 경고를 확인하고 `원문 보기`를 눌러야 일시적으로 표시한다.
- 원문은 수정하거나 순화문으로 덮어쓰지 않는다.
- 검색용 SQL이 숨겨진 원문을 응답 필드로 반환하지 않도록 읽기 모델에서 분리한다.

## Inbox 호환성

Inbox 읽기 모델은 `classification_verdicts`의 최신 결과를 기준으로 한다.

- `safe`, `caution`, `risk`는 기존 배지와 필터에 연결한다.
- `review_queue`는 별도 `판단 보류` 배지와 필터로 제공한다.
- 기존 카테고리 대신 새 `reason_codes`, `feedback_type`, `recommended_actions`를 읽는다.
- 사용자 판단 수정 기능은 새 최종 판정 ID를 참조하여 `classification_feedback`에 추가하고, AI 원본 판정은 변경하지 않는다.
- 순화문이 없는 주의 댓글은 `feedback_core`가 있으면 핵심 피드백을 표시하고, 없으면 보존할 피드백이 없다고 표시한다.

## 테스트와 검증

- Moderation/Luna 병렬 실행과 개별 저장
- Moderation 실패 시 Terra 강제 분기
- 안전 즉시 통과의 명시적 최종 판정
- 위험 불일치 보호 규칙과 `danger -> risk` 저장 변환
- Terra `unclear`의 판단 보류 저장
- 단계 저장 후 재시도 시 외부 API 중복 호출 방지
- workspace 밖 작업 처리 차단
- 상태 API 집계
- 가져오기 결과 패널의 시작, 진행, 완료, 일부 실패 상태
- Inbox의 단계별 판단 표시와 숨김 원문 확인 흐름
- 공개 URL과 소유 채널 가져오기가 동일 저장 경로를 사용하는지 검증
- `npm run lint`, 전체 관련 테스트, `npm run build`

## 완료 기준

- 새로 가져온 댓글이 새 분류 작업으로 생성된다.
- 사용자가 가져오기 결과 바로 아래에서 분류를 실행하고 진행률을 볼 수 있다.
- 모든 성공 댓글에 단계 실행, 분기, 최종 판정이 저장된다.
- Inbox가 새 최종 판정을 표시하고 단계별 판단을 열어볼 수 있다.
- 위험·판단 보류 원문이 기본적으로 노출되지 않는다.
- 기존 분석 처리기는 더 이상 UI/API에서 호출되지 않는다.
- 기존 AI 분석 데이터는 정리되지만 원문 댓글과 가져오기 이력은 유지된다.
