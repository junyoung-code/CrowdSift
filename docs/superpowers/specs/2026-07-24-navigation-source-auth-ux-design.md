# CommentHawk 내비게이션·댓글 원문·Google 로그인 UX 설계

작성일: 2026-07-24

상태: 사용자 승인 완료

## 1. 목적

현재 CommentHawk 수직 슬라이스에서 확인된 다음 네 가지 문제를 함께 해결한다.

1. 사이드바에서 이동한 메뉴가 선택 상태로 유지되지 않는다.
2. 주의·위험 댓글의 `원문 확인` 요청이 실패한다.
3. 안전 댓글과 주의·위험 댓글의 원문 노출 방식이 사용자 의도와 다르다.
4. 로컬 로그인마다 Mailpit의 Magic Link를 다시 열어야 한다.

완료 후 사용자는 현재 위치를 사이드바에서 즉시 알 수 있고, 안전 댓글은 실제 댓글을 바로 읽을 수 있으며, 주의·위험 댓글은 경고 확인 후에만 작성자와 원문을 볼 수 있어야 한다. 로그인은 Google을 기본으로 사용하고 같은 브라우저에서는 사용자가 로그아웃할 때까지 유지한다.

## 2. 범위

### 포함

- 현재 경로에 따른 사이드바 활성 상태
- 안전·주의·위험 등급별 원문 노출 정책
- workspace 범위가 적용된 전용 원문 조회 RPC
- 원문 확인 UI의 작성자 정보와 실제 댓글 표시
- Supabase Google OAuth 로그인
- 동일 브라우저에서 로그아웃까지 유지되는 Supabase 세션
- 명시적인 로그아웃
- 접힌 보조 수단으로 유지하는 이메일 Magic Link
- 관련 단위 테스트, DB 테스트, E2E와 설정 문서

### 제외

- Google One Tap
- 비밀번호 로그인
- 다른 소셜 로그인 제공자
- YouTube 채널 연결 권한과 로그인 권한의 통합
- 사용자별 세션 최대 기간이나 비활성 시간 제한
- 댓글 원문 영구 열람 상태 저장
- 안전 댓글의 자동 YouTube 조치

## 3. 확인된 근본 원인

### 3.1 사이드바

`src/app/globals.css`가 실제 현재 경로와 무관하게 `.product-navigation a:first-child`를 선택 상태로 칠한다. `AppShell`은 모든 항목을 단순한 `Link`로만 렌더링하며 현재 pathname을 읽지 않는다. 따라서 다른 메뉴로 이동해도 `개요`가 계속 선택된 것처럼 보이고, hover 상태가 선택 상태처럼 겹친다.

### 3.2 원문 조회

`POST /api/comments/[commentId]/source`는 인증 사용자용 Supabase 클라이언트로 `raw_comments`를 직접 조회한다. 그러나 초기 권한 마이그레이션은 `raw_comments`에 RLS 정책을 만들었어도 `authenticated` 역할의 테이블 `select` 권한을 철회한 뒤 다시 부여하지 않았다. 따라서 membership 조건을 평가하기 전에 테이블 권한 오류가 발생하며, Route Handler가 이를 일반적인 `source_request_failed` 500 응답으로 바꾼다.

테이블 전체 조회 권한을 다시 여는 것은 해결책이 아니다. 유해 댓글 원문이 일반 조회 경로로 노출될 수 있기 때문이다.

### 3.3 로그인 반복

현재 로그인 화면은 이메일 Magic Link만 제공한다. 로컬 Supabase는 실제 Gmail 대신 Mailpit으로 개발 이메일을 전달하므로 사용자는 로그인할 때마다 Mailpit을 열게 된다. 기존 `@supabase/ssr` 클라이언트와 Proxy는 쿠키 기반 세션 갱신 구조를 이미 갖추고 있으므로 Google OAuth를 같은 PKCE callback에 연결하면 별도의 세션 체계를 만들 필요가 없다.

## 4. 승인된 접근

**등급별 최소 노출 + 보안 RPC + Supabase Google OAuth**를 사용한다.

