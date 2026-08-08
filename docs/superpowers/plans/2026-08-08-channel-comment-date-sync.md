# Channel-Wide Date-Based YouTube Comment Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** YouTube 채널 연결 직후 사용자가 시작 날짜를 고르면, 연결 채널에 달린 댓글을 최신순으로 해당 날짜까지 가져와 신규 댓글만 기존 분류 파이프라인에 넣고 이후 새 댓글도 자동 동기화한다.

**Architecture:** 연결 화면의 Server Action은 날짜를 검증해 기존 `channel_comment_sync_settings`에 저장하고 즉시 backfill을 예약한다. 실제 수집은 YouTube `commentThreads.list(allThreadsRelatedToChannelId, order=time)`를 페이지 단위로 실행하는 재개 가능한 worker가 담당하며, 한 페이지의 댓글을 영상별 import job으로 나눠 현재의 원문 보존·분류 저장 구조를 재사용한다. 최초 backfill은 선택 날짜에 도달하면 끝나고, 이후 60분 단위 incremental sync와 별도의 reply reconciliation이 신규 댓글·답글만 분류한다.

**Tech Stack:** Next.js 16.2.11 App Router/Server Actions/Route Handlers, React 19.2.4, TypeScript 5, Zod 4, Supabase Postgres/RLS/RPC, Google YouTube Data API v3, Vitest/Testing Library, Playwright, pgTAP, Vercel Cron.

## Global Constraints

- 작업 브랜치는 `feature/junyoung/channel-comment-date-sync`를 사용한다.
- 사용자가 고른 `YYYY-MM-DD`는 `Asia/Seoul`의 해당 날짜 00:00:00부터 포함한다.
- “채널 댓글”은 연결한 채널의 영상에 달린 공개 최상위 댓글과 그 스레드의 답글을 뜻한다. 크리에이터가 다른 채널에 작성한 댓글을 뜻하지 않는다.
- 최초 backfill은 최상위 댓글 게시 시각을 기준으로 선택 날짜까지 내려가며, 포함된 스레드의 답글은 부모와 함께 모두 저장한다.
- 선택 날짜 이후 스레드에 나중에 추가된 답글은 reply reconciliation이 보완한다.
- 기존 `/app/videos`의 영상 하나·20/30/50개 수동 가져오기 흐름은 분류 품질 테스트용 보조 경로로 유지하되, 연결 화면의 기본 CTA에서는 제거한다.
- YouTube 응답 한 페이지만 한 worker claim에서 처리한다. 페이지 토큰과 lease를 DB에 저장해 타임아웃·재시작 후에도 이어간다.
- 첫 수집인 `stored` 댓글만 새 분석 item을 만든다. `duplicate`는 건너뛰고, 편집 감지인 `updated`는 immutable observation만 추가하며 기존 원문을 덮어쓰거나 오래된 원문으로 재분류하지 않는다.
- 분류는 현재 병합된 Moderation + Luna 1차 + 조건부 Terra 2차 파이프라인만 사용한다.
- 원문, provider payload, source observation, 분류 단계 출력, 최종 verdict는 기존처럼 구조적으로 분리한다.
- 숨김·거절·삭제 등 비가역 YouTube 조치는 자동 실행하지 않는다.
- fixture 데이터는 항상 `TEST FIXTURE`로 표시하며 실제 연결 데이터처럼 보이게 하지 않는다.
- 모든 Server Action과 사용자 Route Handler는 `requireViewer()`로 workspace를 다시 확인하고 입력을 Zod로 검증한다.
- 내부 worker route는 secret을 timing-safe 방식으로 검증하고 service-role key와 OAuth token을 브라우저에 반환하지 않는다.
- 완료 보고 전에 `npm run test`, `npm run lint`, `npm run build`, `npm run db:test`를 통과한다.

---

## File Structure

### Create

- `supabase/migrations/202608080034_channel_comment_sync_runtime.sql`: 이미 적용된 sync schema를 수정하지 않고 claim 완료/실패, incremental watermark, 영상별 job idempotency를 보강한다.
- `supabase/tests/channel_comment_sync.sql`: 날짜 설정, claim lease, backfill/incremental/reply 완료 상태, workspace 격리를 pgTAP으로 검증한다.
- `src/features/youtube/channel-comment-contracts.ts`: 채널 댓글 페이지, 영상 메타데이터, quota 결과 타입을 소유한다.
- `src/features/youtube/channel-comment-provider.test.ts`: Google/fixture provider가 채널 단위 필터와 최신순을 정확히 전달하는지 검증한다.
- `src/features/ingestion/channel-comment-page-collector.ts`: 한 채널 페이지의 날짜 필터, 답글 완전 조회, 영상별 그룹화를 담당하는 순수 도메인 서비스다.
- `src/features/ingestion/channel-comment-page-collector.test.ts`: cutoff, pagination, 답글, 불완전 날짜를 검증한다.
- `src/features/ingestion/channel-comment-sync-service.ts`: claim 한 건을 import job·원문·분류 job으로 변환하고 run을 완료/실패 처리한다.
- `src/features/ingestion/channel-comment-sync-service.test.ts`: idempotency, 신규 댓글만 분석, run 재개와 오류를 검증한다.
- `src/features/ingestion/reply-reconciliation-service.ts`: 이미 저장된 스레드의 새 답글을 작은 batch로 재확인한다.
- `src/features/ingestion/reply-reconciliation-service.test.ts`: 오래된 스레드에 새 답글이 생긴 경우를 검증한다.
- `src/features/ingestion/process-channel-comment-sync.ts`: Supabase·provider·token refresh·분류 설정을 조립하는 server-only adapter다.
- `src/features/ingestion/channel-sync-progress.ts`: DB row를 연결 화면용 안전한 progress DTO로 변환한다.
- `src/features/ingestion/channel-sync-progress.test.ts`: backfill, active, complete, failed UI 상태 변환을 검증한다.
- `src/features/ingestion/channel-sync-progress-panel.tsx`: 페이지 처리·상태 polling·Inbox 이동을 제공하는 client component다.
- `src/features/ingestion/channel-sync-progress-panel.test.tsx`: 자동 진행, 오류, 재시도, 접근성 문구를 검증한다.
- `src/app/api/channel-comment-sync/status/route.ts`: 로그인 사용자의 sync/분류 집계 상태를 반환한다.
- `src/app/api/channel-comment-sync/process/route.ts`: 로그인 사용자가 자기 workspace의 한 처리 batch를 즉시 실행한다.
- `src/app/api/internal/channel-comment-sync/process/route.ts`: cron용 bounded worker endpoint다.
- `src/app/api/internal/channel-comment-sync/process/route.test.ts`: secret, 처리 한도, 오류 응답을 검증한다.
- `e2e/channel-comment-date-sync.spec.ts`: 연결 완료 → 날짜 선택 → backfill → 분류 → Inbox 흐름을 fixture로 검증한다.
- `vercel.json`: 5분마다 worker를 깨우는 cron을 선언한다. 실제 채널별 신규 조회는 DB의 60분 간격을 따른다.

