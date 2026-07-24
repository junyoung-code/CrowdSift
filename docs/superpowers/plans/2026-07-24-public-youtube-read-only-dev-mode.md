# Public YouTube Read-Only Development Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인한 개발자가 YouTube OAuth 없이 공개 영상 URL을 미리보고, 답글을 포함한 실제 댓글을 기본 20개부터 최대 1,000개까지 가져와 규칙·2단계 AI로 분석한 뒤 Comment Inbox에서 `공개 URL · 읽기 전용` 출처로 안전하게 검토할 수 있게 한다.

**Architecture:** 기존 OAuth 기반 `YouTubeProvider`와 별도로 서버 API Key만 사용하는 쓰기 capability 없는 `PublicYouTubeReadProvider`를 둔다. URL parser, preview, 총 댓글 수 collector, persisted import job, 기존 ingestion/analysis pipeline, cost snapshot, source-aware feedback/moderation guard를 순서대로 연결한다. 공개 출처의 읽기 전용 성격은 UI, server/domain, PostgreSQL transaction 세 경계에서 강제하고 기존 OAuth 흐름은 그대로 유지한다.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5, Supabase/Postgres/RLS, Google YouTube Data API v3, OpenAI Responses/Embeddings API, Zod, Vitest/Testing Library, Playwright, Supabase CLI.

## Global Constraints

- 구현 기준은 `docs/superpowers/specs/2026-07-24-public-youtube-read-only-dev-mode-design.md`, `docs/product-context.md`, `AGENTS.md` 순서다.
- `NODE_ENV=production`에서는 공개 URL 개발 모드를 절대 초기화하거나 렌더링하지 않는다.
- `YOUTUBE_PUBLIC_API_KEY`는 server-only이며 client props, HTML, URL, 로그, DB, audit metadata에 기록하지 않는다.
- 지원 URL에서 영상 ID만 추출하고 임의 URL을 fetch하지 않는다.
- 요청 수는 답글 포함 총 댓글 수이며 `20 / 50 / 100 / 1000`만 허용하고 기본값은 `20`, 하드 상한은 `1000`이다.
- 답글이 없는 최상위 댓글도 포함하고, 답글을 포함할 때는 부모를 먼저 포함한다.
- 공개 출처는 YouTube moderation, personalization, training에 사용할 수 없다.
- 유해 가능성이 있는 원문은 기본적으로 가리고 명시적 요청 전에는 전체 원문을 HTML에 포함하지 않는다.
- Fixture는 항상 `TEST FIXTURE`로 표시하며 실제 API 결과처럼 표현하지 않는다.
- 외부 API 호출은 사용자의 `댓글 가져오기 및 분석 시작` 확인 뒤에만 수행한다.
- 기존 dirty worktree와 사용자 소유 `src/app/globals 2.css`를 보존한다. 각 commit 전 `git diff -- <task paths>`로 범위를 확인하고 해당 Task 파일만 stage한다.
- 구현 전에 관련 Next.js 16 로컬 문서를 읽고 Server Action 입력을 신뢰하지 않으며 매번 auth/workspace와 source context를 재검증한다.
- 완료 보고 전 `npm test`, `npm run db:test`, `npm run test:e2e`, `npm run lint`, `npm run build`를 실행한다.

---

## Delivery Map

```text
Task 1  환경 gate·URL parser
  └─ Task 2  공개 YouTube provider·미리보기
       └─ Task 3  DB provenance·총 수·비용 snapshot
            └─ Task 4  부모 보존형 총 댓글 collector
                 └─ Task 5  공개 import job·처리·진행 상태
Task 6  명시적 AI routing·모델 분리·비용 계산
Task 7  공개 출처 feedback/moderation 3중 guard
Task 8  연결 화면·Inbox·dashboard 출처 UI
Task 9  fixture E2E·회귀·로컬 live 검증
```

## File Responsibility Map

- `src/lib/env.ts`: 개발 기능 flag, 서버 API Key, Stage 1/2/embedding model 환경 계약.
- `src/features/youtube/public-video-url.ts`: 허용 URL parse/canonicalize 순수 함수.
- `src/features/youtube/public-read-contracts.ts`: 공개 읽기 provider-owned DTO와 오류 계약.
- `src/features/youtube/google-public-read-provider.ts`: API Key 기반 영상·댓글 read adapter.
- `src/features/youtube/public-preview-service.ts`: auth 이후 미리보기 orchestration.
- `src/features/ingestion/public-comment-collector.ts`: 총 수 cap, pagination, 부모-답글 무결성, quota 계수.
- `src/features/ingestion/public-import-service.ts`: 공개 job 생성과 기존 ingestion/analysis 연결.
- `supabase/migrations/202607240022_public_youtube_read_mode.sql`: source provenance와 총 수 제약.
- `supabase/migrations/202607240023_analysis_job_costs.sql`: 가격 snapshot과 source-aware DB guard.
- `src/features/analysis/stage-one-routing.ts`: 코드가 강제하는 review-level 하한과 Stage 2 trigger.
- `src/features/analysis/cost-estimator.ts`: 실행 전 범위와 실행 후 usage 기반 비용 계산.
- `src/features/analysis/openai-analysis-provider.ts`: Stage 1/Stage 2 model 분리.
- `src/app/(product)/app/connect/youtube/public-video-actions.ts`: preview/start Server Actions.
- `src/features/youtube/public-video-import-panel.tsx`: URL, preview, 수량, 비용, 확인, 진행 UI.
- `src/features/inbox/*`: 공개 URL 출처 배지와 read-only action 상태.
- `src/features/feedback/*`, `src/features/moderation/*`: source-aware server/domain guard.
- `e2e/public-youtube-read-only.spec.ts`: 외부 호출 없는 fixture 수직 흐름.

