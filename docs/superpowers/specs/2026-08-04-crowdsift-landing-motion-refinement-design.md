# CrowdSift Landing Motion Refinement Design

## Goal

Refine the existing landing motion so visitors can understand the analysis flow without scrolling through an artificially tall section, while making the Hero product preview and the remaining page sections feel more responsive and interactive.

The result should retain native page scrolling, keep all product data explicitly labeled as examples, and preserve CrowdSift's user-confirmation and source-protection principles.

## Approved Direction

- Replace the `250vh` sticky analysis story with a normal-height, clickable four-stage walkthrough.
- Autoplay the walkthrough while it is visible, but preserve direct user control.
- Extend Hero state changes to metrics, review-priority rows, and the AI summary rather than changing only the top tabs and title.
- Add balanced, section-specific entrance and ambient motion throughout the page.
- Do not add scroll hijacking, horizontal scrolling, or additional long pinned sections.

## 1. Clickable Analysis Walkthrough

### Layout

The analysis section remains a two-column layout on desktop:

- The left column contains four stage controls: `1차 분석`, `크리에이터 문맥`, `2차 분석`, and `사용자 확인`.
- The right column contains the current stage panel, progress indicator, and four result rows.
- The section uses normal document height. It must not use `min-height: 250vh`, sticky positioning, or scroll-progress mapping.
- On mobile, the controls appear above the result panel in normal vertical flow.

### Interaction

- Each stage control is a semantic button and exposes the selected state with `aria-current="step"`.
- The first stage is selected initially.
- When the section is at least 35% visible and the page is visible, the selected stage advances every 4 seconds.
- After stage four, autoplay loops to stage one.
- Clicking a stage selects it immediately and pauses autoplay for 8 seconds. Autoplay then continues from the following stage.
- Hovering the walkthrough or moving keyboard focus inside it pauses autoplay. Autoplay resumes when hover and focus leave, unless the 8-second manual pause is still active.
- Leaving the viewport resets the walkthrough to stage one and clears the manual pause.

### Motion

- The selected stage control gains border, shadow, and a maximum 4px lift.
- The panel heading crossfades with an 8px vertical transition.
- Result rows activate in order with 60ms stagger, a maximum 8px horizontal movement, and a check-icon scale transition.
- The progress indicator changes width over 420ms.
- Inactive stage text remains readable and stays in the DOM.

## 2. Hero Product Preview

### State Data

The existing three example states remain:

1. `댓글 수집`
2. `1차 분류`
3. `최종 추천`

Each state owns its visible title, summary, status, metric values, review-level counts, and emphasized review row. Values are deterministic example data and never call YouTube, AI, Supabase, or any server action.

The collection state communicates that comments are imported but analysis is pending. The classification state shows completed counts and the first-pass distribution. The recommendation state keeps the analyzed distribution and emphasizes the rows that require creator review.

The exact example values are:

| State | Imported | Analyzed | Caution | Risk | Review counts | Emphasis |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| `댓글 수집` | 248 | `—` | `—` | `—` | 안전 `—`, 주의 `—`, 위험 `—` | none |
| `1차 분류` | 248 | 241 | 17 | 6 | 안전 218, 주의 17, 위험 6 | 주의 |
| `최종 추천` | 248 | 241 | 17 | 6 | 안전 218, 주의 17, 위험 6 | 위험 |

The dash means analysis has not occurred yet; it must not be rendered as a misleading zero.

### Interaction and Motion

- Existing tab selection and 4.5-second autoplay remain.
- A manual tab selection pauses Hero autoplay until the preview leaves the viewport.
- On every state change:
  - the title crossfades and moves no more than 8px;
  - metric cards enter with 60ms stagger and no more than 8px vertical movement;
  - metric values use a compact vertical-roll transition rather than a long count-up;
  - review-priority rows enter with 60ms stagger and no more than 8px horizontal movement;
  - the emphasized review row receives a restrained border and background pulse;
  - the AI summary moves up by 8px and its status badge briefly scales from `0.96` to `1`.
- Cards may lift up to 3px on pointer hover. Their semantic role does not change into a button because they do not perform an action.

## 3. Section-Specific Scroll Motion

All section motion uses viewport entry rather than scroll-progress pinning. Each effect runs once unless it is a small ambient transform.

### Problem Section

- Heading reveals first.
- Three cards reveal upward with 80ms stagger and a maximum 12px movement.
- Card icons scale from `0.94` to `1` after their card appears.

### Solution Section

- Heading and supporting copy reveal together.
- Cards alternate from `-12px`, `0`, and `12px` horizontally with 80ms stagger.
- The active hover/focus treatment keeps the existing 4px lift.

### Analysis Sections

- The analysis heading reveals before the clickable walkthrough.
- The source-preserving dark section reveals its copy from the left and the interactive demo from the right, each by at most 16px.
- The three principle cards reveal upward with 80ms stagger.
- Existing demo controls retain their current state transitions and source-protection behavior.

### YouTube Integration

- The YouTube mark enters from the left and has a maximum 16px viewport-linked vertical parallax on desktop.
- The copy enters from the right.
- Parallax is disabled below 768px.

### Final CTA

- The CTA content reveals upward by no more than 12px.
- The background halo scales from `0.96` to `1` as the section enters, without changing layout dimensions.

## 4. Accessibility and Responsive Rules

- Native vertical scrolling remains unchanged.
- Focus rings remain visible on all interactive controls.
- Stage controls use buttons and are reachable in logical keyboard order.
- Autoplay stops while keyboard focus is inside the walkthrough.
- `prefers-reduced-motion: reduce` disables both autoplays, parallax, stagger, rolling values, and ambient transforms.
- Reduced-motion content appears immediately with no hidden initial state.
- Below 768px, all movement is capped at 12px and the analysis walkthrough uses normal one-column flow.
- The 390px layout must not introduce horizontal overflow.

## 5. Component Boundaries

- `AnalysisScrollStory` becomes a clickable/autoplay client component and no longer imports scroll-progress helpers.
- `ProductPreview` continues as a client component and consumes expanded typed Hero state data.
- `MotionReveal` remains the reusable boundary for one-time viewport entrances.
- A small client wrapper may be introduced for the YouTube mark parallax; it must not convert `LandingPage` into a Client Component.
- `LandingPage` remains a Server Component that composes focused client islands.

## 6. Testing and Verification

Focused tests must verify:

- stage controls select the corresponding analysis panel immediately;
- analysis autoplay advances every 4 seconds, loops, and pauses for 8 seconds after manual selection;
- hover, focus, viewport exit, and reduced motion control autoplay correctly;
- Hero state changes update metric values, review counts, emphasis, title, and AI summary together;
- Hero manual selection and reduced-motion autoplay behavior remain correct;
- all stage content and section headings remain accessible;
- harmful example source remains hidden by default;
- sign-in links and example labels remain unchanged.

Before completion, run the full test suite, `npm run lint`, and `npm run build`, then inspect desktop and mobile behavior in the local app where the browser surface supports it.

## Out of Scope

- New backend integrations or live data
- Smooth-scroll engines or scroll hijacking
- Additional pinned scrollytelling sections
- Billing, multi-platform support, or dashboard changes
- Executable moderation controls on the landing page