### Modify

- `src/app/(product)/app/connect/youtube/actions.ts`: 날짜 설정, 지금 동기화, 일시중지 Server Action을 추가한다.
- `src/app/(product)/app/connect/youtube/page.tsx`: “영상 선택하기” 기본 카드를 날짜 설정·동기화 상태 카드로 교체한다.
- `src/app/globals.css`: date field, sync status, progress, responsive layout을 추가한다.
- `src/features/youtube/google-youtube-provider.ts`: 채널 단위 comment thread, reply, 영상 메타데이터 조회를 추가한다.
- `src/features/youtube/google-youtube-provider.test.ts`: `allThreadsRelatedToChannelId`, `order=time`, page token을 검증한다.
- `src/features/youtube/fixture-youtube-provider.ts`: 여러 날짜·영상·페이지·늦게 추가된 답글 fixture를 제공한다.
- `src/features/ingestion/comment-mapper.ts`: 채널 thread의 `youtubeVideoId`를 손실 없이 전달한다.
- `src/lib/env.ts`, `src/lib/env.test.ts`, `.env.example`: `CRON_SECRET` 검증과 예시를 추가한다.
- `src/types/database.ts`: 새 migration 적용 후 로컬 Supabase 타입을 재생성한다.
- `docs/product-context.md`: 기본 제품 흐름을 날짜 기반 채널 sync로 갱신하고 수동 영상 가져오기를 테스트 경로로 명시한다.
- `docs/CrowdSift_Project_Context_v1.0.pdf`: 갱신한 Markdown과 같은 제품 계약으로 다시 생성·렌더 검증한다.
- `README.md`: 기본 흐름, branch 이름, 로컬 worker 실행, cron 환경변수를 문서화한다.

---

### Task 1: 제품 계약과 날짜 입력 계약을 먼저 고정한다

**Files:**
- Create: `src/features/ingestion/channel-sync-contract.ts`
- Test: `src/features/ingestion/channel-sync-contract.test.ts`
- Modify: `docs/product-context.md`

**Interfaces:**
- Consumes: 브라우저 `<input type="date">`가 제출하는 `YYYY-MM-DD` 문자열.
- Produces: `parseChannelSyncStartDate(value: unknown): string`과 `getKoreanToday(now?: Date): string`.

- [ ] **Step 1: 날짜 경계 테스트를 작성한다**

```ts
describe("parseChannelSyncStartDate", () => {
  it("accepts a real Korean calendar date", () => {
    expect(parseChannelSyncStartDate("2026-08-01")).toBe("2026-08-01");
  });

  it.each(["2026-02-30", "2026/08/01", "", null])(
    "rejects invalid input: %s",
    (value) => expect(() => parseChannelSyncStartDate(value)).toThrow(),
  );

  it("rejects a date after today in Asia/Seoul", () => {
    expect(() =>
      parseChannelSyncStartDate("2026-08-09", new Date("2026-08-08T10:00:00Z")),
    ).toThrow("future_start_date");
  });
});
```

- [ ] **Step 2: 계약 테스트가 실패하는지 확인한다**

Run: `npm test -- src/features/ingestion/channel-sync-contract.test.ts`

Expected: FAIL because `channel-sync-contract.ts` does not exist.

- [ ] **Step 3: 날짜 parser를 최소 구현한다**

```ts
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export function parseChannelSyncStartDate(value: unknown, now = new Date()) {
  const parsed = dateText.parse(value);
  const [year, month, day] = parsed.split("-").map(Number);
  const utc = new Date(Date.UTC(year!, month! - 1, day!));
  if (
    utc.getUTCFullYear() !== year ||
    utc.getUTCMonth() !== month! - 1 ||
    utc.getUTCDate() !== day
  ) throw new Error("invalid_start_date");
  if (parsed > getKoreanToday(now)) throw new Error("future_start_date");
  return parsed;
}
```

- [ ] **Step 4: 제품 문서의 기본 흐름을 사용자 승인 내용으로 바꾼다**

```text
YouTube 연결
→ 시작 날짜 선택
→ 연결 채널의 최신 댓글부터 날짜까지 페이지 수집
→ 신규 댓글 AI 분류
→ 원문과 분석 결과를 DB에 분리 저장
→ Comment Inbox에서 확인
→ 이후 새 댓글을 60분마다 동기화
```

`/app/videos`의 영상 하나·20/30/50개 흐름은 “분류 품질 수동 검증” 절로 옮긴다.

- [ ] **Step 5: 단위 테스트와 문서 문자열을 확인한다**

Run: `npm test -- src/features/ingestion/channel-sync-contract.test.ts`

Expected: PASS.

Run: `rg -n "시작 날짜 선택|60분마다 동기화|분류 품질 수동 검증" docs/product-context.md`

