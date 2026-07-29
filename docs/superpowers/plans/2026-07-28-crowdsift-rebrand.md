# CrowdSift Rebrand Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the active product rebrand as CrowdSift across the application, runtime identifiers, current documentation, and product-context PDF while preserving credentials, existing data, and historical AI audit records.

**Architecture:** Treat the product display name, runtime slug, AI prompt versions, database defaults, and documentation paths as separate change boundaries. Update observable behavior through failing tests first, introduce one additive database migration, and use a reproducible PDF generator for the canonical CrowdSift context. Stable provider credentials and the running local Supabase Docker namespace remain unchanged.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, Vitest, Supabase/PostgreSQL pgTAP, Markdown, Python ReportLab, Poppler.

## Global Constraints

- Product display name is exactly `CrowdSift`.
- Runtime slug is exactly `crowdsift`.
- Destructive confirmation phrase is exactly `CROWDSIFT 데이터 삭제`.
- New prompt versions are `crowdsift-stage1-v2`, `crowdsift-stage2-v2`, and `crowdsift-dashboard-summary-v2`.
- Existing pre-rebrand v1 prompt records remain unchanged.
- API keys, OAuth client IDs, encryption keys, callback URLs, comments, analyses, and audit records are not modified.
- Existing applied migrations are immutable; database behavior changes use a new migration.
- `supabase/config.toml` keeps its current local project ID until a separately approved local-stack recreation.
- Untracked duplicate files whose names end in ` 2` are not modified or deleted.

---

### Task 1: User-facing CrowdSift identity

**Files:**
- Modify: `src/features/landing/landing-page.test.tsx`
- Modify: `src/app/auth/sign-in/page.test.tsx`
- Modify: `src/app/(product)/app/settings/data/data-deletion-form.test.tsx`
- Modify: `src/features/auth/workspace-deletion-service.test.ts`
- Modify: `src/app/layout.tsx`
- Modify: `src/features/landing/landing-page.tsx`
- Modify: `src/features/landing/landing-copy.ts`
- Modify: `src/features/app-shell/app-shell.tsx`
- Modify: `src/features/app-shell/app-navigation.tsx`
- Modify: `src/app/auth/sign-in/page.tsx`
- Modify: `src/app/(product)/app/connect/youtube/page.tsx`
- Modify: `src/app/(product)/app/settings/data/page.tsx`
- Modify: `src/app/(product)/app/settings/data/data-deletion-form.tsx`
- Modify: `src/features/dashboard/dashboard-view.tsx`
- Modify: `src/features/auth/workspace-deletion-service.ts`

**Interfaces:**
- Consumes: existing React components and `WORKSPACE_DELETION_CONFIRMATION`.
- Produces: CrowdSift metadata, visible copy, accessible labels, and exact deletion confirmation behavior.

- [ ] **Step 1: Change behavior expectations to CrowdSift**

Update the landing banner, sign-in heading, deletion form, and deletion service tests to expect these literals:

```ts
"CrowdSift"
"CrowdSift에 로그인"
"CROWDSIFT 데이터 삭제"
"CrowdSift 로그인 계정은 삭제되지 않습니다"
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- src/features/landing/landing-page.test.tsx src/app/auth/sign-in/page.test.tsx 'src/app/(product)/app/settings/data/data-deletion-form.test.tsx' src/features/auth/workspace-deletion-service.test.ts
```

Expected: failures show the former product strings.

- [ ] **Step 3: Update production UI and deletion behavior**

Replace active user-facing former-brand strings with `CrowdSift`, including
ARIA labels and Korean possessive phrases. Set:

```ts
export const WORKSPACE_DELETION_CONFIRMATION = "CROWDSIFT 데이터 삭제";
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the Step 2 command again. Expected: all focused tests pass.

- [ ] **Step 5: Commit the user-facing rebrand**

Stage only the Task 1 files and commit:

```bash
git commit -m "feat: rebrand application UI as CrowdSift"
```

### Task 2: Runtime slug and AI prompt versions

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/features/youtube/oauth-state-cookie.ts`
- Modify: `src/lib/fixture-external-network-guard.ts`
- Modify: `src/lib/fixture-node-network-guard.ts`
- Modify: `src/app/auth/sign-in/actions.test.ts`
- Modify: `src/features/analysis/prompts.ts`
- Modify: `src/evaluation/korean-comment-cases.json`
- Modify: `src/evaluation/run-evaluation.test.ts`
- Modify: `src/features/analysis/analysis-service.test.ts`
- Modify: `src/features/analysis/analysis-storage.test.ts`
- Modify: `src/features/analysis/idempotency.test.ts`
- Modify: `src/features/analysis/stage-two.integration.test.ts`
- Modify: `src/features/dashboard/supabase-dashboard-summary-repository.test.ts`

**Interfaces:**
- Consumes: the existing analysis pipeline and environment-selected OpenAI models.
- Produces: `crowdsift` package/runtime labels and v2 CrowdSift prompt provenance for new analyses.

- [ ] **Step 1: Change prompt provenance expectations**

Update test and evaluation fixtures to expect:

```ts
"crowdsift-stage1-v2"
"crowdsift-stage2-v2"
"crowdsift-dashboard-summary-v2"
```

Change the test-only host to `https://crowdsift.example`.

- [ ] **Step 2: Run analysis and auth tests and verify RED**

Run:

```bash
npm test -- src/evaluation/run-evaluation.test.ts src/features/analysis src/features/dashboard/supabase-dashboard-summary-repository.test.ts src/app/auth/sign-in/actions.test.ts
```

Expected: prompt version and example-origin assertions fail against current production constants.

- [ ] **Step 3: Update runtime and prompt implementation**

Set the package name to `crowdsift`, change the OAuth cookie and fixture guard
keys to the canonical slug, update active system-prompt product names, and use
the v2 prompt identifiers.

- [ ] **Step 4: Run Task 2 tests and verify GREEN**

Run the Step 2 command. Expected: all selected tests pass.

- [ ] **Step 5: Commit runtime identifiers**

Stage only Task 2 files and commit:

```bash
git commit -m "refactor: adopt CrowdSift runtime identifiers"
```

### Task 3: Default workspace database migration

**Files:**
- Create: `supabase/migrations/202607280029_crowdsift_workspace_names.sql`
- Create: `supabase/tests/crowdsift_rebrand.sql`

**Interfaces:**
- Consumes: `public.workspaces`.
- Produces: `내 CrowdSift` as the default for new workspaces while preserving custom names.

- [ ] **Step 1: Add a failing pgTAP test**

The test creates an authenticated owner, one default-named workspace, one exact
legacy default, and one custom workspace. Assert:

```sql
select is(
  (
    select name
    from public.workspaces
    where id = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa'
  ),
  '내 CrowdSift',
  'new workspaces use the CrowdSift default'
);

select is(
  (
    select name
    from public.workspaces
    where id = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb'
  ),
  '내 CrowdSift',
  'exact legacy defaults migrate to CrowdSift'
);

select is(
  (
    select name
    from public.workspaces
    where id = 'cccccccc-3333-4333-8333-cccccccccccc'
  ),
  '내 채널 운영실',
  'custom workspace names remain unchanged'
);
```

- [ ] **Step 2: Run the new DB test and verify RED**

Run:

```bash
npm run db:test -- supabase/tests/crowdsift_rebrand.sql
```

Expected: the new default and migrated legacy assertions fail.

- [ ] **Step 3: Add the migration**

Implement:

```sql
alter table public.workspaces
  alter column name set default '내 CrowdSift';

update public.workspaces
set name = '내 CrowdSift'
where name = '내 CrowdSift';
```

- [ ] **Step 4: Apply migration without resetting data**

Run:

```bash
npx supabase migration up --local --yes
```

- [ ] **Step 5: Run the new and full DB suites**

Run:

```bash
npm run db:test -- supabase/tests/crowdsift_rebrand.sql
npm run db:test
```

Expected: all database tests pass.

- [ ] **Step 6: Commit database changes**

