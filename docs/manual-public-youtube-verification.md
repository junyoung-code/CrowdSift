# 공개 YouTube URL 읽기 전용 모드 검증 가이드

작성일: 2026-07-24

적용 범위: 로컬 개발 환경

관련 설계: `docs/superpowers/specs/2026-07-24-public-youtube-read-only-dev-mode-design.md`

## 로그인 방식과 로컬 Google 설정

CommentHawk의 기본 로그인은 Supabase Auth를 통한 Google 로그인이다. 로그인용 Google OAuth는 CommentHawk 사용자 신원을 확인하는 용도이고, YouTube OAuth는 채널 조회·댓글 조치 권한을 받는 용도다. 두 흐름의 토큰과 환경 변수, callback을 서로 섞지 않는다.

Google Cloud의 로그인용 OAuth 2.0 웹 클라이언트에는 다음 로컬 값을 등록한다.

| 항목 | 로컬 값 |
|---|---|
| 앱 origin | `http://localhost:3000` |
| Google Authorized JavaScript origin | `http://localhost:3000` |
| Google Authorized redirect URI | `http://127.0.0.1:54321/auth/v1/callback` |
| Supabase Auth 이후 앱 callback | `http://localhost:3000/auth/callback` |

PKCE 검증 쿠키는 로그인을 시작한 브라우저 호스트에 묶인다. 따라서 앱은 `localhost`에서 시작한 로그인은 `localhost` callback으로, `127.0.0.1`에서 시작한 로그인은 `127.0.0.1` callback으로 완료한다. callback Route는 설정된 `APP_ORIGIN`과 같은 origin 또는 포트가 같은 로컬 `localhost/127.0.0.1` 쌍만 허용하며, 그 밖의 호스트는 `APP_ORIGIN`으로 되돌린다.

로컬 Supabase를 시작하는 셸에 로그인 전용 값을 서버 환경 변수로 전달한다. 실제 값은 터미널 기록, 문서, Git에 남기지 않는다.

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=<login-client-id> \
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=<login-client-secret> \
npm run db:start
```

Google 설정 없이 결정적인 로컬 테스트만 실행할 때는 로그인 화면의 `다른 방법으로 로그인`을 열어 Magic Link를 사용한다. 로컬 메일은 Gmail이 아니라 Mailpit(`http://127.0.0.1:54324`)에서 확인한다.

로그인에 성공하면 Supabase refresh token과 Next.js proxy가 세션을 갱신한다. 별도 시간 제한을 두지 않았으므로 같은 브라우저에서는 사용자가 `로그아웃`을 누르거나 보안상 세션이 폐기될 때까지 로그인 상태가 유지된다.

## 이 모드가 하는 일

CommentHawk에 로그인한 개발자가 공개 YouTube 영상 URL을 입력하면, 해당 영상의 공개 댓글을 OAuth 없이 읽어 기존 분류 파이프라인과 Comment Inbox에서 확인한다.

- 영상 소유자의 계정 인증은 필요하지 않다.
- 공개 상태이고 댓글이 활성화된 영상만 읽을 수 있다.
- API Key로는 영상 소유권이나 숨김·삭제 권한이 생기지 않는다.
- 최상위 댓글과 답글을 합쳐 `20 / 50 / 100 / 1,000`개 중 하나를 선택한다.
- 기본값과 첫 live 검증 값은 `20`이다.
- 공개 URL 결과의 판단 수정은 감사 기록으로만 남기며 개인화 RAG나 학습 데이터로 사용하지 않는다.

## 1. 비용이 발생하지 않는 fixture 검증

fixture 모드는 YouTube와 OpenAI를 호출하지 않는 결정적 로컬 테스트다. 화면 상단과 영상 미리보기에 항상 `TEST FIXTURE`가 표시되어야 한다.

`.env.local`에는 실제 비밀값을 문서나 Git에 기록하지 말고 다음 설정만 둔다.

```dotenv
APP_ORIGIN=http://localhost:3000
EXTERNAL_PROVIDER_MODE=fixture
ALLOW_FIXTURE_PROVIDERS=true
ENABLE_PUBLIC_YOUTUBE_DEV_MODE=true
```

검증 순서:

- [ ] `npm run db:start`로 로컬 Supabase를 시작한다.
- [ ] `npm run dev`로 앱을 시작한다.
- [ ] `/auth/sign-in`에서 `Google로 계속하기`가 기본 로그인으로 보이는지 확인한다.
- [ ] `다른 방법으로 로그인`을 열고 테스트 이메일로 로그인 링크를 요청한다.
- [ ] `http://127.0.0.1:54324`의 Mailpit에서 링크를 연다.
- [ ] `/app/connect/youtube`에서 `TEST FIXTURE`를 확인한다.
- [ ] `https://www.youtube.com/watch?v=fixture0001`을 입력한다.
- [ ] 댓글 수 기본값이 `20`인지 확인한다.
- [ ] `영상 확인` 후 fixture 영상과 `공개 URL · 읽기 전용` 표시를 확인한다.
- [ ] `댓글 가져오기 및 분석 시작`을 누른다.
- [ ] 확인 20개, 최상위 16개, 답글 4개로 완료되는지 확인한다.
- [ ] Comment Inbox에서 안전 댓글은 원문과 작성자 정보가 바로 보이는지 확인한다.
- [ ] 주의·위험 댓글은 순화 요약만 먼저 보이고, 경고 확인 후 원문이 아래에 펼쳐지는지 확인한다.
- [ ] 펼친 원문을 `원문 접기`로 다시 숨길 수 있는지 확인한다.
- [ ] 공개 URL 카드에 YouTube 숨김·삭제 버튼이 없는지 확인한다.

자동 검증:

```bash
npm run test:e2e -- e2e/public-youtube-read-only.spec.ts
```

이 E2E는 브라우저와 Next.js 서버 양쪽에서 Google·OpenAI 요청을 차단하고, fixture provider만으로 로그인부터 Inbox까지 확인한다.

## 2. 실제 공개 영상으로 live 검증

### Google Cloud 준비

1. 별도 개발용 Google Cloud 프로젝트를 선택하거나 만든다.
2. API Library에서 `YouTube Data API v3`를 활성화한다.
3. Credentials에서 서버용 API Key를 만든다.
4. API restriction을 `YouTube Data API v3`로 제한한다.
5. 배포 환경에서는 서버의 고정 IP 등 운영 방식에 맞는 application restriction도 적용한다.
6. API Key를 브라우저 코드, 로그, 문서, Git에 넣지 않는다.

공식 참고:

- [YouTube Data API 시작하기](https://developers.google.com/youtube/v3/getting-started)
- [YouTube Data API 레퍼런스](https://developers.google.com/youtube/v3/docs)
- [Google Cloud API Key 관리](https://cloud.google.com/docs/authentication/api-keys)

### 로컬 환경 설정

`.env.local`의 값은 각 개발자가 직접 입력하고 커밋하지 않는다.

```dotenv
APP_ORIGIN=http://localhost:3000
EXTERNAL_PROVIDER_MODE=live
ALLOW_FIXTURE_PROVIDERS=false
ENABLE_PUBLIC_YOUTUBE_DEV_MODE=true
YOUTUBE_PUBLIC_API_KEY=<server-only key>
OPENAI_API_KEY=<server-only key>
OPENAI_STAGE1_MODEL=<approved stage-1 model>
OPENAI_STAGE2_MODEL=<approved stage-2 model>
OPENAI_EMBEDDING_MODEL=<approved embedding model>
```

서버를 재시작한 뒤 화면에 `TEST FIXTURE`가 보이면 live 검증을 중단한다. 실제 Key를 fixture 모드와 섞어 시험하지 않는다.

### 단계별 체크리스트

각 단계는 앞 단계가 완전히 성공한 뒤에만 진행한다.

#### 20개

- [ ] 공개 상태이고 댓글이 활성화된 테스트 영상 URL을 입력한다.
- [ ] 제목, 채널, 댓글 가능 여부가 올바른지 확인한다.
- [ ] 예상 YouTube quota와 OpenAI 비용 범위를 확인한다.
- [ ] 총 댓글 수 `20`으로 명시적 실행을 승인한다.
- [ ] 최상위 댓글과 답글의 합이 20 이하인지 확인한다.
- [ ] 모든 답글의 부모 댓글이 같은 작업에 포함됐는지 확인한다.
- [ ] Inbox에서 `공개 URL · 읽기 전용`과 분석 결과를 확인한다.

#### 50개

- [ ] 20개 실행에 오류, 과도한 비용, 잘못된 분류가 없을 때만 `50`으로 실행한다.
- [ ] 중복 수, 부분 실패, token 사용량과 처리 시간을 기록한다.

#### 100개

- [ ] 50개 실행 결과를 검토한 뒤에만 `100`으로 실행한다.
- [ ] YouTube quota와 OpenAI 비용 증가가 예상 범위인지 확인한다.

#### 1,000개

- [ ] 100개 실행이 안정적이고 비용을 승인했을 때만 `1,000`으로 실행한다.
- [ ] 개발 모드의 서버 하드 상한이 1,000임을 확인한다.
- [ ] 장시간 실행, 부분 실패, 중복과 재실행 idempotency를 별도로 검토한다.

## 3. 검증 기록 양식

| 항목 | 기록 |
|---|---|
| 실행 일시 |  |
| 개발자 |  |
| 영상 ID | URL 전체 대신 ID만 기록 가능 |
| 요청 총 수 | 20 / 50 / 100 / 1,000 |
| 확인 / 신규 / 중복 / 실패 |  |
| 최상위 / 답글 |  |
| YouTube quota units |  |
| Stage 1 모델 / input / output token |  |
| Stage 2 모델 / input / output token |  |
| embedding 모델 / token |  |
| 추정 비용 / 계산 비용 |  |
| 처리 시간 |  |
| 부분 실패와 재시도 |  |
| Inbox 검토 결과 |  |

YouTube 요청량은 댓글 개수만이 아니라 필요한 API 페이지와 추가 답글 페이지 수에 따라 증가한다. OpenAI 비용은 분석한 텍스트와 출력 token, 2차 분석 대상 수, embedding 사용량에 따라 증가한다. 실제 검증에서는 화면의 실행 전 추정치와 저장된 실행 후 token/cost snapshot을 함께 기록한다.

## 4. Mailpit으로 메일이 오는 이유

로컬 Supabase CLI는 실제 Gmail로 메일을 전송하지 않고 Mailpit이 개발용 인증 메일을 가로채도록 구성된다. 그래서 로그인 링크는 `http://127.0.0.1:54324`에서 확인한다. 이는 실제 사용자에게 테스트 메일이 발송되는 것을 막고 이메일 인증 흐름을 안전하게 반복하기 위한 동작이다.

프로덕션에서는 Mailpit을 사용하지 않는다. Supabase 프로젝트에 별도의 SMTP 제공자를 설정하고 발신 도메인, redirect URL, rate limit과 전달 성공 여부를 검증해야 한다.

공식 참고:

- [Supabase 로컬 Auth 이메일 테스트](https://supabase.com/docs/guides/local-development/cli/testing-and-linting)
- [Supabase 로컬 설정](https://supabase.com/docs/guides/local-development/cli/config)

## 5. 실패 상황별 확인

| 증상 | 먼저 확인할 항목 |
|---|---|
| 영상 없음 | URL 형식, 비공개·삭제 영상 여부 |
| 댓글 사용 불가 | 영상의 댓글 비활성화 여부 |
| quota 초과 | Google Cloud의 당일 quota 사용량과 API Key 제한 |
| 분석 실패 | OpenAI Key, 승인 모델명, schema 재시도 기록 |
| 일부 댓글만 저장 | job의 실패 수, 페이지 token, 답글 조회 오류 |
| 로그인 링크가 Gmail에 없음 | 로컬에서는 Mailpit을 보는 것이 정상 |
| Google 로그인을 시작할 수 없음 | 로그인용 Google client ID/secret, `http://127.0.0.1:54321/auth/v1/callback`, Supabase 재시작 여부 |
| Google 로그인 후 원래 화면으로 돌아오지 않음 | `APP_ORIGIN`, `/auth/callback` allow-list, `next`가 `/app` 내부 경로인지 확인 |
| 숨김·삭제 버튼이 없음 | 공개 URL은 읽기 전용이므로 정상 |

## 6. 완료 기준

- [ ] fixture E2E가 외부 API 호출 0건으로 통과한다.
- [ ] live 20개 실행을 먼저 완료하고 비용과 quota를 기록한다.
- [ ] 답글 없는 최상위 댓글이 누락되지 않는다.
- [ ] 저장된 모든 답글에 같은 작업 안의 부모 댓글이 있다.
- [ ] 공개 URL 결과에서 개인화·학습 opt-in과 moderation이 차단된다.
- [ ] 안전 댓글 원문은 즉시 보이고 주의·위험 원문은 확인 전 HTML에 포함되지 않는다.
- [ ] 새로고침 후에도 로그인 상태가 유지되고 로그아웃 후 `/auth/sign-in`으로 이동한다.
- [ ] production 환경에서는 공개 URL 개발 모드와 fixture provider가 활성화되지 않는다.