---

### Task 1: 개발 기능 gate, 환경 계약, YouTube URL parser

**Files:**
- Modify: `.env.example`
- Modify: `src/lib/env.ts`
- Create: `src/features/youtube/public-dev-mode.ts`
- Create: `src/features/youtube/public-video-url.ts`
- Test: `src/features/youtube/public-dev-mode.test.ts`
- Test: `src/features/youtube/public-video-url.test.ts`

**Interfaces:**
- Produces: `getPublicYouTubeDevMode(env): PublicYouTubeDevMode`, `parsePublicYouTubeVideoUrl(input): PublicVideoReference`.
- Consumes: 없음.

- [x] **Step 1: Next.js 16 환경변수와 server/client 경계 문서를 끝까지 읽는다**

Run:

```bash
sed -n '1,260p' node_modules/next/dist/docs/01-app/02-guides/environment-variables.md
sed -n '1,280p' node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md
```

Expected: non-`NEXT_PUBLIC_` 환경변수는 server-only이며 Client Component에 전달하지 않아야 함을 확인한다.

- [x] **Step 2: 실패 테스트를 작성한다**

```ts
it.each([
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ["https://youtu.be/dQw4w9WgXcQ?t=3", "dQw4w9WgXcQ"],
  ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
])("parses %s", (input, videoId) => {
  expect(parsePublicYouTubeVideoUrl(input)).toEqual({
    videoId,
    canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
  });
});

it.each([
  "https://example.com/watch?v=dQw4w9WgXcQ",
  "https://youtube.com/channel/UC123",
  "javascript:alert(1)",
])("rejects unsupported input %s", (input) => {
  expect(() => parsePublicYouTubeVideoUrl(input)).toThrow("지원하는 YouTube 영상 URL");
});

it("rejects public mode in production even when the flag is true", () => {
  expect(() =>
    getPublicYouTubeDevMode({
      NODE_ENV: "production",
      ENABLE_PUBLIC_YOUTUBE_DEV_MODE: "true",
      YOUTUBE_PUBLIC_API_KEY: "secret",
    }),
  ).toThrow("production");
});
```

Run:

```bash
npx vitest run src/features/youtube/public-dev-mode.test.ts src/features/youtube/public-video-url.test.ts
```

Expected: FAIL because the modules do not exist.

- [x] **Step 3: 최소 환경 gate와 parser를 구현한다**

```ts
export const PUBLIC_COMMENT_COUNTS = [20, 50, 100, 1000] as const;

export function getPublicYouTubeDevMode(env: PublicModeEnv) {
  const requested = env.ENABLE_PUBLIC_YOUTUBE_DEV_MODE === "true";
  if (env.NODE_ENV === "production" && requested) {
    throw new Error("Public YouTube development mode cannot run in production");
  }
  return {
    enabled: requested && env.NODE_ENV !== "production",
    configured: Boolean(env.YOUTUBE_PUBLIC_API_KEY),
  };
}
```

`parsePublicYouTubeVideoUrl`은 `URL`로 parse하고 정확한 host/path만 허용하며 영상 ID를 `^[A-Za-z0-9_-]{11}$`로 검증한 뒤 canonical URL만 반환한다.

- [x] **Step 4: 환경 문서와 server schema를 갱신한다**

`.env.example`에 실제 값 없이 다음 이름과 로컬 전용 설명을 추가한다.

