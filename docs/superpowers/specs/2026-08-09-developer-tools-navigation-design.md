# Developer Tools Navigation Design

**Date:** 2026-08-09
**Status:** Approved design
**Scope:** 일반 사용자 탐색에서 수동 영상 테스트를 제거하고, 기존 테스트 기능을 개발자 전용 영역으로 이동한다.

## 1. 문제

현재 제품에는 다음 세 진입점이 함께 노출된다.

1. `YouTube 연결` 화면의 채널 댓글 자동 수집
2. 사이드바 `영상` 메뉴의 내 영상 20·30·50개 수동 댓글 테스트
3. `YouTube 연결` 화면 하단의 다른 크리에이터 공개 URL 테스트

세 기능은 실행 방식은 다르지만 모두 댓글을 저장하고 Classification V1으로 분석한 뒤 Comment Inbox에 표시한다. 일반 사용자는 이 차이를 알기 어려우며, 자동 운영 기능과 개발용 품질 검증 기능이 중복돼 보인다.

또한 공개 URL 기능은 현재 비프로덕션 환경 플래그로만 제한된다. 개발 환경에 로그인할 수 있는 사용자 중 실제 개발자인지는 확인하지 않는다.

## 2. 제품 결정

일반 사용자의 기본 흐름은 다음 하나로 유지한다.

```text
YouTube 연결
→ 시작 날짜 선택
→ 최신 댓글부터 자동 수집
→ 신규 댓글 Classification V1 분석
→ Comment Inbox 확인
→ 이후 60분 간격으로 신규 댓글 확인
```

영상 하나를 선택하는 수동 테스트와 다른 크리에이터의 공개 URL 테스트는 모두 `개발자 도구`로 이동한다.

## 3. 탐색 구조

### 일반 사용자

사이드바 순서는 다음과 같다.

1. 개요
2. 댓글 Inbox
3. YouTube 연결
4. 운영 기준

기존 `영상` 메뉴는 삭제한다. 뒤에 있던 메뉴는 한 칸씩 위로 이동한다.

일반 사용자에게는 다음 항목을 표시하지 않는다.

- `영상` 메뉴
- `영상 하나로 분류 테스트` 링크
- 다른 크리에이터의 공개 URL 테스트 패널
- `개발자 도구` 메뉴

### 승인된 개발자

위 일반 메뉴 뒤에 마지막 항목으로 다음 메뉴를 추가한다.

5. 개발자 도구

경로는 `/app/developer-tools`를 사용한다.

## 4. 개발자 도구 화면

개발자 도구는 기존 기능을 새로 복제하지 않고 현재 구현을 옮겨 재사용한다.

### 내 채널 영상 테스트

- 연결된 YouTube 채널의 영상 목록을 불러온다.
- 영상 하나를 선택한다.
- 최상위 댓글 20·30·50개 중 하나를 선택한다.
- 답글을 함께 가져온다.
- 기존 원문 저장과 Classification V1 경로를 사용한다.
- 결과는 Comment Inbox에서 확인한다.

### 다른 크리에이터 공개 URL 테스트

- 공개 YouTube 영상 URL을 입력한다.
- 20·50·100·1,000개 중 하나를 선택한다.
- 읽기 전용으로 댓글을 가져온다.
- 기존 공개 URL 원문 저장과 Classification V1 경로를 사용한다.
- 숨김·삭제 등 YouTube moderation 권한은 제공하지 않는다.
- 결과는 Comment Inbox에서 확인한다.

두 테스트에는 `DEVELOPMENT`와 `TEST FIXTURE` 출처를 명확히 표시한다. fixture 결과를 실제 연결 데이터로 표시하지 않는다.

## 5. 접근 제어

개발자 도구는 다음 조건을 모두 만족할 때만 사용할 수 있다.

1. `NODE_ENV !== "production"`
2. `ENABLE_DEVELOPER_TOOLS=true`
3. 로그인한 `user.id`가 서버 환경변수 `DEVELOPER_USER_IDS` allowlist에 포함됨

`DEVELOPER_USER_IDS`는 쉼표로 구분한 Supabase Auth UUID 목록이다. 브라우저에는 전체 allowlist를 전달하지 않는다.

접근 제어는 UI 숨김만으로 끝내지 않는다.

- Product layout은 현재 사용자가 승인된 개발자인지 서버에서 계산한다.
- 사이드바는 승인된 개발자에게만 `개발자 도구`를 렌더링한다.
- `/app/developer-tools` page는 서버에서 다시 권한을 확인한다.
- 영상 동기화·댓글 가져오기·공개 URL preview/import Server Action도 동일한 권한을 다시 확인한다.
- 일반 사용자의 직접 URL 접근과 직접 Action 호출은 모두 거부한다.
- 권한이 없는 route 접근은 개발 기능의 존재와 설정을 노출하지 않도록 `notFound()`로 처리한다.

