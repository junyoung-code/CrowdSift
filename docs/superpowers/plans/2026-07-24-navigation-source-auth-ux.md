# Navigation, Source Visibility, and Google Sign-In Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix persistent sidebar selection, safely show comment source by review level, repair acknowledged source retrieval, and make Google OAuth the primary persistent login while retaining Magic Link as a fallback.

**Architecture:** Keep the product layout server-rendered and isolate pathname-aware navigation in a small client component. Extend the Inbox security-definer read model to include source text only for `safe` comments, and add a separate membership-scoped RPC for acknowledged protected source. Reuse the existing Supabase SSR PKCE callback and cookie-refresh Proxy for Google login, while keeping login scopes separate from YouTube channel authorization.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Supabase Auth/Postgres/RLS, `@supabase/ssr`, Vitest, Testing Library, pgTAP, Playwright, Phosphor Icons, CSS.

## Global Constraints

- `docs/product-context.md` and `docs/CommentHawk_Project_Context_v0.1.pdf` remain the product source of truth.
- Follow `docs/superpowers/specs/2026-07-24-navigation-source-auth-ux-design.md` exactly.
- Never grant `authenticated` direct `select` access to `raw_comments`.
- Only comments with `review_level = 'safe'` and `source_deleted_at IS NULL` may include source text in the initial Inbox response.
- `caution`, `risk`, pending, failed, and unclassified comments must not include source text in initial HTML or RSC data.
- Return `text_display`, not `text_original` or raw provider payload, to the UI.
- Keep Google sign-in scopes separate from YouTube connection and moderation scopes.
- Preserve the existing Magic Link flow behind `다른 방법으로 로그인`.
- Preserve the current session policy: `jwt_expiry = 3600`, refresh-token rotation enabled, no timebox, and no inactivity timeout.
- Keep secrets server-side and commit only empty variable names to `.env.example`.
- Do not modify or stage the user-owned `src/app/globals 2.css`.
- Use TDD for every implementation task.
- Before completion run `npm test`, `npm run db:test`, `npm run test:e2e`, `npm run lint`, `npx tsc --noEmit`, and `npm run build`.

## File Responsibility Map

- `src/features/app-shell/app-navigation.tsx`: pathname-aware product navigation.
- `src/features/app-shell/app-navigation.test.tsx`: exact and prefix active-route tests.
- `src/features/app-shell/app-shell.tsx`: shell composition and logout placement.
- `src/features/auth/google-sign-in-button.tsx`: browser Google OAuth initiation.
- `src/features/auth/google-sign-in-button.test.tsx`: provider and redirect contract.
- `src/features/auth/sign-out-button.tsx`: browser session sign-out and redirect.
- `src/features/auth/sign-out-button.test.tsx`: successful and failed sign-out behavior.
- `src/features/auth/safe-next-path.ts`: shared internal redirect validation.
- `src/features/inbox/comment-source-block.tsx`: reusable author and source rendering.
- `src/features/inbox/source-reveal.tsx`: warning, acknowledgement, fetch, retry, expand, and collapse state.
- `src/features/inbox/source-service.ts`: acknowledged source DTO and repository contract.
- `src/features/inbox/comment-inbox.tsx`: level-aware source presentation.
- `src/features/inbox/inbox-query.ts`: `safeSourceText` Inbox contract.
- `src/features/inbox/supabase-inbox-repository.ts`: RPC row mapping.
- `src/app/api/comments/[commentId]/source/route.ts`: acknowledged-source RPC adapter.
- `supabase/migrations/202607240027_navigation_source_auth_ux.sql`: safe source read model and protected source RPC.
- `supabase/tests/inbox.sql`: safe-source and workspace-isolation database assertions.
- `supabase/config.toml`: local Google provider registration.
- `.env.example`: local Google provider variable names only.

---

### Task 1: Pathname-Aware Product Navigation