```dotenv
ENABLE_PUBLIC_YOUTUBE_DEV_MODE=false
YOUTUBE_PUBLIC_API_KEY=
OPENAI_STAGE1_MODEL=gpt-5.4-nano
OPENAI_STAGE2_MODEL=gpt-5.4-mini
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

- [x] **Step 5: 테스트를 통과시키고 Task 범위를 확인한다**

Run:

```bash
npx vitest run src/features/youtube/public-dev-mode.test.ts src/features/youtube/public-video-url.test.ts
git diff -- .env.example src/lib/env.ts src/features/youtube/public-dev-mode.ts src/features/youtube/public-video-url.ts
```

Expected: tests PASS; diff에 비밀값이 없고 production guard와 허용 URL만 포함된다.

- [x] **Step 6: Task 1을 commit한다**

```bash
git add .env.example src/lib/env.ts src/features/youtube/public-dev-mode.ts src/features/youtube/public-dev-mode.test.ts src/features/youtube/public-video-url.ts src/features/youtube/public-video-url.test.ts
git commit -m "feat: gate public YouTube development mode"
```

---

### Task 2: 공개 YouTube provider와 영상 미리보기

**Files:**
- Create: `src/features/youtube/public-read-contracts.ts`
- Create: `src/features/youtube/google-public-read-provider.ts`
- Create: `src/features/youtube/google-public-read-provider.test.ts`
- Create: `src/features/youtube/public-preview-service.ts`
- Create: `src/features/youtube/public-preview-service.test.ts`
- Modify: `src/features/youtube/provider-factory.ts`
- Test: `src/features/youtube/provider-factory.test.ts`

**Interfaces:**
- Produces: `PublicYouTubeReadProvider`, `createPublicYouTubeReadProvider(env)`, `previewPublicVideo(input, dependencies)`.
- Consumes: Task 1 `PublicVideoReference`, `getPublicYouTubeDevMode`.

- [x] **Step 1: Google provider mapping과 오류의 실패 테스트를 작성한다**

가짜 YouTube client를 주입해 다음을 검증한다.

```ts
expect(await provider.getPublicVideo("dQw4w9WgXcQ")).toEqual({
  videoId: "dQw4w9WgXcQ",
  canonicalUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: "Public test video",
  channelId: "channel-1",
  channelTitle: "Creator",
  thumbnailUrl: "https://i.ytimg.com/example.jpg",
  commentsAvailable: true,
  quotaUnitsUsed: 1,
});
expect("moderateComment" in provider).toBe(false);
```

또한 `videoNotFound`, `commentsDisabled`, `quotaExceeded`, transient provider error를 application error code로 mapping하는 테스트를 작성한다.

Run:

```bash
npx vitest run src/features/youtube/google-public-read-provider.test.ts src/features/youtube/public-preview-service.test.ts
```

Expected: FAIL because provider and service do not exist.

- [x] **Step 2: application-owned read contract를 만든다**

```ts
export interface PublicYouTubeReadProvider {
  getPublicVideo(videoId: string): Promise<PublicVideoPreview>;
  listCommentThreads(input: PublicThreadPageRequest): Promise<PublicThreadPage>;
  listReplies(input: PublicReplyPageRequest): Promise<PublicReplyPage>;
}
```

계약에는 write/moderation 메서드를 넣지 않고 SDK resource type도 노출하지 않는다.

- [x] **Step 3: API Key 기반 adapter와 factory를 구현한다**

`google.youtube({ version: "v3", auth: apiKey })`를 server module 안에서만 만들고:

- `videos.list(part=["snippet","statistics"], id=[videoId])`
- `commentThreads.list(part=["snippet","replies"], order="time", textFormat="plainText")`
- `comments.list(part=["snippet"], parentId, textFormat="plainText")`

만 호출한다. 호출별 quota unit을 반환 DTO에 누적 가능하게 포함하고 API Key 자체는 오류 metadata에 넣지 않는다.

- [x] **Step 4: preview service에서 auth 이후 gate와 URL을 재검증한다**

```ts
export async function previewPublicVideo(
  input: unknown,
  deps: PreviewDependencies,
): Promise<PublicVideoPreview> {
  deps.assertAuthenticatedWorkspace();
  deps.assertDevelopmentMode();
  const reference = parsePublicYouTubeVideoUrl(previewInputSchema.parse(input).url);
  return deps.provider.getPublicVideo(reference.videoId);
}
```

미리보기는 DB import job이나 comment row를 만들지 않는다.

- [x] **Step 5: 계약 테스트를 통과시키고 commit한다**

Run:

```bash
npx vitest run src/features/youtube/google-public-read-provider.test.ts src/features/youtube/public-preview-service.test.ts src/features/youtube/provider-factory.test.ts
git diff -- src/features/youtube
```

Expected: tests PASS; public provider에 write capability가 없고 API Key가 반환값/오류에 없다.

```bash
git add src/features/youtube/public-read-contracts.ts src/features/youtube/google-public-read-provider.ts src/features/youtube/google-public-read-provider.test.ts src/features/youtube/public-preview-service.ts src/features/youtube/public-preview-service.test.ts src/features/youtube/provider-factory.ts src/features/youtube/provider-factory.test.ts
git commit -m "feat: add public YouTube preview provider"
```

---

### Task 3: DB source provenance, 총 요청 수, 비용 snapshot

**Files:**
- Create: `supabase/migrations/202607240022_public_youtube_read_mode.sql`
- Create: `supabase/migrations/202607240023_analysis_job_costs.sql`
- Create: `supabase/tests/public_youtube_read_mode.sql`
- Modify: `supabase/tests/youtube_selection.sql`
- Generate: `src/types/database.ts`

**Interfaces:**
- Produces: `comment_source_kind`, public import constraints, `analysis_job_costs`, source-aware SQL helpers.
- Consumes: 기존 `comment_import_jobs`, `comment_import_items`, `analysis_jobs`, `model_runs`.

- [x] **Step 1: 현재 schema와 Supabase test 패턴을 확인한다**

Run:

```bash
rg -n "create table public.comment_import_jobs|create table public.analysis_jobs|create function.*moderation|requested_top_level_count" supabase/migrations supabase/tests
sed -n '1,260p' supabase/tests/youtube_selection.sql
```

Expected: 기존 owned OAuth 제약, RLS helper, moderation transaction의 실제 이름을 확인한다.

- [x] **Step 2: DB 실패 테스트를 먼저 작성한다**

`public_youtube_read_mode.sql`에 pgTAP으로 다음을 검증한다.

- 기존/owned job의 `source_kind` 기본값은 `owned_oauth`.
- public job은 `requested_total_count`가 `20/50/100/1000`일 때만 성공.
- public job에 canonical `source_video_url`이 없으면 실패.
- import item 수가 요청 총 수를 넘으면 실패.
- public import observation을 지정한 moderation transaction은 실패.
- public feedback에 personalization 또는 training opt-in은 실패.
- cost row는 analysis job당 pricing version별 하나이며 workspace RLS를 따른다.

Run:

```bash
npm run db:test
```

Expected: FAIL because new columns/table/guards do not exist.

- [x] **Step 3: source provenance migration을 구현한다**

```sql
create type public.comment_source_kind as enum ('owned_oauth', 'public_url');

