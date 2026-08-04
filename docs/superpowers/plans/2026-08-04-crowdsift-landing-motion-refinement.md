# CrowdSift Landing Motion Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the overly tall analysis scrollytelling with a clickable autoplay walkthrough and make the Hero and remaining landing sections respond with balanced, accessible motion.

**Architecture:** Keep `LandingPage` as a Server Component and refine its existing client islands. `AnalysisScrollStory` becomes a visibility-aware timer and button-driven state machine, `ProductPreview` consumes complete per-stage example data, and one focused client component adds desktop-only YouTube mark parallax while `MotionReveal` handles one-time section entrances.

**Tech Stack:** Next.js 16.2 App Router, React 19, TypeScript, Motion for React, CSS, Vitest, Testing Library.

## Global Constraints

- Read the relevant guides under `node_modules/next/dist/docs/` before changing Client/Server Component boundaries.
- Keep `LandingPage` as a Server Component.
- Keep native vertical scrolling; do not add scroll hijacking, horizontal scrolling, or another pinned scrollytelling section.
- Keep the analysis walkthrough at normal document height with no `250vh`, sticky panel, or scroll-progress mapping.
- Keep every displayed metric explicitly inside a `제품 예시 화면` region and never call YouTube, AI, Supabase, moderation routes, or server actions.
- Preserve raw source, analysis signals, feedback, and proposed action as structurally separate example fields.
- Keep harmful source hidden by default and keep irreversible moderation controls off the landing page.
- Disable autoplay, parallax, stagger, value rolling, and ambient transforms for `prefers-reduced-motion: reduce`.
- Below 768px, cap motion distance at 12px and keep all layouts in normal vertical flow.
- Preserve all `/auth/sign-in` routes, Korean copy, focus visibility, and 390px no-overflow behavior.
- Preserve the user's unrelated `AGENTS.md` change and `tmp/pdfs/comment-classification/` files.
- Before completion, run the full test suite, `npm run lint`, and `npm run build`.

## File Structure

- Modify `src/features/landing/analysis-scroll-story.tsx`: clickable stages, autoplay, pause rules, and panel transitions.
- Modify `src/features/landing/analysis-scroll-story.test.tsx`: reducer, timers, direct selection, hover/focus, and reduced-motion coverage.
- Modify `src/features/landing/landing-copy.ts`: complete Hero metric/count/emphasis state records.
- Modify `src/features/landing/product-preview.tsx`: animate all Hero surfaces from active state data.
- Modify `src/features/landing/product-preview.test.tsx`: verify synchronized content updates and existing autoplay rules.
- Create `src/features/landing/integration-mark.tsx`: desktop-only viewport parallax for the YouTube mark.
- Create `src/features/landing/integration-mark.test.tsx`: semantic and reduced-motion behavior.
- Modify `src/features/landing/motion-reveal.tsx`: expose current visibility state for secondary CSS motion.
- Modify `src/features/landing/motion-reveal.test.tsx`: preserve server-visible output and verify visibility metadata.
- Modify `src/features/landing/landing-page.tsx`: compose section-specific reveals and the integration mark.
- Modify `src/features/landing/landing-page.test.tsx`: preserve section semantics, labels, and sign-in destinations.
- Modify `src/app/globals.css`: normal-height walkthrough, animated Hero surfaces, section-specific motion, responsive and reduced-motion rules.

---

### Task 1: Clickable Autoplay Analysis Walkthrough

**Files:**
- Modify: `src/features/landing/analysis-scroll-story.tsx`
- Modify: `src/features/landing/analysis-scroll-story.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `analysisWalkthroughReducer(state, action): AnalysisWalkthroughState` and `AnalysisScrollStory`.
- State: `{ activeStep: number }`.
- Actions: `{ type: "select"; index: number } | { type: "advance" } | { type: "reset" }`.
- Timer constants: `ANALYSIS_AUTOPLAY_MS = 4000` and `ANALYSIS_MANUAL_PAUSE_MS = 8000`.

- [ ] **Step 1: Replace scroll-progress tests with failing reducer and button semantics tests**

Use this reducer contract in `analysis-scroll-story.test.tsx`:

```tsx
expect(
  analysisWalkthroughReducer({ activeStep: 3 }, { type: "advance" }),
).toEqual({ activeStep: 0 });
expect(
  analysisWalkthroughReducer({ activeStep: 2 }, { type: "reset" }),
).toEqual({ activeStep: 0 });