Expected: 세 문구가 모두 검색된다.

- [ ] **Step 6: 커밋한다**

```bash
git add docs/product-context.md src/features/ingestion/channel-sync-contract.ts src/features/ingestion/channel-sync-contract.test.ts
git commit -m "docs: define channel comment date sync contract"
```

---

### Task 2: 적용된 DB 기반 위에 안전한 runtime 상태 전이를 추가한다

**Files:**
- Create: `supabase/migrations/202608080034_channel_comment_sync_runtime.sql`
- Create: `supabase/tests/channel_comment_sync.sql`
- Modify: `src/types/database.ts`

**Interfaces:**
- Consumes: 기존 `configure_channel_comment_sync`, `channel_comment_sync_settings`, `channel_comment_sync_runs`, `comment_import_jobs`.
- Produces: `claim_channel_comment_sync_work_for_workspace`, `complete_channel_comment_sync_run`, `fail_channel_comment_sync_run`, per-run/per-video unique job constraint.

- [ ] **Step 1: pgTAP 실패 테스트를 작성한다**

테스트는 다음 상태 전이를 각각 독립 transaction에서 확인한다.

```sql
select results_eq(
  $$ select backfill_start_at::date from configure_channel_comment_sync(
       '55555555-5555-5555-5555-555555555555'::uuid,
       date '2026-08-01'
     ) $$,
  array[date '2026-08-01'],
  'stores the selected start date'
);

select is(
  (select count(*) from claim_channel_comment_sync_work_for_workspace(
    '55555555-5555-5555-5555-555555555555'::uuid,
    240
  )),
  1::bigint,
  'claims only the requested workspace'
);
```

테스트 시작부에는 기존 `youtube_selection.sql` 패턴처럼 고정 UUID의 `auth.users`, `workspaces`, `workspace_members`, connected `youtube_connections`, selected `youtube_channel_candidates`를 직접 insert하고 authenticated JWT claim을 설정한다.

이어지는 assertion은 다음을 확인한다.

- next page가 있으면 backfill status가 `pending`, token이 새 값, lease가 `null`이다.
- cutoff에 도달하면 backfill status가 `completed`, token이 `null`이다.
- incremental 첫 페이지에서 `incremental_scan_started_at`이 한 번만 고정된다.
- incremental watermark에 도달하면 `last_successful_sync_at`이 scan 시작 시각으로 이동한다.
- 실패하면 run은 `failed`, setting은 재시도 가능한 시각과 `last_error_code`를 가진다.
- 다른 workspace 사용자는 설정을 claim하거나 수정할 수 없다.

- [ ] **Step 2: DB 테스트가 실패하는지 확인한다**

Run: `npm run db:test -- supabase/tests/channel_comment_sync.sql`

Expected: FAIL because the runtime RPCs and watermark column do not exist.

- [ ] **Step 3: 새 migration에 runtime column과 idempotency index를 추가한다**

```sql
alter table public.channel_comment_sync_settings
  add column incremental_scan_started_at timestamptz;

create unique index comment_import_jobs_channel_run_video_unique
  on public.comment_import_jobs(channel_sync_run_id, youtube_video_id)
  where trigger_kind = 'channel_sync';
```

기존 적용 migration 파일은 수정하지 않는다.

- [ ] **Step 4: workspace 전용 claim RPC를 추가한다**

```sql
create function public.claim_channel_comment_sync_work_for_workspace(
  target_workspace_id uuid,
  target_lease_seconds integer default 240
)
returns table (
  setting_id uuid,
  run_id uuid,
  workspace_id uuid,
  connection_id uuid,
  youtube_channel_id text,
  run_kind text,
  backfill_start_at timestamptz,
  page_token text,
  last_successful_sync_at timestamptz,
  incremental_scan_started_at timestamptz
)
language plpgsql security definer set search_path = public;
```

RPC는 `target_workspace_id`의 membership을 확인하고 `for update skip locked`로 한 건만 claim한다. service-role용 기존 global claim도 같은 내부 helper를 사용하도록 새 migration에서 교체한다.

- [ ] **Step 5: 완료와 실패 RPC를 구현한다**

```sql
create function public.complete_channel_comment_sync_run(
  target_run_id uuid,
  target_next_page_token text,
  target_reached_boundary boolean,
  target_observed_count integer,
  target_stored_count integer,
  target_updated_count integer,
  target_duplicate_count integer,
  target_failed_count integer,
  target_analyzed_count integer,
  target_quota_units_used integer,
  target_reply_cursor text default null
) returns public.channel_comment_sync_runs;

create function public.fail_channel_comment_sync_run(
  target_run_id uuid,
  target_error_code text
) returns public.channel_comment_sync_runs;
```

Backfill은 boundary 또는 마지막 page에서 완료하고, incremental은 이전 watermark에 도달했을 때 `last_successful_sync_at = incremental_scan_started_at`로 확정한다. Reply reconciliation은 cursor가 남으면 즉시 다음 batch, 끝나면 `next_reply_reconciliation_at = now() + interval '24 hours'`로 둔다.

- [ ] **Step 6: 권한을 최소화한다**

`configure`, enable/disable, request-now는 authenticated membership을 유지한다. claim/complete/fail/store 함수는 `service_role`만 실행 가능하게 revoke/grant를 명시한다.

- [ ] **Step 7: DB 테스트와 타입 생성을 실행한다**

Run: `npm run db:reset`

Expected: all migrations apply successfully.

Run: `npm run db:test -- supabase/tests/channel_comment_sync.sql`

Expected: PASS.

Run: `npm run db:types`

Expected: `src/types/database.ts`에 새 RPC와 `incremental_scan_started_at`이 생성된다.

- [ ] **Step 8: 커밋한다**

```bash
git add supabase/migrations/202608080034_channel_comment_sync_runtime.sql supabase/tests/channel_comment_sync.sql src/types/database.ts
git commit -m "feat: add resumable channel sync state transitions"
```