alter table public.comment_import_jobs
  add column source_kind public.comment_source_kind not null default 'owned_oauth',
  add column requested_total_count integer,
  add column source_video_url text,
  add column youtube_quota_units_used integer not null default 0 check (youtube_quota_units_used >= 0),
  add column top_level_count integer not null default 0 check (top_level_count >= 0),
  add column reply_count integer not null default 0 check (reply_count >= 0);
```

public row의 count/canonical URL 조건과 owned row의 기존 top-level 계약을 이름 있는 check constraint로 강제한다. `comment_import_items` insert trigger는 해당 job의 관찰 item 수가 `requested_total_count`를 넘지 못하게 한다.

- [x] **Step 4: 비용 snapshot table과 RLS를 구현한다**

`analysis_job_costs`는 model IDs, pricing version/effective date, USD token 단가, estimate low/high, actual input/output tokens, actual calculated USD, timestamps를 가진다. `model_runs.usage`를 원본 truth로 유지하고 cost row는 계산 snapshot만 저장한다.

- [x] **Step 5: source-aware DB guard를 구현한다**

기존 moderation RPC가 source import job ID를 받고 `source_kind='owned_oauth'`와 실제 OAuth connection을 함께 검증하도록 확장한다. feedback 저장 함수 또는 trigger는 source import job이 `public_url`이면 두 opt-in을 모두 false로만 허용한다.

- [x] **Step 6: DB reset/test와 타입 생성을 실행한다**

Run:

```bash
npm run db:reset
npm run db:test
npm run db:types
npx tsc --noEmit
```

Expected: migration과 pgTAP PASS; generated type에 새 enum/column/table이 있고 TypeScript PASS.

- [x] **Step 7: Task 3을 commit한다**

```bash
git add supabase/migrations/202607240022_public_youtube_read_mode.sql supabase/migrations/202607240023_analysis_job_costs.sql supabase/tests/public_youtube_read_mode.sql supabase/tests/youtube_selection.sql src/types/database.ts
git commit -m "feat: persist public comment source provenance"
```

---

### Task 4: 부모 보존형 총 댓글 collector

**Files:**
- Create: `src/features/ingestion/public-comment-collector.ts`
- Create: `src/features/ingestion/public-comment-collector.test.ts`
- Modify: `src/features/ingestion/comment-mapper.ts`
- Test: `src/features/ingestion/comment-mapper.test.ts`

**Interfaces:**
- Produces: `collectPublicComments({ videoId, requestedTotalCount, provider }): PublicCommentCollection`.
- Consumes: Task 2 `PublicYouTubeReadProvider`.

- [x] **Step 1: 총 수와 부모 무결성의 실패 테스트를 작성한다**

```ts
it("includes a top-level comment even when it has no replies", async () => {
  const result = await collectPublicComments(fixture({ requestedTotalCount: 20 }));
  expect(result.comments).toContainEqual(expect.objectContaining({
    youtubeCommentId: "parent-without-replies",
    parentYoutubeCommentId: null,
  }));
});

it("caps parents and replies together and never creates an orphan reply", async () => {
  const result = await collectPublicComments(fixture({ requestedTotalCount: 20 }));
  expect(result.comments).toHaveLength(20);
  for (const reply of result.comments.filter((item) => item.parentYoutubeCommentId)) {
    expect(result.comments.some(
      (item) => item.youtubeCommentId === reply.parentYoutubeCommentId,
    )).toBe(true);
  }
});
```

추가로 `20/50/100/1000`, 임의 수 거절, 최신 parent 순서, 최신 reply 순서, incomplete inline replies의 `listReplies` 보완, page token 중단, quota 합계를 검증한다.

Run:

```bash
npx vitest run src/features/ingestion/public-comment-collector.test.ts
```

Expected: FAIL because collector does not exist.

- [x] **Step 2: 순수 collector를 구현한다**

Algorithm:

```text
while capacity remains and a thread page exists
  for each newest thread
    add parent
    stop immediately if full
    merge/dedupe inline replies and paged replies newest-first
    add replies until capacity is full
  fetch next thread page only if capacity remains
