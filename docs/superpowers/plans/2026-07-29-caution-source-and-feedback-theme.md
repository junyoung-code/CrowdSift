# Comment Inbox Caution Source and Feedback Theme Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show stored source text immediately for safe and caution comments and replies, keep risk source behind acknowledgment, and make the AI correction form follow the active light or dark product theme.

**Architecture:** Keep source visibility enforcement in the authenticated Supabase Inbox read model so the initial Client Component props contain only source text allowed by the selected policy. Extend the existing `safe_source_text` field to mean “source text allowed in the initial Inbox response,” then make the conversation component render safe and caution source immediately while retaining `SourceReveal` for risk. Replace Inbox form hardcoded neutral colors with the existing product and Inbox theme tokens.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, Supabase/PostgreSQL, pgTAP, Vitest, Testing Library, global CSS.

## Global Constraints

- `안전`과 `주의` 댓글은 최상위 댓글과 대댓글 모두 원문을 즉시 표시한다.
- `위험` 댓글 원문은 초기 Inbox 조회 응답과 초기 DOM에 포함하지 않는다.
- 위험 원문은 기존 `POST /api/comments/[commentId]/source` 경고 확인 흐름을 통해서만 표시한다.
- 원본 댓글, AI 분석, 순화 피드백과 사용자 수정 기록은 계속 분리하며 원본을 덮어쓰지 않는다.
- `safeSourceText` 이름은 이번 변경에서 유지하되 “초기 화면에 표시 가능한 원문”으로 해석한다.
- 라이트·다크 변경은 중립색만 바꾸고 안전·주의·위험 의미색과 레이아웃은 유지한다.
- 새 패키지와 새 외부 API는 추가하지 않는다.
- 구현 완료 전 `npm run lint`와 `npm run build`를 실행한다.

## File Structure

- Create: `supabase/migrations/202607290031_caution_source_visibility.sql` — 기존 conversation RPC를 재정의해 safe와 caution 원문만 초기 응답에 포함한다.
- Modify: `supabase/tests/inbox_conversation_workspace.sql` — top-level과 reply의 caution 원문 반환 및 risk 원문 비반환을 검증한다.
- Modify: `src/features/inbox/comment-inbox.tsx` — safe/caution 즉시 원문과 risk 경고 공개 렌더링을 구분한다.
- Modify: `src/features/inbox/comment-inbox.test.tsx` — 최상위 댓글과 대댓글의 등급별 원문 노출 회귀 테스트를 담당한다.
- Modify: `src/app/globals.css` — AI 판단 수정 폼의 하드코딩된 다크 중립색을 테마 토큰으로 교체한다.
- Modify: `src/app/inbox-theme-css.test.ts` — correction form 컨트롤의 토큰 사용을 정적 검증한다.
- Modify: `docs/product-context.md` — 확정된 safe/caution/risk 공개 기준을 제품 기준 문서에 반영한다.

---

### Task 1: Enforce safe and caution source visibility in the conversation read model

**Files:**
- Create: `supabase/migrations/202607290031_caution_source_visibility.sql`
- Modify: `supabase/tests/inbox_conversation_workspace.sql:74-320`
- Modify: `supabase/tests/inbox_conversation_workspace.sql:320-374`

**Interfaces:**
- Consumes: `public.get_inbox_conversation_page(...)` and its existing `safe_source_text text` / reply JSON `safeSourceText` contract.
- Produces: the same function signature, with `safe_source_text` populated only when `review_level in ('safe', 'caution')` and `source_deleted_at is null`.

- [ ] **Step 1: Extend the pgTAP fixture with an explicit risk reply**

Add a fourth `raw_comments` fixture whose `parent_youtube_comment_id` is `parent-conversation`, plus matching `comment_import_items`, `model_runs`, and `comment_analyses` rows. Use these exact identifying values:

```sql
raw_comment_id: a0300000-0000-4000-8000-000000000013
youtube_comment_id: reply-risk
text_display: 위험 답글 원문
model_run_id: a0300000-0000-4000-8000-000000000014
analysis_id: a0300000-0000-4000-8000-000000000015
review_level: risk
category: abusive_no_signal
```

Rename the existing caution reply text from `숨겨야 하는 위험 답글 원문` to `주의 답글 원문` so the fixture meaning matches its analysis.

- [ ] **Step 2: Write failing read-model assertions**

Change `select plan(4)` to `select plan(6)` and add these assertions:

```sql
select is(
  (
    select safe_source_text
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '3:20 구간 설명이 이해가 안 돼요.',
  'caution top-level source is available in the conversation'
);

select is(
  (
    select replies -> 1 ->> 'safeSourceText'
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  '주의 답글 원문',
  'caution reply source is available in the conversation'
);

select is(
  (
    select replies -> 2 ->> 'safeSourceText'
    from public.get_inbox_conversation_page(
      target_workspace_id => 'a0300000-0000-4000-8000-000000000002'
    )
  ),
  null,
  'risk reply source is omitted from the conversation'
);
```

Update `reply_count` from `2::bigint` to `3::bigint`.

- [ ] **Step 3: Run the focused database test and verify RED**

Run:

```bash
npm run db:test -- supabase/tests/inbox_conversation_workspace.sql
```

Expected: the caution source assertions fail because the current RPC returns `null`.

- [ ] **Step 4: Create the migration with the minimal policy change**

Copy the full current `public.get_inbox_conversation_page(...)` definition, revoke, and grant statements from `202607280030_comment_inbox_conversations.sql` into the new migration. Replace both source CASE expressions with:

```sql
case
  when reply_analysis.review_level in (
    'safe'::public.review_level,
    'caution'::public.review_level
  )
    and reply.source_deleted_at is null
  then reply.text_display
  else null
end as safe_source_text
```

and:

```sql
case
  when cca.review_level in (
    'safe'::public.review_level,
    'caution'::public.review_level
  )
    and rc.source_deleted_at is null
  then rc.text_display
  else null
end as safe_source_text
```

Do not include risk source text and do not change the function arguments, return columns, authorization check, ordering, filters, grants, or search behavior.

- [ ] **Step 5: Reset the local database and run the focused test**

Run:

```bash
npm run db:reset
npm run db:test -- supabase/tests/inbox_conversation_workspace.sql
```

Expected: all six pgTAP assertions pass.

- [ ] **Step 6: Commit the read-model policy**

```bash
git add supabase/migrations/202607290031_caution_source_visibility.sql supabase/tests/inbox_conversation_workspace.sql
git commit -m "feat: expose caution source in inbox conversations"
```

---

### Task 2: Render caution source immediately and keep risk behind acknowledgment

**Files:**
- Modify: `src/features/inbox/comment-inbox.tsx:95-112`
- Modify: `src/features/inbox/comment-inbox.tsx:652-744`
- Modify: `src/features/inbox/comment-inbox.test.tsx:7-185`

**Interfaces:**
- Consumes: `InboxItem.safeSourceText`, `InboxReply.safeSourceText`, `reviewLevel`, `sourceAvailable`, and `SourceReveal({ commentId })`.
- Produces: safe/caution initial source rendering and risk-only `SourceReveal` controls for top-level comments and replies.

- [ ] **Step 1: Write failing top-level caution and risk tests**

Replace the parameterized safe/caution hiding test with two explicit tests:

```tsx
it("shows caution source immediately without a reveal button", () => {
  renderInbox({
    ...item,
    safeSourceText: "주의 댓글 원문",
  });

  expect(screen.getByText("주의 댓글 원문")).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "원문 확인" }),
  ).not.toBeInTheDocument();
});

it("keeps risk source out of the initial card and offers acknowledgment", () => {
  renderInbox({
    ...item,
    reviewLevel: "risk",
    safeSourceText: null,
  });

  expect(screen.queryByText("위험 댓글 원문")).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "원문 확인" }),
  ).toBeInTheDocument();
});
```

