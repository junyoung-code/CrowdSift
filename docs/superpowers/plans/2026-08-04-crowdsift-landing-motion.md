# CrowdSift Landing Motion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a truthful, accessible, CommentShark-inspired motion system to the CrowdSift landing page, including responsive scroll storytelling and a deterministic interactive analysis demo.

**Architecture:** Keep `LandingPage` as a Server Component and introduce focused Client Component islands for the header, reusable reveals, hero preview, scroll story, and analysis demo. Use Motion for React for viewport and scroll state, CSS for layout and responsive fallbacks, and pure typed example data that never calls external services.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Motion for React, CSS, Vitest, Testing Library, Playwright.

## Global Constraints

- Keep native page scrolling; do not add scroll hijacking or a smooth-scroll engine.
- Keep the hero heading, description, CTA, and `제품 예시 화면` label visible in the server-rendered first frame.
- Keep `LandingPage` as a Server Component and isolate browser behavior in small Client Components.
- Animate `transform` and `opacity` by default; use width only for compact progress indicators.
- Do not call YouTube, OpenAI, Supabase, moderation routes, or server actions from landing demonstrations.
- Keep raw example content, rule signals, analysis, sanitized feedback, and proposed action as separate fields.
- Hide the harmful example's raw text by default and reset the reveal when the example changes.
- Disable autoplay, parallax, tilt, and sticky scrollytelling when reduced motion is requested.
- Below 768 px, use normal vertical flow with no parallax, tilt, or sticky story.
- Preserve all existing sign-in routes, Korean product copy, focus visibility, and the `제품 예시 화면` truthfulness label.
- Run focused tests, `npm run lint`, and `npm run build` before completion.

---

## File Structure

- Create `src/features/landing/landing-motion.ts`: shared motion constants and pure progress-to-step helpers.
- Create `src/features/landing/motion-reveal.tsx`: reusable Client Component boundary for viewport entrance motion.
- Create `src/features/landing/landing-header.tsx`: sticky header state, scroll direction, and active section navigation.
- Modify `src/features/landing/product-preview.tsx`: client-side hero transforms, autoplay states, and manual state tabs.
- Create `src/features/landing/analysis-scroll-story.tsx`: four-stage reversible scroll narrative and product state panel.
- Create `src/features/landing/interactive-analysis-demo.tsx`: deterministic example selection, hidden harmful source, and staged analysis.
- Modify `src/features/landing/landing-copy.ts`: typed hero states and separate interactive example records.
- Modify `src/features/landing/landing-page.tsx`: compose the client islands inside the existing server-rendered product story.
- Modify `src/app/globals.css`: motion tokens, sticky layout, interactive demo surfaces, responsive behavior, and reduced-motion fallbacks.
- Create focused colocated tests for every client island and update the existing landing integration test.
- Modify `package.json` and `package-lock.json`: add the `motion` runtime dependency.

---

### Task 1: Motion foundation and reusable reveal

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/features/landing/landing-motion.ts`
- Create: `src/features/landing/landing-motion.test.ts`
- Create: `src/features/landing/motion-reveal.tsx`
- Create: `src/features/landing/motion-reveal.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `landingMotion`, `getAnalysisStepFromProgress(progress: number): number`, and `MotionReveal`.
- `MotionReveal` props: `{ as?: "div" | "section" | "article" | "li"; className?: string; delay?: number; x?: number; y?: number; once?: boolean; children: ReactNode }`.

- [ ] **Step 1: Install Motion for React**

Run:

```bash
npm install motion
```

Expected: `motion` appears in `dependencies`, and the lockfile records the resolved package.

- [ ] **Step 2: Write failing pure motion tests**

Create `landing-motion.test.ts` with boundary assertions:

```ts
expect(getAnalysisStepFromProgress(-1)).toBe(0);
expect(getAnalysisStepFromProgress(0.24)).toBe(0);
expect(getAnalysisStepFromProgress(0.25)).toBe(1);
expect(getAnalysisStepFromProgress(0.74)).toBe(2);
expect(getAnalysisStepFromProgress(1)).toBe(3);
expect(getAnalysisStepFromProgress(2)).toBe(3);
```