기존 `ENABLE_PUBLIC_YOUTUBE_DEV_MODE`, `YOUTUBE_PUBLIC_API_KEY`, fixture provider 설정은 공개 URL 기능의 provider 준비 여부를 계속 결정한다. 이것들은 개발자 신원 검사를 대신하지 않는다.

## 6. 기존 경로 처리

- `/app/videos`는 일반 사용자 탐색에서 제거한다.
- 승인된 개발자가 기존 북마크로 `/app/videos`에 접근하면 `/app/developer-tools`로 redirect한다.
- 일반 사용자가 `/app/videos`에 직접 접근하면 `notFound()`를 반환한다.
- `YouTube 연결` 화면에서는 `영상 하나로 분류 테스트` 링크와 `PublicVideoImportPanel`을 제거한다.

## 7. 데이터 흐름

개발자 도구는 데이터베이스 관리 화면이 아니다. 기존 수집·분류 경로를 실행하는 테스트 도구다.

```text
개발자 도구에서 댓글 가져오기
→ comment_import_jobs 생성
→ raw_comments와 provider payload 저장
→ analysis_jobs / analysis_job_items 생성
→ Moderation → Luna → 조건부 Terra
→ classification_verdicts 저장
→ Comment Inbox 표시
```

원문, 관찰 기록, AI 단계 출력, 최종 판단은 계속 구조적으로 분리한다. 개발자 도구에서 저장된 데이터도 workspace 경계를 따른다.

## 8. 자동 동기화와의 관계

`YouTube 연결` 화면의 자동 동기화는 사용자 운영 기능이다.

- Production Cron은 5분마다 bounded worker를 깨운다.
- DB의 `next_sync_at`이 도래한 채널만 실제 YouTube 신규 댓글을 조회한다.
- 정상 상태의 채널별 조회 간격은 60분이다.
- worker는 계속 실행되는 daemon이 아니라, 짧게 실행되고 종료되는 작업이다.

`개발자 도구`의 수동 테스트는 이 스케줄을 변경하지 않는다. 사용자가 버튼을 눌렀을 때 선택한 영상 또는 공개 URL에 대해서만 별도 import job을 만든다.

## 9. UI 문구

개발자 도구 제목과 설명은 사용자용 운영 기능과 구분한다.

- Eyebrow: `DEVELOPER TOOLS`
- 제목: `댓글 분류 테스트`
- 설명: `수동 수집과 Classification V1 저장 경로를 개발 환경에서 검증합니다.`
- 내 채널 섹션: `내 채널 영상으로 테스트`
- 공개 URL 섹션: `다른 크리에이터의 공개 영상으로 테스트`
- 결과 안내: `가져온 댓글과 분석 결과는 현재 workspace의 Comment Inbox에 저장됩니다.`

## 10. 테스트 계약

### 접근 제어

- 일반 사용자의 사이드바에는 `영상`과 `개발자 도구`가 없다.
- 승인된 개발자의 사이드바 마지막에는 `개발자 도구`가 있다.
- Production에서는 allowlist에 포함돼도 개발자 도구가 비활성화된다.
- 비승인 사용자의 page와 Server Action 직접 호출은 거부된다.

### 기능 회귀

- 내 채널 영상 테스트가 기존 20·30·50개 import 계약을 유지한다.
- 공개 URL 테스트가 기존 읽기 전용 계약을 유지한다.
- 두 경로 모두 기존 Classification V1 processor를 사용한다.
- 완료된 분석이 Comment Inbox에 나타난다.
- 일반 `YouTube 연결` 화면에는 개발용 panel과 수동 테스트 링크가 없다.

### 검증

- 관련 Vitest 및 Testing Library 테스트
- 권한 없는 직접 route/Action 호출 테스트
- 개발자 도구 → 댓글 가져오기 → Inbox fixture E2E
- `npm run lint`
- `npm run build`

## 11. 범위 제외

- 데이터베이스 관리자 UI
- Production에서의 공개 URL 테스트 허용
- 일반 사용자가 수동 영상 import를 사용하는 제품 기능
- 새로운 분류 모델 또는 별도 분류 파이프라인
- 기존 자동 동기화 주기 변경

## 12. 완료 조건

- 일반 사용자 사이드바에서 `영상`이 사라지고 기존 메뉴가 위로 이동한다.
- 승인된 개발자에게만 마지막 `개발자 도구` 메뉴가 보인다.
- 기존 내 영상 테스트와 공개 URL 테스트가 개발자 도구에서 동작한다.
- 일반 사용자는 UI와 직접 URL·Action 호출 모두로 개발 기능에 접근할 수 없다.
- 테스트 결과가 기존 DB 경로를 거쳐 Comment Inbox에 표시된다.