- 안전 댓글 원문만 Inbox 초기 조회에 포함한다.
- 주의·위험·분석 전 댓글 원문은 초기 응답에 포함하지 않는다.
- 확인한 원문은 workspace membership을 검사하는 전용 보안 RPC로만 가져온다.
- `raw_comments`의 일반 사용자 직접 조회 권한은 계속 닫아 둔다.
- Google 로그인과 YouTube 채널 연결 OAuth를 완전히 분리한다.
- 로그인 세션은 Supabase access token과 refresh token으로 자동 갱신한다.

검토했지만 선택하지 않은 접근은 다음과 같다.

- 모든 원문을 처음부터 브라우저로 보내고 CSS로 가리는 방식: 유해 댓글이 초기 HTML 또는 RSC payload에 포함되어 제품 원칙을 위반한다.
- 모든 댓글 원문을 개별 API로 다시 가져오는 방식: 안전 댓글까지 N+1 요청이 발생해 느리고 복잡하다.

## 5. 내비게이션 설계

### 5.1 컴포넌트 경계

`AppShell` 전체를 클라이언트 컴포넌트로 바꾸지 않는다. 현재 경로가 필요한 내비게이션만 `AppNavigation` 클라이언트 컴포넌트로 분리한다.

`AppNavigation`은 다음 순수 규칙을 사용한다.

- `href === "/app"`은 pathname이 정확히 `/app`일 때만 활성화한다.
- 나머지는 pathname이 href와 같거나 `${href}/`로 시작할 때 활성화한다.
- 동시에 둘 이상의 항목을 활성화하지 않는다.
- 활성 링크에는 `aria-current="page"`와 `is-active` 클래스를 지정한다.
- hover 스타일과 active 스타일은 서로 다른 상태로 보이게 한다.

예시:

| pathname | 활성 메뉴 |
| --- | --- |
| `/app` | 개요 |
| `/app/inbox` | 댓글 Inbox |
| `/app/inbox/example` | 댓글 Inbox |
| `/app/videos` | 영상 |
| `/app/connect/youtube` | YouTube 연결 |
| `/app/settings/moderation` | 운영 기준 |

## 6. 댓글 원문 노출 정책

### 6.1 공통 원칙

- DB의 `raw_comments.text_display`를 YouTube 화면에 대응하는 표시용 원문으로 사용한다.
- `text_original`과 원시 API payload는 이 UI의 응답에 포함하지 않는다.
- 작성자 표시에는 `author_display_name`, `author_avatar_url`, `published_at`을 사용한다.
- 아바타가 없으면 기존 디자인 언어에 맞는 기본 사용자 아이콘을 표시한다.
- `source_deleted_at`이 설정된 댓글은 어떤 등급에서도 원문을 보여주지 않는다.
- 원문을 펼쳤는지는 브라우저 메모리 상태로만 유지하며 새로고침 후 다시 가린다.

### 6.2 안전 댓글

등급이 정확히 `safe`이고 원문이 사용 가능한 경우:

- 작성자 프로필, 계정명, 작성 시각, `text_display`를 카드의 주요 내용으로 즉시 표시한다.
- `원문 확인` 버튼과 유해 표현 경고창을 렌더링하지 않는다.
- AI 분류 등급, 댓글 유형, 신뢰도, 추천 조치와 조치 상태는 원문 아래에 유지한다.
- 순화된 요약은 실제 댓글을 대신하는 주요 문구로 사용하지 않는다.

### 6.3 주의·위험 댓글

등급이 `caution` 또는 `risk`인 경우:

- 초기에는 작성자 계정명, 순화된 요약, AI 분석 정보만 표시한다.
- 실제 댓글은 초기 Inbox 응답, HTML과 RSC payload에 포함하지 않는다.
- 사용자가 `원문 확인`을 누르면 경고 dialog를 연다.
- 사용자가 `경고를 확인하고 원문 보기`를 눌러야 API 요청을 보낸다.
- 성공하면 기존 순화된 요약을 유지하고 그 아래에 `확인한 원문` 블록을 추가한다.
- 원문 블록에는 작성자 프로필, 계정명, 작성 시각, 실제 댓글과 수집 시각을 표시한다.
- 사용자는 원문 블록을 다시 접을 수 있다.

### 6.4 분석 전·분석 실패·등급 없음

등급이 안전으로 확정되지 않은 모든 상태는 보호 대상으로 취급한다.