- [ ] **Step 3: Run the pure test and verify failure**

Run:

```bash
npm test -- src/features/landing/landing-motion.test.ts
```

Expected: FAIL because `landing-motion.ts` does not exist.

- [ ] **Step 4: Implement shared tokens and progress mapping**

Create:

```ts
export const landingMotion = {
  duration: { fast: 0.16, base: 0.42, section: 0.62 },
  stagger: 0.08,
  distance: { small: 8, medium: 20, parallax: 32 },
  tilt: 1.5,
  ease: [0.22, 1, 0.36, 1] as const,
} as const;

export function getAnalysisStepFromProgress(progress: number) {
  const clamped = Math.min(1, Math.max(0, progress));
  return Math.min(3, Math.floor(clamped * 4));
}
```

- [ ] **Step 5: Write a failing reveal accessibility test**

Render a semantic `article` before viewport activation and assert that its content remains in the document and the wrapper uses the requested element:

```tsx
render(
  <MotionReveal as="article">
    <h3>검토할 댓글부터</h3>
  </MotionReveal>,
);
expect(screen.getByRole("article")).toHaveTextContent("검토할 댓글부터");
```

- [ ] **Step 6: Implement `MotionReveal`**

Use a fixed component map rather than dynamic arbitrary tags. Keep `initial={false}` so server-rendered and no-JavaScript content starts visible; after hydration, hide only offscreen content until it enters the viewport:

```tsx
"use client";

const elements = {
  div: motion.div,
  section: motion.section,
  article: motion.article,
  li: motion.li,
};

export function MotionReveal({
  as = "div",
  className,
  delay = 0,
  y = 20,
  x = 0,
  once = true,
  children,
}: MotionRevealProps) {
  const shouldReduceMotion = useReducedMotion();
  const Component = elements[as];
  const scope = useRef<HTMLElement | null>(null);
  const isInView = useInView(scope, { once, amount: 0.18 });
  const controls = useAnimationControls();

  useEffect(() => {
    if (shouldReduceMotion) {
      controls.set({ opacity: 1, x: 0, y: 0 });
      return;
    }

    if (isInView) {
      void controls.start({ opacity: 1, x: 0, y: 0 });
    } else {
      controls.set({ opacity: 0, x, y });
    }
  }, [controls, isInView, shouldReduceMotion, x, y]);

  return (
    <Component
      ref={scope}
      className={className}
      initial={false}
      animate={controls}
      transition={{ duration: landingMotion.duration.section, delay, ease: landingMotion.ease }}
    >
      {children}
    </Component>
  );
}
```

Do not set hidden or `aria-hidden`; content must remain accessible before visual activation. The implementation test must also confirm the server render contains no inline `opacity: 0` style.

- [ ] **Step 7: Add global CSS motion tokens and stable defaults**

Add CSS custom properties for the approved durations, easing, distances, and focus-safe hover transforms. Extend the existing reduced-motion media query so landing motion wrappers render with `opacity: 1` and `transform: none`.

- [ ] **Step 8: Run foundation tests**

Run:

```bash
npm test -- src/features/landing/landing-motion.test.ts src/features/landing/motion-reveal.test.tsx
```

Expected: PASS.

- [ ] **Step 9: Commit the foundation**

```bash
git add package.json package-lock.json src/features/landing/landing-motion.ts src/features/landing/landing-motion.test.ts src/features/landing/motion-reveal.tsx src/features/landing/motion-reveal.test.tsx src/app/globals.css
git commit -m "feat: add landing motion foundation"
```

---

### Task 2: Responsive header and hero product motion