---

### Task 3: YouTube provider에 채널 단위 최신 댓글 API를 추가한다

**Files:**
- Create: `src/features/youtube/channel-comment-contracts.ts`
- Create: `src/features/youtube/channel-comment-provider.test.ts`
- Modify: `src/features/youtube/google-youtube-provider.ts`
- Modify: `src/features/youtube/google-youtube-provider.test.ts`
- Modify: `src/features/youtube/fixture-youtube-provider.ts`
- Modify: `src/features/ingestion/comment-mapper.ts`

**Interfaces:**
- Consumes: selected `youtubeChannelId`, `pageToken`, `maxResults <= 100`.
- Produces: `listChannelCommentThreads`, `listReplies`, `listVideosByIds` with explicit quota counts.

- [ ] **Step 1: provider 호출 계약 테스트를 작성한다**

```ts
await provider.listChannelCommentThreads({
  youtubeChannelId: "channel-1",
  maxResults: 100,
  pageToken: "page-2",
});

expect(commentThreadsList).toHaveBeenCalledWith({
  part: ["id", "snippet", "replies"],
  allThreadsRelatedToChannelId: "channel-1",
  maxResults: 100,
  order: "time",
  textFormat: "plainText",
  pageToken: "page-2",
});
```

응답 mapping 테스트는 thread의 `snippet.videoId`가 `youtubeVideoId`로 보존되고, 없는 ID의 thread는 저장 대상에서 제외되며 `invalidItemCount`에 집계되는지 확인한다.

- [ ] **Step 2: provider 테스트가 실패하는지 확인한다**

Run: `npm test -- src/features/youtube/channel-comment-provider.test.ts src/features/youtube/google-youtube-provider.test.ts`

Expected: FAIL because `listChannelCommentThreads` does not exist.

- [ ] **Step 3: channel contract를 정의한다**

```ts
export type ChannelCommentThread = ProviderCommentThread & {
  youtubeVideoId: string;
};

export type ChannelCommentPage = {
  items: ChannelCommentThread[];
  nextPageToken: string | null;
  quotaUnitsUsed: number;
  invalidItemCount: number;
};

export interface ChannelCommentProvider {
  listChannelCommentThreads(input: {
    youtubeChannelId: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<ChannelCommentPage>;
  listReplies(input: {
    parentYoutubeCommentId: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<{ items: ProviderComment[]; nextPageToken: string | null; quotaUnitsUsed: number }>;
  listVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]>;
}
```

- [ ] **Step 4: Google provider를 구현한다**

Published 댓글 조회에는 현재의 server API key client를 사용한다. `commentThreads.list`와 `comments.list`는 호출당 quota 1을 반환하고, `videos.list(part=snippet,id=[...])`는 최대 50개 ID씩 묶는다. provider는 비밀 key나 OAuth token을 반환 타입에 포함하지 않는다.

- [ ] **Step 5: fixture provider에 결정적 페이지를 추가한다**

첫 페이지는 두 영상의 2026-08-08/07 댓글과 `next-1`, 두 번째 페이지는 2026-08-01 경계 댓글과 2026-07-31 댓글을 제공한다. 한 thread는 inline reply 1개, `totalReplyCount=3`으로 만들어 추가 reply pagination을 강제한다.

- [ ] **Step 6: provider 테스트를 통과시킨다**

Run: `npm test -- src/features/youtube/channel-comment-provider.test.ts src/features/youtube/google-youtube-provider.test.ts`

Expected: PASS and calls contain `allThreadsRelatedToChannelId`, `order: "time"`, and the supplied page token.

- [ ] **Step 7: 커밋한다**

```bash
git add src/features/youtube/channel-comment-contracts.ts src/features/youtube/channel-comment-provider.test.ts src/features/youtube/google-youtube-provider.ts src/features/youtube/google-youtube-provider.test.ts src/features/youtube/fixture-youtube-provider.ts src/features/ingestion/comment-mapper.ts
git commit -m "feat: read channel comments newest first"
```

---

### Task 4: 한 페이지를 날짜 경계까지 안전하게 수집하는 순수 서비스를 만든다

**Files:**
- Create: `src/features/ingestion/channel-comment-page-collector.ts`
- Create: `src/features/ingestion/channel-comment-page-collector.test.ts`

**Interfaces:**
- Consumes: `ChannelCommentProvider`, `youtubeChannelId`, `pageToken`, `boundaryAt`, run kind.
- Produces: `ChannelCommentCollectionPage` grouped by real YouTube video ID.

- [ ] **Step 1: 날짜와 답글 동작의 실패 테스트를 작성한다**

```ts
it("keeps the boundary day and stops after an older top-level comment", async () => {
  const result = await collectChannelCommentPage({
    provider,
    youtubeChannelId: "channel-1",
    pageToken: null,
    boundaryAt: "2026-08-01T00:00:00+09:00",
    kind: "backfill_recent",
  });

  expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
    "new-1",
    "boundary-1",
  ]);
  expect(result.reachedBoundary).toBe(true);
  expect(result.nextPageToken).toBeNull();
});
```

추가 테스트는 다음을 확인한다.

- 첫 page가 모두 새 댓글이면 provider의 next token을 그대로 반환한다.
- `publishedAt`이 없는 항목 하나 때문에 cutoff로 판단하지 않는다.
- inline reply가 일부뿐이면 `comments.list(parentId)`를 끝까지 돈다.
- 같은 reply가 inline/API 양쪽에 있어도 한 번만 포함한다.
- reply는 부모 thread의 `youtubeVideoId`를 상속하고 orphan으로 저장되지 않는다.
- incremental은 `publishedAt > lastSuccessfulSyncAt`만 신규 후보로 남긴다.

- [ ] **Step 2: collector 테스트가 실패하는지 확인한다**

Run: `npm test -- src/features/ingestion/channel-comment-page-collector.test.ts`

Expected: FAIL because the collector does not exist.