render(<AnalysisScrollStory />);
const contextButton = screen.getByRole("button", { name: /크리에이터 문맥/ });
await user.click(contextButton);
expect(contextButton).toHaveAttribute("aria-current", "step");
expect(screen.getByText("정책과 과거 수정 3건")).toBeInTheDocument();
```

Keep the existing assertions that all four stage headings remain in the document and the region name is `두 단계 분석 과정`.

- [ ] **Step 2: Add failing autoplay and manual-pause tests**

Use fake timers and the visible `IntersectionObserver` test setup:

```tsx
vi.useFakeTimers();
render(<AnalysisScrollStory />);

await act(async () => vi.advanceTimersByTimeAsync(4000));
expect(screen.getByRole("button", { name: /크리에이터 문맥/ }))
  .toHaveAttribute("aria-current", "step");

fireEvent.click(screen.getByRole("button", { name: /사용자 확인/ }));
await act(async () => vi.advanceTimersByTimeAsync(8000));
expect(screen.getByRole("button", { name: /사용자 확인/ }))
  .toHaveAttribute("aria-current", "step");

await act(async () => vi.advanceTimersByTimeAsync(4000));
expect(screen.getByRole("button", { name: /1차 분석/ }))
  .toHaveAttribute("aria-current", "step");
```

Add separate tests that `mouseEnter` and `focusIn` pause the 4-second interval, and mock `useReducedMotion` as `true` to assert no automatic change occurs after 12 seconds.

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npm test -- --run src/features/landing/analysis-scroll-story.test.tsx
```

Expected: FAIL because stages are not buttons and the current component is driven by `useScroll`.

- [ ] **Step 4: Implement the reducer and timer state**

Replace scroll-progress imports with visibility and timer hooks:

```tsx
import {
  motion,
  useInView,
  usePageInView,
  useReducedMotion,
} from "motion/react";
import { useEffect, useReducer, useRef, useState } from "react";

export const ANALYSIS_AUTOPLAY_MS = 4000;
export const ANALYSIS_MANUAL_PAUSE_MS = 8000;

export type AnalysisWalkthroughState = { activeStep: number };
export type AnalysisWalkthroughAction =
  | { type: "select"; index: number }
  | { type: "advance" }
  | { type: "reset" };

export function analysisWalkthroughReducer(
  state: AnalysisWalkthroughState,
  action: AnalysisWalkthroughAction,
) {
  if (action.type === "select") return { activeStep: action.index };
  if (action.type === "advance") {
    return { activeStep: (state.activeStep + 1) % landingCopy.processSteps.length };
  }
  return { activeStep: 0 };
}
```

Use `useInView(storyRef, { amount: 0.35 })`, `usePageInView()`, `useReducedMotion()`, `isInteracting`, and `isManualPaused`. The interval effect runs only when the section and page are visible and both pause flags are false. A manual selection clears the previous timeout, dispatches `select`, sets `isManualPaused`, and schedules an 8-second reset. Clear both timers on unmount.

- [ ] **Step 5: Replace static stage cards with buttons and keyed panel motion**

Render each stage as:

```tsx
<li key={title}>
  <button
    aria-current={state.activeStep === index ? "step" : undefined}
    onClick={() => selectStep(index)}
    type="button"
  >
    <span className="process-step">{step}</span>
    <span>
      <strong>{title}</strong>
      <small>{description}</small>
    </span>
  </button>
</li>
```

Add `onMouseEnter`, `onMouseLeave`, `onFocusCapture`, and a containment-aware `onBlurCapture` to the root. Use `motion.div` keyed by the active title for the panel heading and `motion.li` for result rows. Set `initial={false}` when reduced motion is requested and otherwise use no more than 8px translation with 60ms row stagger.

- [ ] **Step 6: Reset on viewport leave without an effect-state lint violation**

Render the root as `motion.div` and use:

```tsx
onViewportLeave={() => {
  clearManualPause();
  dispatch({ type: "reset" });
}}
```

Do not synchronously reset state inside an effect.

- [ ] **Step 7: Replace tall sticky CSS with normal-height clickable layout**

Change the core rules to:

```css
.analysis-scroll-story {
  display: grid;
  grid-template-columns: minmax(300px, 0.78fr) minmax(480px, 1.22fr);
  gap: clamp(40px, 6vw, 88px);
  min-height: auto;
}

.analysis-story-visual {
  position: static;
  align-self: start;
}

.analysis-story-steps button {
  display: grid;
  width: 100%;
  min-height: 132px;
  grid-template-columns: 54px 1fr;
  gap: 16px;
  border: 1px solid var(--ch-border);
  border-radius: 20px;
  padding: 24px;
  background: white;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
```

Selected buttons lift no more than 4px. Below 768px, use one column, buttons at normal height, and no transform. Replace the note about scroll direction with `단계를 선택하거나 자동 재생으로 분석 흐름을 확인할 수 있습니다.`

- [ ] **Step 8: Run tests and commit**

Run:

```bash
npm test -- --run src/features/landing/analysis-scroll-story.test.tsx src/features/landing/landing-page.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src/features/landing/analysis-scroll-story.tsx src/features/landing/analysis-scroll-story.test.tsx src/app/globals.css
git commit -m "feat: make landing analysis walkthrough clickable"
```

---

### Task 2: Animate Every Hero Product Surface

**Files:**
- Modify: `src/features/landing/landing-copy.ts`
- Modify: `src/features/landing/product-preview.tsx`
- Modify: `src/features/landing/product-preview.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Extends each `heroPreviewStates` entry with `metricValues: readonly [string, string, string, string]`, `reviewCounts: readonly [number | "—", number | "—", number | "—"]`, and `emphasis: "caution" | "risk" | null`.
- Keeps existing state IDs, tab labels, summary, status, tone, 4.5-second autoplay, and manual selection behavior.

- [ ] **Step 1: Write failing synchronized-state tests**

Add helpers that scope assertions to the metric and review cards:

```tsx
const analyzedMetric = screen.getByText("분석 완료").closest("article");
expect(within(analyzedMetric!).getByText("—")).toBeInTheDocument();

fireEvent.click(screen.getByRole("tab", { name: "1차 분류" }));
expect(within(analyzedMetric!).getByText("241")).toBeInTheDocument();
expect(screen.getByText("주의 · 78%")).toBeInTheDocument();
expect(screen.getByTestId("review-level-caution")).toHaveAttribute(
  "data-emphasized",
  "true",
);

fireEvent.click(screen.getByRole("tab", { name: "최종 추천" }));
expect(screen.getByTestId("review-level-risk")).toHaveAttribute(
  "data-emphasized",
  "true",
);
expect(screen.getByText("사용자 검토 필요")).toBeInTheDocument();
```

Keep the timer-pause and reduced-motion tests.

- [ ] **Step 2: Run the Hero test and verify RED**

Run:

```bash
npm test -- --run src/features/landing/product-preview.test.tsx
```

Expected: FAIL because metric and review data are still static.

- [ ] **Step 3: Add exact deterministic state data**

Extend the three records with:

```ts
// 댓글 수집
metricValues: ["248", "—", "—", "—"],
reviewCounts: ["—", "—", "—"],
emphasis: null,

// 1차 분류
metricValues: ["248", "241", "17", "6"],
reviewCounts: [218, 17, 6],
emphasis: "caution",

// 최종 추천
metricValues: ["248", "241", "17", "6"],
reviewCounts: [218, 17, 6],
emphasis: "risk",
```

Keep `previewMetrics` as label/tone metadata and remove its static `value` field. Keep `previewReviewLevels` as label/description/tone metadata and remove its static `count` field.

- [ ] **Step 4: Animate title, metrics, review rows, and insight from the active state**

Use keyed Motion elements:

```tsx
<motion.div
  key={activeState.id}
  initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: landingMotion.duration.base, ease: landingMotion.ease }}
  aria-live="polite"
>
  <span className="preview-kicker">{activeState.kicker}</span>
  <strong>{activeState.title}</strong>
</motion.div>
```

Render metric values from `activeState.metricValues[index]`, review counts from `activeState.reviewCounts[index]`, and set `data-emphasized={activeState.emphasis === tone}`. Key the metric card, value, row, and insight by `activeState.id` plus their stable label. Use 60ms stagger, no more than 8px translation, and status-badge scale from `0.96` to `1`. Use `whileHover={{ y: -3 }}` only when reduced motion is false.

- [ ] **Step 5: Add focused Hero CSS**

Add:

```css
.metric-card,
.level-row,
.preview-insight {
  will-change: transform, opacity;
}

