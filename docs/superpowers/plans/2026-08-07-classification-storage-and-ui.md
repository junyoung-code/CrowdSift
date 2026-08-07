# Classification Storage and UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect the merged Moderation + Luna + conditional Terra classifier to imported comments, persistent storage, progress UI, and a per-comment decision trace in Comment Inbox.

**Architecture:** Keep `analysis_jobs` and `analysis_job_items` as the existing work queue, but replace the legacy processor with a classification-v1 service. Persist each external stage, deterministic branch, and final verdict separately; make the status API and Inbox read model consume the final verdict. Owned imports expose an explicit start button while public URL imports keep their existing automatic progression.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Vitest, Supabase/PostgreSQL, OpenAI Responses and Moderation APIs.

## Global Constraints

- Read `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`, `15-route-handlers.md`, and `09-revalidating.md` before production changes.
- Do not call the legacy analysis provider from UI or API after migration.
- Preserve YouTube connections, videos, raw comments, import jobs, observations, and audit logs.
- Clear only legacy AI-derived rows in explicit foreign-key order; do not use `TRUNCATE ... CASCADE`.
- Run Moderation and Luna in parallel; call Terra only when `routeFirstPass` returns `verify`.
- Map classifier `danger` to product `risk`; keep `review_queue` distinct with a null level.
- Hide caution, risk, and review-queue source text by default.
- Recommendations never execute delete, block, or report actions automatically.
- Do not implement the unavailable rewrite stage.
- Keep API keys and model configuration server-side.
- Before completion run `npm run lint` and `npm run build`.

---

### Task 1: Classification Persistence Contract and Database Migration

**Files:**
- Create: `supabase/migrations/202608070032_classification_v1_storage.sql`
- Create: `src/features/classification/storage.ts`
- Create: `src/features/classification/storage.test.ts`
- Modify: `src/types/database.ts`

**Interfaces:**
- Produces: `toStageRunRow(input)`, `toBranchRow(input)`, `toVerdictRow(input)` and database tables `classification_stage_runs`, `classification_branches`, `classification_verdicts`, `classification_feedback`.
- Consumes: `FirstPassResult`, `BranchOutcome`, `TerraVerdict`, and `Verdict` from the merged classifier.

- [ ] **Step 1: Write failing mapper tests**

Cover Moderation output, Luna usage, Terra output, instant-safe verdict, `danger -> risk`, and `review_queue -> level null`:

```ts
expect(toVerdictRow({
  item,
  verdict: { ...dangerVerdict, level: "danger" },
  reasonCodes: ["personal_attack"],
  feedbackType: "none",
  feedbackCore: null,
})).toMatchObject({ status: "decided", level: "risk", hide_source: true });
```

- [ ] **Step 2: Run tests and verify RED**

Run: `npm test -- src/features/classification/storage.test.ts`
Expected: FAIL because `storage.ts` does not exist.

- [ ] **Step 3: Implement pure storage mappers**

Use explicit row shapes and JSON casts. `toVerdictRow` must convert only `danger` to `risk`, preserve `null`, and never invent a level for review queue.

- [ ] **Step 4: Run mapper tests and verify GREEN**

Run: `npm test -- src/features/classification/storage.test.ts`
Expected: all mapper cases pass.

- [ ] **Step 5: Add the migration**

Create four RLS-enabled tables with workspace foreign keys, stage/status checks, unique idempotency keys, and indexes on workspace/comment/created time. `classification_feedback` references a final verdict and stores append-only user corrections without overwriting AI output. Delete legacy rows in this order: dashboard summary retry rows, summary rows, cost rows, feedback embeddings, creator feedback, sanitized feedback, comment analyses, model runs, rule evaluations, analysis job items, analysis jobs. Add service-role write access and member read policies matching neighboring analysis tables.

- [ ] **Step 6: Reset the local database and regenerate types**

Run: `npm run db:reset`
Expected: all migrations apply without an FK or policy error.

Run: `npm run db:types`
Expected: generated types contain all three classification tables.

- [ ] **Step 7: Re-run tests and commit**

Run: `npm test -- src/features/classification/storage.test.ts`

Commit:
```bash
git add supabase/migrations/202608070032_classification_v1_storage.sql src/features/classification/storage.ts src/features/classification/storage.test.ts src/types/database.ts
git commit -m "feat: add classification v1 storage"
```

### Task 2: Deterministic Final Result for the Instant-Safe Path

