# CommentHawk 공개 YouTube URL 읽기 전용 개발 모드 설계

**상태:** 승인됨
**작성일:** 2026-07-24
**적용 범위:** 로컬 개발 환경 전용
**기준 문서:** `docs/product-context.md`, `docs/CommentHawk_Project_Context_v0.1.pdf`, `docs/superpowers/specs/2026-07-23-commenthawk-real-vertical-slice-design.md`

## 1. 결정 요약

CommentHawk에 YouTube OAuth 연결 없이 공개 영상 URL의 실제 댓글을 가져와 기존 분석 파이프라인과 Comment Inbox에서 확인할 수 있는 개발 모드를 추가한다.

이 기능은 다음 원칙을 따른다.

- CommentHawk 로그인과 워크스페이스는 필요하지만 YouTube 계정 인증은 필요하지 않다.
- 서버 전용 YouTube Data API Key로 공개 영상과 공개 댓글만 읽는다.
- 기존 OAuth 기반 본인 채널 연결과 공개 URL 읽기를 별도 Provider로 분리한다.
- 공개 URL로 가져온 데이터는 항상 `공개 URL · 읽기 전용` 출처로 다룬다.
- 댓글 선택지는 `20 / 50 / 100 / 1,000`이며 기본값은 `20`이다.
- 선택 수는 최상위 댓글과 답글을 합친 총 댓글 수이며 서버 하드 상한은 `1,000`이다.
- 댓글은 최신 최상위 스레드부터 가져온다.
- 답글이 없는 최상위 댓글도 정상적으로 가져온다.
- 답글을 저장할 때는 해당 부모 댓글을 반드시 함께 저장한다.
- 규칙 엔진, 1차 AI, 크리에이터별 정책, RAG 기반 2차 AI를 기존 구조와 연결한다.
- AI는 추천만 하며 공개 URL 출처에는 YouTube 변경 작업을 허용하지 않는다.
- 이번 단계에서 모바일, 프로덕션 공개, 자동 moderation, Fine-tuning은 구현하지 않는다.

## 2. 목표와 비목표

### 2.1 목표

1. 개발자가 공개 YouTube 영상 URL을 붙여 넣고 실제 댓글을 가져올 수 있다.
2. 가져오기 전에 영상 메타데이터와 댓글 가능 여부를 확인할 수 있다.
3. 기본 20개부터 최대 총 1,000개까지 사용자가 선택할 수 있다.
4. 가져오기 전에 예상 YouTube 할당량과 OpenAI 비용 범위를 확인할 수 있다.
5. 실제 원문, 원본 payload, 규칙 결과, AI 결과, 피드백을 서로 덮어쓰지 않고 분리 보존한다.
6. 기존 대시보드와 Comment Inbox에서 실제 저장·분석 결과를 확인할 수 있다.
7. 공개 URL 출처는 UI, 서버, DB 경계에서 읽기 전용으로 보호한다.
8. 기존 OAuth 기반 본인 채널 연결과 moderation 흐름에 회귀를 만들지 않는다.

### 2.2 비목표

- 프로덕션 사용자에게 공개 URL 모드 제공
- 모바일 전용 레이아웃
- YouTube 할당량 증설 또는 compliance audit
- 공개 URL 댓글 숨김, 삭제, 게시, 답글 작성
- 공개 URL 피드백의 자동 개인화 또는 학습 사용
- Fine-tuning 작업 또는 모델 생성
- 결제, 사용량 과금, 고객별 요금제
- 여러 소셜 플랫폼 지원
- YouTube 검색어로 영상 검색

## 3. 용어