.level-row[data-emphasized="true"] {
  border-color: color-mix(in srgb, currentcolor 28%, transparent);
  box-shadow: 0 9px 24px rgb(39 73 127 / 10%);
}
```

Keep panel dimensions stable. In reduced motion, remove transforms and transitions. On mobile, do not add new horizontal overflow.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
npm test -- --run src/features/landing/product-preview.test.tsx src/features/landing/landing-page.test.tsx
```

Expected: PASS.

Commit:

```bash
git add src/features/landing/landing-copy.ts src/features/landing/product-preview.tsx src/features/landing/product-preview.test.tsx src/app/globals.css
git commit -m "feat: animate landing product preview surfaces"
```

---

### Task 3: Section-Specific Viewport Motion

**Files:**
- Create: `src/features/landing/integration-mark.tsx`
- Create: `src/features/landing/integration-mark.test.tsx`
- Modify: `src/features/landing/motion-reveal.tsx`
- Modify: `src/features/landing/motion-reveal.test.tsx`
- Modify: `src/features/landing/landing-page.tsx`
- Modify: `src/features/landing/landing-page.test.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `IntegrationMark` with no props.
- Extends `MotionReveal` output with `data-motion-visible={boolean}`.
- Keeps `MotionReveal` server output visible through `initial={false}`.

- [ ] **Step 1: Write failing reveal metadata and integration-mark tests**

Extend `motion-reveal.test.tsx`:

```tsx
render(<MotionReveal as="article">카드</MotionReveal>);
expect(screen.getByRole("article")).toHaveAttribute(
  "data-motion-visible",
  "true",
);
```

The shared `VisibleIntersectionObserver` makes the element visible in tests. In `integration-mark.test.tsx`, render `IntegrationMark` and assert it exposes a decorative wrapper without a button or link:

```tsx
const { container } = render(<IntegrationMark />);
expect(container.querySelector(".youtube-mark")).toHaveAttribute(
  "aria-hidden",
  "true",
);
expect(screen.queryByRole("button")).not.toBeInTheDocument();
```

Mock `useReducedMotion` as `true` and assert the wrapper has no inline transform style.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- --run src/features/landing/motion-reveal.test.tsx src/features/landing/integration-mark.test.tsx
```

Expected: FAIL because `IntegrationMark` and visibility metadata do not exist.

- [ ] **Step 3: Expose `MotionReveal` visibility without hiding server output**

Keep the existing hidden and visible control values unchanged. Add:

```tsx
data-motion-visible={isInView || Boolean(shouldReduceMotion)}
```

Keep `initial={false}` and retain the existing semantic element map.

- [ ] **Step 4: Implement desktop-only YouTube mark parallax**

Create:

```tsx
"use client";

import { YoutubeLogo } from "@phosphor-icons/react";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";

export function IntegrationMark() {
  const scope = useRef<HTMLDivElement>(null);
  const shouldReduceMotion = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: scope,
    offset: ["start end", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], [-8, 8]);

  return (
    <motion.div
      aria-hidden="true"
      className="youtube-mark"
      ref={scope}
      style={shouldReduceMotion ? undefined : { y }}
    >
      <YoutubeLogo weight="fill" />
    </motion.div>
  );
}
```

CSS below 768px forces the mark transform to none. Do not add resize listeners.

- [ ] **Step 5: Compose distinct section reveals in `LandingPage`**

Make these exact composition changes:

- Analysis heading: wrap with `MotionReveal` using `y={12}`.
- Solution cards: use `x={index === 0 ? -12 : index === 2 ? 12 : 0}` and `y={0}`.
- Dark AI copy: `MotionReveal x={-12} y={0}`.
- Interactive demo wrapper: `MotionReveal x={12} y={0}`.
- AI fact articles: `MotionReveal as="article" delay={index * 0.08} y={12}`.
- Integration mark: wrap `IntegrationMark` with `MotionReveal x={-12} y={0}`.
- Integration copy: keep `x={12}` and `y={0}`.
- Final CTA: keep `y={12}` and use its visibility metadata to animate only the background halo.

Remove the direct `YoutubeLogo` import from `landing-page.tsx`. Keep every section ID and `aria-labelledby` relationship unchanged.

- [ ] **Step 6: Add section-specific CSS and mobile/reduced fallbacks**

Use `data-motion-visible` for secondary icon emphasis:

```css
.landing-reveal-card .card-icon,
.landing-reveal-card .solution-icon {
  scale: 0.94;
  transition: scale var(--landing-motion-base) var(--landing-motion-ease);
}

.landing-reveal-card[data-motion-visible="true"] :is(.card-icon, .solution-icon) {
  scale: 1;
}

.integration-mark-reveal {
  display: grid;
  place-items: center;
}

.ai-demo-reveal {
  min-width: 0;
  align-self: center;
}

.final-cta::before {
  position: absolute;
  z-index: -1;
  inset: 0;
  border-radius: inherit;
  background: radial-gradient(circle at 50% 0%, rgb(108 153 255 / 31%), transparent 45%);
  content: "";
  scale: 0.96;
  transition: scale var(--landing-motion-section) var(--landing-motion-ease);
}

.final-cta[data-motion-visible="true"]::before {
  scale: 1;
}
```

Below 768px, disable only the integration-mark parallax and keep reveal distances at or below 12px. In reduced motion, force `translate`, `scale`, and Motion inline transforms to their resting values. Keep the existing one-column dark section and integration fallbacks.

- [ ] **Step 7: Extend landing integration assertions**

Assert that the analysis region contains four buttons, the dark section still contains the `제품 예시 화면 - AI 분석 데모` region, the YouTube integration heading remains accessible, and every link whose text includes `시작` or `로그인` targets `/auth/sign-in`.

- [ ] **Step 8: Run landing tests and commit**

Run:

```bash
npm test -- --run src/features/landing src/app/page.test.tsx src/app/layout-scroll.test.ts
```

Expected: PASS.

Commit:

```bash
git add src/features/landing/integration-mark.tsx src/features/landing/integration-mark.test.tsx src/features/landing/motion-reveal.tsx src/features/landing/motion-reveal.test.tsx src/features/landing/landing-page.tsx src/features/landing/landing-page.test.tsx src/app/globals.css
git commit -m "feat: add section-specific landing motion"
```

---

### Task 4: Accessibility, Browser, and Release Verification

**Files:**
- Modify only if verification finds a scoped defect in the files changed by Tasks 1–3.

**Interfaces:**
- Consumes the complete landing motion composition.
- Produces verified local behavior on `feat/junyoung/landing_page`.

- [ ] **Step 1: Run the complete automated verification**

Run freshly on the final tree:

```bash
npm test -- --run
npm run lint
npm run build
```

Expected: all test files pass except documented skips, ESLint exits 0, and Next.js production build exits 0.

- [ ] **Step 2: Verify desktop interactions in the local CrowdSift app**

At `http://127.0.0.1:3000/`, confirm:

- the analysis section fits in normal page height;
- stage controls autoplay every 4 seconds;
- clicking stage four changes the panel immediately and pauses automatic changes for 8 seconds;
- the Hero collection state displays dashes for not-yet-analyzed metrics;
- changing Hero tabs updates title, metrics, review counts, emphasis, and AI summary together;
- the header remains sticky and active navigation still updates;
- harmful source remains hidden before explicit reveal;
- final recommendations contain no executable moderation button.

- [ ] **Step 3: Verify responsive and reduced-motion behavior**

Where the browser surface supports viewport and media emulation, verify 390px width and `prefers-reduced-motion: reduce`. Otherwise rely on the focused reduced-motion tests and inspect computed responsive CSS. Confirm no horizontal overflow and no autoplay or parallax under reduced motion.

- [ ] **Step 4: Inspect Git scope and preserve unrelated files**

Run:

```bash
git status --short
git diff --check
git log --oneline main..HEAD
```

Expected: only the user's pre-existing `AGENTS.md` change and `tmp/pdfs/comment-classification/` remain uncommitted; all landing work is committed on `feat/junyoung/landing_page`.

- [ ] **Step 5: Commit any verification-only fix, if one was necessary**

If verification required a scoped fix, rerun the command that exposed it and commit only the affected landing files:

```bash
git add src/features/landing/analysis-scroll-story.tsx src/features/landing/analysis-scroll-story.test.tsx src/features/landing/landing-copy.ts src/features/landing/product-preview.tsx src/features/landing/product-preview.test.tsx src/features/landing/integration-mark.tsx src/features/landing/integration-mark.test.tsx src/features/landing/motion-reveal.tsx src/features/landing/motion-reveal.test.tsx src/features/landing/landing-page.tsx src/features/landing/landing-page.test.tsx src/app/globals.css
git commit -m "fix: polish refined landing motion"
```

If no fix was necessary, do not create an empty commit.