**Files:**
- Create: `src/features/landing/landing-header.tsx`
- Create: `src/features/landing/landing-header.test.tsx`
- Modify: `src/features/landing/product-preview.tsx`
- Create: `src/features/landing/product-preview.test.tsx`
- Modify: `src/features/landing/landing-copy.ts`
- Modify: `src/features/landing/landing-page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `LandingHeader`, `ProductPreview`, and `heroPreviewStates`.
- `heroPreviewStates` entries: `{ id: string; tabLabel: string; kicker: string; title: string; status: string; summary: string; tone: "blue" | "caution" | "risk" }`.

- [ ] **Step 1: Write failing header state tests**

Mock `IntersectionObserver`, render `LandingHeader`, simulate the scroll motion value changing beyond 24 px, and assert the banner gains the `landing-header-scrolled` class. Trigger an observed section and assert the matching navigation link receives `aria-current="location"`.

- [ ] **Step 2: Implement `LandingHeader` as a client island**

Use `useScroll`, `useMotionValueEvent`, and one `IntersectionObserver` for `problems`, `solutions`, `analysis`, and `integration`. Keep the existing logo, navigation labels, and sign-in links. Derive classes from `scrolled` and `scrollDirection` without changing layout height.

- [ ] **Step 3: Write failing hero autoplay and manual-control tests**

Use fake timers:

```ts
expect(screen.getByRole("tab", { name: "댓글 수집" })).toHaveAttribute("aria-selected", "true");
await vi.advanceTimersByTimeAsync(4500);
expect(screen.getByRole("tab", { name: "1차 분류" })).toHaveAttribute("aria-selected", "true");
await user.click(screen.getByRole("tab", { name: "최종 추천" }));
await vi.advanceTimersByTimeAsync(9000);
expect(screen.getByRole("tab", { name: "최종 추천" })).toHaveAttribute("aria-selected", "true");
```

Add a reduced-motion test asserting timers do not advance the selected state.

- [ ] **Step 4: Add typed hero states to `landing-copy.ts`**

Create exactly three states: `댓글 수집`, `1차 분류`, and `최종 추천`. Each state must remain visibly labeled as an example and describe only CrowdSift's approved behavior.

- [ ] **Step 5: Convert `ProductPreview` to a client component**

Use `useScroll({ target, offset: ["start start", "end start"] })` plus `useTransform` for y, rotate, and scale. Disable transformed values with `useReducedMotion`. Use `useInView` and `usePageInView` to run the 4.5 second timer only while the preview and page are visible. Tabs pause autoplay after a manual selection.

- [ ] **Step 6: Integrate the header and hero without converting `LandingPage`**

Replace the static header with `<LandingHeader />`, keep `LandingPage` free of `"use client"`, and keep the hero copy outside the animated client boundary.

- [ ] **Step 7: Add hero and header CSS**

Add sticky header states, tab controls, active preview tone, stable panel dimensions, and transforms that cap at 32 px and 1.5 degrees. Disable the transforms below 768 px and in reduced motion.

- [ ] **Step 8: Run focused tests and commit**

```bash
npm test -- src/features/landing/landing-header.test.tsx src/features/landing/product-preview.test.tsx src/features/landing/landing-page.test.tsx src/app/page.test.tsx
git add src/features/landing/landing-header.tsx src/features/landing/landing-header.test.tsx src/features/landing/product-preview.tsx src/features/landing/product-preview.test.tsx src/features/landing/landing-copy.ts src/features/landing/landing-page.tsx src/app/globals.css
git commit -m "feat: animate landing header and hero preview"
```

Expected: tests PASS and `LandingPage` remains a Server Component.

---

### Task 3: Four-stage analysis scroll story

**Files:**
- Create: `src/features/landing/analysis-scroll-story.tsx`
- Create: `src/features/landing/analysis-scroll-story.test.tsx`
- Modify: `src/features/landing/landing-page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `landingCopy.processSteps`, `getAnalysisStepFromProgress`, and `landingMotion`.
- Produces: `AnalysisScrollStory` with no required props.

- [ ] **Step 1: Write failing scroll-story semantics tests**

Assert all four stage headings remain in the document, the region has the accessible name `두 단계 분석 과정`, and exactly one step starts with `aria-current="step"`.

- [ ] **Step 2: Write a failing reversible progress test**

Mock the Motion scroll value, emit `0.8`, assert step 4 is current, then emit `0.3` and assert step 2 is current. This verifies upward scrolling can reverse the narrative.