Stage the new migration and pgTAP test and commit:

```bash
git commit -m "feat: migrate default workspace name to CrowdSift"
```

### Task 4: Canonical documentation and tracked paths

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `design-qa.md`
- Modify: `design-qa-dashboard.md`
- Modify: `design-qa-landing.md`
- Modify: tracked Markdown under `docs/codex-guides/`, `docs/superpowers/`, and `docs/`
- Rename: tracked former-slug specifications and plans to `crowdsift`
- Rename: the former UI reference folder to `references/crowdsift-ui/`
- Rename: the former product-context PDF to `docs/CrowdSift_Project_Context_v1.0.pdf`
- Create: `scripts/generate_crowdsift_context_pdf.py`

**Interfaces:**
- Consumes: updated `docs/product-context.md`.
- Produces: canonical CrowdSift documentation, links, reference paths, and a reproducible context PDF.

- [ ] **Step 1: Rename tracked paths with Git-aware moves**

Use `git mv` for every tracked path containing the former slug, preserving
file history. Do not touch untracked files ending in ` 2`.

- [ ] **Step 2: Mechanically update tracked text**

Within tracked text files only, replace the former display name, uppercase
confirmation prefix, lowercase slug, and misspelled repository name with their
CrowdSift equivalents. Restore the explicitly allowed
`supabase/config.toml` project ID afterward.

- [ ] **Step 3: Add a reproducible PDF generator**

Create `scripts/generate_crowdsift_context_pdf.py` using ReportLab. It reads
`docs/product-context.md`, registers
`/System/Library/Fonts/Supplemental/AppleGothic.ttf`, renders headings,
paragraphs, bullets, code blocks, and page numbers, and writes
`docs/CrowdSift_Project_Context_v1.0.pdf`.

- [ ] **Step 4: Generate and inspect the PDF**

Run the generator, then:

```bash
pdfinfo docs/CrowdSift_Project_Context_v1.0.pdf
pdftotext docs/CrowdSift_Project_Context_v1.0.pdf -
pdftoppm -png docs/CrowdSift_Project_Context_v1.0.pdf tmp/pdfs/crowdsift-context
```

Verify the extracted text contains `CrowdSift` and no active former-brand name;
inspect every rendered PNG for clipped, overlapping, or missing Korean text.

- [ ] **Step 5: Scan tracked files for legacy names**

Run a tracked-file-aware scan. Only immutable migration history, the exact-name
conversion migration, and the preserved local Supabase project ID may contain
the former identifier. The scan must exclude Git history and untracked ` 2`
copies.

- [ ] **Step 6: Commit documentation and generated artifacts**

Stage only Task 4 paths and commit:

```bash
git commit -m "docs: rebrand canonical project context as CrowdSift"
```

### Task 5: Full verification and handoff

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: Tasks 1-4.
- Produces: verified rebrand status and exact external owner checklist.

- [ ] **Step 1: Run unit and evaluation tests**

```bash
npm test
npm run test:eval
```

- [ ] **Step 2: Run database tests**

```bash
npm run db:test
```

- [ ] **Step 3: Run lint and production build**

```bash
npm run lint
npm run build
```

- [ ] **Step 4: Verify the running application**

Check `/`, `/auth/sign-in`, `/app`, `/app/connect/youtube`, and
`/app/settings/data`. Confirm CrowdSift branding, unchanged login callbacks,
and the exact deletion phrase.

- [ ] **Step 5: Report owner-only external actions**

Report these exact remaining actions without changing credentials:

1. Rename the current GitHub repository to `CrowdSift`.
2. Verify Google OAuth consent-screen app name is `CrowdSift`.
3. Rename hosted Supabase/Vercel display projects if they exist.
4. After closing Codex and the dev server, rename the local folder to
   `CrowdSift`.
5. After GitHub rename, update `origin` to the new repository URL.

- [ ] **Step 6: Review final Git status**

Confirm the rebrand did not stage, edit, or delete user-owned untracked ` 2`
files and did not absorb the earlier Inbox deduplication changes into unrelated
rebrand commits.
