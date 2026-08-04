# Comment Inbox Conversation Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current card-based Comment Inbox with the approved dark conversation workspace while keeping every displayed comment, reply, analysis, and moderation state grounded in stored CrowdSift data.

**Architecture:** Keep the route page as a Server Component that loads workspace-scoped data. Add a dedicated read-only Supabase RPC for top-level Inbox conversations and their stored replies, map that result into a serializable domain contract, and render the interactive master-detail selection inside a focused Client Component. Preserve the existing source-reveal warning, creator-correction actions, and explicit YouTube moderation confirmation flow.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, Supabase/PostgreSQL, Vitest, Testing Library, pgTAP, Phosphor Icons, global CSS.

## Global Constraints

- Use `docs/product-context.md` and `docs/CrowdSift_Project_Context_v1.0.pdf` as product truth.
- Advance the approved first vertical slice; do not add billing, multi-platform support, Rules, Audience, or unrelated dashboards.
- Never present generated sample comments, placeholder metrics, or draft replies as connected YouTube data.
- Keep raw source, AI output, sanitized feedback, user actions, evidence, and audit records structurally separate.
- Keep `주의` and `위험` source text hidden until the existing explicit source-warning flow succeeds.
- Do not post replies or perform irreversible moderation automatically.
- Preserve the selected visual target at `references/crowdsift-ui/2026-07-28-comment-inbox-dark-brandbastion.png`.
- Keep the page responsive below 1440px and maintain keyboard-visible focus states.
- Run `npm run lint` and `npm run build` before reporting completion.
- Do not overwrite or revert unrelated dirty-worktree changes.

---

### Task 1: Conversation read model

**Files:**
- Create: `supabase/migrations/202607280030_comment_inbox_conversations.sql`
- Create: `supabase/tests/inbox_conversation_workspace.sql`
- Modify: `src/types/database.ts`
- Modify: `src/features/inbox/inbox-query.ts`
- Modify: `src/features/inbox/supabase-inbox-repository.ts`
- Modify: `src/features/inbox/supabase-inbox-repository.test.ts`

**Interfaces:**
- Consumes: immutable `raw_comments`, `comment_import_items`, `comment_import_jobs`, `current_comment_analyses`, `sanitized_feedback`, `youtube_videos`, and existing workspace membership checks.
- Produces: `InboxItem` with `likeCount`, `replyCount`, `videoTitle`, `videoThumbnailUrl`, and `replies: InboxReply[]`.

- [ ] **Step 1: Write the failing repository mapping test**

Add a complete RPC row fixture containing:

```ts
like_count: 12,
reply_count: 2,
video_title: "등산 필수 장비 7가지",
video_thumbnail_url: "https://i.ytimg.com/example.jpg",
replies: [
  {
    rawCommentId: "reply-1",
    authorDisplayName: "creator_hj",
    authorAvatarUrl: null,
    publishedAt: "2026-07-28T10:10:00.000Z",
    likeCount: 5,
    reviewLevel: "safe",
    sourceAvailable: true,
    safeSourceText: "좋은 지적 감사합니다.",
    neutralText: null,
    normalizedQuestion: null,
  },
],
```