**Files:**
- Create: `src/features/app-shell/app-navigation.tsx`
- Create: `src/features/app-shell/app-navigation.test.tsx`
- Modify: `src/features/app-shell/app-shell.tsx`
- Modify: `src/features/app-shell/app-shell.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: current pathname from `usePathname()`.
- Produces: `isNavigationItemActive(pathname: string, href: string): boolean` and `AppNavigation`.
- Guarantees: at most one link receives `className="is-active"` and `aria-current="page"`.

- [ ] **Step 1: Write failing route-matching tests**

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

let pathname = "/app";

vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
}));

import {
  AppNavigation,
  isNavigationItemActive,
} from "./app-navigation";

describe("AppNavigation", () => {
  it.each([
    ["/app", "/app", true],
    ["/app/inbox", "/app", false],
    ["/app/inbox", "/app/inbox", true],
    ["/app/inbox/thread", "/app/inbox", true],
    ["/app/connect/youtube", "/app/connect/youtube", true],
  ])("matches %s against %s", (current, href, expected) => {
    expect(isNavigationItemActive(current, href)).toBe(expected);
  });

  it("marks exactly one current link", () => {
    pathname = "/app/inbox";
    render(<AppNavigation />);

    expect(screen.getAllByRole("link").filter(
      (link) => link.getAttribute("aria-current") === "page",
    )).toHaveLength(1);
    expect(screen.getByRole("link", { name: "댓글 Inbox" }))
      .toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "개요" }))
      .not.toHaveAttribute("aria-current");
  });
});
```

- [ ] **Step 2: Run the focused test and confirm failure**

Run:

```bash
npm test -- src/features/app-shell/app-navigation.test.tsx
```

Expected: FAIL because `app-navigation.tsx` does not exist.

- [ ] **Step 3: Implement the client navigation**

```tsx
"use client";

import {
  ChatCircleDots,
  House,
  SlidersHorizontal,
  Video,
  YoutubeLogo,
} from "@phosphor-icons/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navigationItems = [
  { href: "/app", label: "개요", icon: House },
  { href: "/app/inbox", label: "댓글 Inbox", icon: ChatCircleDots },
  { href: "/app/videos", label: "영상", icon: Video },
  { href: "/app/connect/youtube", label: "YouTube 연결", icon: YoutubeLogo },
  { href: "/app/settings/moderation", label: "운영 기준", icon: SlidersHorizontal },
] as const;

export const isNavigationItemActive = (pathname: string, href: string) =>
  href === "/app"
    ? pathname === href
    : pathname === href || pathname.startsWith(`${href}/`);

export function AppNavigation() {
  const pathname = usePathname();

  return (
    <nav className="product-navigation" aria-label="CommentHawk 메뉴">
      {navigationItems.map(({ href, icon: Icon, label }) => {
        const active = isNavigationItemActive(pathname, href);
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={active ? "is-active" : undefined}
            href={href}
            key={href}
          >
            <Icon aria-hidden="true" weight="duotone" />
            <span>{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
```

Replace the inline navigation map in `AppShell` with `<AppNavigation />`. Change CSS from the incorrect first-child selector to:

```css
.product-navigation a:hover {
  background: #f4f7fc;
  color: var(--ch-ink-soft);
}

.product-navigation a.is-active {
  background: var(--ch-blue-soft);
  color: var(--ch-blue-strong);
}
```

- [ ] **Step 4: Run navigation and shell tests**

Run:

```bash
npm test -- src/features/app-shell/app-navigation.test.tsx src/features/app-shell/app-shell.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/features/app-shell/app-navigation.tsx src/features/app-shell/app-navigation.test.tsx src/features/app-shell/app-shell.tsx src/features/app-shell/app-shell.test.tsx src/app/globals.css
git commit -m "fix: track active product navigation"
```

---

### Task 2: Safe Inbox Source and Protected Source RPC

**Files:**
- Create: `supabase/migrations/202607240027_navigation_source_auth_ux.sql`
- Modify: `supabase/tests/inbox.sql`
- Regenerate: `src/types/database.ts`

**Interfaces:**
- Produces: `get_inbox_page(...).safe_source_text text`.
- Produces: `get_acknowledged_comment_source(target_workspace_id uuid, target_raw_comment_id uuid)`.
- Guarantees: protected comments never return source through `get_inbox_page`; direct `raw_comments` access remains revoked.

- [ ] **Step 1: Extend the DB test fixture with safe, caution, risk, and foreign-workspace comments**

Add analyzed source rows and plan assertions that prove:

```sql
select is(
  (
    select safe_source_text
    from public.get_inbox_page(
      target_workspace_id => '33333333-3333-3333-3333-333333333333',
      review_levels => array['safe']::public.review_level[]
    )
    where raw_comment_id = '77777777-7777-4777-8777-777777777777'
  ),
  '안전 댓글 원문',
  'safe source is returned in the inbox read model'
);

select is(
  (
    select safe_source_text
    from public.get_inbox_page(
      target_workspace_id => '33333333-3333-3333-3333-333333333333',
      review_levels => array['caution']::public.review_level[]
    )
    where raw_comment_id = '88888888-8888-4888-8888-888888888888'
  ),
  null,
  'caution source is omitted from the inbox read model'
);

select lives_ok(
  $$
    select *
    from public.get_acknowledged_comment_source(
      '33333333-3333-3333-3333-333333333333',
      '88888888-8888-4888-8888-888888888888'
    )
  $$,
  'workspace member can request acknowledged source'
);

select throws_ok(
  $$
    select *
    from public.get_acknowledged_comment_source(
      '44444444-4444-4444-8444-444444444444',
      '88888888-8888-4888-8888-888888888888'
    )
  $$,
  '42501',
  'workspace access denied',
  'other workspace source is denied'
);

select throws_ok(
  $$ select text_display from public.raw_comments limit 1 $$,
  '42501',
  null,
  'authenticated users still cannot select raw_comments directly'
);
```

- [ ] **Step 2: Run the DB test and confirm failure**

Run:

```bash
npm run db:test
```

Expected: FAIL because `safe_source_text` and `get_acknowledged_comment_source` do not exist.

- [ ] **Step 3: Recreate `get_inbox_page` with safe-only source**

In the migration, drop the current exact function signature, recreate the function from `202607240025_source_aware_read_models.sql`, and make these exact additions:

```sql
returns table (
  raw_comment_id uuid,
  source_import_job_id uuid,
  source_kind public.comment_source_kind,
  youtube_video_id text,
  author_display_name text,
  author_avatar_url text,
  published_at timestamptz,
  source_available boolean,
  safe_source_text text,
  analysis_id uuid,
  category public.comment_category,
  review_level public.review_level,
  confidence real,
  recommended_action public.recommended_action,
  manual_review boolean,
  neutral_text text,
  normalized_question text,
  analysis_state text,
  action_state public.action_state,
  delete_eligible boolean,
  total_count bigint
)
```

Add this expression to `inbox_rows` after `source_available`:

```sql
case
  when cca.review_level = 'safe'::public.review_level
    and rc.source_deleted_at is null
  then rc.text_display
  else null
end as safe_source_text
```

Return `ir.safe_source_text` in the final select immediately after `ir.source_available`. Keep all filters, ordering, page-size bounds, membership checks, grants, and revocations identical to the current function.

- [ ] **Step 4: Add the protected source RPC**

Append:

```sql
create or replace function public.get_acknowledged_comment_source(
  target_workspace_id uuid,
  target_raw_comment_id uuid
)
returns table (
  author_display_name text,
  author_avatar_url text,
  published_at timestamptz,
  text_display text,
  captured_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null
    or not public.is_workspace_member(target_workspace_id)
  then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  return query
  select
    rc.author_display_name,
    rc.author_avatar_url,
    rc.published_at,
    rc.text_display,
    rc.captured_at
  from public.raw_comments rc
  where rc.id = target_raw_comment_id
    and rc.workspace_id = target_workspace_id
    and rc.source_deleted_at is null
  limit 1;
end;
$$;

revoke all on function public.get_acknowledged_comment_source(uuid, uuid)
  from public;
grant execute on function public.get_acknowledged_comment_source(uuid, uuid)
  to authenticated, service_role;
```

- [ ] **Step 5: Reset DB, regenerate types, and run DB tests**

Run:

```bash
npm run db:reset
npm run db:types
npm run db:test
```

Expected: migrations apply and all DB tests PASS.

- [ ] **Step 6: Commit Task 2**

```bash
git add supabase/migrations/202607240027_navigation_source_auth_ux.sql supabase/tests/inbox.sql src/types/database.ts
git commit -m "fix: scope comment source reads by review level"
```

---

### Task 3: Acknowledged Source Service and Route

**Files:**
- Modify: `src/features/inbox/source-service.ts`
- Modify: `src/features/inbox/source-service.test.ts`
- Modify: `src/app/api/comments/[commentId]/source/route.ts`
- Create: `src/app/api/comments/[commentId]/source/route.test.ts`