Update the base caution fixture to `safeSourceText: "주의 댓글 원문"` and its caution reply to `safeSourceText: "주의 답글 원문"`.

- [ ] **Step 2: Write failing reply-level tests**

Add a risk reply to the rendered item and assert:

```tsx
expect(screen.getByText("주의 답글 원문")).toBeInTheDocument();
expect(screen.queryByText("위험 답글 원문")).not.toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "위험 답글 원문 확인" }),
).toBeInTheDocument();
```

To avoid duplicate accessible names, extend `SourceReveal` with an optional label:

```ts
type SourceRevealProps = {
  commentId: string;
  label?: string;
};
```

The default remains `원문 확인`; risk replies pass `label="위험 답글 원문 확인"`. The button text and accessible name use `label`.

- [ ] **Step 3: Run the focused component tests and verify RED**

Run:

```bash
npm test -- src/features/inbox/comment-inbox.test.tsx src/features/inbox/source-reveal.test.tsx
```

Expected: caution still renders the protected summary, and risk replies have no reveal control.

- [ ] **Step 4: Implement the minimal rendering policy**

Add:

```ts
const isInitiallyVisibleSource = (level: ReviewLevel | null) =>
  level === "safe" || level === "caution";
```

Use it for the selected top-level source branch:

```tsx
{isInitiallyVisibleSource(selectedItem.reviewLevel) &&
selectedItem.sourceAvailable &&
selectedItem.safeSourceText ? (
  <CommentSourceBlock
    authorAvatarUrl={selectedItem.authorAvatarUrl}
    authorDisplayName={selectedItem.authorDisplayName}
    publishedAt={selectedItem.publishedAt}
    textDisplay={selectedItem.safeSourceText}
  />
) : (
  // retain the current protected summary and SourceReveal branch
)}
```

Render reply content using these exact conditions:

```tsx
{isInitiallyVisibleSource(reply.reviewLevel) &&
reply.sourceAvailable &&
reply.safeSourceText ? (
  <p>{reply.safeSourceText}</p>
) : (
  <>
    <p>{getReplySummary(reply)}</p>
    {reply.reviewLevel === "risk" && reply.sourceAvailable ? (
      <SourceReveal
        commentId={reply.rawCommentId}
        label="위험 답글 원문 확인"
      />
    ) : null}
  </>
)}
```

In `SourceReveal`, retain `원문 확인` as the default:

```tsx
export function SourceReveal({
  commentId,
  label = "원문 확인",
}: SourceRevealProps) {
  // existing state and fetch flow
}
```

Use `{label}` in the reveal button. Do not change the POST endpoint, acknowledgment payload, focus restoration, retry behavior, collapse behavior, or warning copy.

- [ ] **Step 5: Run the focused component tests and verify GREEN**

Run:

```bash
npm test -- src/features/inbox/comment-inbox.test.tsx src/features/inbox/source-reveal.test.tsx
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit the UI policy**

```bash
git add src/features/inbox/comment-inbox.tsx src/features/inbox/comment-inbox.test.tsx src/features/inbox/source-reveal.tsx src/features/inbox/source-reveal.test.tsx
git commit -m "feat: show caution sources in comment inbox"
```

---

### Task 3: Make the AI correction form theme-aware

**Files:**
- Modify: `src/app/globals.css:5622-5629`
- Modify: `src/app/globals.css:6549-6573`
- Modify: `src/app/inbox-theme-css.test.ts:23-41`

**Interfaces:**
- Consumes: `--inbox-line`, `--inbox-panel-raised`, `--inbox-text-soft`, `--app-text`, and `--app-muted`.
- Produces: theme-derived correction `select` and `textarea` surfaces in both product themes.

- [ ] **Step 1: Write a failing CSS regression test**

Add:

```ts
it("derives AI correction controls from theme tokens", () => {
  const controls = declarationsFor(
    ".inbox-page .feedback-correction select",
  );

  expect(controls).toContain("var(--inbox-panel-raised)");
  expect(controls).toContain("var(--inbox-text-soft)");
  expect(controls).not.toContain("#090e16");
});
```

Because grouped selectors are not matched by the helper as a standalone selector, add one final explicit rule for `.inbox-page .feedback-correction select` rather than relying only on a grouped selector.

- [ ] **Step 2: Run the CSS test and verify RED**

Run:

```bash
npm test -- src/app/inbox-theme-css.test.ts
```

Expected: the control rule still contains `#090e16` or lacks `var(--inbox-panel-raised)`.

