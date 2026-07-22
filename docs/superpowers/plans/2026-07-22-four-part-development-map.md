# Four-Part Development Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render one large, editable Mermaid flowchart that separates CommentHawk implementation work into Frontend, Backend, AI, and Security parts and converges on an integrated MVP.

**Architecture:** Immutable four-part metadata and seeded tasks feed a pure Mermaid-source builder. A client coordinator loads and saves task edits through a validated localStorage adapter, while a dedicated Mermaid canvas renders the SVG and owns copy and full-screen controls.

**Tech Stack:** Next.js 16.2.11, React 19.2.4, TypeScript 5.9, Tailwind CSS 4, Mermaid 11.16.0, Vitest 4.1.10, jsdom 29.1.1, Testing Library React 16.3.2

## Global Constraints

- Keep the four part identifiers fixed as `frontend`, `backend`, `ai`, and `security`.
- Persist only task items under `commenthawk.development-map.v1`.
- Use Mermaid `flowchart TD`, `securityLevel: "strict"`, and `htmlLabels: false`.
- Generate node IDs internally; never derive Mermaid node IDs from user text.
- Normalize and escape every user label before inserting it into Mermaid source.
- Do not imply that any represented OAuth, YouTube, AI, evidence, or moderation integration already works.
- Preserve the existing hero and render the development map below it.
- Verify with unit tests, ESLint, a production build, and desktop/mobile browser checks.

---

### Task 1: Test foundation, roadmap data, storage, and Mermaid source

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `vitest.config.ts`
- Create: `src/test/setup.ts`
- Create: `src/components/development-map/development-data.ts`
- Create: `src/components/development-map/development-storage.ts`
- Create: `src/components/development-map/build-mermaid-source.ts`
- Test: `src/components/development-map/development-storage.test.ts`
- Test: `src/components/development-map/build-mermaid-source.test.ts`

**Interfaces:**
- Produces: `DevelopmentPartId`, `PlanItem`, `PlansByPart`, `DEVELOPMENT_PARTS`, `DEFAULT_PLANS`, `cloneDefaultPlans()`, `readDevelopmentPlans()`, `writeDevelopmentPlans()`, `escapeMermaidLabel()`, and `buildMermaidSource()`.
- Consumes: browser-compatible `Storage` supplied explicitly to storage functions.

- [ ] **Step 1: Install exact runtime and test dependencies**

Run:

```bash
npm install mermaid@11.16.0
npm install --save-dev vitest@4.1.10 jsdom@29.1.1 @testing-library/react@16.3.2 @testing-library/user-event@14.6.1 @testing-library/jest-dom@7.0.0
```