**Files:**
- Modify: `src/features/classification/verdict.ts`
- Modify: `src/features/classification/verdict.test.ts`
- Create: `src/features/classification/finalize.ts`
- Create: `src/features/classification/finalize.test.ts`

**Interfaces:**
- Produces: `FinalClassificationVerdict` and `finalizeClassification({ firstPass, branch, terra })`.
- Consumes: `routeFirstPass` and `decideVerdict`.

- [ ] **Step 1: Write failing instant-safe and verification tests**

```ts
expect(finalizeClassification({ firstPass, branch: instantSafe, terra: null }))
  .toMatchObject({ status: "decided", level: "safe", basis: "instant_safe", agreedWithFirstPass: null });
```

Also assert that a `verify` branch without Terra throws, and a verified danger result retains `danger` until the storage mapper converts it.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/classification/finalize.test.ts`
Expected: FAIL because the finalizer is missing.

- [ ] **Step 3: Implement the finalizer**

Define a normalized final type that supports `basis: "instant_safe"` and `agreedWithFirstPass: null`. For verify branches, call `decideVerdict` with the branch's `moderationMinimumLevel`.

- [ ] **Step 4: Verify GREEN and commit**

Run: `npm test -- src/features/classification/finalize.test.ts src/features/classification/verdict.test.ts`

Commit:
```bash
git add src/features/classification/finalize.ts src/features/classification/finalize.test.ts src/features/classification/verdict.ts src/features/classification/verdict.test.ts
git commit -m "feat: normalize final classification verdicts"
```

### Task 3: Classification Job Service and Supabase Repository

**Files:**
- Create: `src/features/classification/classification-service.ts`
- Create: `src/features/classification/classification-service.test.ts`
- Create: `src/features/classification/process-classification-job.ts`
- Create: `src/features/classification/process-classification-job.test.ts`
- Modify: `src/features/classification/openai-clients.ts`

**Interfaces:**
- Produces: `createClassificationService(dependencies).processChunk(jobId, maxItems)` and `processClassificationChunk(jobId, maxItems)`.
- Consumes: claimed work items, `createFirstPass`, `routeFirstPass`, `createSecondPass`, `finalizeClassification`, and storage mappers.

- [ ] **Step 1: Write failing service tests**

Test these observable sequences:

```ts
expect(firstPass).toHaveBeenCalledOnce();
expect(repository.insertStageRun).toHaveBeenCalledWith(expect.objectContaining({ stage: "moderation" }));
expect(repository.insertStageRun).toHaveBeenCalledWith(expect.objectContaining({ stage: "luna" }));
expect(secondPass).not.toHaveBeenCalled();
expect(repository.insertVerdict).toHaveBeenCalledWith(expect.objectContaining({ level: "safe" }));
```

Add separate cases for Terra verification, Moderation unavailable forcing Terra, Luna failure, Terra failure, and reuse of an already-stored successful stage.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/classification/classification-service.test.ts`
Expected: FAIL because the service is missing.

- [ ] **Step 3: Implement dependency-injected orchestration**

The service must persist stage success immediately, persist branch before Terra, persist final verdict before marking an item succeeded, and mark item failure with a stable error code. It must never call Terra on `instant_safe`.

Use `DEFAULT_CLASSIFICATION_PROFILE` and an empty similar-example list until a workspace has new `classification_feedback` rows; do not read deleted legacy feedback as classifier context.

- [ ] **Step 4: Verify service GREEN**

Run: `npm test -- src/features/classification/classification-service.test.ts`
Expected: all orchestration cases pass.

- [ ] **Step 5: Write failing Supabase adapter tests**

Assert workspace-scoped job loading, raw comment/video/profile mapping, idempotent stage lookup/insert, branch/verdict upsert, claim size limit, and job progress refresh.

- [ ] **Step 6: Verify adapter RED, implement, and verify GREEN**

Run before implementation: `npm test -- src/features/classification/process-classification-job.test.ts`
Expected: FAIL because the adapter is missing.

Run after implementation: `npm test -- src/features/classification/process-classification-job.test.ts`
Expected: adapter cases pass.

- [ ] **Step 7: Commit**

```bash
git add src/features/classification/classification-service.ts src/features/classification/classification-service.test.ts src/features/classification/process-classification-job.ts src/features/classification/process-classification-job.test.ts src/features/classification/openai-clients.ts
git commit -m "feat: process classification jobs"
```

### Task 4: Import Configuration, Processing API, Retry, and Progress Counts