- 원문을 초기 응답에 포함하지 않는다.
- `source_available`인 경우 주의 댓글과 동일한 확인 흐름을 사용한다.
- 분석 상태 안내는 기존대로 유지한다.

## 7. Inbox 읽기 모델

### 7.1 초기 목록

`get_inbox_page` 반환값에 다음 필드를 추가한다.

```ts
safe_source_text: string | null
```

DB 함수는 다음 조건에서만 `raw_comments.text_display`를 반환한다.

```text
review_level = safe
AND source_deleted_at IS NULL
```

나머지 모든 경우 `safe_source_text`는 `null`이다. TypeScript `InboxItem`에서는 `safeSourceText: string | null`로 변환한다.

검색은 기존처럼 서버에서 원문을 대상으로 수행할 수 있지만 검색 결과 응답에 보호 댓글 원문을 포함하지 않는다.

### 7.2 확인 후 원문

새로운 `security definer` DB 함수는 다음 계약을 사용한다.

```sql
get_acknowledged_comment_source(
  target_workspace_id uuid,
  target_raw_comment_id uuid
)
```

반환 필드:

```text
author_display_name
author_avatar_url
published_at
text_display
captured_at
```

함수 요구사항:

- `auth.uid()`가 없으면 거부한다.
- `is_workspace_member(target_workspace_id)`가 false면 거부한다.
- 대상 댓글의 `workspace_id`가 정확히 일치해야 한다.
- `source_deleted_at IS NULL`인 댓글만 반환한다.
- `authenticated`와 `service_role`에만 실행 권한을 부여한다.
- `public`과 `anon`의 실행 권한은 철회한다.
- 다른 workspace의 댓글과 존재하지 않는 댓글은 애플리케이션에서 동일한 not-found 결과로 처리한다.

HTTP 경고 동의는 기존처럼 Route Handler 요청의 `acknowledged: true`로 검사한다. DB 함수명에 `acknowledged`가 포함되는 것은 전용 원문 열람 경로라는 의도를 나타내며, 실제 사용자 동의 검증은 Route Handler가 담당한다.

## 8. 원문 API와 UI 컴포넌트

### 8.1 Route Handler

`POST /api/comments/[commentId]/source`는 직접 테이블 조회를 제거하고 위 RPC를 호출한다.

요청:

```json
{ "acknowledged": true }
```

성공 응답:

```json
{
  "authorDisplayName": "작성자",
  "authorAvatarUrl": null,
  "publishedAt": "2026-07-24T00:00:00.000Z",
  "textDisplay": "실제 댓글",
  "capturedAt": "2026-07-24T00:01:00.000Z"
}
```

응답에는 `text_original`, `author_channel_id`, 원시 payload를 포함하지 않는다.

### 8.2 표시 컴포넌트

원문 표시 모양은 재사용 가능한 `CommentSourceBlock`으로 분리한다.

- 안전 댓글은 서버에서 받은 `safeSourceText`와 Inbox 작성자 메타데이터로 즉시 렌더링한다.
- 주의·위험 댓글은 `SourceReveal`이 API 응답을 받은 뒤 같은 컴포넌트를 사용한다.
- `SourceReveal`은 경고 dialog, loading, error, expanded/collapsed 상태만 관리한다.

경고 dialog는 다음 접근성 기준을 지킨다.

- `role="dialog"`와 `aria-modal="true"`
- 제목과 설명 연결
- Escape로 닫기
- 열릴 때 확인 가능한 요소로 focus 이동
- 닫힌 뒤 `원문 확인` 버튼으로 focus 복귀

## 9. Google 로그인과 세션

### 9.1 로그인 화면

- 기본 CTA는 `Google로 계속하기`다.
- 로그인 버튼은 브라우저 Supabase 클라이언트의 `signInWithOAuth({ provider: "google" })`를 호출한다.
- OAuth `redirectTo`는 현재 origin의 `/auth/callback`과 검증된 내부 `next` 경로를 사용한다.
- 이메일 Magic Link는 `다른 방법으로 로그인` details 안에 유지한다.
- Google 로그인을 사용한 경우 Mailpit을 열 필요가 없다.

### 9.2 OAuth 분리

로그인용 Google OAuth:

- `openid`
- `userinfo.email`
- `userinfo.profile`

YouTube 채널 연결용 OAuth:

- 기존 YouTube 전용 경로와 별도 client/configuration을 유지한다.
- 로그인 시 YouTube 관리 scope를 요청하지 않는다.
- Google 로그인 provider token을 YouTube API용 토큰으로 저장하거나 재사용하지 않는다.

### 9.3 세션 유지

- 기존 `@supabase/ssr` cookie 기반 PKCE 흐름을 유지한다.
- access token 만료는 현재 Proxy가 refresh token으로 자동 갱신한다.
- `jwt_expiry = 3600`, refresh token rotation과 10초 reuse interval을 유지한다.
- `[auth.sessions]`의 timebox와 inactivity timeout을 설정하지 않는다.
- 따라서 동일 브라우저에서는 브라우저를 재시작해도 사용자가 로그아웃하거나 Supabase 세션이 보안상 폐기되기 전까지 로그인 상태를 유지한다.
- Google provider token 장기 보관은 필요하지 않다. CommentHawk 로그인 유지에는 Supabase refresh token을 사용한다.

### 9.4 로그아웃

- 사이드바 하단에 명시적인 `로그아웃` 버튼을 추가한다.
- 로그아웃은 Supabase `signOut()`을 호출하여 현재 브라우저 세션을 폐기한다.
- 성공 후 `/auth/sign-in`으로 이동하고 보호된 페이지의 캐시를 다시 사용하지 않는다.
- 실패 시 세션 상태를 다시 확인하고 사용자에게 재시도 가능한 오류를 표시한다.

## 10. Google OAuth 설정

### 로컬

`supabase/config.toml`에 Google provider를 활성화한다.

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
skip_nonce_check = false
```

로컬 Google OAuth Web Client에는 다음을 등록한다.

```text
Authorized JavaScript origin:
http://localhost:3000
http://127.0.0.1:3000