- [ ] **Step 3: 결과 타입과 timestamp 판정을 구현한다**

```ts
export type ChannelCommentCollectionPage = {
  groups: Map<string, SourceComment[]>;
  observedCount: number;
  topLevelCount: number;
  replyCount: number;
  invalidCount: number;
  nextPageToken: string | null;
  reachedBoundary: boolean;
  quotaUnitsUsed: number;
};

const atOrAfter = (publishedAt: string | null, boundaryAt: string) =>
  publishedAt === null || Date.parse(publishedAt) >= Date.parse(boundaryAt);
```

Backfill 경계는 inclusive이며, 알 수 없는 timestamp는 데이터 유실을 피하기 위해 저장 후보로 유지하고 다음 page 여부만 provider token으로 결정한다.

- [ ] **Step 4: 답글 완전 조회와 video grouping을 구현한다**

각 포함 thread마다 `totalReplyCount > inlineReplies.length`이면 reply page를 모두 조회한다. `Map<youtubeVideoId, SourceComment[]>`에 부모를 먼저 넣고 dedupe된 reply를 뒤에 넣는다.

- [ ] **Step 5: collector 테스트를 통과시킨다**

Run: `npm test -- src/features/ingestion/channel-comment-page-collector.test.ts`

Expected: PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add src/features/ingestion/channel-comment-page-collector.ts src/features/ingestion/channel-comment-page-collector.test.ts
git commit -m "feat: collect channel comment pages to a date boundary"
```

---

### Task 5: 채널 page를 기존 import·분류 저장 경로에 연결한다

**Files:**
- Create: `src/features/ingestion/channel-comment-sync-service.ts`
- Create: `src/features/ingestion/channel-comment-sync-service.test.ts`
- Create: `src/features/ingestion/process-channel-comment-sync.ts`
- Modify: `src/features/ingestion/import-errors.ts`

**Interfaces:**
- Consumes: Task 2의 claimed work와 Task 4의 grouped collection page.
- Produces: 영상별 `comment_import_jobs`, immutable source/observation, 신규 댓글용 `analysis_jobs`, completed sync run.

- [ ] **Step 1: orchestration 실패 테스트를 작성한다**

```ts
it("creates analysis items only for first-seen comments", async () => {
  repository.storeComment
    .mockResolvedValueOnce({ disposition: "stored", rawCommentId: "raw-1" })
    .mockResolvedValueOnce({ disposition: "duplicate", rawCommentId: "raw-2" })
    .mockResolvedValueOnce({ disposition: "updated", rawCommentId: "raw-3" });

  await service.process(claim);

  expect(repository.ensureAnalysisJob).toHaveBeenCalledWith(
    expect.objectContaining({ rawCommentIds: ["raw-1"] }),
  );
});
```

추가 테스트는 다음을 확인한다.

- 두 영상이 한 channel page에 있으면 같은 run 아래 import job 두 개가 생긴다.
- 재시도 시 `(channel_sync_run_id, youtube_video_id)` job을 재사용한다.
- 영상 metadata 조회가 실패해도 실제 video ID는 보존하고 가짜 제목을 저장하지 않는다.
- item 하나 저장 실패가 다른 댓글을 rollback하지 않는다.
- quota/permission/provider 오류가 run과 setting에 stable error code로 남는다.
- complete RPC에는 다음 page token, cutoff, stored/updated/duplicate/failed/analyzed/quota 수가 정확히 전달된다.

- [ ] **Step 2: sync service 테스트가 실패하는지 확인한다**

Run: `npm test -- src/features/ingestion/channel-comment-sync-service.test.ts`

Expected: FAIL because the service does not exist.

- [ ] **Step 3: repository contract를 정의한다**

```ts
export interface ChannelSyncRepository {
  createOrGetVideoImportJob(input: {
    runId: string;
    workspaceId: string;
    youtubeVideoId: string;
    providerMode: "live" | "fixture";
  }): Promise<{ id: string }>;
  storeComment(input: StoreChannelCommentInput): Promise<{
    disposition: "stored" | "updated" | "duplicate";
    rawCommentId: string;
  }>;
  ensureAnalysisJob(input: {
    importJobId: string;
    workspaceId: string;
    configurationKey: string;
    rawCommentIds: string[];
  }): Promise<{ id: string } | null>;
  completeRun(input: CompleteChannelSyncRunInput): Promise<void>;
  failRun(runId: string, errorCode: ChannelSyncErrorCode): Promise<void>;
}
```

- [ ] **Step 4: 영상별 job과 신규 댓글 분석 생성을 구현한다**

각 group의 import job은 `source_kind='owned_oauth'`, `trigger_kind='channel_sync'`, `channel_sync_run_id=claim.runId`, 두 requested count는 `null`로 저장한다. `store_import_comment_item` 결과가 `stored`인 ID만 analysis item으로 전달한다. `updated`는 observation과 count만 남긴다.

- [ ] **Step 5: Supabase adapter를 구현한다**

`process-channel-comment-sync.ts`는 다음만 조립한다.

```ts
export async function processOneChannelSyncWork(input: {
  workspaceId?: string;
}): Promise<ChannelSyncBatchResult | null>;

export async function processPendingChannelClassification(input: {
  workspaceId?: string;
  maxItems: number;
}): Promise<ClassificationProgress | null>;
```

사용자 route는 workspace 전용 claim RPC를, cron은 service-role global claim RPC를 사용한다. 현재 classification configuration key는 정책 버전과 Moderation/Luna/Terra model identifier로 생성한다.

- [ ] **Step 6: sync service 테스트를 통과시킨다**

Run: `npm test -- src/features/ingestion/channel-comment-sync-service.test.ts`

Expected: PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add src/features/ingestion/channel-comment-sync-service.ts src/features/ingestion/channel-comment-sync-service.test.ts src/features/ingestion/process-channel-comment-sync.ts src/features/ingestion/import-errors.ts
git commit -m "feat: persist and classify channel sync comments"
```