| 용어 | 의미 |
|---|---|
| `owned_oauth` | 사용자가 OAuth로 연결하고 소유권을 확인한 YouTube 채널 출처 |
| `public_url` | 서버 API Key로 읽은 공개 영상 URL 출처 |
| 최상위 댓글 | 다른 댓글에 대한 답글이 아닌 스레드의 부모 댓글 |
| 답글 | 최상위 댓글에 달린 대댓글 |
| 총 댓글 수 | 최상위 댓글과 답글을 합친 저장·분석 대상 수 |
| 안전 / 주의 / 위험 | 사람이 얼마나 우선적으로 확인해야 하는지를 나타내는 검토 단계 |
| `uncertain` | AI가 의미를 충분히 확신하지 못한 내용 유형이며 별도의 검토 단계가 아님 |

## 4. 승인된 사용자 흐름

### 4.1 진입

기존 YouTube 연결 화면에 다음 두 영역을 둔다.

- `내 YouTube 채널 연결`
- `공개 영상 테스트 · 개발 모드`

공개 영상 테스트 영역은 다음 조건을 모두 만족할 때만 렌더링한다.

- 로컬 개발 환경이다.
- `ENABLE_PUBLIC_YOUTUBE_DEV_MODE=true`이다.

서버에 `YOUTUBE_PUBLIC_API_KEY`가 설정되어 있으면 실제 입력 UI를 표시한다. Key가 누락된 경우 영역 자체를 숨기지 않고 입력 UI 대신 개발 환경 설정 안내를 표시한다.

### 4.2 미리보기

1. 사용자가 공개 YouTube URL을 입력한다.
2. 서버가 허용 도메인과 경로를 검증하고 영상 ID를 추출한다.
3. `PublicYouTubeReadProvider`가 영상 메타데이터를 조회한다.
4. 화면에 다음을 표시한다.
   - 썸네일
   - 영상 제목
   - 채널 이름
   - 정규화된 영상 URL
   - 댓글 사용 가능 여부
5. 미리보기 단계에서는 DB에 댓글이나 가져오기 작업을 만들지 않는다.

지원 URL은 다음으로 한정한다.

- `youtube.com/watch?v=...`
- `youtu.be/...`
- `youtube.com/shorts/...`

임의 URL을 서버가 직접 fetch하지 않는다. 허용된 URL에서 ID만 추출한 뒤 Google API endpoint로 요청해 SSRF 경계를 유지한다.

### 4.3 가져오기 및 분석 확인

사용자는 다음 중 하나를 선택한다.

- `20` — 기본값
- `50`
- `100`
- `1,000`

확인 영역에 다음을 표시한다.

- 답글 포함 총 최대 댓글 수
- 예상 YouTube quota unit 범위
- 예상 OpenAI 비용 범위
- 공개 URL 출처는 읽기 전용이라는 안내

사용자가 `댓글 가져오기 및 분석 시작`을 명시적으로 누른 뒤에만 외부 API 호출과 유료 AI 분석을 시작한다.

### 4.4 진행과 완료

화면에 다음 단계를 분리해 표시한다.

1. 댓글 가져오기
2. 규칙 검사
3. 1차 AI 분석
4. 2차 AI 분석
5. 완료

완료 화면에는 다음을 표시한다.

- 요청 수
- 실제 관찰·연결한 수와 새로 저장한 원문 수
- 최상위 댓글 수와 답글 수
- 중복 수
- 분석 성공 수와 실패 수
- 안전 / 주의 / 위험 분포
- 사용 모델과 실제 token 사용량
- 추정 비용과 실제 token usage 기반 계산 비용
- `Comment Inbox에서 보기` 링크

## 5. 아키텍처

### 5.1 Provider 분리

OAuth 연결과 공개 URL 읽기는 서로 다른 구현으로 유지한다.

```text
OwnedYouTubeProvider
├── OAuth token 사용
├── 소유 채널과 영상 조회
├── 댓글 읽기
└── 확인을 거친 moderation 작업

PublicYouTubeReadProvider
├── 서버 API Key 사용
├── 공개 영상 미리보기
├── 공개 댓글과 답글 읽기
└── 쓰기 메서드 없음
```

두 Provider가 공유하는 읽기 계약은 application-owned type으로 정의한다.