```

Provider가 raw SDK response를 숨기되 원본 payload 보존용 DTO를 함께 반환하도록 mapper 경계를 맞춘다. collector 결과에는 `comments`, `topLevelCount`, `replyCount`, `youtubeQuotaUnitsUsed`, `nextPageToken`을 포함한다.

- [x] **Step 3: 테스트와 typecheck를 통과시킨다**

Run:

```bash
npx vitest run src/features/ingestion/public-comment-collector.test.ts src/features/ingestion/comment-mapper.test.ts
npx tsc --noEmit
```

Expected: all PASS; 모든 reply의 parent가 결과에서 더 앞에 있고 길이가 hard cap 이하이다.

- [x] **Step 4: Task 4를 commit한다**

```bash
git add src/features/ingestion/public-comment-collector.ts src/features/ingestion/public-comment-collector.test.ts src/features/ingestion/comment-mapper.ts src/features/ingestion/comment-mapper.test.ts
git commit -m "feat: collect public comments with a total cap"
```

---

### Task 5: 공개 import job 생성, 저장, 분석 연결, 진행 상태

**Files:**
- Create: `src/features/ingestion/public-import-contract.ts`
- Create: `src/features/ingestion/public-import-service.ts`
- Create: `src/features/ingestion/public-import-service.test.ts`
- Modify: `src/features/ingestion/comment-import-service.ts`
- Modify: `src/features/ingestion/process-import-job.ts`
- Modify: `src/app/api/import-jobs/[jobId]/process/route.ts`
- Create: `src/app/api/import-jobs/[jobId]/status/route.ts`
- Test: `src/app/api/import-jobs/[jobId]/status/route.test.ts`

**Interfaces:**
- Produces: `createPublicImportJob`, source-dispatched `processImportJob`, persisted `ImportJobProgress`.
- Consumes: Task 3 schema, Task 4 collector, 기존 ingestion repository와 analysis job.

- [x] **Step 1: 공개 job 계약과 dispatch의 실패 테스트를 작성한다**

검증 항목:

- 입력 count 생략 시 `20`.
- `20/50/100/1000` 외 수량은 Server Action 이전 domain schema에서도 거절.
- `public_url` job은 OAuth connection 없이 public provider로 처리.
- `owned_oauth` job은 기존 token 기반 provider로 처리.
- import item은 중복 raw comment를 새로 만들지 않지만 현재 job에 연결.
- observed item 수, net-new raw 수, duplicate 수를 분리.
- 재호출은 completed item/API/AI를 중복 실행하지 않음.
- 일부 저장 실패는 `partially_succeeded`와 item error를 보존.

Run:

```bash
npx vitest run src/features/ingestion/public-import-service.test.ts src/features/ingestion/comment-import-service.test.ts
```

Expected: FAIL before implementation.

- [x] **Step 2: public job creation service를 구현한다**

`workspaceId`, validated video reference, preview metadata, requested total count만 받아:

1. canonical video upsert
2. `source_kind='public_url'` import job insert
3. analysis job 준비
4. 외부 호출 전 pending job ID 반환

을 하나의 service 경계로 만든다.

- [x] **Step 3: process dispatcher와 persistence를 구현한다**

`processImportJob`이 DB에서 source kind를 읽어:

- `owned_oauth`: 기존 code path
- `public_url`: public provider + total collector

로 dispatch한다. public path는 `comment_import_items`에 부모부터 insert하고 quota/top-level/reply counters를 update한 뒤 기존 analysis job을 이어서 실행한다.

- [x] **Step 4: persisted status endpoint를 구현한다**

Route Handler는 job ID를 신뢰하지 않고 로그인 사용자의 workspace와 job workspace를 대조한다. 응답은 source label, import/analysis 단계, counts, safe/caution/risk distribution, failure summary만 제공하며 원문/API Key/provider raw error를 포함하지 않는다.

- [x] **Step 5: 회귀 테스트를 통과시키고 commit한다**

Run:

```bash
npx vitest run src/features/ingestion src/app/api/import-jobs
npx tsc --noEmit
```

Expected: public/owned dispatch와 idempotency tests PASS; typecheck PASS.

```bash
git add src/features/ingestion/public-import-contract.ts src/features/ingestion/public-import-service.ts src/features/ingestion/public-import-service.test.ts src/features/ingestion/comment-import-service.ts src/features/ingestion/process-import-job.ts 'src/app/api/import-jobs/[jobId]/process/route.ts' 'src/app/api/import-jobs/[jobId]/status/route.ts' 'src/app/api/import-jobs/[jobId]/status/route.test.ts'
git commit -m "feat: process public URL comment import jobs"
```

---

### Task 6: 명시적 Stage 1 routing, 모델 분리, 비용 계산

**Files:**
- Create: `src/features/analysis/stage-one-routing.ts`
- Create: `src/features/analysis/stage-one-routing.test.ts`
- Modify: `src/features/analysis/second-pass.ts`
- Modify: `src/features/analysis/second-pass.test.ts`
- Modify: `src/features/rules/route-review-level.ts`
- Modify: `src/features/rules/evaluate-comment.test.ts`
- Modify: `src/features/analysis/analysis-provider.ts`
- Modify: `src/features/analysis/openai-analysis-provider.ts`
- Modify: `src/features/analysis/analysis-service.ts`
- Modify: `src/features/analysis/process-analysis-job.ts`
- Create: `src/features/analysis/cost-estimator.ts`
- Create: `src/features/analysis/cost-estimator.test.ts`

**Interfaces:**
- Produces: `routeStageOne`, distinct Stage 1/2 model configuration, `estimateAnalysisCost`, `calculateObservedCost`.
- Consumes: existing rule signals, Stage 1 output, RAG repository, `model_runs.usage`.

- [x] **Step 1: routing table의 실패 테스트를 작성한다**

```ts
it.each([
  [{ category: "uncertain", confidence: 0.99 }, "caution"],
  [{ category: "neutral", confidence: 0.84 }, "caution"],
  [{ category: "neutral", confidence: 0.99, needsSecondPass: true }, "caution"],
  [{ category: "phishing", confidence: 0.99 }, "risk"],
  [{ category: "threat_or_serious_risk", confidence: 0.99 }, "risk"],
])("enforces the code routing floor", (stageOne, minimumReviewLevel) => {
  const route = routeStageOne({ stageOne, ruleSignals: [] });
  expect(route.minimumReviewLevel).toBe(minimumReviewLevel);
  expect(route.runSecondPass).toBe(true);
});
```

별도 테스트로 blocked phrase 단독은 `caution`, allowed/context exception 단독은 `safe`, 깨끗한 일반 질문 confidence `>=0.85`는 Stage 2 불필요임을 검증한다.

Run:

```bash
npx vitest run src/features/analysis/stage-one-routing.test.ts src/features/analysis/second-pass.test.ts src/features/rules/evaluate-comment.test.ts
```

Expected: FAIL for uncertain, `needsSecondPass`, allowed/context behavior.

- [x] **Step 2: code-owned routing을 구현하고 RAG 시점을 옮긴다**

`analysis-service`는 Stage 1과 rule result 직후 `routeStageOne`을 실행한다. Stage 2 대상에 대해서만 embedding과 같은 workspace RAG 검색을 수행하며 similarity `>=0.78`, 최대 5개 approved/corrected feedback을 provenance와 함께 전달한다. Stage 2는 코드가 정한 review-level floor 아래로 내리지 못한다.

- [x] **Step 3: Stage 1/2 model을 분리한다**

```ts
export interface AnalysisProviderConfig {
  stageOneModel: string;
  stageTwoModel: string;
  embeddingModel: string;
}
```

`openai-analysis-provider`는 각 call에 맞는 model을 사용하고 `model_runs`에 provider가 실제 반환한 model identifier와 token usage를 저장한다. 기존 `OPENAI_ANALYSIS_MODEL`은 migration 기간 fallback으로만 읽고 새 환경변수를 우선한다.

- [x] **Step 4: 실행 전/후 비용의 실패 테스트와 계산기를 구현한다**

가격 snapshot:

```ts
export const DEFAULT_PRICING = {
  version: "openai-2026-07-24",
  currency: "USD",
  stageOne: { inputPerMillion: 0.20, outputPerMillion: 1.25 },
  stageTwo: { inputPerMillion: 0.75, outputPerMillion: 4.50 },
  embedding: { inputPerMillion: 0.02 },
} as const;
```

테스트는 20/50/100/1000 estimate가 단조 증가하고 actual cost가 저장된 usage 합으로 재현됨을 검증한다. UI용 estimate는 low/high 범위와 적용일을 반환하고 실제 청구액 보장이 아님을 명시한다.

- [x] **Step 5: 분석/cost 테스트와 회귀를 통과시킨다**

Run:

```bash
npx vitest run src/features/analysis src/features/rules
npx tsc --noEmit
```

Expected: routing, model selection, RAG isolation, usage cost tests PASS.

- [x] **Step 6: Task 6을 commit한다**

```bash
git add src/features/analysis src/features/rules src/lib/env.ts .env.example
git commit -m "feat: enforce two-stage analysis routing"
```

---

### Task 7: 공개 출처 feedback과 moderation의 3중 read-only guard

**Files:**
- Modify: `src/features/feedback/feedback-contract.ts`
- Modify: `src/features/feedback/feedback-service.ts`
- Modify: `src/features/feedback/feedback-service.test.ts`
- Modify: `src/app/(product)/app/inbox/actions.ts`
- Modify: `src/features/moderation/contracts.ts`
- Modify: `src/features/moderation/moderation-service.ts`
- Modify: `src/features/moderation/moderation-service.test.ts`
- Modify: `src/app/(product)/app/inbox/moderation-actions.ts`
- Test: `supabase/tests/public_youtube_read_mode.sql`

**Interfaces:**
- Produces: source observation ID가 필수인 feedback/moderation request와 `PUBLIC_SOURCE_READ_ONLY` domain error.
- Consumes: Task 3 DB guard와 source provenance.

- [x] **Step 1: 우회 요청의 실패 테스트를 작성한다**

검증 항목:

- public source + `useForPersonalization=true` 거절.
- public source + `useForTraining=true` 거절.
- public source + hide/reject/publish/delete 요청 거절.
- raw comment ID만 바꿔 제출해도 source import job/workspace 불일치 거절.
- owned source의 기존 feedback/moderation 성공 계약 유지.
- provider가 public 거절 전에 호출되지 않음.

Run:

```bash
npx vitest run src/features/feedback/feedback-service.test.ts src/features/moderation/moderation-service.test.ts
npm run db:test
```

Expected: FAIL because source observation is not yet enforced.

- [x] **Step 2: Server Action schema와 domain service를 강화한다**

모든 mutation input에 `sourceImportJobId`를 포함하고 server에서:

1. session/workspace 확인
2. raw comment와 import item 관계 확인
3. source kind 확인
4. public이면 금지 요청 거절
5. owned이면 기존 provider path 실행

순서를 강제한다. public feedback 자체는 저장 가능하지만 두 opt-in은 false로 고정하지 않고 true 요청을 명시적으로 거절해 호출자 오류를 드러낸다.

- [x] **Step 3: DB guard까지 검증한다**

service role 또는 직접 RPC 호출로 UI/server를 우회해도 public moderation/opt-in이 실패하는 pgTAP을 통과시킨다.

- [x] **Step 4: 전체 관련 테스트를 통과시키고 commit한다**

Run:

```bash
npx vitest run src/features/feedback src/features/moderation 'src/app/(product)/app/inbox'
npm run db:test
npx tsc --noEmit
```

Expected: public mutation attempts fail with stable code; owned flow tests PASS.

```bash
git add src/features/feedback 'src/app/(product)/app/inbox/actions.ts' src/features/moderation 'src/app/(product)/app/inbox/moderation-actions.ts' supabase/tests/public_youtube_read_mode.sql
git commit -m "feat: enforce public comment read-only policy"
```

---

### Task 8: 공개 URL 입력·확인·진행 UI와 Inbox/dashboard 출처

**Files:**
- Create: `src/app/(product)/app/connect/youtube/public-video-actions.ts`
- Create: `src/features/youtube/public-video-import-panel.tsx`
- Create: `src/features/youtube/public-video-import-panel.test.tsx`
- Modify: `src/app/(product)/app/connect/youtube/page.tsx`
- Modify: `src/features/inbox/inbox-query.ts`
- Modify: `src/features/inbox/supabase-inbox-repository.ts`
- Modify: `src/features/inbox/comment-inbox.tsx`
- Modify: `src/features/inbox/comment-inbox.test.tsx`
- Modify: `src/features/dashboard/dashboard-query.ts`
- Modify: `src/features/dashboard/dashboard-view.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: preview/start actions, interactive public import panel, source-aware Inbox/dashboard read models.
- Consumes: Tasks 1–7 services.