---

### Task 6: 오래된 포함 스레드에 새로 달린 답글을 보정한다

**Files:**
- Create: `src/features/ingestion/reply-reconciliation-service.ts`
- Create: `src/features/ingestion/reply-reconciliation-service.test.ts`
- Modify: `src/features/ingestion/process-channel-comment-sync.ts`

**Interfaces:**
- Consumes: 선택 날짜 이후 저장된 top-level raw comment를 `(published_at, id)` keyset 순서로 최대 20개, provider `listReplies`.
- Produces: 새 reply source rows, 신규 reply 분석 items, 다음 opaque cursor 또는 reconciliation 완료.

- [ ] **Step 1: 늦은 답글 테스트를 작성한다**

```ts
it("finds a new reply on an already stored thread", async () => {
  repository.listParents.mockResolvedValue({
    items: [{ rawCommentId: "raw-parent", youtubeCommentId: "parent-1", youtubeVideoId: "video-1" }],
    nextCursor: null,
  });
  provider.listReplies.mockResolvedValue({
    items: [reply("existing-reply"), reply("new-reply")],
    nextPageToken: null,
    quotaUnitsUsed: 1,
  });

  await service.process(claim);

  expect(repository.ensureAnalysisJob).toHaveBeenCalledWith(
    expect.objectContaining({ rawCommentIds: ["raw-new-reply"] }),
  );
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `npm test -- src/features/ingestion/reply-reconciliation-service.test.ts`

Expected: FAIL because the reconciliation service does not exist.

- [ ] **Step 3: cursor를 검증 가능한 형태로 구현한다**

```ts
const ReplyCursorSchema = z.object({
  publishedAt: z.iso.datetime(),
  id: z.uuid(),
});

export const encodeReplyCursor = (cursor: ReplyCursor) =>
  Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
```

decode 실패는 `invalid_reply_cursor`로 run을 실패시키고 처음부터 무한 반복하지 않는다.

- [ ] **Step 4: 부모 20개 단위 보정을 구현한다**

각 부모의 reply API pagination을 끝까지 조회하고 기존 `store_import_comment_item`으로 저장한다. `stored` reply만 분석하고, 다음 parent cursor가 있으면 run completion RPC에 전달한다. 마지막 cursor이면 24시간 뒤 다음 reconciliation을 예약한다.

- [ ] **Step 5: 테스트를 통과시킨다**

Run: `npm test -- src/features/ingestion/reply-reconciliation-service.test.ts`

Expected: PASS.

- [ ] **Step 6: 커밋한다**

```bash
git add src/features/ingestion/reply-reconciliation-service.ts src/features/ingestion/reply-reconciliation-service.test.ts src/features/ingestion/process-channel-comment-sync.ts
git commit -m "feat: reconcile new replies on known threads"
```

---

### Task 7: 연결 화면에 날짜 설정과 진행 상태를 표시한다

**Files:**
- Modify: `src/app/(product)/app/connect/youtube/actions.ts`
- Modify: `src/app/(product)/app/connect/youtube/page.tsx`
- Modify: `src/app/globals.css`
- Create: `src/features/ingestion/channel-sync-progress.ts`
- Create: `src/features/ingestion/channel-sync-progress.test.ts`
- Create: `src/features/ingestion/channel-sync-progress-panel.tsx`
- Create: `src/features/ingestion/channel-sync-progress-panel.test.tsx`

**Interfaces:**
- Consumes: `startDate` form field, sync settings/latest run DTO.
- Produces: `configureChannelCommentSyncAction`, `requestChannelCommentSyncNowAction`, `setChannelCommentSyncEnabledAction`.

- [ ] **Step 1: Server Action과 UI 실패 테스트를 작성한다**

```tsx
render(<ChannelSyncSetup maxDate="2026-08-08" />);
expect(screen.getByLabelText("언제의 댓글부터 가져올까요?")).toHaveAttribute(
  "type",
  "date",
);
expect(screen.getByRole("button", { name: "댓글 가져오기 시작" })).toBeEnabled();
expect(screen.getByRole("link", { name: "영상 하나로 분류 테스트" })).toHaveAttribute(
  "href",
  "/app/videos",
);
```

Progress 테스트는 active 상태에서 status를 가져오고 `/api/channel-comment-sync/process`를 POST한 뒤 다시 polling하며, unmount 시 더 이상 요청하지 않는지 검증한다.

- [ ] **Step 2: UI 테스트가 실패하는지 확인한다**

Run: `npm test -- src/features/ingestion/channel-sync-progress.test.ts src/features/ingestion/channel-sync-progress-panel.test.tsx`

Expected: FAIL because the components do not exist.

- [ ] **Step 3: 날짜 설정 Server Action을 구현한다**

```ts
export async function configureChannelCommentSyncAction(formData: FormData) {
  const startDate = parseChannelSyncStartDate(formData.get("startDate"));
  const { workspaceId } = await requireViewer();
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("configure_channel_comment_sync", {
    target_workspace_id: workspaceId,
    target_start_date: startDate,
  });
  if (error) redirect("/app/connect/youtube?error=sync_configuration_failed");
  revalidatePath("/app/connect/youtube");
  redirect("/app/connect/youtube?sync=started");
}
```

지금 동기화와 일시중지 action도 같은 membership 경계에서 각각 `request_channel_comment_sync_now`, `set_channel_comment_sync_enabled`를 호출한다.

- [ ] **Step 4: 연결 page의 기본 CTA를 날짜 form으로 교체한다**

```tsx
<form action={configureChannelCommentSyncAction} className="channel-sync-setup">
  <label htmlFor="channel-sync-start-date">언제의 댓글부터 가져올까요?</label>
  <p>최신 댓글부터 선택한 날짜까지 역순으로 가져옵니다.</p>
  <input id="channel-sync-start-date" name="startDate" type="date" max={today} required />
  <button className="button button-primary" type="submit">댓글 가져오기 시작</button>
  <Link href="/app/videos">영상 하나로 분류 테스트</Link>