- [ ] **Step 3: Implement `AnalysisScrollStory`**

Track the section with `useScroll`. Map progress through `getAnalysisStepFromProgress`. Render:

- all four text steps in an ordered list;
- a sticky visualization with source, rule signals, creator context, and recommendation rows;
- `aria-current="step"` only on the active step;
- a progress element whose accessible value is the active step number.

Do not remove inactive step text from the DOM.

- [ ] **Step 4: Replace the static process grid**

In `landing-page.tsx`, keep the existing heading copy and replace only the current `process-grid` list with `<AnalysisScrollStory />`.

- [ ] **Step 5: Add responsive sticky story CSS**

At 1024 px and above, use approximately 280 vh of section scroll range and a sticky visualization. Between 768 and 1023 px, remove persistent pinning. Below 768 px and under reduced motion, use normal flow and make each stage readable without transforms.

- [ ] **Step 6: Run tests and commit**

```bash
npm test -- src/features/landing/landing-motion.test.ts src/features/landing/analysis-scroll-story.test.tsx src/features/landing/landing-page.test.tsx
git add src/features/landing/analysis-scroll-story.tsx src/features/landing/analysis-scroll-story.test.tsx src/features/landing/landing-page.tsx src/app/globals.css
git commit -m "feat: add landing analysis scroll story"
```

Expected: PASS.

---

### Task 4: Deterministic interactive analysis demo

**Files:**
- Modify: `src/features/landing/landing-copy.ts`
- Create: `src/features/landing/interactive-analysis-demo.tsx`
- Create: `src/features/landing/interactive-analysis-demo.test.tsx`
- Modify: `src/features/landing/landing-page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `landingAnalysisExamples` and `InteractiveAnalysisDemo`.
- Example record shape:

```ts
type LandingAnalysisExample = {
  id: string;
  label: string;
  isHarmful: boolean;
  rawSource: string;
  sourceSummary: string;
  ruleSignals: readonly string[];
  stageOne: { level: "안전" | "주의" | "위험"; reason: string };
  creatorContext: string;
  sanitizedFeedback: string | null;
  finalRecommendation: string;
  proposedAction: string;
};
```

- [ ] **Step 1: Write failing reducer and safety tests**

Cover these exact behaviors:

```ts
expect(screen.queryByText(harmful.rawSource)).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "유해 댓글 예시 선택" }));
expect(screen.queryByText(harmful.rawSource)).not.toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "가려진 원문 보기" }));
expect(screen.getByText(harmful.rawSource)).toBeInTheDocument();
await user.click(screen.getByRole("button", { name: "질문 댓글 예시 선택" }));
expect(screen.queryByText(harmful.rawSource)).not.toBeInTheDocument();
```

Also assert stage controls progress in order and the final state contains `사용자가 확인해야 조치됩니다` with a sign-in link, not a moderation button.

- [ ] **Step 2: Add three separate example records**

Create question, constructive-feedback, and harmful examples. Keep raw source, rule signals, stage-one result, creator context, sanitized feedback, final recommendation, and proposed action in distinct fields. Label the entire demo `제품 예시 화면`.

- [ ] **Step 3: Implement an explicit reducer**

Use state `{ selectedId, revealedSource, stage }` and actions:

```ts
type DemoAction =
  | { type: "select"; id: string }
  | { type: "toggle-source" }
  | { type: "advance" }
  | { type: "reset" };