Add scripts to `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 2: Configure Vitest**

Create `vitest.config.ts` with jsdom, the `@/*` alias pointing to `src`, and `src/test/setup.ts`. The setup file imports `@testing-library/jest-dom/vitest` and runs Testing Library cleanup after each test.

- [ ] **Step 3: Write failing storage tests**

Cover these exact behaviors in `development-storage.test.ts`:

```ts
it("returns cloned seeded plans when storage is empty", () => {});
it("returns persisted plans when the stored shape is valid", () => {});
it("falls back when stored JSON is invalid", () => {});
it("falls back when a required part is missing", () => {});
it("returns false instead of throwing when writes fail", () => {});
```

Run `npm test -- development-storage.test.ts` and expect failures because the storage module does not exist.

- [ ] **Step 4: Implement immutable data and validated storage**

Use these exported shapes:

```ts
export type DevelopmentPartId = "frontend" | "backend" | "ai" | "security";
export type PlanItem = { id: string; title: string };
export type PlansByPart = Record<DevelopmentPartId, PlanItem[]>;

export function readDevelopmentPlans(storage?: Pick<Storage, "getItem">): PlansByPart;
export function writeDevelopmentPlans(
  plans: PlansByPart,
  storage?: Pick<Storage, "setItem">,
): boolean;
```

Validation requires all four keys and arrays of objects with non-empty string `id` and `title` fields. Catch JSON and Storage errors and return a deep clone of the seeded data.

- [ ] **Step 5: Verify storage tests pass**

Run `npm test -- development-storage.test.ts` and expect all five tests to pass.

- [ ] **Step 6: Write failing Mermaid builder tests**

Cover these exact behaviors in `build-mermaid-source.test.ts`:

```ts
it("builds one TD graph with four part subgraphs and an integrated MVP", () => {});
it("creates node IDs from part keys and indexes rather than labels", () => {});
it("normalizes line breaks and removes Mermaid control characters from labels", () => {});
it("keeps a valid completion path for a part with no task items", () => {});
```

Run `npm test -- build-mermaid-source.test.ts` and expect failures because the builder does not exist.

- [ ] **Step 7: Implement the pure Mermaid builder**

`escapeMermaidLabel()` trims text, collapses whitespace, converts quotes and Mermaid shape delimiters to safe punctuation, and removes angle brackets and pipe characters. `buildMermaidSource()` emits:

```text
flowchart TD
  ROOT["CommentHawk 구현 로드맵"]
  ROOT --> FRONTEND_ROOT
  ROOT --> BACKEND_ROOT
  ROOT --> AI_ROOT
  ROOT --> SECURITY_ROOT
  ...four subgraphs and internally generated item nodes...
  FRONTEND_DONE & BACKEND_DONE & AI_DONE & SECURITY_DONE --> MVP
```

Add restrained `classDef` entries and assign root, part, detail, completion, and MVP classes.

- [ ] **Step 8: Verify builder tests and the complete unit suite**

Run `npm test` and expect all tests to pass with zero failures.

- [ ] **Step 9: Commit the pure implementation**

```bash
git add package.json package-lock.json vitest.config.ts src/test src/components/development-map/development-data.ts src/components/development-map/development-storage.ts src/components/development-map/build-mermaid-source.ts src/components/development-map/*.test.ts
git commit -m "feat: add development map data and Mermaid builder"
```

### Task 2: Mermaid canvas with copy and full-screen controls

**Files:**
- Create: `src/components/development-map/mermaid-canvas.tsx`
- Test: `src/components/development-map/mermaid-canvas.test.tsx`

**Interfaces:**
- Consumes: `source: string` returned by `buildMermaidSource()`.
- Produces: `MermaidCanvas({ source }: { source: string })` with an SVG canvas, copy feedback, full-screen control, loading state, and concise render-error state.

- [ ] **Step 1: Write failing interaction tests**

Mock the `mermaid` module and browser clipboard. Assert that the component initializes Mermaid with strict security and no HTML labels, renders returned SVG, copies the exact source, and shows `복사됨` feedback. Run `npm test -- mermaid-canvas.test.tsx` and expect failure because the component does not exist.

- [ ] **Step 2: Implement the Mermaid canvas**

Use a client component and dynamic Mermaid import inside `useEffect`. Initialize with:

```ts
mermaid.initialize({
  startOnLoad: false,
  securityLevel: "strict",
  flowchart: { htmlLabels: false, nodeSpacing: 34, rankSpacing: 58 },
  theme: "base",
});
```

Render into a ref-backed canvas with a unique internal render ID, ignore stale async results, preserve the last valid SVG on failure, and expose `전체 화면` and `Mermaid 복사` buttons. The canvas must use a large minimum width and two-axis overflow.

- [ ] **Step 3: Verify canvas tests**

Run `npm test -- mermaid-canvas.test.tsx` and expect all tests to pass.

- [ ] **Step 4: Commit the canvas**

```bash
git add src/components/development-map/mermaid-canvas.tsx src/components/development-map/mermaid-canvas.test.tsx
git commit -m "feat: render interactive Mermaid development map"
```

### Task 3: Editable plan panel and persisted coordinator

**Files:**
- Create: `src/components/development-map/plan-editor.tsx`
- Create: `src/components/development-map/development-map.tsx`
- Test: `src/components/development-map/plan-editor.test.tsx`
- Test: `src/components/development-map/development-map.test.tsx`

**Interfaces:**
- `PlanEditor` consumes the selected part metadata, its `PlanItem[]`, and `onAdd`, `onRename`, `onDelete` callbacks.
- `DevelopmentMap` owns `PlansByPart`, selected part, localStorage hydration, Mermaid source generation, and composes `MermaidCanvas` with `PlanEditor`.

- [ ] **Step 1: Write failing editor tests**

Test visible part buttons, selected-state changes, whitespace rejection, add, inline rename, cancel, delete confirmation, and an empty-state add action. Run `npm test -- plan-editor.test.tsx` and expect failure because the component does not exist.

- [ ] **Step 2: Implement the plan editor**

Use real buttons and labeled forms. Keep one add form and one edit row active at a time. Generate new plan IDs with `crypto.randomUUID()`. Delete only when `window.confirm("이 계획을 삭제할까요?")` returns true.

- [ ] **Step 3: Verify editor tests**

Run `npm test -- plan-editor.test.tsx` and expect all editor tests to pass.

- [ ] **Step 4: Write failing coordinator persistence tests**

Mock `MermaidCanvas` to expose its source. Verify seeded first render, stored-plan hydration, localStorage updates after add and rename, and safe operation when `setItem` throws. Run `npm test -- development-map.test.tsx` and expect failure because the coordinator does not exist.

- [ ] **Step 5: Implement the coordinator**

Load storage after mount without overwriting it with defaults, set a hydrated flag, persist changes only after hydration, and keep edits in memory if storage writes fail. Use `useMemo` to rebuild Mermaid source only when plans change.

- [ ] **Step 6: Verify interaction suite**

Run `npm test` and expect the complete test suite to pass.

- [ ] **Step 7: Commit editing and persistence**

```bash
git add src/components/development-map/plan-editor.tsx src/components/development-map/development-map.tsx src/components/development-map/plan-editor.test.tsx src/components/development-map/development-map.test.tsx
git commit -m "feat: edit and persist development map plans"
```

### Task 4: Home-page integration and full verification

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`
- Modify: `README.md`

**Interfaces:**
- Consumes: `DevelopmentMap`.
- Produces: the existing hero followed by the full-width four-part development map and documentation for the new planning behavior.

- [ ] **Step 1: Integrate below the existing hero**

Import `DevelopmentMap`, render it after the hero section, add an anchor identifier, and keep all chart language explicit that nodes represent planned work. Do not alter the disabled YouTube CTA.

- [ ] **Step 2: Add only necessary global behavior**

Add reduced-motion handling, full-screen canvas background, and unobtrusive scrollbar styling. Keep feature-specific layout in Tailwind classes within components.

- [ ] **Step 3: Document the planning map**

Update `README.md` to state that the development map is a local planning tool, that edits are browser-local, and that the four-part nodes are not implementation-status claims.

- [ ] **Step 4: Run full automated verification**

Run:

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

Expected: tests, lint, and build exit with code 0. Record audit advisories without running a breaking `--force` downgrade.

- [ ] **Step 5: Verify in a browser**

At desktop width and 390 px width verify:

- the complete chart has four recognizable part branches and an integrated MVP node;
- the canvas scrolls without overflowing the page itself;
- adding and renaming a plan updates the SVG;
- refresh preserves the edited plan;
- copy feedback appears;
- full-screen control is available;
- no browser console errors occur.

- [ ] **Step 6: Commit the integrated feature**

```bash
git add src/app/page.tsx src/app/globals.css README.md
git commit -m "feat: add four-part CommentHawk development map"
```
