# YouTube 연결과 댓글 가져오기 프롬프트

## 문서 목적

실제 Google OAuth와 YouTube Data API를 연결해 사용자가 자신의 채널에서 영상 하나를 선택하고 댓글 20~50개를 가져오게 한다. 이 단계에서는 AI 분석을 구현하지 않는다.

## 적용 시점

5번의 기반 구현이 검증됐고, Supabase와 Google Cloud 프로젝트의 실제 자격 증명이 준비됐을 때 사용한다.

## 복사용 영문 프롬프트

```text
Implement the approved YouTube connection and real comment-ingestion milestone for CommentHawk.

Do not implement AI analysis or fine-tuning in this milestone. Preserve the established UI and domain boundaries. Use docs/product-context.md and AGENTS.md as the source of truth.

Before coding:

1. Re-inspect the current repository, migrations, service interfaces, tests, package.json, and .env.example.
2. Read the relevant local Next.js 16 documentation under node_modules/next/dist/docs.
3. Verify the current official Google OAuth and YouTube Data API documentation before selecting scopes or API methods.
4. Confirm that secrets and refresh tokens never reach browser code.

Implement this exact user flow:

1. Sign in to the CommentHawk application.
2. Connect one owned YouTube channel through Google OAuth.
3. Load the connected channel and a small list of its recent videos.
4. Let the user select exactly one video.
5. Import a controlled batch of 20-50 real top-level comments and available replies.
6. Persist the import and show the real source records in an unclassified Comment Inbox state.

OAuth requirements:

- Use Google's official server-side client library.
- Use state validation and a secure callback flow.
- Request the minimum read scope needed for connection and import.
- Request any broader moderation scope only when the user explicitly enables moderation features.
- Support offline access when refresh is required.
- Encrypt stored refresh tokens and separate application authentication from YouTube authorization.
- Support disconnect, revoked access, expired tokens, insufficient permission, and callback failure.
- Document every required variable in .env.example without committing values.

Import requirements:

- Preserve channel ID, video ID, video title, video URL, comment ID, parent ID, author display name, author channel identifier and URL when available, original displayed text, published and updated timestamps, moderation status when available, captured timestamp, and import batch ID.
- Keep the original comment text immutable.
- Make imports idempotent using stable YouTube identifiers and explicit uniqueness constraints.
- Handle pagination without importing more than the approved limit.
- Record import progress, item counts, last successful synchronization time, partial failures, and retryable errors.
- Handle disabled comments, unavailable videos, quota errors, network errors, permission loss, and deleted source comments.
- Never replace an existing source comment with future AI or sanitized text.

UI requirements:

- Show connected and disconnected states accurately.
- Show the selected channel and video source.
- Show import progress and the number of records actually stored.
- Clearly mark imported comments as not yet analyzed.
- Do not mix test fixtures or mock comments into the connected data path.
- Keep harmful comment text hidden by default where the existing UI supports source-text protection.
- Use optimistic UI only when a failed request can be rolled back safely.

Moderation boundaries:

- Do not add automatic moderation.
- Do not use unsupported or deprecated API methods.
- If any moderation action is included in the approved plan, preserve evidence first, ask for explicit confirmation, record the request and result, and keep the original source unchanged.

Add tests for OAuth state handling, token boundary enforcement, comment transformation, pagination limits, idempotent imports, tenant isolation, partial failures, and the channel → video → import flow. Mock Google responses in automated tests; never call the live API from the test suite.

Run:

- npm test
- npm run lint
- npm run build

At completion, report migrations, scopes, environment variables, imported fields, test results, unresolved Google verification requirements, and the exact manual steps needed to verify a real import.
```

## 완료 기준

실제 채널과 영상 출처가 표시되고, 선택한 영상의 댓글 20~50개가 중복 없이 저장되며, Comment Inbox에서 미분석 상태의 실제 데이터임을 확인할 수 있어야 한다.

다음 단계는 [7. AI 분류와 개인화·Comment Inbox 프롬프트](./07-ai-분류와-개인화-comment-inbox-프롬프트.md)다.