**Interfaces:**
- Consumes: DB RPC from Task 2.
- Produces:

```ts
type CommentSource = {
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  textDisplay: string;
  capturedAt: string;
};
```

- [ ] **Step 1: Write failing service tests for the enriched DTO**

Update the repository fixture and expected result:

```ts
const source = {
  authorDisplayName: "테스트 작성자",
  authorAvatarUrl: null,
  publishedAt: "2026-07-23T00:00:00.000Z",
  textDisplay: "표시 원문",
  capturedAt: "2026-07-23T00:01:00.000Z",
};
```

Keep the existing acknowledgement-required and cross-workspace not-found tests.

- [ ] **Step 2: Write failing Route Handler tests**

Mock `requireViewer`, `createServerSupabaseClient`, and `rpc`. Assert:

```ts
expect(mockRpc).toHaveBeenCalledWith(
  "get_acknowledged_comment_source",
  {
    target_raw_comment_id: "comment-1",
    target_workspace_id: "workspace-1",
  },
);
expect(await response.json()).toEqual(source);
```

Also assert:

- missing acknowledgement returns 400 without an RPC call;
- empty RPC data returns 404;
- DB permission and unknown failures never include DB messages or source text.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
npm test -- src/features/inbox/source-service.test.ts 'src/app/api/comments/[commentId]/source/route.test.ts'
```

Expected: FAIL because the route still calls `.from("raw_comments")` and the DTO is incomplete.

- [ ] **Step 4: Implement the DTO and RPC-backed repository**

Replace the route repository body with:

```ts
const { data, error } = await supabase.rpc(
  "get_acknowledged_comment_source",
  {
    target_workspace_id: input.workspaceId,
    target_raw_comment_id: input.commentId,
  },
);

if (error) throw error;
const row = data?.[0];
if (!row) return null;

return {
  authorDisplayName: row.author_display_name,
  authorAvatarUrl: row.author_avatar_url,
  publishedAt: row.published_at,
  textDisplay: row.text_display,
  capturedAt: row.captured_at,
};
```

Do not catch-and-log raw DB payloads. Preserve the public response codes `400`, `404`, and `500`.

- [ ] **Step 5: Run focused tests**

Run:

```bash
npm test -- src/features/inbox/source-service.test.ts 'src/app/api/comments/[commentId]/source/route.test.ts'
```

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/features/inbox/source-service.ts src/features/inbox/source-service.test.ts 'src/app/api/comments/[commentId]/source/route.ts' 'src/app/api/comments/[commentId]/source/route.test.ts'
git commit -m "fix: load acknowledged source through secure rpc"
```

---

### Task 4: Review-Level-Aware Inbox Presentation