Assert the repository returns those literal camelCase values and never adds a protected reply source field.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm test -- src/features/inbox/supabase-inbox-repository.test.ts
```

Expected: the mapping assertions fail because the new conversation fields do not exist.

- [ ] **Step 3: Add a failing pgTAP read-model test**

Create a workspace member, one stored top-level comment, two stored replies, analyses, sanitized feedback, and a YouTube video. Assert:

```sql
select results_eq(
  $$
    select reply_count
    from public.get_inbox_conversation_page(
      'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
    )
  $$,
  array[2::bigint],
  'conversation rows count stored replies'
);
```

Also assert the RPC returns one top-level row, returns both reply metadata records, exposes safe source text only for safe replies, and returns `null` source text for caution/risk replies.

- [ ] **Step 4: Run the pgTAP test and verify RED**

Run:

```bash
npm run db:test -- supabase/tests/inbox_conversation_workspace.sql
```

Expected: failure because `get_inbox_conversation_page` does not exist.

- [ ] **Step 5: Add the additive conversation RPC**

Create `public.get_inbox_conversation_page` instead of mutating the existing `get_inbox_page` function. The new function must:

```sql
where rc.parent_youtube_comment_id is null
```

for top-level rows, calculate reply count by matching:

```sql
reply.parent_youtube_comment_id = rc.youtube_comment_id
```

join `youtube_videos` for title and thumbnail, and build replies with `jsonb_agg`. Each reply payload may contain stored metadata, safe source text only when its review level is `safe`, and sanitized feedback; it must not include `raw_comments.text_display` for caution/risk replies.

Revoke public execution and grant only `authenticated` and `service_role`, matching the existing Inbox RPC.

- [ ] **Step 6: Apply the migration without resetting local data**

Run:

```bash
npx supabase migration up --local --yes
```

- [ ] **Step 7: Update TypeScript contracts and repository mapping**

Define:

```ts
export type InboxReply = {
  rawCommentId: string;
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  likeCount: number;
  reviewLevel: ReviewLevel | null;
  sourceAvailable: boolean;
  safeSourceText: string | null;
  neutralText: string | null;
  normalizedQuestion: string | null;
};
```

Extend `InboxItem` with the new conversation fields and change the repository RPC name to `get_inbox_conversation_page`.

- [ ] **Step 8: Run read-model tests and verify GREEN**

Run:

```bash
npm test -- src/features/inbox/inbox-query.test.ts src/features/inbox/supabase-inbox-repository.test.ts
npm run db:test -- supabase/tests/inbox_conversation_workspace.sql
```

Expected: all selected TypeScript and database tests pass.

---

### Task 2: Master-detail Comment Inbox behavior

**Files:**
- Modify: `src/app/(product)/app/inbox/page.tsx`
- Modify: `src/features/inbox/comment-inbox.tsx`
- Modify: `src/features/inbox/comment-inbox.test.tsx`
- Modify: `src/features/inbox/source-reveal.tsx`

**Interfaces:**
- Consumes: `InboxItem[]`, selected comment ID from `searchParams`, existing correction/moderation server actions, and existing protected-source API.
- Produces: top-level comment queue, `답글 N개 보기` links, selected thread workspace, analysis summary, and existing action controls.

- [ ] **Step 1: Write failing component behavior tests**

Add literal tests that verify:

```ts
expect(screen.getByRole("link", { name: "답글 2개 보기" })).toHaveAttribute(
  "href",
  expect.stringContaining("selected=comment-1"),
);
expect(screen.getByRole("region", { name: "선택한 댓글 스레드" }))
  .toBeInTheDocument();