- `getPublicVideo(videoId)`
- `listCommentThreads(videoId, pageToken, maxResults, order)`
- `listReplies(parentCommentId, pageToken, maxResults)`

공개 Provider에는 moderation 메서드를 추가하지 않는다. Google SDK 타입을 React component나 domain service에 직접 노출하지 않는다.

### 5.2 서비스 경계

다음 단위가 각각 한 가지 책임을 갖는다.

| 단위 | 책임 |
|---|---|
| URL parser | 허용된 YouTube URL을 영상 ID와 canonical URL로 변환 |
| Public preview service | 실제 영상 메타데이터와 댓글 가능 여부 확인 |
| Public import service | 총 수 제한, pagination, 부모-답글 무결성, quota 측정 |
| Ingestion repository | 기존 원문·payload·job item 저장과 중복 연결 |
| Analysis pipeline | 규칙, 1차 AI, RAG, 2차 AI, provenance 저장 |
| Read-only policy | 공개 출처의 moderation과 학습 사용 차단 |
| Cost estimator | 실행 전 비용 범위와 실행 후 실제 비용 계산 |

### 5.3 기존 파이프라인 재사용

공개 Provider는 YouTube에서 데이터를 읽는 입구만 새로 제공한다. 그 이후에는 기존 구조를 재사용한다.

```text
Public URL
→ video preview
→ explicit confirmation
→ comment import job
→ raw comments and payloads
→ analysis job
→ rule evaluation
→ Stage 1
→ creator feedback retrieval
→ conditional Stage 2
→ dashboard and Comment Inbox
```

## 6. 댓글 선택과 총 수 제한

### 6.1 기준

- `requested_total_count`는 최상위 댓글과 답글을 합친 수다.
- 이 제한은 새 raw row 수가 아니라 해당 import job이 관찰·연결한 comment item 수에 적용한다.
- 허용값은 `20`, `50`, `100`, `1,000`뿐이다.
- 클라이언트 값과 관계없이 서버에서 다시 검증한다.
- 저장 수는 절대 `requested_total_count`와 `1,000`을 넘지 않는다.
- YouTube `commentThreads.list`는 `order=time`으로 요청한다.

### 6.2 스레드 처리

최신 최상위 스레드부터 다음 순서로 처리한다.

1. 최상위 댓글을 추가한다.
2. 답글이 있으면 최신 답글부터 남은 용량만큼 추가한다.
3. 다음 최상위 스레드로 이동한다.
4. 총 수가 선택한 한도에 도달하면 pagination을 중단한다.

예를 들어 한도가 20이고 18개가 이미 선택됐다면 다음 스레드의 최상위 댓글 1개와 최신 답글 1개를 추가하고 중단한다.

이 규칙의 결과는 다음과 같다.

- 답글이 없는 최상위 댓글도 정상 저장된다.
- 답글을 저장할 때 부모 댓글이 항상 먼저 존재한다.
- 한 스레드의 모든 답글을 가져오지 못할 수 있지만 orphan reply는 만들지 않는다.
- `commentThread` 응답에 모든 답글이 포함되지 않으면 `comments.list`로 필요한 답글을 추가 조회한다.

### 6.3 중복

같은 워크스페이스의 동일한 YouTube comment ID는 원문을 중복 생성하지 않는다.

- 새 import job과 job item은 남긴다.
- job item은 기존 raw comment를 참조할 수 있다.
- 원문은 최초 보존 값을 덮어쓰지 않는다.
- 동일 분석 설정의 결과가 이미 있으면 idempotency key로 중복 모델 호출을 막는다.

## 7. 데이터 모델

### 7.1 `comment_import_jobs`

기존 테이블에 다음 필드를 추가한다.

| 필드 | 설명 |
|---|---|
| `source_kind` | `owned_oauth` 또는 `public_url`; 기존 행 기본값은 `owned_oauth` |
| `requested_total_count` | 공개 URL 작업의 답글 포함 총 요청 수 |
| `source_video_url` | 공개 URL 작업의 canonical YouTube URL |
| `youtube_quota_units_used` | 실제 사용한 quota unit |
| `top_level_count` | 실제 연결한 최상위 댓글 수 |
| `reply_count` | 실제 연결한 답글 수 |