**Files:**
- Create: `src/features/inbox/comment-source-block.tsx`
- Create: `src/features/inbox/comment-source-block.test.tsx`
- Modify: `src/features/inbox/inbox-query.ts`
- Modify: `src/features/inbox/supabase-inbox-repository.ts`
- Modify: `src/features/inbox/supabase-inbox-repository.test.ts`
- Modify: `src/features/inbox/comment-inbox.tsx`
- Modify: `src/features/inbox/comment-inbox.test.tsx`
- Modify: `src/features/inbox/source-reveal.tsx`
- Modify: `src/features/inbox/source-reveal.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `InboxItem.safeSourceText` and Task 3 `CommentSource`.
- Produces: reusable `CommentSourceBlock`.
- Guarantees: only `safe` renders source without acknowledgement.

- [ ] **Step 1: Write failing repository and Inbox tests**

Add `safe_source_text` to the RPC fixture and assert mapping:

```ts
expect(result.items[0]?.safeSourceText).toBe("안전 댓글 원문");
```

Add UI cases:

```tsx
it("shows safe source immediately without a reveal button", () => {
  renderInbox({
    ...item,
    reviewLevel: "safe",
    category: "positive",
    safeSourceText: "오늘 영상도 잘 봤어요.",
  });

  expect(screen.getByText("오늘 영상도 잘 봤어요.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "원문 확인" }))
    .not.toBeInTheDocument();
});

it.each(["caution", "risk"] as const)(
  "does not embed %s source in the initial card",
  (reviewLevel) => {
    renderInbox({
      ...item,
      reviewLevel,
      safeSourceText: null,
    });
    expect(screen.queryByText("원문에만 있는 표현")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원문 확인" }))
      .toBeInTheDocument();
  },
);
```

- [ ] **Step 2: Write failing SourceReveal interaction tests**

Assert that after acknowledgement:

- the sanitized summary remains visible in the parent card;
- author name, timestamp, and source text appear;
- `원문 접기` removes the source block from the screen;
- a 500 response leaves a retry button available;
- `textOriginal` is neither expected nor rendered.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```bash
npm test -- src/features/inbox
```

Expected: FAIL because `safeSourceText`, `CommentSourceBlock`, enriched source, retry, and collapse do not exist.

- [ ] **Step 4: Extend Inbox contracts and repository mapping**

Add:

```ts
safeSourceText: string | null;
```

Map:

```ts
safeSourceText: row.safe_source_text,
```

and add `safe_source_text: string | null` to `InboxRpcRow`.

- [ ] **Step 5: Implement `CommentSourceBlock`**

```tsx
type CommentSourceBlockProps = {
  authorDisplayName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  textDisplay: string;
  capturedAt?: string;
  protectedSource?: boolean;
};
```

Render:

- avatar image when URL exists, otherwise a user-icon fallback;
- author name or `이름 없는 시청자`;
- Korean formatted published time when present;
- source text with `white-space: pre-wrap`;
- captured time only for acknowledged protected source;
- `확인한 원문` label only when `protectedSource`.

- [ ] **Step 6: Implement safe and protected branches**

In `CommentInbox`:

```tsx
const showSafeSource =
  item.reviewLevel === "safe" &&
  item.sourceAvailable &&
  item.safeSourceText !== null;
```

- Render `CommentSourceBlock` in the summary for `showSafeSource`.
- Render `getPrimarySummary(item)` for all non-safe branches.
- Render `SourceReveal` only when `!showSafeSource && item.sourceAvailable`.
- Pass no source text for caution, risk, pending, failed, or missing review level.

In `SourceReveal`:

- render the enriched `CommentSourceBlock` after success;
- retain the warning acknowledgement;
- add `원문 접기`;
- retain the sanitized parent summary;
- show `다시 시도` after a transient error.

- [ ] **Step 7: Add accessible styling**

Add focused classes for source author row, avatar, fallback icon, source body, protected label, collapse, and retry. Preserve desktop and responsive Inbox layout. Ensure controls have visible focus styles and do not rely on color alone.

- [ ] **Step 8: Run focused and component tests**

Run:

```bash
npm test -- src/features/inbox
```

Expected: PASS.

- [ ] **Step 9: Commit Task 4**

```bash
git add src/features/inbox src/app/globals.css
git commit -m "feat: reveal comment source by review level"
```

---

### Task 5: Google Primary Login, Persistent Session, and Logout

**Files:**
- Create: `src/features/auth/safe-next-path.ts`
- Create: `src/features/auth/safe-next-path.test.ts`
- Create: `src/features/auth/google-sign-in-button.tsx`
- Create: `src/features/auth/google-sign-in-button.test.tsx`
- Create: `src/features/auth/sign-out-button.tsx`
- Create: `src/features/auth/sign-out-button.test.tsx`
- Modify: `src/app/auth/sign-in/page.tsx`
- Modify: `src/app/auth/sign-in/page.test.tsx`
- Modify: `src/app/auth/sign-in/sign-in-form.tsx`
- Modify: `src/app/auth/callback/route.ts`
- Modify: `src/app/auth/callback/route.test.ts`
- Modify: `src/features/app-shell/app-shell.tsx`
- Modify: `src/features/app-shell/app-shell.test.tsx`
- Modify: `src/lib/supabase/proxy.ts`
- Modify: `supabase/config.toml`
- Modify: `.env.example`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `getSafeNextPath(value: unknown): string`.
- Produces: primary Google OAuth redirect with the existing `/auth/callback`.
- Produces: explicit Supabase sign-out.
- Guarantees: email Magic Link remains usable and session policy remains indefinite until explicit or security-driven termination.

- [ ] **Step 1: Write failing safe-next and Google OAuth tests**

```ts
it.each([
  ["/app/inbox?levels=risk", "/app/inbox?levels=risk"],
  ["//evil.example", "/app"],
  ["/%5Cevil.example", "/app"],
  ["https://evil.example", "/app"],
  [undefined, "/app"],
])("normalizes %s", (value, expected) => {
  expect(getSafeNextPath(value)).toBe(expected);
});
```

Mock `createBrowserSupabaseClient()` and assert:

```ts
expect(mockSignInWithOAuth).toHaveBeenCalledWith({
  provider: "google",
  options: {
    redirectTo:
      "http://localhost:3000/auth/callback?next=%2Fapp%2Finbox",
  },
});
```

Do not request YouTube scopes, `access_type: "offline"`, or provider-token persistence.

- [ ] **Step 2: Write failing sign-in page and logout tests**

Assert:

- `Google로 계속하기` is the primary visible button;
- Magic Link fields are inside `다른 방법으로 로그인`;
- sign-out calls `supabase.auth.signOut()`;
- successful sign-out replaces the route with `/auth/sign-in` and refreshes;
- failure exposes a retryable alert without logging token data;
- AppShell includes the logout control.

- [ ] **Step 3: Run focused auth tests and confirm failure**

Run:

```bash
npm test -- src/features/auth src/app/auth src/features/app-shell
```

Expected: FAIL because Google sign-in, shared safe-next, and sign-out do not exist.

- [ ] **Step 4: Extract safe internal redirect validation**

Implement:

```ts
export const getSafeNextPath = (value: unknown) => {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (
    typeof candidate !== "string" ||
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    /[\\\u0000-\u001F\u007F]/.test(candidate)
  ) {
    return "/app";
  }

  try {
    const decoded = decodeURIComponent(candidate);
    if (decoded.includes("\\") || decoded.startsWith("//")) return "/app";
    return candidate;
  } catch {
    return "/app";
  }
};
```

Use it in both the sign-in page and callback route.

- [ ] **Step 5: Implement Google sign-in**

`GoogleSignInButton`:

```tsx
"use client";

export function GoogleSignInButton({ nextPath }: { nextPath: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const signIn = async () => {
    setPending(true);
    setError(null);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", nextPath);
    const supabase = createBrowserSupabaseClient();
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });
    if (authError) {
      setPending(false);
      setError("Google 로그인을 시작하지 못했습니다. 다시 시도해 주세요.");
    }
  };

  return (
    <>
      <button className="button button-google" onClick={signIn} type="button">
        {pending ? "Google로 이동 중…" : "Google로 계속하기"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </>
  );
}
```

Render it before:

```tsx
<details className="auth-alternative">
  <summary>다른 방법으로 로그인</summary>
  <SignInForm />
</details>
```

- [ ] **Step 6: Implement sign-out**

Use a small client component that calls:

```ts
const { error } = await createBrowserSupabaseClient().auth.signOut();
if (error) {
  setError("로그아웃하지 못했습니다. 다시 시도해 주세요.");
  return;
}
router.replace("/auth/sign-in");
router.refresh();
```

Place it in the AppShell sidebar footer without exposing session tokens to props.

- [ ] **Step 7: Configure local Google provider**

Add to `supabase/config.toml`:

```toml
[auth.external.google]
enabled = true
client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"
secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"
skip_nonce_check = false
```

Add empty names to `.env.example`:

```dotenv
# Supabase Auth Google login (separate from YouTube OAuth)
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=
```

Do not add `[auth.sessions]`, do not change `jwt_expiry = 3600`, and do not expose the secret through `NEXT_PUBLIC_*`.

- [ ] **Step 8: Run auth tests**

Run:

```bash
npm test -- src/features/auth src/app/auth src/features/app-shell
```

Expected: PASS.

- [ ] **Step 9: Commit Task 5**

```bash
git add .env.example supabase/config.toml src/features/auth src/app/auth src/features/app-shell src/lib/supabase/proxy.ts src/app/globals.css
git commit -m "feat: add persistent Google sign in"
```

---

### Task 6: E2E Regression, Documentation, and Final Verification

**Files:**
- Modify: `e2e/public-youtube-read-only.spec.ts`
- Modify: `e2e/helpers/supabase-mail.ts` only if the existing helper needs an explicit fallback name
- Modify: `docs/manual-public-youtube-verification.md`
- Modify: `docs/product-context.md`
- Modify: `docs/superpowers/plans/2026-07-24-navigation-source-auth-ux.md`

**Interfaces:**
- Consumes: Tasks 1–5.
- Produces: documented local Google setup, retained Magic Link E2E fallback, and checked completion boxes.

- [ ] **Step 1: Add failing E2E assertions**

Using the existing Mailpit login helper as the deterministic CI fallback:

```ts
await expect(page.getByRole("link", { name: "댓글 Inbox" }))
  .toHaveAttribute("aria-current", "page");

await expect(page.getByText("오늘 영상도 편안하게 잘 봤어요."))
  .toBeVisible();

const protectedCard = page.locator(".inbox-comment-card").filter({
  hasText: "원문에서 보존할 만한",
}).first();
await expect(protectedCard.getByText("source harmful text"))
  .not.toBeVisible();
await protectedCard.getByRole("button", { name: "원문 확인" }).click();
await protectedCard.getByRole("button", {
  name: "경고를 확인하고 원문 보기",
}).click();
await expect(protectedCard.getByText("source harmful text")).toBeVisible();
```

Also assert the login page visibly offers `Google로 계속하기` while the fixture test chooses the Magic Link fallback.

- [ ] **Step 2: Run E2E and confirm any missing behavior**

Run:

```bash
npm run test:e2e
```

Expected before all integration is complete: FAIL at the new navigation/source/auth assertions.

- [ ] **Step 3: Complete integration-only corrections**

Only correct wiring exposed by E2E:

- selector and card boundaries;
- safe fixture selection;
- protected fixture selection;
- focus and dialog timing;
- logout redirect;
- no live Google or YouTube network calls in fixture mode.

Do not weaken assertions or expose protected source in fixture HTML to make E2E pass.

- [ ] **Step 4: Update documentation**

Document:

- Google login is the primary authentication path;
- Magic Link and Mailpit remain deterministic local fallback;
- exact local Google origin and callback values;
- login Google OAuth and YouTube OAuth are separate;
- safe comments are visible immediately;
- caution/risk sources require acknowledgement;
- same-browser session persists until logout.

- [ ] **Step 5: Run the complete verification suite**

Run:

```bash
npm test
npm run test:eval
npm run db:test
npm run test:e2e
npm run lint
npx tsc --noEmit
npm run build
git diff --check
```

Expected:

- unit and integration tests PASS;
- evaluation tests PASS with the existing human-review release gate still separate;
- DB tests PASS;
- E2E PASS, except any previously documented intentionally skipped viewport;
- lint, type-check, production build, and diff check PASS.

- [ ] **Step 6: Perform security and scope checks**

Run:

```bash
rg -n --hidden --glob '!node_modules/**' --glob '!.git/**' \
  '(sk-[A-Za-z0-9_-]{20,}|AIza[0-9A-Za-z_-]{20,}|client_secret.*=.+)' .
git status --short
```

Expected:

- no populated secrets;
- `src/app/globals 2.css` remains untracked and unstaged;
- only files in this plan are changed.

- [ ] **Step 7: Check all Plan boxes and commit Task 6**

```bash
git add e2e/public-youtube-read-only.spec.ts docs/manual-public-youtube-verification.md docs/product-context.md docs/superpowers/plans/2026-07-24-navigation-source-auth-ux.md
git commit -m "test: verify navigation source and auth UX"
```

## Final Acceptance Checklist

- [ ] Exactly one sidebar item remains active after every product navigation.
- [ ] Safe comments show author metadata and source text immediately.
- [ ] Safe comments do not show the source warning flow.
- [ ] Caution, risk, pending, failed, and unclassified comments omit source text from initial data.
- [ ] Acknowledgement reveals author metadata and source below the sanitized summary.
- [ ] Protected source can be collapsed and resets after refresh.
- [ ] Cross-workspace and anonymous source reads are denied.
- [ ] `authenticated` still lacks direct `raw_comments` select privilege.
- [ ] Google is the primary sign-in method.
- [ ] Magic Link remains available under `다른 방법으로 로그인`.
- [ ] Login Google scopes remain separate from YouTube scopes.
- [ ] The browser session refreshes until explicit logout.
- [ ] Logout clears the Supabase session and returns to sign-in.
- [ ] No populated secret is committed.
- [ ] Full verification suite passes.