**Files:**
- Create: `src/features/classification/configuration.ts`
- Create: `src/features/classification/configuration.test.ts`
- Modify: `src/features/ingestion/process-import-job.ts`
- Modify: `src/features/ingestion/process-public-import-job.ts`
- Modify: `src/app/api/analysis-jobs/[jobId]/process/route.ts`
- Create: `src/app/api/analysis-jobs/[jobId]/retry/route.ts`
- Modify: `src/app/api/import-jobs/[jobId]/status/route.ts`
- Modify: `src/features/ingestion/import-job-progress.ts`
- Modify: `src/features/ingestion/import-job-progress.test.ts`

**Interfaces:**
- Produces: `getClassificationConfigurationKey()`, expanded `ImportJobProgress.analysis`, processing/retry endpoints, and verdict counts.
- Consumes: `processClassificationChunk` and the three model env values.

- [ ] **Step 1: Write failing configuration and progress tests**

Assert that changing any model/prompt/schema version changes the configuration key, and that progress maps `safe/caution/risk/reviewQueue` counts without folding review queue into safe.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/classification/configuration.test.ts src/features/ingestion/import-job-progress.test.ts`
Expected: missing configuration function and missing count fields.

- [ ] **Step 3: Implement configuration and status mapping**

Build a deterministic versioned key and query `classification_verdicts` grouped by status/level in the status route. Keep auth and workspace ownership checks.

- [ ] **Step 4: Replace the route processor and add retry**

The process route calls `processClassificationChunk`. The retry route updates only failed items in the authenticated job to `pending`, clears their transient error fields, and leaves successful items untouched.

- [ ] **Step 5: Point both import paths at classification-v1**

Replace legacy analysis model configuration construction in owned and public import processors with `getClassificationConfigurationKey()`.

- [ ] **Step 6: Verify GREEN and commit**

Run: `npm test -- src/features/classification/configuration.test.ts src/features/ingestion/import-job-progress.test.ts src/features/ingestion/comment-import-service.test.ts src/features/ingestion/public-import-service.test.ts`

Commit:
```bash
git add src/features/classification/configuration.ts src/features/classification/configuration.test.ts src/features/ingestion/process-import-job.ts src/features/ingestion/process-public-import-job.ts src/app/api/analysis-jobs src/app/api/import-jobs src/features/ingestion/import-job-progress.ts src/features/ingestion/import-job-progress.test.ts
git commit -m "feat: route imports through classification v1"
```

### Task 5: Owned Import Classification Panel

**Files:**
- Create: `src/features/classification/classification-progress-panel.tsx`
- Create: `src/features/classification/classification-progress-panel.test.tsx`
- Modify: `src/app/(product)/app/videos/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `<ClassificationProgressPanel importJobId initialProgress autoStart={false} />`.
- Consumes: import status, classification process, and retry endpoints.

- [ ] **Step 1: Write failing UI tests**

Cover ready state with `분류 시작`, repeated chunk processing after click, count cards, terminal Inbox link, refresh-safe initial state, and failed-item retry. Assert no processing POST occurs before the explicit click for owned imports.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/classification/classification-progress-panel.test.tsx`
Expected: FAIL because the panel is missing.

- [ ] **Step 3: Implement the client panel**

Poll status after each bounded process call, stop only on terminal state, expose API errors without erasing stored progress, and use accessible progress/status markup.

- [ ] **Step 4: Render below the owned import result**

Replace the plain “next step” note in `videos/page.tsx` with the panel whenever an import job has a classification job.

- [ ] **Step 5: Verify GREEN and commit**

Run: `npm test -- src/features/classification/classification-progress-panel.test.tsx src/features/ingestion/import-progress.test.tsx`

Commit:
```bash
git add src/features/classification/classification-progress-panel.tsx src/features/classification/classification-progress-panel.test.tsx 'src/app/(product)/app/videos/page.tsx' src/app/globals.css
git commit -m "feat: show classification progress after import"
```

### Task 6: Public URL Flow Uses the Same Classification Processor

**Files:**
- Modify: `src/features/youtube/public-video-import-panel.tsx`
- Modify: `src/features/youtube/public-video-import-panel.test.tsx`

**Interfaces:**
- Consumes: expanded status response and the same analysis-job processing endpoint.
- Produces: unchanged public auto-start UX with new classification counts.

- [ ] **Step 1: Add failing tests for new counts and review queue**

Assert public imports automatically process classification chunks and show 안전/주의/위험/판단 보류 totals returned by status.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/features/youtube/public-video-import-panel.test.tsx`
Expected: count assertions fail.