기존 `requested_top_level_count`는 OAuth 흐름의 역사적 의미를 보존한다. 공개 URL 작업에서는 `requested_total_count`를 사용한다. 이번 기능을 위해 기존 데이터를 억지로 총 댓글 의미로 다시 해석하지 않는다.

DB check는 다음을 강제한다.

- `owned_oauth`는 기존 top-level 계약을 따른다.
- `public_url`은 `requested_total_count in (20, 50, 100, 1000)`을 요구한다.
- `public_url`은 canonical `source_video_url`을 요구한다.

### 7.2 영상과 원문

- `youtube_videos`는 영상 identity와 캡처 메타데이터를 계속 보존한다.
- `raw_comments`는 원문과 댓글 identity를 보존한다.
- `raw_comment_payloads`는 원본 Google 응답을 별도로 보존한다.
- `comment_import_items`는 어떤 import job이 어떤 raw comment를 관찰했는지 기록한다.

영상 또는 댓글 row에 `read_only` boolean을 중복 저장하지 않는다. 읽기 전용 여부는 선택된 source observation의 `comment_import_jobs.source_kind`에서 결정한다.

### 7.3 비용 기록

`analysis_job_costs`에 분석 작업별 비용 snapshot을 별도 기록한다.

- 추정 시점
- 통화 `USD`
- Stage 1, Stage 2, embedding model ID
- 입력·출력 token 단가와 적용일
- 예상 token과 비용 범위
- 실제 model run token 합계
- 실제 token usage 기반 계산 비용

실제 model response의 token usage는 기존 `model_runs.usage`에 계속 보존한다. 가격이 바뀌어도 과거 계산을 재현할 수 있도록 당시 단가 snapshot을 함께 저장한다. 계산 비용은 provider 청구서 자체가 아니라 저장된 usage와 단가로 계산한 관측값이라고 UI에 명시한다.

## 8. AI 분석

### 8.1 입력 분리

Stage 1에는 다음을 전달한다.

- 변경 불가능한 댓글 원문
- 영상 제목
- 허용된 부모·답글 문맥
- 규칙 엔진 신호
- 현재 creator policy

모델 출력은 다음을 포함한다.

- category
- confidence
- 제안 review level
- toxicity, spam, phishing
- actionable feedback 여부
- `needsSecondPass`
- 2차 분석 사유
- recommended action
- 간결한 설명

### 8.2 코드가 강제하는 Stage 1 라우팅

모델의 제안만으로 최종 라우팅하지 않는다. 다음 하한선을 코드로 적용한다.

| 조건 | 최소 review level | Stage 2 |
|---|---|---|
| 긍정·중립·일반 질문, confidence 0.85 이상, 다른 신호 없음 | `safe` | 불필요 |
| category `uncertain` | `caution` | 필수 |
| confidence 0.85 미만 | `caution` | 필수 |
| `needsSecondPass=true` | `caution` | 필수 |
| blocked phrase | `caution` | 필수 |
| suspicious URL 또는 반복 광고 신호 | `caution` | 필수 |
| `spam_advertisement` | `caution` | 필수 |
| `toxic_but_actionable` | `caution` | 필수 |
| `harassment` 또는 `abusive_no_signal` | 최소 `caution` | 필수 |
| `phishing` 또는 `threat_or_serious_risk` | `risk` | 필수 |
| credential 요청과 URL이 결합된 phishing rule | `risk` | 필수 |

다음 규칙도 적용한다.

- 금지어 하나만으로 `risk` 또는 자동 삭제를 결정하지 않는다.
- allowed phrase와 context exception은 그 자체로 review level을 올리지 않는다.
- allowed phrase와 context exception은 모델이 금지어를 오해하지 않도록 입력 provenance에 포함한다.
- 규칙 또는 코드가 만든 하한선 아래로 모델이 review level을 낮출 수 없다.