</form>
```

설정 후에는 시작 날짜, backfill 상태, 마지막 성공 시각, 신규 저장/중복/실패/분류 수를 표시한다. 전체 댓글 수는 YouTube가 정확한 잔여량을 제공하지 않으므로 가짜 percent를 만들지 않고 indeterminate progress를 사용한다.

- [ ] **Step 5: 반응형·접근성 CSS를 추가한다**

Date input과 버튼은 44px 이상의 hit target을 유지한다. 760px 이하에서는 날짜/버튼을 한 열로 배치하고, `aria-live="polite"` 상태 문구와 error `role="alert"`를 제공한다.

- [ ] **Step 6: UI 테스트를 통과시킨다**

Run: `npm test -- src/features/ingestion/channel-sync-progress.test.ts src/features/ingestion/channel-sync-progress-panel.test.tsx`

Expected: PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add 'src/app/(product)/app/connect/youtube/actions.ts' 'src/app/(product)/app/connect/youtube/page.tsx' src/app/globals.css src/features/ingestion/channel-sync-progress.ts src/features/ingestion/channel-sync-progress.test.ts src/features/ingestion/channel-sync-progress-panel.tsx src/features/ingestion/channel-sync-progress-panel.test.tsx
git commit -m "feat: choose channel comment sync start date"
```

---

### Task 8: 사용자 즉시 실행 route와 자동 worker를 연결한다

**Files:**
- Create: `src/app/api/channel-comment-sync/status/route.ts`
- Create: `src/app/api/channel-comment-sync/process/route.ts`
- Create: `src/app/api/internal/channel-comment-sync/process/route.ts`
- Create: `src/app/api/internal/channel-comment-sync/process/route.test.ts`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `.env.example`
- Create: `vercel.json`

**Interfaces:**
- Consumes: authenticated workspace or `Authorization: Bearer ${CRON_SECRET}`.
- Produces: bounded sync/classification processing result and safe status DTO.

- [ ] **Step 1: route authorization 실패 테스트를 작성한다**

```ts
it("rejects a cron request without the secret", async () => {
  const response = await GET(new Request("http://localhost/api/internal/channel-comment-sync/process"));
  expect(response.status).toBe(401);
});

it("runs a bounded batch with the correct secret", async () => {
  const response = await GET(new Request(url, {
    headers: { authorization: `Bearer ${"c".repeat(32)}` },
  }));
  expect(response.status).toBe(200);
  expect(processWorker).toHaveBeenCalledWith({ maxSyncClaims: 1, maxAnalysisItems: 5 });
});
```

- [ ] **Step 2: route 테스트가 실패하는지 확인한다**

Run: `npm test -- src/app/api/internal/channel-comment-sync/process/route.test.ts src/lib/env.test.ts`

Expected: FAIL because the route and `CRON_SECRET` do not exist.

- [ ] **Step 3: 사용자 status/process route를 구현한다**

`GET /api/channel-comment-sync/status`는 settings, 최근 run 합계, 연결된 channel-sync import의 pending analysis count만 조회해 DTO로 반환한다. `POST /api/channel-comment-sync/process`는 `requireViewer()`의 workspace 전용 claim 1건과 classification item 최대 5개만 처리한다.

- [ ] **Step 4: cron worker를 구현한다**

```ts
export async function GET(request: Request) {
  const { CRON_SECRET } = getServerEnv();
  if (!CRON_SECRET || !hasValidBearer(request, CRON_SECRET)) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  return Response.json(await processChannelSyncWorker({
    maxSyncClaims: 1,
    maxAnalysisItems: 5,
  }));
}
```

Worker 한 호출은 sync page 1개와 classification item 5개를 상한으로 가져 종료한다. 오류는 해당 run/item에 기록하고 다른 workspace 데이터를 응답에 포함하지 않는다.

- [ ] **Step 5: cron 환경과 주기를 선언한다**

`.env.example`에 값 없는 `CRON_SECRET=`을 추가하고 Zod에서 32자 이상 optional secret으로 검증한다.

```json
{
  "crons": [
    { "path": "/api/internal/channel-comment-sync/process", "schedule": "*/5 * * * *" }
  ]
}
```

5분 cron은 worker를 깨우는 주기다. 실제 신규 channel fetch는 DB의 `next_sync_at`이 60분이 되었을 때만 claim된다.

- [ ] **Step 6: route와 env 테스트를 통과시킨다**

Run: `npm test -- src/app/api/internal/channel-comment-sync/process/route.test.ts src/lib/env.test.ts`

Expected: PASS.

- [ ] **Step 7: 커밋한다**

```bash
git add src/app/api/channel-comment-sync/status/route.ts src/app/api/channel-comment-sync/process/route.ts src/app/api/internal/channel-comment-sync/process/route.ts src/app/api/internal/channel-comment-sync/process/route.test.ts src/lib/env.ts src/lib/env.test.ts .env.example vercel.json
git commit -m "feat: process channel sync in bounded workers"
```

---

### Task 9: 전체 fixture 흐름과 운영 문서를 검증한다

**Files:**
- Create: `e2e/channel-comment-date-sync.spec.ts`
- Modify: `README.md`
- Modify: `docs/CrowdSift_Project_Context_v1.0.pdf`

**Interfaces:**
- Consumes: Task 1~8의 UI, worker, fixture, DB state.
- Produces: 사용자 흐름의 회귀 테스트와 실행 가능한 운영 문서.

- [ ] **Step 1: Playwright 실패 테스트를 작성한다**

```ts
test("imports newest channel comments back to the selected date", async ({ page }) => {
  await connectFixtureYouTube(page);
  await page.getByLabel("언제의 댓글부터 가져올까요?").fill("2026-08-01");
  await page.getByRole("button", { name: "댓글 가져오기 시작" }).click();
  await expect(page.getByText("선택 날짜까지 가져오기 완료")).toBeVisible();
  await expect(page.getByText("2026-07-31 fixture comment")).not.toBeVisible();
  await page.getByRole("link", { name: "Comment Inbox에서 보기" }).click();
  await expect(page.getByText(/안전|주의|위험/).first()).toBeVisible();
});
```