expect(screen.getByText("좋은 지적 감사합니다.")).toBeInTheDocument();
expect(screen.queryByText("숨겨야 하는 위험 답글 원문")).not.toBeInTheDocument();
```

Also verify:

- zero replies produce no reply disclosure;
- the selected queue row has `aria-current="true"`;
- safe top-level source appears immediately;
- caution/risk top-level source still uses the existing reveal button;
- public URL observations do not expose moderation controls;
- the selected row remains encoded in pagination and filter URLs.

- [ ] **Step 2: Run the focused component test and verify RED**

Run:

```bash
npm test -- src/features/inbox/comment-inbox.test.tsx
```

Expected: failures for missing conversation regions, reply disclosure links, and selected state.

- [ ] **Step 3: Pass selected comment state from the server page**

Read `searchParams.selected` as a bounded string and pass it to `CommentInbox`. When absent or invalid, select the first returned item. Keep the page itself server-rendered.

- [ ] **Step 4: Implement the queue and selected thread**

Make `CommentInbox` a focused Client Component only where local filter/selection interaction requires it. Render:

- an accessible filter/search queue;
- top-level rows only;
- avatar, author, relative/published time, sanitized or safe preview, like count, reply count, thumbnail, and review level;
- a plain `답글 N개 보기` disclosure with a caret only when `replyCount > 0`;
- the selected top-level comment and stored replies in the center workspace;
- safe reply text or sanitized reply feedback, never protected source text.

Use ordinary links/search params for durable selection so refresh and browser navigation preserve the selected thread.

- [ ] **Step 5: Preserve protected-source behavior**

Allow `SourceReveal` to accept a button label:

```ts
label?: string;
```

Use `출처 댓글 확인` in the new workspace while retaining `원문 확인` as the default elsewhere.

- [ ] **Step 6: Re-home existing actions**

Keep creator correction and moderation controls attached to the selected comment. Maintain:

- public-source read-only explanation;
- explicit moderation confirmation request;
- conditional delete eligibility;
- source-unavailable messaging.

Do not add a working reply composer in this task. Render the approved composer-shaped area as an honest locked state:

```text
답글 작성은 YouTube 게시·증거 저장 구현 후 사용할 수 있습니다.
```

Its button must be disabled and must not imply a reply can currently be posted.

- [ ] **Step 7: Run the component suite and verify GREEN**

Run:

```bash
npm test -- src/features/inbox/comment-inbox.test.tsx src/features/inbox/source-reveal.test.tsx
```

Expected: all selected tests pass.

---

### Task 3: Approved dark visual system and responsive layout

**Files:**
- Copy: `references/crowdsift-ui/2026-07-28-comment-inbox-dark-brandbastion.png`
- Modify: `src/features/app-shell/app-shell.tsx`
- Modify: `src/features/app-shell/app-shell.test.tsx`
- Modify: `src/app/globals.css`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: the existing app shell and final selected visual source.
- Produces: Inbox-scoped black/charcoal theme, BrandBastion-softened surfaces, wide text navigation, four-region desktop layout, and responsive drawers/stacking.

- [ ] **Step 1: Save the selected source visual**

Copy the final generated source image to:

```text
references/crowdsift-ui/2026-07-28-comment-inbox-dark-brandbastion.png
```

Leave the generated original in place.

- [ ] **Step 2: Write a failing shell/inbox visual-contract test**

Assert the Inbox page emits a stable scoping hook such as:

```tsx
<div className="inbox-page inbox-conversation-workspace">
```

and that the shell navigation continues to expose the real CrowdSift links and accessible active state.

- [ ] **Step 3: Run the visual-contract test and verify RED**

Run:

```bash
npm test -- src/features/app-shell/app-shell.test.tsx src/features/inbox/comment-inbox.test.tsx
```

Expected: the new scoping hook assertion fails.

- [ ] **Step 4: Implement the approved layout tokens**

Scope dark tokens under:

```css
.product-shell:has(.inbox-conversation-workspace)
```

Use:

```css
--inbox-black: #050608;
--inbox-surface: #0b0e14;
--inbox-surface-raised: #101522;
--inbox-border: #202838;
--inbox-blue: #246bfe;
```

Desktop layout at 1440px:

```css
grid-template-columns: minmax(300px, 360px) minmax(560px, 1fr) 220px;
```

Use 12–16px radii for grouped surfaces, restrained semantic tints, visible focus states, and no gradient or glassmorphism.

- [ ] **Step 5: Implement responsive behavior**

- `1180–1439px`: collapse the analysis rail into a details drawer.
- `1024–1179px`: reduce queue width and keep the thread primary.
- `<1024px`: stack queue and thread; keep source warning and moderation confirmation visible.
- `<820px`: preserve the existing horizontal app navigation behavior without clipping the Inbox controls.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/app-shell/app-shell.test.tsx src/features/inbox/comment-inbox.test.tsx
```

Expected: all selected tests pass.

---

### Task 4: Browser verification and completion gate

**Files:**
- Modify: `design-qa.md`
- Create: `docs/qa/comment-inbox-dark-workspace.png`
- Create: `docs/qa/comment-inbox-dark-workspace-comparison.png`

**Interfaces:**
- Consumes: selected source visual and locally rendered `/app/inbox`.
- Produces: browser evidence, design-QA history, and verified completion output.

- [ ] **Step 1: Run the complete automated verification**

Run:

```bash
npm test
npm run db:test
npm run lint
npm run build
```

Expected: every command exits `0`.

- [ ] **Step 2: Start the local app and open the Inbox**

Use the Codex in-app browser at a `1440 × 1024` viewport. Load a real local authenticated/fixture Inbox state; the fixture banner must remain visible when fixture data is used.

- [ ] **Step 3: Test primary interactions**

Verify:

- search and review-level filters;
- selecting a queue row;
- `답글 N개 보기`;
- safe comment visibility;
- caution/risk source warning and cancellation;
- correction details;
- public-source read-only state;
- moderation request confirmation entry;
- responsive layout at 1180px and below 1024px;
- no browser console errors.

- [ ] **Step 4: Capture and compare**

Capture the implementation and create a same-size side-by-side comparison with the selected source. Review typography, layout rhythm, colors, image quality, icons, Korean copy, interaction states, and accessibility.

- [ ] **Step 5: Fix P0/P1/P2 findings and repeat**

Record every iteration in `design-qa.md`. Stop only when it contains:

```text
final result: passed
```

P3 polish may remain as follow-up notes.

- [ ] **Step 6: Re-run required completion commands**

After visual fixes, run fresh:

```bash
npm test
npm run db:test
npm run lint
npm run build
```

Expected: every command exits `0` with no failing tests.
