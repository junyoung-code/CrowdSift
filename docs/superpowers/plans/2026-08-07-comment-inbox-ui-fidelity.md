# Comment Inbox UI Fidelity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the existing Comment Inbox presentation to match the approved Figma hierarchy while displaying only connected CrowdSift data and preserving protected-source behavior.

**Architecture:** Keep the Inbox page and data query server-rendered. Derive user-facing labels, relative time, and categorical certainty from the existing `InboxItem` and classification trace, then render the richer three-column workspace with CSS-only responsive reflow. No database migration is needed because the current read model already returns author, video, reply, verdict, and stage-trace data.

**Tech Stack:** Next.js 16.2.11 App Router, React 19, TypeScript, Vitest, Testing Library, Phosphor Icons, global CSS.

## Global Constraints

- Use the approved Figma file `https://www.figma.com/design/k4ULHCRVcB85Aae9n2Bv1q` and the target screenshot as visual truth.
- Never copy target sample values such as `238개` or `97%` into connected product data.
- Show categorical certainty from the Luna/Terra trace; do not synthesize numeric confidence.
- Keep caution/risk source text hidden until the existing warning and reveal flow succeeds.
- Render stored replies, profile images, video thumbnails, likes, and counts only when the read model provides them.
- Keep the classification trace available but collapsed by default.
- Preserve server actions and explicit confirmation for YouTube moderation.
- Keep the initial UI responsive and keyboard accessible.
- Do not overwrite unrelated dirty-worktree changes.
- Run focused tests, `npm run lint`, and `npm run build` before completion.

---

### Task 1: Lock presentation behavior with failing tests

**Files:**
- Modify: `src/features/inbox/comment-inbox.test.tsx`
- Modify: `src/features/inbox/classification-trace.test.tsx`

**Interfaces:**
- Consumes: existing `InboxItem`, `InboxClassificationTrace`, and server-rendered `CommentInbox` props.
- Produces: assertions for relative time, queue metadata, categorical certainty, zero-reply behavior, and a collapsed trace.

- [ ] **Step 1: Add a queue enrichment test**

Render an item with a video thumbnail/title, `constructive_feedback`, likes, and replies. Assert the queue exposes `AI가 정리한 유용한 피드백`, the video thumbnail/title, and `답글 3개` using literal expected values.

- [ ] **Step 2: Add a zero-reply test**

Render `{ replyCount: 0, replies: [] }` and assert there is no link named `답글 0개 보기`.

- [ ] **Step 3: Add a relative-time test**

Freeze time at `2026-08-07T12:00:00.000Z`, render a comment published at `2026-08-07T11:55:00.000Z`, and assert `5분 전` is visible.

- [ ] **Step 4: Add categorical-certainty assertions**

Render a Terra trace with `certainty: "clear"` and numeric legacy confidence `0.82`. Assert `확실성`, `높음 · clear`, and the absence of `82%`.

- [ ] **Step 5: Require the trace to be collapsed**

Assert the element containing `판단 과정` is a `details` element without `open` and its summary copy is available.

- [ ] **Step 6: Run focused tests and verify RED**

Run:

```bash
npm test -- src/features/inbox/comment-inbox.test.tsx src/features/inbox/classification-trace.test.tsx
```

Expected: failures for missing queue label/video metadata, zero-reply suppression, relative time, categorical certainty, and collapsed trace.

---

### Task 2: Implement the approved information hierarchy

**Files:**
- Modify: `src/features/inbox/comment-inbox.tsx`
- Modify: `src/features/inbox/classification-trace.tsx`

**Interfaces:**
- Consumes: the existing read model without adding placeholder data.
- Produces: richer queue rows, protected conversation card, user-facing insight summary, categorical certainty, and a collapsed five-stage trace.

- [ ] **Step 1: Add presentation helpers**