- [x] **Step 1: Next.js Server Action/form 문서와 기존 page/action 패턴을 읽는다**

Run:

```bash
sed -n '1,320p' node_modules/next/dist/docs/01-app/02-guides/server-actions.md
sed -n '1,300p' node_modules/next/dist/docs/01-app/02-guides/forms.md
sed -n '1,240p' 'src/app/(product)/app/connect/youtube/page.tsx'
sed -n '1,220p' 'src/app/(product)/app/connect/youtube/actions.ts'
```

Expected: Server Action을 public POST endpoint로 보고 action 내부에서 auth와 입력 검증을 반복해야 함을 확인한다.

- [x] **Step 2: UI 상태의 실패 테스트를 작성한다**

Testing Library로 다음 상태를 검증한다.

- flag off: 개발 패널 없음.
- flag on/key missing: 설정 안내, URL 입력 없음.
- configured: URL 입력과 기본 20.
- preview: thumbnail/title/channel/comments availability, `공개 URL · 읽기 전용`.
- confirmation: `20/50/100/1,000`, quota/cost estimate, 명시적 start button.
- progress: 댓글 가져오기 → 규칙 검사 → 1차 AI → 2차 AI → 완료.
- public Inbox row: `공개 URL`, `읽기 전용`, moderation disabled reason.
- public feedback: personalization/training checkbox가 disabled.
- harmful text: reveal 전 원문이 DOM에 없음.