- [ ] **Step 3: Replace the hardcoded control surface**

Change the existing grouped rule to:

```css
.inbox-page .inbox-select-filters select,
.inbox-page .inbox-select-filters input,
.inbox-page .feedback-correction select,
.inbox-page .feedback-correction textarea {
  border-color: var(--inbox-line);
  background: var(--inbox-panel-raised);
  color: var(--inbox-text-soft);
}
```

Add a final explicit rule after the shared conversation normalization:

```css
.inbox-page .feedback-correction select {
  border-color: var(--inbox-line);
  background: var(--inbox-panel-raised);
  color: var(--inbox-text-soft);
}
```

Keep the existing focus-visible rules and semantic status colors unchanged.

- [ ] **Step 4: Run the CSS and component tests**

Run:

```bash
npm test -- src/app/inbox-theme-css.test.ts src/features/inbox/comment-inbox.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit the theme correction**

```bash
git add src/app/globals.css src/app/inbox-theme-css.test.ts
git commit -m "fix: theme inbox correction controls"
```

---

### Task 4: Align product truth and run complete verification

**Files:**
- Modify: `docs/product-context.md:52-59`

**Interfaces:**
- Consumes: approved design `docs/superpowers/specs/2026-07-29-caution-source-and-feedback-theme-design.md`.
- Produces: one authoritative product statement matching the implemented visibility policy.

- [ ] **Step 1: Update the product source of truth**

Replace the current caution/risk bullets with:

```markdown
- 안전·주의 댓글은 작성자 정보와 원문을 바로 보여준다.
- 위험 댓글은 의미를 훼손하지 않은 순화 요약을 먼저 보여주며, 사용자가 경고를 확인해야 작성자 정보와 원문을 아래에서 펼쳐 볼 수 있다.
- 펼친 위험 원문은 접을 수 있고 새로고침하면 다시 가려진 상태로 시작한다.
```

- [ ] **Step 2: Run all unit tests**

Run:

```bash
npm test
```

Expected: all Vitest suites pass.

- [ ] **Step 3: Run all database tests**

Run:

```bash
npm run db:test
```

Expected: all pgTAP suites pass, including the six conversation visibility assertions.

- [ ] **Step 4: Run static and production checks**

Run:

```bash
npm run lint
npx tsc --noEmit
npm run build
```

Expected: all commands exit successfully with no TypeScript, lint, or production build error.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git diff --check
git status --short
git diff -- src/features/inbox/comment-inbox.tsx src/features/inbox/source-reveal.tsx src/app/globals.css docs/product-context.md
```

Expected: no whitespace errors, no populated environment files, and no unrelated untracked files staged.

- [ ] **Step 6: Commit documentation and any final test-only adjustments**

```bash
git add docs/product-context.md
git commit -m "docs: update inbox source visibility policy"
```

## Completion Criteria

- Safe and caution top-level comments show stored source immediately.
- Safe and caution replies show stored source immediately.
- Risk top-level comments and replies do not include source text in the initial response or DOM.
- Risk source remains available only after acknowledgment and can be collapsed again.
- AI judgment correction selects and textarea use active theme tokens in light and dark modes.
- Product context matches the implemented policy.
- Focused tests, full Vitest, pgTAP, lint, TypeScript, and production build all pass.