### 8.3 RAG와 Stage 2

Stage 2 후보에는 현재 워크스페이스의 enabled personalization 사례를 검색한다.

- 같은 workspace만 검색
- similarity `0.78` 이상
- 최대 5개
- approved 또는 corrected 사례
- 검색된 feedback ID와 similarity 기록

RAG 검색 결과, 원문, thread context, 영상 제목, Stage 1 결과, creator policy, rule version을 Stage 2에 전달한다.

Stage 2는 다음을 반환한다.

- final category와 confidence
- final 안전 / 주의 / 위험
- sanitized feedback 또는 `null`
- normalized question 또는 `null`
- recommended action
- manual-review, evidence-review
- creator-facing explanation

Stage 1과 Stage 2의 model run과 분석 결과는 모두 보존한다.

### 8.4 공개 URL 피드백

공개 URL observation에서 작성한 feedback은 저장할 수 있지만 다음을 강제한다.

- `use_for_personalization=false`
- `use_for_training=false`

UI 기본값에만 의존하지 않는다. 서버 contract와 DB transaction이 `public_url` 출처에 대해 두 값을 `true`로 저장하는 요청을 거절한다.

## 9. 모델과 비용 전략

초기 개발 설정은 다음을 권장한다.

- Stage 1: `gpt-5.4-nano`
- Stage 2: `gpt-5.4-mini`
- Embedding: `text-embedding-3-small`

각 model ID는 별도 서버 환경변수로 설정한다.

- `OPENAI_STAGE1_MODEL`
- `OPENAI_STAGE2_MODEL`
- `OPENAI_EMBEDDING_MODEL`

model ID를 application code에 영구 고정하지 않는다. Korean evaluation set에서 Stage 1 모델이 기준을 충족하지 못하면 Stage 1도 mini 모델로 교체할 수 있다. 모든 model run은 실제 model identifier, prompt version, schema version, policy version, latency, usage를 기록한다.

비용 추정은 안내값이며 실제 청구액을 보장하지 않는다. 화면에는 가격 snapshot 적용일과 `예상 범위`임을 표시한다.

## 10. 읽기 전용과 보안

### 10.1 기능 차단

`public_url` observation에는 다음 작업을 허용하지 않는다.

- 댓글 숨김
- 댓글 삭제 또는 reject
- 댓글 publish
- 답글 작성
- 작성자 차단
- training 또는 personalization opt-in

보호는 세 경계에서 적용한다.

1. UI에서 action control을 비활성화하고 이유를 표시한다.
2. server action과 moderation domain service가 source import job을 검증해 거절한다.
3. DB moderation transaction이 OAuth connection, owned video, source context를 다시 검증한다.

버튼을 숨기는 것만으로 보안을 구현하지 않는다.

### 10.2 출처 결합

moderation 요청에는 action의 출처가 된 import job 또는 source observation을 결합한다. 동일한 raw comment가 서로 다른 작업에서 관찰됐더라도 공개 URL 화면에서 시작된 요청은 허용하지 않는다.

향후 소유 채널 화면에서 동일 댓글을 OAuth로 다시 관찰하고 moderation 가능 여부를 재평가하는 것은 별도 제품 결정이다.

### 10.3 환경 보호

- API Key는 서버 환경변수에만 저장한다.
- API Key를 HTML, client bundle, URL, log, audit metadata, DB에 기록하지 않는다.
- `NODE_ENV=production`에서 `ENABLE_PUBLIC_YOUTUBE_DEV_MODE=true`이면 feature initialization을 거절한다.
- preview 또는 production deployment에서는 이번 개발 모드를 노출하지 않는다.
- fixture mode와 live public mode를 동시에 실제 데이터처럼 표시하지 않는다.

## 11. 작업 상태, 재시도, 멱등성

### 11.1 작업 상태

기존 job 상태를 사용한다.

- `pending`
- `running`
- `partially_succeeded`
- `succeeded`
- `failed`