Authorized redirect URI:
http://127.0.0.1:54321/auth/v1/callback
```

애플리케이션 callback은 Google 로그인을 시작한 브라우저 origin으로 만든다. callback Route는 요청 origin이 설정된 `APP_ORIGIN`과 같거나, HTTP·포트가 동일한 로컬 `localhost/127.0.0.1` 쌍일 때만 같은 origin에서 코드 교환과 최종 이동을 완료한다. 이 방식으로 PKCE 검증 쿠키와 세션 쿠키를 같은 호스트에 유지한다. 그 밖의 요청 origin은 `APP_ORIGIN`으로 제한한다.

비밀 값은 `.env.local` 또는 로컬 shell 환경에만 저장하고 커밋하지 않는다. `.env.example`에는 변수명만 추가한다.

### 배포

- Google Auth Platform에 실제 서비스 origin과 Supabase hosted callback URL을 등록한다.
- Supabase Dashboard에서 Google provider의 Client ID와 Client Secret을 설정한다.
- Supabase URL Configuration에 실제 Site URL과 `/auth/callback` redirect URL을 등록한다.
- Vercel에는 애플리케이션이 직접 필요로 하는 공개 Supabase URL과 publishable/anon key만 설정하고 Google Client Secret을 클라이언트 환경 변수로 노출하지 않는다.

참고:

- [Supabase Login with Google](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Supabase Server-Side Auth](https://supabase.com/docs/guides/auth/server-side)
- [Supabase User Sessions](https://supabase.com/docs/guides/auth/sessions)

## 11. 오류 처리

### 내비게이션

- 알 수 없는 하위 경로에서는 prefix가 일치하는 가장 구체적인 메뉴만 활성화한다.
- 어떤 메뉴와도 일치하지 않으면 활성 상태를 강제로 만들지 않는다.

### 원문

| 상황 | 사용자 응답 |
| --- | --- |
| 경고 동의 없음 | 원문 요청을 보내지 않음 |
| 세션 만료 | 안전한 `next` 경로를 포함해 로그인 화면으로 이동 |
| 댓글 없음·다른 workspace·삭제됨 | `원문을 더 이상 확인할 수 없습니다` |
| 일시적인 DB 오류 | dialog를 유지하고 `다시 시도` 제공 |
| 성공 | 순화 요약 아래에 원문 블록 표시 |

서버 로그에는 실제 댓글, access token, refresh token과 Google credential을 남기지 않는다. 구조화된 오류 코드와 요청 식별자만 기록한다.

### 인증

| 상황 | 사용자 응답 |
| --- | --- |
| Google 로그인 취소 | 로그인 화면 유지, 재시도 및 Magic Link 제공 |
| Google provider 미설정 | 개발 환경에서 필요한 설정 이름 안내 |
| callback code 없음·만료 | 기존 `expired` 오류 안내 |
| 안전하지 않은 `next` | `/app`으로 이동 |
| 로그아웃 실패 | 현재 세션 재확인 후 재시도 안내 |

## 12. 테스트 전략

### 내비게이션 단위 테스트

- `/app`에서 `개요`만 활성화
- `/app/inbox`와 하위 경로에서 `댓글 Inbox`만 활성화
- 영상, YouTube 연결, 운영 기준 경로
- hover 전용 CSS와 active 전용 CSS가 분리됨
- 활성 링크 하나만 `aria-current="page"`를 가짐

### Inbox 컴포넌트 테스트

- 안전 댓글은 작성자와 실제 댓글을 즉시 표시
- 안전 댓글에는 `원문 확인` 버튼이 없음
- 주의·위험 댓글은 초기 DOM에 실제 댓글이 없음
- 경고 확인 전에는 API를 호출하지 않음
- 확인 후 순화 요약과 작성자·원문을 동시에 표시
- 접기 후 원문을 화면에서 제거
- 분석 전·실패·등급 없음 댓글은 자동 노출되지 않음
- 원문 오류 시 다시 시도 가능

### 서비스와 Route Handler 테스트

- `acknowledged !== true` 요청 거부
- 성공 응답에 승인된 DTO 필드만 존재
- RPC 오류 코드를 HTTP 상태와 사용자 오류로 변환
- 응답과 로그에 원시 payload나 token이 없음

### DB 테스트

- `get_inbox_page.safe_source_text`는 안전·원문 사용 가능 조건에서만 값이 있음
- 주의·위험·분석 전·삭제된 댓글은 `safe_source_text IS NULL`
- workspace 회원은 소유 댓글의 원문 RPC 사용 가능
- 다른 workspace와 anon은 원문 RPC 사용 불가
- `raw_comments` 직접 select 권한은 authenticated에 부여되지 않음

### 인증 테스트

- Google OAuth URL이 Google provider와 안전한 callback을 사용
- 외부 `next`와 backslash 기반 우회 경로 거부
- callback이 PKCE code를 session으로 교환
- Proxy가 유효한 세션을 갱신하고 보호 경로를 유지
- 로그아웃이 세션을 폐기하고 로그인 화면으로 이동
- Magic Link가 접힌 보조 방식에서도 작동

### E2E

- fixture 로그인 경로는 회귀 테스트용으로 유지
- 사이드바 이동 후 활성 상태 검증
- fixture 안전 댓글 즉시 표시
- fixture 주의·위험 댓글 경고 확인 후 원문 표시
- 로그아웃 후 보호 페이지 접근 차단
- 실제 Google credential을 CI fixture로 커밋하거나 네트워크 테스트하지 않음

## 13. 완료 기준

- 모든 제품 경로에서 사이드바 활성 항목이 정확히 하나다.
- 안전 댓글은 사용자 정보와 실제 댓글이 즉시 보인다.
- 주의·위험 댓글은 확인 전 실제 댓글이 네트워크 응답과 DOM에 없다.
- 확인 후 순화된 요약 아래에 사용자 정보와 실제 댓글이 보인다.
- 원문 API가 더 이상 `raw_comments` 직접 select 권한 오류로 실패하지 않는다.
- 다른 workspace의 원문을 확인할 수 없다.
- Google 로그인이 기본 수단으로 작동한다.
- 동일 브라우저에서 사용자가 로그아웃할 때까지 Supabase 세션이 갱신된다.
- Magic Link는 보조 로그인 방식으로 남아 있다.
- 로그아웃 버튼이 실제 세션을 폐기한다.
- `npm test`, DB 테스트, E2E, `npm run lint`, `npx tsc --noEmit`, `npm run build`가 통과한다.