- [ ] **Step 3: Adapt the existing panel and verify GREEN**

Run: `npm test -- src/features/youtube/public-video-import-panel.test.tsx`
Expected: existing import behavior and new classification display pass.

- [ ] **Step 4: Commit**

```bash
git add src/features/youtube/public-video-import-panel.tsx src/features/youtube/public-video-import-panel.test.tsx
git commit -m "feat: show classification results for public imports"
```

### Task 7: Inbox Read Model and Per-Comment Decision Trace

**Files:**
- Create: `supabase/migrations/202608070033_classification_inbox_read_model.sql`
- Modify: `src/features/inbox/inbox-query.ts`
- Modify: `src/features/inbox/supabase-inbox-repository.ts`
- Modify: `src/features/inbox/supabase-inbox-repository.test.ts`
- Modify: `src/features/inbox/comment-inbox.tsx`
- Modify: `src/features/inbox/comment-inbox.test.tsx`
- Create: `src/features/inbox/classification-trace.tsx`
- Create: `src/features/inbox/classification-trace.test.tsx`
- Modify: `src/app/(product)/app/inbox/actions.ts`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `InboxClassificationTrace`, review-queue filter/state, and `<ClassificationTrace trace={...} />`.
- Consumes: classification stage outputs, branch, and final verdict from the Inbox RPC.

- [ ] **Step 1: Write failing repository mapping tests**

Use an RPC row containing Moderation categories/scores, Luna candidate/certainty/flags, branch reasons, optional Terra, final verdict, and technical metadata. Assert the mapped trace preserves each value and `review_queue` remains level-null.

- [ ] **Step 2: Verify RED, implement types/mapping, verify GREEN**

Run before and after: `npm test -- src/features/inbox/supabase-inbox-repository.test.ts src/features/inbox/inbox-query.test.ts`

- [ ] **Step 3: Add the Inbox RPC migration**

Replace legacy `current_comment_analyses` joins with the newest `classification_verdicts` plus lateral stage/branch aggregation. Return no hidden source text when verdict `hide_source` is true. Include trace JSON and a `review_queue` filter value.

- [ ] **Step 4: Write failing trace component tests**

Assert visible labels for all five stages, exact values, `안전 즉시 통과로 생략`, a collapsed `기술 정보 보기`, and the existing warning-confirmed source reveal for hidden source.

- [ ] **Step 5: Verify RED, implement trace UI, verify GREEN**

Run before and after: `npm test -- src/features/inbox/classification-trace.test.tsx src/features/inbox/comment-inbox.test.tsx`

- [ ] **Step 6: Reset DB, regenerate types, and commit**

Before reset, update the Inbox correction action to validate a classification verdict in the viewer's workspace and append a `classification_feedback` row. Keep the AI verdict immutable and apply the newest correction only in the Inbox read model.

Run: `npm run db:reset && npm run db:types`

Commit:
```bash
git add supabase/migrations/202608070033_classification_inbox_read_model.sql src/types/database.ts src/features/inbox src/app/globals.css
git commit -m "feat: show classification decision traces in inbox"
```

### Task 8: Final Integration and Verification

**Files:**
- No file changes expected. A newly discovered defect starts a new failing test and red-green cycle in the task that owns that file.

**Interfaces:**
- Verifies the complete owned and public vertical slice.

- [ ] **Step 1: Run focused classification and ingestion suites**

Run:
```bash
npm test -- src/features/classification src/features/ingestion src/features/youtube/public-video-import-panel.test.tsx src/features/inbox
```
Expected: zero failures.

- [ ] **Step 2: Run database verification**

Run: `npm run db:reset && npm run db:test`
Expected: migrations and database tests pass.

- [ ] **Step 3: Run full project tests**

Run: `npm test`
Expected: zero failures; if unrelated pre-existing failures remain, record exact files and counts and do not claim a full pass.

- [ ] **Step 4: Run required lint and build**

Run: `npm run lint`

Run: `npm run build`

Expected: both exit with code 0.

- [ ] **Step 5: Verify the real browser flow**

In the owned YouTube flow, import comments, confirm no model call occurs before `분류 시작`, run classification, observe counts, open Inbox, expand a decision trace, and verify hidden source requires confirmation. Repeat public URL import and confirm automatic processing uses the same stored result format.

- [ ] **Step 6: Review destructive scope and diff**

Run: `git diff --check && git status --short && git log --oneline -10`
Expected: no whitespace errors, only planned files, and no deletion of raw comment/import/channel tables or data.