Run:

```bash
npx vitest run src/features/youtube/public-video-import-panel.test.tsx src/features/inbox/comment-inbox.test.tsx
```

Expected: FAIL before UI implementation.

- [x] **Step 3: preview/start Server Actions를 구현한다**

두 action 모두 `requireViewer()`와 workspace 검증, production gate, Zod parse를 수행한다. preview는 metadata만 반환하고 start만 public import job을 만든다. 사용자에게 반환하는 error는 stable code와 한국어 안내만 포함하고 provider raw body/API Key를 제거한다.

- [x] **Step 4: 작은 Client Component로 panel을 구현한다**

`public-video-import-panel.tsx`만 Client Component로 두고 Server Component page가 mode/configuration state를 전달한다. preview 결과를 확인한 뒤에만 count와 start를 활성화한다. status Route Handler를 polling하되 완료/실패에서 중단하고 새로고침 시 URL의 job ID로 복원한다.

- [x] **Step 5: source-aware Inbox/dashboard를 구현한다**

Inbox RPC/read model은 각 observation의 `sourceKind`와 `sourceImportJobId`를 반환한다. 공개 observation은 항상 두 badge를 표시하고 mutation controls를 비활성화한다. dashboard 완료 요약에는 observed/new/duplicate, parent/reply, analysis success/failure, review distribution, model usage/cost snapshot을 실제 저장값에서만 표시한다.

- [x] **Step 6: 접근성, responsive desktop, 테스트를 검증한다**

Run:

```bash
npx vitest run src/features/youtube/public-video-import-panel.test.tsx src/features/inbox src/features/dashboard
npx tsc --noEmit
```

Expected: tests PASS; label/fieldset/live region/focus states가 있고 public action control이 비활성화된다.

- [x] **Step 7: Task 8을 commit한다**

`src/app/globals.css`의 기존 dirty hunk와 `src/app/globals 2.css`를 stage하지 않도록 diff를 먼저 확인한다.

```bash
git diff -- 'src/app/(product)/app/connect/youtube' src/features/youtube/public-video-import-panel.tsx src/features/inbox src/features/dashboard src/app/globals.css
git add 'src/app/(product)/app/connect/youtube' src/features/youtube/public-video-import-panel.tsx src/features/youtube/public-video-import-panel.test.tsx src/features/inbox src/features/dashboard
git commit -m "feat: add public URL import experience"
```

CSS가 새 UI에 필수라면 관련 hunk만 별도 확인 후 stage하고, 사용자 소유 `src/app/globals 2.css`는 절대 포함하지 않는다.

---

### Task 9: Fixture E2E, 전체 회귀, 로컬 live 검증 문서

**Files:**
- Modify: `src/features/youtube/fixture-youtube-provider.ts`
- Modify: `src/features/analysis/fixture-analysis-provider.ts`
- Create: `e2e/public-youtube-read-only.spec.ts`
- Modify: `playwright.config.ts`
- Create: `docs/manual-public-youtube-verification.md`
- Modify: `docs/product-context.md`

**Interfaces:**
- Produces: 외부 API 비용 0인 deterministic E2E와 20→50→100→1000 live 검증 절차.
- Consumes: 전체 feature.

- [x] **Step 1: Fixture가 public provider 계약을 구현하되 명확히 표시되게 한다**

