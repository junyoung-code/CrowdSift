# CrowdSift Landing Motion Design

**Date:** 2026-08-04
**Status:** Approved direction, written specification pending user review

## Goal

Make the existing CrowdSift landing page feel responsive and product-led in the same broad spirit as CommentShark without copying its layout, assets, text, or exact motion. Scrolling should reveal how CrowdSift works, and direct interaction should let a visitor understand the product before signing in.

The experience must remain truthful: all landing demonstrations are labeled as product examples, no example is presented as connected YouTube data, and no moderation action is sent from the landing page.

## Approved Direction

Use a medium-intensity motion system:

- the hero and two-stage analysis story receive the strongest scroll-linked motion;
- problem, solution, integration, and CTA sections use restrained entrance and hover feedback;
- one interactive comment-analysis demonstration shows real product concepts with fixed example data;
- native page scrolling is preserved, with no scroll hijacking or artificial smooth-scroll engine;
- mobile and reduced-motion experiences simplify movement while preserving all information and controls.

Motion for React plus CSS is the preferred implementation. CSS owns static styling, hover and focus feedback, and reduced-motion fallbacks. Motion for React owns viewport entry state, scroll-linked transforms, staggered transitions, and interactive state changes.

## Reference Principles

The CommentShark reference is useful for four principles:

1. Show product behavior above the fold instead of relying on decorative illustration.
2. Reveal sections as the user reaches them, with generous pacing and visible hierarchy.
3. Use small scroll-linked translations and tilts to make product surfaces feel physical.
4. Let visitors manipulate an example workflow without requiring an account.

CrowdSift adapts those principles to its own safety model: source preservation, two-stage analysis, creator-specific context, hidden harmful content, and explicit confirmation before irreversible moderation.

## Experience Blueprint

### 1. Sticky header

The existing header remains visible while scrolling.

- At the top, it keeps the current transparent light presentation.
- After 24 px of scroll, it gains a subtle translucent background, bottom border, and restrained shadow.
- Scrolling down compresses its vertical padding slightly; scrolling up restores the more readable state.
- The current section link is visually active as its section crosses the middle of the viewport.
- Header changes use 160–240 ms transitions and never move primary page content.

### 2. Hero and product preview

The hero heading, description, and primary CTA remain visible in the server-rendered first frame. They must not begin at `opacity: 0`, so motion cannot delay the value proposition or harm perceived loading.

The existing `ProductPreview` becomes the hero's primary motion surface:

- Its outer browser frame translates vertically within a 32 px range as the hero leaves the viewport.
- Rotation stays between -1.5 and 1.5 degrees, and scale stays between 0.98 and 1.01.
- Internal content cycles through three labeled example states every 4.5 seconds:
  1. a viewer question is imported;
  2. first-stage classification marks it for review;
  3. creator context produces a final recommendation.
- State changes animate only opacity, transform, and progress width.
- Hover, keyboard focus within the preview, or any manual tab selection pauses automatic cycling.
- Manual selection remains active until the visitor leaves the hero section.
- The preview keeps its existing `제품 예시 화면` label and never implies a live connection.

### 3. Problem and solution sections

Headings enter once with a 20 px upward translation and fade over 500–650 ms. Cards follow with an 80 ms stagger.

- Problem cards use the same direction and distance to feel orderly rather than chaotic.
- Solution cards alternate by no more than 8 px horizontally to introduce visual rhythm.
- Hover raises a card by 4 px and strengthens its border and shadow.
- Keyboard focus receives the same emphasis without requiring pointer movement.
- Entrance animations run once per page visit. They do not repeatedly replay when the user scrolls back and forth.

### 4. Two-stage analysis scroll story

The current four-step process becomes the page's main scroll-driven story on desktop.

- At viewport widths of 1024 px and above, the section provides approximately 280 vh of scroll range.
- A product panel remains sticky inside the viewport while four explanatory steps progress beside it.
- The active step changes when its text block crosses the central activation band.
- A vertical progress line and step number identify the current stage.
- Product state changes follow this sequence:
  1. `댓글 수집`: source and thread metadata appear;
  2. `1차 분류`: safe, caution, or risk classification appears with confidence context;
  3. `개인화 분석`: creator policy and consented historical corrections are added;
  4. `사용자 검토`: the recommendation is presented without executing an action.
- Scroll-linked movement is reversible: scrolling upward moves the story to the previous stage.
- Text remains normal document content and is never hidden solely because a stage is inactive.

Between 768 px and 1023 px, the product panel remains visually prominent but is not pinned for the full story. Below 768 px, the four stages become a normal vertical sequence with one small reveal per stage.