가져오기와 분석 진행률을 별도로 표시한다. 브라우저 새로고침 후에도 job ID를 이용해 persisted state를 다시 읽는다.

### 11.2 재시도

- YouTube transient error: 지수 backoff로 최대 3회
- OpenAI 429 또는 5xx: 지수 backoff로 최대 3회
- Structured Output schema 오류: 한 번 재요청 후 해당 item 실패
- 영구적인 4xx: 자동 반복하지 않고 명확한 error code 저장
- 일부 item 실패: 성공한 원문과 분석은 유지하고 실패 item만 재시도

### 11.3 멱등성

- import item: import job + YouTube comment ID
- raw comment: workspace + YouTube comment ID
- Stage 1/2 analysis: raw comment + policy version + prompt version + schema version + model version
- 비용 snapshot: analysis job + pricing version

동일한 완료 작업을 다시 호출해 외부 API나 모델을 중복 실행하지 않는다.

## 12. UI 상태와 문구

### 12.1 출처 표시

공개 URL 결과에는 항상 다음 배지를 표시한다.

- `공개 URL`
- `읽기 전용`

Fixture에는 항상 `TEST FIXTURE`를 표시한다. Fixture 데이터를 실제 공개 API 결과 또는 실제 AI 결과로 표현하지 않는다.

### 12.2 유해 원문

유해할 가능성이 있는 원문은 기본적으로 가린다. 사용자가 명시적으로 열기 전에는 전체 텍스트를 HTML에 포함하지 않는 기존 보호 원칙을 유지한다.

### 12.3 오류 문구

| 오류 | 사용자 안내 |
|---|---|
| 잘못된 URL | 지원하는 YouTube 영상 URL을 입력해 달라고 안내 |
| 비공개·삭제 영상 | 공개 영상만 테스트할 수 있다고 안내 |
| 댓글 비활성화 | 해당 영상에서 댓글을 가져올 수 없다고 안내 |
| API Key 누락 | 로컬 개발 환경 설정이 필요하다고 안내 |
| YouTube quota 초과 | quota 상태와 초기화 또는 Console 확인 안내 |
| OpenAI rate limit | 자동 재시도 중임을 표시 |
| 일부 item 실패 | 성공·실패 수와 실패 item 재시도 제공 |
| 새로고침 | 저장된 작업 상태 복원 |

오류 화면에 API Key, provider raw error body, 댓글 원문을 노출하지 않는다.

## 13. 테스트

### 13.1 단위 테스트

- YouTube URL 허용·거절과 canonicalization
- 요청 수 기본값 20
- 허용값 `20 / 50 / 100 / 1,000`
- 임의 수와 1,000 초과 서버 거절
- 답글이 없는 최상위 댓글 포함
- 답글을 저장할 때 부모 댓글이 함께 존재
- 부모와 답글을 합친 총 수 제한
- `uncertain`의 caution floor와 Stage 2 강제
- confidence 0.85 미만의 Stage 2 강제
- `needsSecondPass=true`의 Stage 2 강제
- phishing와 serious threat의 risk floor
- blocked phrase 단독으로 risk가 되지 않음
- allowed/context exception 단독으로 level이 올라가지 않음
- public source feedback의 personalization/training 거절

### 13.2 Provider 계약 테스트

- 공개 Provider가 API Key를 server-side request에만 사용
- 영상 미리보기 mapping
- pagination과 quota unit 계수
- `commentThread`의 불완전한 replies를 `comments.list`로 보완
- comments disabled, video not found, quota exceeded error mapping
- 공개 Provider에 쓰기 capability가 존재하지 않음

### 13.3 DB와 통합 테스트

- `source_kind` check와 기본값
- public job의 total count 제약
- raw source 불변성
- duplicate comment 연결
- source-context moderation 거절
- 실패 item만 재시도
- 동일 분석 설정의 모델 멱등성
- cost snapshot 재현
- workspace 간 RAG 격리

### 13.4 UI와 E2E