Fixture 댓글에는 답글 없는 parent, 여러 reply, duplicate, 한국어 욕설/비꼼/질문/phishing 예시를 포함한다. UI와 job metadata는 항상 `TEST FIXTURE`이며 fixture/live 동시 활성화는 environment validation에서 거절한다.

- [x] **Step 2: E2E 실패 테스트를 작성한다**

```ts
test("imports and reviews 20 public comments without YouTube OAuth", async ({ page }) => {
  await signInWithLocalMail(page);
  await page.goto("/app/connect/youtube");
  await page.getByLabel("공개 YouTube 영상 URL").fill(FIXTURE_PUBLIC_URL);
  await page.getByRole("button", { name: "영상 확인" }).click();
  await expect(page.getByText("TEST FIXTURE")).toBeVisible();
  await expect(page.getByLabel("댓글 수")).toHaveValue("20");
  await page.getByRole("button", { name: "댓글 가져오기 및 분석 시작" }).click();
  await expect(page.getByText("완료")).toBeVisible();
  await page.getByRole("link", { name: "Comment Inbox에서 보기" }).click();
  await expect(page.getByText("공개 URL")).toBeVisible();
  await expect(page.getByText("읽기 전용")).toBeVisible();
});
```

public moderation 버튼 비활성화, default count, total cap/parent preservation을 UI와 persisted state에서 함께 확인한다.

Run:

```bash
npm run test:e2e -- e2e/public-youtube-read-only.spec.ts
```

Expected: FAIL until fixture route and UI flow are fully wired.

- [x] **Step 3: E2E fixture wiring을 완료한다**

CI/test에서는 실제 YouTube/OpenAI endpoint에 network request가 발생하면 테스트가 실패하도록 Playwright route guard를 둔다. fixture 분석 결과도 `TEST FIXTURE` 표시를 유지한다.

- [x] **Step 4: 로컬 live 검증 문서를 작성한다**

문서에 다음을 포함한다.

- Google Cloud에서 YouTube Data API v3 활성화와 server API Key 제한.
- `.env.local` 이름만 안내하고 값은 기록하지 않음.
- `ENABLE_PUBLIC_YOUTUBE_DEV_MODE=true`, provider live 설정.
- 20 성공 전 50/100/1000을 실행하지 않는 단계별 checklist.
- quota/token/latency/partial failure 기록 양식.
- Gmail이 아닌 local Mailpit으로 magic link가 오는 이유와 production SMTP가 별도라는 안내.
- public URL은 다른 크리에이터 영상 댓글도 공개/댓글 활성화 조건에서 read-only로 읽을 수 있지만 moderation 권한은 생기지 않는다는 안내.

- [x] **Step 5: 전체 자동 검증을 실행한다**

Run:

```bash
npm test
npm run db:test
npm run test:eval
npm run test:e2e
npm run lint
npm run build
```

Expected: all commands exit 0. 실제 API Key가 없는 CI/fixture 환경에서도 외부 API를 호출하지 않고 통과한다.

- [x] **Step 6: 최종 범위와 secret leakage를 확인한다**

Run:

```bash
git status --short
git diff --check
git diff --name-only HEAD
rg -n "YOUTUBE_PUBLIC_API_KEY=.+|AIza[0-9A-Za-z_-]{20,}" . --glob '!node_modules/**' --glob '!.next/**'
```

Expected: whitespace error 없음; populated secret 없음; `src/app/globals 2.css`는 수정/추적되지 않음.

- [x] **Step 7: Task 9를 commit한다**

```bash
git add src/features/youtube/fixture-youtube-provider.ts src/features/analysis/fixture-analysis-provider.ts e2e/public-youtube-read-only.spec.ts playwright.config.ts docs/manual-public-youtube-verification.md docs/product-context.md
git commit -m "test: verify public YouTube read-only flow"
```

---

## Final Acceptance Checklist

- [x] 공개 영상 URL을 YouTube OAuth 없이 미리볼 수 있다.
- [x] 외부 호출 전 영상 정보, 총 댓글 수, 예상 quota와 OpenAI 비용을 확인한다.
- [x] 기본값은 20이고 `20 / 50 / 100 / 1,000`만 허용된다.
- [x] 저장·분석 댓글은 부모와 답글을 합쳐 선택값과 1,000을 넘지 않는다.
- [x] 답글 없는 댓글이 누락되지 않고 orphan reply가 없다.
- [x] 공개 URL job과 결과가 DB에 source provenance와 함께 저장된다.
- [x] `uncertain`, 낮은 confidence, `needsSecondPass`가 Stage 2로 이동한다.
- [x] phishing/serious threat는 `risk` 아래로 내려가지 않는다.
- [x] allowed/context exception만으로 review level이 올라가지 않는다.
- [x] Stage 1/2 모델과 token/cost snapshot을 구분해 확인할 수 있다.
- [x] 공개 출처 feedback은 personalization/training에 사용되지 않는다.
- [x] UI, server/domain, DB가 공개 출처 moderation을 모두 거절한다.
- [x] Inbox/dashboard에 `공개 URL · 읽기 전용`과 실제 persisted 결과가 표시된다.
- [x] Fixture는 항상 `TEST FIXTURE`이며 CI에서 실제 외부 API를 호출하지 않는다.
- [x] 기존 OAuth import/moderation 흐름이 회귀하지 않는다.
- [x] production에서는 개발 모드가 비활성화된다.
- [x] unit, DB, evaluation, E2E, lint, build가 모두 통과한다.