같은 날짜로 다시 설정하고 실행했을 때 신규 저장 수가 0이고 Inbox row가 중복되지 않는 시나리오를 하나 더 작성한다.

- [ ] **Step 2: E2E가 실패하는지 확인한다**

Run: `npm run test:e2e -- e2e/channel-comment-date-sync.spec.ts`

Expected: FAIL before all wiring is complete.

- [ ] **Step 3: README를 갱신한다**

다음 내용을 정확히 기록한다.

- 기본 사용자 흐름과 보조 `/app/videos` 테스트 흐름의 차이.
- `feature/<name>/<work>` branch 규칙과 이번 branch 이름.
- 로컬에서 status/process route로 한 batch를 실행하는 방법.
- production의 `CRON_SECRET`과 5분 wake-up/60분 fetch 차이.
- 날짜가 오래될수록 YouTube page 수와 OpenAI 분석 비용이 증가한다는 안내.
- published 댓글 읽기만 자동화하며 실제 moderation action은 사용자 확인이 필요하다는 제한.

- [ ] **Step 4: PDF source-of-truth를 다시 생성하고 시각 검증한다**

`docs/product-context.md`와 동일한 내용으로 PDF를 갱신하고 `pdftoppm`으로 모든 page를 PNG로 렌더한다. 제목·첫 실제 흐름·날짜 sync·수동 테스트 경로가 잘리지 않고 Markdown과 일치하는지 눈으로 확인한다.

- [ ] **Step 5: E2E를 통과시킨다**

Run: `npm run test:e2e -- e2e/channel-comment-date-sync.spec.ts`

Expected: PASS for initial backfill and repeat-run dedupe scenarios.

- [ ] **Step 6: 전체 검증을 실행한다**

Run: `npm run test`

Expected: all Vitest tests pass.

Run: `npm run db:test`

Expected: all pgTAP tests pass.

Run: `npm run lint`

Expected: exit code 0.

Run: `npm run build`

Expected: Next.js 16 production build exits with code 0.

- [ ] **Step 7: live API 수동 smoke test를 한다**

실제 테스트 채널에서 오늘 또는 어제 날짜를 선택하고 다음을 기록한다.

- API page와 reply page 수, quota units.
- observed/stored/duplicate/failed/analyzed 수.
- 경계 날짜 이전 댓글이 저장되지 않았는지.
- 동일 작업 재실행 시 신규 댓글만 분석되는지.
- Inbox의 최신순, 원문 보호, 단계별 분류 trace가 유지되는지.
- token revoke, quota exceeded, channel not found에서 재연결/재시도 문구가 맞는지.

- [ ] **Step 8: 최종 커밋한다**

```bash
git add e2e/channel-comment-date-sync.spec.ts README.md docs/CrowdSift_Project_Context_v1.0.pdf
git commit -m "test: verify channel comment date sync flow"
```

---

## Acceptance Criteria

- YouTube 연결 완료 화면에서 `언제의 댓글부터 가져올까요?`와 필수 date input을 볼 수 있다.
- 사용자는 미래가 아닌 날짜를 선택하고 영상 선택 없이 수집을 시작한다.
- 채널 댓글은 `allThreadsRelatedToChannelId + order=time`으로 최신순 조회된다.
- 선택 날짜 당일 댓글은 포함되고 그보다 오래된 최상위 댓글에서 backfill이 중단된다.
- page token, lease, watermark가 저장되어 중단 후 다시 이어갈 수 있다.
- 한 channel page에 여러 영상 댓글이 있어도 실제 video ID별 import job으로 안전하게 저장된다.
- 신규 댓글만 현재 Classification V1 분석 item을 만들고 duplicate는 분석 비용을 다시 발생시키지 않는다.
- 원문과 최초 payload는 immutable하며 편집 관찰은 별도 observation으로 남는다.
- 포함 스레드의 전체 답글과 이후 추가된 새 답글이 부모 관계를 유지해 저장된다.
- 연결 화면에서 backfill/분류/실패 상태와 실제 집계만 표시되고 가짜 progress percent는 없다.
- 브라우저를 닫아도 cron worker가 남은 backfill, incremental sync, classification을 계속할 수 있다.
- `/app/videos`의 영상 하나 수동 검증 흐름은 유지되지만 기본 onboarding 경로가 아니다.
- 자동 moderation action은 발생하지 않는다.
- fixture/live 상태가 UI와 저장 record에서 구분된다.
- 단위, DB, E2E, lint, production build가 모두 통과한다.

## Self-Review

- **Spec coverage:** 날짜 UI, KST 날짜 저장, 채널 전체 최신순, 페이지 재개, 날짜 중단, 중복 skip, 신규 분석, 답글, 자동 sync, 상태 UI, 기존 수동 테스트 경로 보존을 Task 1~9에서 모두 다룬다.
- **Boundary clarity:** 날짜 기준은 최상위 thread에 적용하고 그 thread의 reply 전체를 포함한다. 나중에 달린 reply는 별도 reconciliation으로 보완한다.
- **Data integrity:** `raw_comments`와 최초 payload를 수정하지 않고 observation과 분석 record를 분리한다.
- **Cost control:** YouTube page는 100개 상한, reply reconciliation은 parent 20개 상한, classification은 worker 호출당 item 5개 상한이다.
- **Type consistency:** provider의 `youtubeVideoId`, collector의 video group, import job의 `youtube_video_id`, raw comment의 `youtube_video_id`가 같은 이름과 의미로 이어진다.
- **Failure recovery:** claim lease, completion/failure RPC, page token, incremental watermark, reply cursor가 모든 재시작 지점을 가진다.