```

`select` must reset `revealedSource` to `false` and `stage` to `0`. `advance` must clamp at the final stage.

- [ ] **Step 4: Implement `InteractiveAnalysisDemo`**

Render accessible example tabs, the protected source panel, four progressive result rows, a text progress indicator, and the final sign-in CTA. Use `AnimatePresence` or keyed Motion elements only for state opacity and compact translation. No effect may call a service or server action.

- [ ] **Step 5: Replace the static dark-section analysis card**

Preserve the existing AI copy and facts, but replace the static `analysis-card` with `<InteractiveAnalysisDemo />`. Keep the final recommendation language advisory rather than executable.

- [ ] **Step 6: Add dark demo responsive and focus styles**

Use a two-column source/result layout on desktop and a single-column layout below 1024 px. Make every control at least 44 px on mobile and preserve visible focus rings.

- [ ] **Step 7: Run tests and commit**

```bash
npm test -- src/features/landing/interactive-analysis-demo.test.tsx src/features/landing/landing-page.test.tsx src/app/page.test.tsx
git add src/features/landing/landing-copy.ts src/features/landing/interactive-analysis-demo.tsx src/features/landing/interactive-analysis-demo.test.tsx src/features/landing/landing-page.tsx src/app/globals.css
git commit -m "feat: add interactive landing analysis demo"
```

Expected: PASS.

---

### Task 5: Apply restrained reveals and finish responsive behavior

**Files:**
- Modify: `src/features/landing/landing-page.tsx`
- Modify: `src/features/landing/landing-page.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `MotionReveal` and existing landing sections.
- Produces: completed page-level motion composition.

- [ ] **Step 1: Add failing landing integration assertions**

Assert problem and solution articles remain semantic articles, section headings remain accessible, every example area has explicit example labeling, and all existing sign-in links still target `/auth/sign-in`.

- [ ] **Step 2: Wrap restrained sections with `MotionReveal`**

Apply one-time reveals to problem and solution headings/cards, the YouTube integration mark/copy, and final CTA. Use 80 ms card delays and no more than 20 px travel. Do not wrap the hero heading in an initially hidden motion component.

- [ ] **Step 3: Add hover, focus, tablet, and mobile CSS**

Add 4 px card hover lift, matching `:focus-within` emphasis, mobile 12 px reveal cap, and stable grid fallbacks. Ensure the existing 390 px no-overflow behavior remains.

- [ ] **Step 4: Extend reduced-motion CSS**

Force landing motion transforms off, reveal wrappers visible, sticky story in normal flow, and all transitions at the existing reduced duration. Confirm no autoplay logic depends on CSS alone.

- [ ] **Step 5: Run landing tests and commit**

```bash
npm test -- src/features/landing src/app/page.test.tsx src/app/layout-scroll.test.ts
git add src/features/landing/landing-page.tsx src/features/landing/landing-page.test.tsx src/app/globals.css
git commit -m "feat: finish responsive landing motion"
```

Expected: PASS.

---

### Task 6: Browser, accessibility, and release verification

**Files:**
- Modify only if verification exposes a scoped defect in the files from Tasks 1–5.
- Add QA evidence to `docs/qa/` only when new screenshots are intentionally retained.

**Interfaces:**
- Consumes: completed landing implementation.
- Produces: verified branch ready for review.

- [ ] **Step 1: Run the complete automated test suite**

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: PASS with no warnings or errors.

- [ ] **Step 3: Run the production build**

```bash
npm run build
```

Expected: Next.js production build completes successfully.

- [ ] **Step 4: Verify browser behavior at 1440 × 900 and 1280 × 800**

At each viewport:

- confirm the hero is visible immediately;
- scroll down and up through the hero and analysis story;
- confirm the sticky story reverses stages;
- select hero tabs and verify autoplay remains paused;
- exercise all three analysis examples;
- reveal and re-hide the harmful example through selection changes;
- confirm header active links and sticky styles;
- check browser console errors.

- [ ] **Step 5: Verify tablet and mobile**

At 820 px and 390 px, confirm no sticky scrollytelling, no parallax or tilt, no horizontal overflow, 44 px demo controls, readable cards, and uncut focus rings.

- [ ] **Step 6: Verify reduced motion**

Enable reduced motion and confirm immediate content visibility, no autoplay, no parallax/tilt, normal-flow story layout, and fully usable demo controls.

- [ ] **Step 7: Review final diff and commit verification fixes**

```bash
git diff --check
git status --short
```

If verification required changes, rerun the focused test plus lint and build, then commit only implementation files:

```bash
git add src/features/landing src/app/globals.css package.json package-lock.json
git commit -m "fix: polish landing motion behavior"
```

Do not stage the pre-existing `AGENTS.md` modification or `tmp/pdfs/comment-classification/` files.