### 5. Interactive comment-analysis demo

The dark AI section contains one focused, directly manipulable product demonstration.

Three fixed example comments are provided:

1. a product or equipment question;
2. constructive feedback about the video's presentation;
3. a harmful comment whose original text is hidden by default.

The interaction flow is:

1. The visitor selects an example comment.
2. The interface previews its preserved source state.
3. Selecting `분석 과정 보기` progresses through rule signals, first-stage classification, creator context, and final recommendation.
4. The final state shows a recommendation and the message `사용자가 확인해야 조치됩니다`.
5. No control performs a real moderation request. The final CTA routes to sign-in.

The demo uses deterministic local example data. It does not call YouTube, OpenAI, Supabase, or any production API. Example raw content, analysis output, sanitized feedback, and proposed user action are represented as separate fields even in this client-only demonstration.

For the harmful example:

- the raw text is replaced by an accessible hidden-content summary by default;
- a clearly labeled reveal control is required to view it;
- choosing another example hides it again;
- screen-reader text explains why the content is hidden.

### 6. Integration and final CTA

These sections use only restrained entrance effects.

- The YouTube mark can scale from 0.96 to 1 while fading in.
- Supporting copy follows after 80 ms.
- The final CTA does not use looping motion.
- Primary buttons keep a short 2 px hover lift and visible focus state.

## Motion Tokens

The motion system uses a small shared vocabulary:

| Token | Value | Use |
| --- | ---: | --- |
| `fast` | 160 ms | hover, focus, small header changes |
| `base` | 420 ms | state swaps and compact reveals |
| `section` | 620 ms | section heading and panel entrances |
| `stagger` | 80 ms | related card and list entrances |
| `distance-sm` | 8 px | card rhythm and micro feedback |
| `distance-md` | 20 px | standard entrance movement |
| `parallax` | 32 px maximum | hero product preview only |
| `tilt` | 1.5 degrees maximum | product surfaces only |

Default easing is `cubic-bezier(0.22, 1, 0.36, 1)`. Interactive state changes may use a restrained spring, but no element may bounce more than once or overshoot enough to shift surrounding layout.

## Component Architecture

The root `LandingPage` remains a Server Component. Motion is introduced through small client islands so the complete marketing page does not become client-rendered.

### `LandingMotionHeader`

- Owns header scroll direction and current-section state.
- Receives navigation section IDs as configuration.
- Depends only on browser scroll state and does not own landing copy.

### `MotionReveal`

- Wraps headings, cards, or small content groups.
- Supports `once`, `delay`, and stagger configuration.
- Defaults to semantic pass-through behavior so wrappers do not damage heading or list structure.
- Renders content fully visible when JavaScript is unavailable.

### `HeroProductPreview`

- Owns the three deterministic hero states and manual tab selection.
- Owns autoplay pause and resume rules.
- Receives example content as typed props, separate from animation configuration.

### `AnalysisScrollStory`

- Owns scroll progress and the active step.
- Renders all explanatory content in document order.
- Sends only an active-step index to its product visualization.
- Switches to non-sticky presentation through responsive CSS rather than maintaining separate content trees.

### `InteractiveAnalysisDemo`

- Owns selected example, revealed-source state, and visible analysis stage.
- Uses a reducer or explicit state machine so invalid stage combinations cannot render.
- Receives fixed example records with separate `rawSource`, `ruleSignals`, `stageOne`, `creatorContext`, `finalRecommendation`, and `proposedAction` fields.
- Has no service, repository, or API dependency.

### `LandingMotionConfig`

- Centralizes durations, distances, easing, and reduced-motion behavior.
- Prevents one-off values from spreading through page components and styles.

## State and Data Flow

There are two independent state paths:

1. Scroll state drives presentation only: header state, section visibility, hero transform, and active story step.
2. Demo interaction state drives deterministic local example content: selected comment, revealed source, and analysis stage.

Neither path writes to storage, changes authentication, calls a server action, or modifies real product data. Changing scroll position never mutates the interactive demo's selected comment. Selecting a demo comment never changes page scroll state.

Autoplay is secondary to user intent. Once the visitor manually selects a hero state, the timer stops until the hero leaves the viewport. Returning to the hero resets it to the first example state rather than resuming midway through an old timer.

## Accessibility and Reduced Motion

The existing global `prefers-reduced-motion` behavior remains the baseline and is strengthened at the component level.

When reduced motion is requested:

- all scroll-linked translation, scale, rotation, and parallax are disabled;
- section content is immediately visible;
- autoplay is disabled;
- state changes use either no transition or a short opacity transition;
- the sticky analysis story becomes the normal vertical sequence;
- every control and result remains available through keyboard navigation.

Motion never communicates classification or progress alone. Text labels, step numbers, status names, and accessible descriptions remain the source of meaning. Focus is never moved automatically during scroll or autoplay.

## Performance Boundaries

- Animate `transform` and `opacity` by default; width is allowed only for the small progress indicator.
- Do not animate layout properties such as top, left, height, margin, or padding during scroll.
- Do not attach an unthrottled global `scroll` listener for each component.
- Load Motion only for landing client islands and use its reduced-bundle loading path where compatible with the implementation.
- Pause autoplay and nonessential updates when their section is outside the viewport or the document is hidden.
- Reserve stable dimensions for every product panel so animations cause no layout shift.
- Do not add background video, canvas, WebGL, scroll smoothing, or pointer-following effects in this slice.

## Progressive Fallbacks and Error Handling

- Without JavaScript, the hero shows its first example, all sections are visible, and the four analysis stages render sequentially.
- If Motion fails to load, CSS presents the same static fallback without blocking navigation or CTAs.
- If an animation is interrupted by resize or orientation change, the current content state remains readable and the scroll story recalculates from the new layout.
- Demo controls never enter a loading or error state because the data is local and deterministic.
- Any future real-data demo requires a separate product decision and must not silently replace the example-data contract.

## Responsive Rules

### Desktop, 1024 px and above

- Full hero parallax and restrained tilt.
- Sticky four-stage analysis story.
- Staggered three-card grids.
- Interactive demo uses a two-column source-and-analysis layout.

### Tablet, 768–1023 px

- Reduced hero travel and no persistent analysis pin.
- Cards may remain in two columns where space permits.
- Interactive demo stacks its analysis panel below the selected source.

### Mobile, below 768 px

- No parallax or tilt.
- No sticky scrollytelling.
- Standard vertical reveal with no more than 12 px travel.
- Demo controls fill the available width and keep a minimum 44 px target size.
- No horizontal overflow at 390 px.

## Testing and Verification

### Component tests

- Hero autoplay advances through the three states and pauses after manual selection.
- Reduced motion disables autoplay and transform-based movement.
- Harmful example text begins hidden, can be revealed explicitly, and hides again when selection changes.
- Interactive analysis stages advance in the defined order and never expose a real moderation action.
- `MotionReveal` content is present and accessible before viewport activation.

### Landing integration tests

- The first server-rendered frame contains the hero heading, description, CTA, and example-data label.
- All navigation anchors and sign-in links remain correct.
- The scroll story exposes all four stage headings to assistive technology.
- The page contains no call from the landing demo to YouTube, OpenAI, Supabase, or moderation endpoints.

### Browser verification

- Verify desktop at 1440 × 900 and 1280 × 800.
- Verify tablet at 820 px and mobile at 390 px.
- Scroll down and back up through the hero and analysis story to confirm reversible linked motion.
- Confirm card reveals run once and do not flicker when re-entering the viewport.
- Confirm sticky header states and active navigation markers.
- Confirm no horizontal overflow, layout shift, clipped focus ring, or hidden content collision.
- Repeat the flow with reduced motion enabled.
- Compare captured landing states against the existing CrowdSift visual references for hierarchy and brand consistency, not pixel cloning.

### Project gates

- Run the focused landing and component tests.
- Run `npm run lint`.
- Run `npm run build`.

## Implementation Sequence

The implementation should be split into three reviewable passes:

1. Add shared motion tokens, reduced-motion behavior, header response, and section reveals.
2. Add hero state animation and the responsive two-stage scroll story.
3. Add the interactive analysis demo, then complete accessibility, performance, and cross-viewport verification.

Each pass must leave the landing page usable and truthful on its own. No pass introduces real external data or moderation behavior.

## Acceptance Criteria

- The landing page visibly responds to scrolling without changing native scroll behavior.
- The hero demonstrates CrowdSift's product flow with clearly labeled example data.
- The two-stage analysis section communicates four ordered stages through reversible desktop scrollytelling and a complete mobile fallback.
- Visitors can directly explore a deterministic comment-analysis example without signing in or calling external services.
- Harmful source text is hidden by default.
- All content and controls remain usable with reduced motion, keyboard navigation, JavaScript disabled, and mobile layouts.
- Motion uses a small consistent token set and does not introduce horizontal overflow or layout shift.
- Existing authentication links, safety language, and product truthfulness constraints remain intact.
