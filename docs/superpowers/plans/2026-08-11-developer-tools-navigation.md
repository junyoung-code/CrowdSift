# Developer Tools Navigation Implementation Plan

> **For agentic workers:** This compact plan is executed inline in the current session. Do not dispatch subagents.

**Goal:** 일반 사용자 메뉴에서 `영상`을 제거하고, 기존 수동 댓글 테스트를 승인된 개발자만 사용하는 `/app/developer-tools`로 이동한다.

**Architecture:** 서버 환경변수와 로그인 user ID로 개발자 권한을 한 곳에서 판정한다. Product layout은 메뉴 표시 여부만 전달하고, page와 모든 Server Action은 서버에서 권한을 다시 확인한다. 기존 수집·Classification V1·DB 저장 경로는 변경하지 않고 화면과 redirect 경로만 이동한다.

**Tech Stack:** Next.js 16.2 App Router, React Server Components, Server Actions, TypeScript, Zod, Vitest, Testing Library

## Global Constraints

- Production에서는 개발자 도구를 항상 비활성화한다.
- `ENABLE_DEVELOPER_TOOLS=true`와 `DEVELOPER_USER_IDS` allowlist를 모두 만족해야 한다.
- 일반 사용자는 메뉴, page 직접 접근, Server Action 직접 호출 모두 사용할 수 없다.
- 기존 원문 저장, Classification V1, Comment Inbox 데이터 경로는 변경하지 않는다.
- 기존 자동 채널 동기화 주기는 변경하지 않는다.

---

### Task 1: Developer Access and Navigation

**Files:**
- Create: `src/features/developer-tools/developer-tools-access.ts`
- Create: `src/features/developer-tools/developer-tools-access.test.ts`
- Modify: `src/lib/env.ts`
- Modify: `src/lib/env.test.ts`
- Modify: `.env.example`
- Modify: `src/app/(product)/app/layout.tsx`
- Modify: `src/features/app-shell/app-shell.tsx`
- Modify: `src/features/app-shell/app-navigation.tsx`
- Modify: `src/features/app-shell/app-navigation.test.tsx`
- Modify: `src/features/app-shell/app-shell.test.tsx`

**Interfaces:**
- Produces: `hasDeveloperToolsAccess({ nodeEnv, enabled, allowedUserIds, userId }): boolean`
- Produces: `requireDeveloperToolsViewer(): Promise<Viewer>` for page and Server Action authorization.
- Consumes: `ENABLE_DEVELOPER_TOOLS` and comma-separated `DEVELOPER_USER_IDS` from server env.

- [x] **Step 1: Write failing access and navigation tests**

```ts
expect(hasDeveloperToolsAccess({
  nodeEnv: "development",
  enabled: true,
  allowedUserIds: "user-1,user-2",
  userId: "user-1",
})).toBe(true);
expect(hasDeveloperToolsAccess({
  nodeEnv: "production",
  enabled: true,
  allowedUserIds: "user-1",
  userId: "user-1",
})).toBe(false);
```

Render `AppNavigation` with and without `developerToolsEnabled`; assert that `영상` never appears and `개발자 도구` appears only as the last link for an approved developer.

- [x] **Step 2: Run focused tests and verify RED**

Run: `npx vitest run src/features/developer-tools/developer-tools-access.test.ts src/features/app-shell/app-navigation.test.tsx src/features/app-shell/app-shell.test.tsx src/lib/env.test.ts`

Expected: FAIL because access helpers, environment fields, and navigation props do not exist.

- [x] **Step 3: Implement the minimal server authorization and navigation props**

```ts
export const hasDeveloperToolsAccess = (input: DeveloperToolsAccessInput) =>
  input.nodeEnv !== "production" &&
  input.enabled &&
  parseAllowedUserIds(input.allowedUserIds).includes(input.userId);
```

`requireDeveloperToolsViewer` calls `requireViewer`, evaluates the server env, and calls `notFound()` when access is denied. Product layout passes the resulting boolean through `AppShell` to `AppNavigation`.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the Task 1 focused command again.

Expected: PASS.

---

### Task 2: Move Manual Tests to Developer Tools

**Files:**
- Create: `src/app/(product)/app/developer-tools/page.tsx`
- Modify: `src/app/(product)/app/videos/page.tsx`
- Modify: `src/app/(product)/app/videos/actions.ts`
- Modify: `src/app/(product)/app/connect/youtube/page.tsx`
- Modify: `src/app/(product)/app/connect/youtube/public-video-actions.ts`
- Modify: `src/features/ingestion/channel-sync-progress-panel.tsx`
- Modify: `src/features/ingestion/channel-sync-progress-panel.test.tsx`
- Modify: `src/features/dashboard/dashboard-view.tsx`
- Modify: `src/app/api/analysis-jobs/[jobId]/retry/route.ts`
- Modify: `src/app/api/import-jobs/[jobId]/process/route.ts`

**Interfaces:**
- Consumes: Task 1 `requireDeveloperToolsViewer`.
- Produces: `/app/developer-tools` containing the existing owned-video import and public-URL import panels.
- Produces: `/app/videos` compatibility redirect for approved developers and 404 for everyone else.

- [x] **Step 1: Write failing UI regression tests**

Remove the expected `영상 하나로 분류 테스트` link from the channel sync panel test. Add assertions that the normal shell excludes `영상` and that developer mode exposes only `개발자 도구` as the final navigation item.

- [x] **Step 2: Move the existing page without duplicating the ingestion pipeline**

The new page reuses `syncYouTubeVideosAction`, `importYouTubeCommentsAction`, `previewPublicVideoAction`, and `startPublicVideoImportAction`. It keeps existing DB jobs and progress components, but changes heading copy to `DEVELOPER TOOLS / 댓글 분류 테스트`.

- [x] **Step 3: Enforce action authorization and update paths**

```ts
const { workspaceId } = await requireDeveloperToolsViewer();
revalidatePath("/app/developer-tools");
redirect("/app/developer-tools?imported=1");
```

All four manual-test Server Actions authorize before reading form input or calling providers. Remove `PublicVideoImportPanel` and manual-test links from the YouTube connection screen. Replace dashboard `/app/videos` links with operational routes (`/app/connect/youtube` or `/app/inbox`).

- [x] **Step 4: Run relevant tests**

Run: `npx vitest run src/features/developer-tools/developer-tools-access.test.ts src/features/app-shell/app-navigation.test.tsx src/features/app-shell/app-shell.test.tsx src/features/ingestion/channel-sync-progress-panel.test.tsx src/lib/env.test.ts`

Expected: PASS.

- [x] **Step 5: Verify the product**

Run: `npm run lint`

Run: `npm run build`

Expected: both exit 0. In the local app, confirm the normal sidebar order is `개요 → 댓글 Inbox → YouTube 연결 → 운영 기준`, and an allowlisted developer sees `개발자 도구` last.