Fixture CI에서는 다음을 검증한다.

```text
공개 URL 개발 영역
→ fixture preview
→ 기본 20개 선택
→ explicit start
→ import progress
→ analysis progress
→ dashboard
→ Comment Inbox
```

Fixture 화면에는 `TEST FIXTURE`가 있어야 한다. CI는 실제 YouTube 또는 OpenAI를 호출하지 않는다.

### 13.5 로컬 live 검증

수동 검증은 공개 테스트 가능한 영상과 개발자 소유 Google Cloud API Key를 사용한다.

1. 20개 end-to-end
2. 50개
3. 100개
4. 1,000개

각 단계에서 quota, token usage, latency, 일부 실패, 재시도, Inbox 출처를 기록한다. 20개 검증이 성공하기 전에는 더 큰 단계를 실행하지 않는다.

## 14. 완료 기준

- [ ] 공개 영상 URL을 YouTube OAuth 없이 미리볼 수 있다.
- [ ] 실제 댓글을 기본 20개로 가져오고 분석할 수 있다.
- [ ] `20 / 50 / 100 / 1,000`만 선택할 수 있다.
- [ ] 답글 포함 총 수가 선택값과 1,000을 넘지 않는다.
- [ ] 답글 없는 최상위 댓글을 정상적으로 가져온다.
- [ ] 답글을 저장할 때 부모 댓글도 함께 저장한다.
- [ ] 원문, payload, 규칙, model run, 분석, sanitized feedback, creator feedback이 분리되어 있다.
- [ ] `uncertain`, 낮은 confidence, `needsSecondPass`가 반드시 Stage 2로 이동한다.
- [ ] phishing와 serious threat가 `safe` 또는 `caution`으로 낮아지지 않는다.
- [ ] 금지어 하나만으로 risk 또는 자동 삭제가 되지 않는다.
- [ ] 공개 URL 결과가 대시보드와 Inbox에서 실제 persisted data로 보인다.
- [ ] 모든 공개 URL observation에 `공개 URL · 읽기 전용`이 표시된다.
- [ ] UI, 서버, DB가 공개 출처 moderation을 거절한다.
- [ ] 공개 출처 feedback이 personalization 또는 training에 들어가지 않는다.
- [ ] 실행 전 비용 범위와 실행 후 token/cost를 확인할 수 있다.
- [ ] 기존 OAuth 채널 연결, 가져오기, moderation 흐름이 회귀하지 않는다.
- [ ] 프로덕션에서 개발 모드가 활성화되지 않는다.
- [ ] 관련 unit, integration, DB, E2E 테스트가 통과한다.
- [ ] `npm run lint`가 통과한다.
- [ ] `npm run build`가 통과한다.

## 15. 구현 순서

이 문서는 설계만 승인한다. 상세 구현 순서는 별도 implementation plan에서 테스트 우선으로 작성한다.

권장 구현 묶음은 다음과 같다.

1. 환경변수와 개발 기능 gate
2. 공개 URL parser와 preview Provider
3. DB source provenance와 total count migration
4. 총 댓글 제한 import service
5. 명시적 Stage 1 routing 보완
6. Stage 1/Stage 2 model 분리와 비용 snapshot
7. 읽기 전용 server/DB guard
8. 공개 URL UI, 진행률, Inbox provenance
9. 자동 테스트와 단계별 live 검증

## 16. 참고 문서

- [YouTube `commentThreads.list`](https://developers.google.com/youtube/v3/docs/commentThreads/list)
- [YouTube `comments.list`](https://developers.google.com/youtube/v3/docs/comments/list)
- [YouTube quota calculator](https://developers.google.com/youtube/v3/determine_quota_cost)
- [OpenAI GPT-5.4 nano](https://developers.openai.com/api/docs/models/gpt-5.4-nano)
- [OpenAI GPT-5.4 mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini)
- [OpenAI text-embedding-3-small](https://developers.openai.com/api/docs/models/text-embedding-3-small)