Implement deterministic helpers for relative Korean time, queue context labels, insight descriptions, and certainty resolution. Resolve certainty from Terra when present, otherwise Luna, mapping `clear → 높음`, `borderline → 경계`, and `unclear → 재검토 필요`.

- [ ] **Step 2: Enrich the queue row**

Add a context label, video thumbnail/title, likes, and reply count. Keep the selection link durable and render reply disclosure only when `replyCount > 0`.

- [ ] **Step 3: Refine the selected conversation**

Use `AI가 정리한 유용한 피드백` for actionable caution content, preserve the original-source warning and reveal control, and render only stored replies.

- [ ] **Step 4: Refine operating insights**

Use the user-facing category as the insight title, a concise category explanation as the supporting copy, categorical certainty instead of numeric confidence, and keep recommendation/action state grounded in stored values.

- [ ] **Step 5: Collapse the classification trace**

Wrap the five-stage trace in a closed `details` element with a visible `판단 과정` summary. Keep technical information nested and closed.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm test -- src/features/inbox/comment-inbox.test.tsx src/features/inbox/classification-trace.test.tsx
```

Expected: all selected tests pass.

---

### Task 3: Match the approved desktop composition and responsive behavior

**Files:**
- Modify: `src/app/globals.css`
- Test: `src/app/inbox-theme-css.test.ts`

**Interfaces:**
- Consumes: the new semantic class names from Task 2 and existing product theme variables.
- Produces: a 30/42/28 desktop grid, target-style queue density, protected content hierarchy, compact insights, and responsive reflow.

- [ ] **Step 1: Add a failing CSS contract test**

Assert the Inbox stylesheet contains the approved grid ratios, queue context/video selectors, collapsed trace summary selector, and the `1260px` and `900px` responsive breakpoints.

- [ ] **Step 2: Run the CSS test and verify RED**

Run:

```bash
npm test -- src/app/inbox-theme-css.test.ts
```

Expected: failure for the new semantic selectors and grid contract.

- [ ] **Step 3: Implement target-aligned CSS**

Use existing product theme variables for light/dark compatibility. Apply the approved 30/42/28 column hierarchy, selected-row emphasis, thumbnail treatment, protected-source warning, compact insight cards, and closed-trace accordion.

- [ ] **Step 4: Implement responsive reflow**

At `max-width: 1260px`, keep queue/conversation side by side and place insights below. At `max-width: 900px`, use one column with bounded queue scrolling and full-width controls.

- [ ] **Step 5: Run Inbox tests and verify GREEN**

Run:

```bash
npm test -- src/app/inbox-theme-css.test.ts src/features/inbox/comment-inbox.test.tsx src/features/inbox/classification-trace.test.tsx
```

Expected: all selected tests pass.

---

### Task 4: Visual and production verification

**Files:**
- Create: `design-qa.md`

**Interfaces:**
- Consumes: approved target screenshot, the Figma implementation contract, and the locally rendered `/app/inbox` route.
- Produces: browser evidence, comparison history, and `final result: passed` or an explicit blocker.

- [ ] **Step 1: Run the full quality gates**

Run:

```bash
npm test
npm run lint
npm run build
```

- [ ] **Step 2: Capture the implementation**

Open `/app/inbox` in the in-app browser at the authenticated state and capture `1440 × 1024`, plus the responsive state when practical. Exercise comment selection, source reveal warning, filters, and classification trace disclosure; check the browser console.

- [ ] **Step 3: Compare source and implementation**

Place the target screenshot and implementation capture together. Review typography, spacing, colors, image fidelity, copy, hierarchy, and responsive behavior.

- [ ] **Step 4: Fix every P0/P1/P2 finding**

Repeat capture and comparison after each material fix until no actionable P0/P1/P2 finding remains.

- [ ] **Step 5: Save the final QA report**

Create `design-qa.md` with source/implementation paths, viewport, state, interactions, console result, comparison history, and exactly `final result: passed` or `final result: blocked`.
