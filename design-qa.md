# Comment Inbox Design QA

## Evidence

- Source visual truth: `references/crowdsift-ui/2026-07-28-comment-inbox-dark-brandbastion.png`
- Browser implementation: `references/crowdsift-ui/2026-07-28-comment-inbox-implementation.png`
- Route: `http://localhost:3000/app/inbox?levels=caution&levels=risk&selected=b0300000-0000-4000-8000-000000000010&page=1`
- State: authenticated local `TEST FIXTURE` workspace, caution comment selected, two stored replies open, harmful source still protected, reply composer disabled
- Viewport: 1440 × 1024 CSS px
- Device pixel ratio: 1
- Source pixels: 1487 × 1058
- Implementation pixels: 1440 × 1024
- Density normalization: both full views and both focused workspace crops were normalized to 700 px width for combined visual comparison; no density-only differences were filed

## Findings

No actionable P0, P1, or P2 findings remain.

- Typography: the implementation preserves the source hierarchy with a restrained Korean system-sans stack, compact uppercase eyebrow labels, strong conversation summaries, and smaller operational metadata. Text remains legible without the brittle ultra-small density of the concept image.
- Spacing and layout rhythm: the three-column queue / conversation / analysis structure, thin dividers, rounded dark surfaces, and compact filter row match the intended composition. The existing CrowdSift shell is preserved while adopting the source's full dark frame.
- Colors and tokens: near-black canvas, blue selection, violet AI accents, amber caution, and rose risk states map consistently to the source. Contrast and disabled states remain visible.
- Image quality and asset fidelity: stored author avatars and video thumbnails are rendered when their source URLs exist; initials are used only as a data-absence fallback. The QA fixture intentionally has no remote imagery and is labeled as non-production data.
- Copy and content: Korean labels are concise and operational. The implementation does not claim reply posting exists; the composer explicitly states that YouTube publishing and evidence storage are required first.
- Icons and affordances: one Phosphor icon family is used consistently. Selected rows, reply disclosure links, review badges, details controls, disabled composer, and moderation actions are distinguishable.
- Accessibility and responsiveness: semantic regions, headings, labeled filters, disabled state, focus-visible styling, and protected-source disclosure are present. At 820 px and 390 px the workspace collapses to one column without document-level horizontal overflow.

## Focused Region Comparison

The queue, selected thread, two-reply branch, AI summary, and moderation controls were compared in a combined focused image after matching the visible selected-comment state. This focused pass confirmed that the reply-count disclosure and central thread hierarchy remain readable at production density.

## Primary Interactions Tested

- Opened `답글 2개 보기` and confirmed the selected URL parameter, selected author, and both stored replies updated.
- Confirmed caution/risk source text is absent initially and `원문 확인` remains the explicit reveal affordance.
- Confirmed the reply composer explanation is visible and `답글 보내기` is disabled.
- Confirmed desktop width has no horizontal overflow.
- Confirmed 820 px tablet layout collapses to one workspace column.
- Confirmed 390 px mobile layout has `document.scrollWidth === 390`, keeps two replies, and makes the product navigation independently horizontally scrollable.
- Checked browser warning/error logs after the final render: none.

## Comparison History

1. First comparison
   - [P2] The existing product shell remained light, weakening the requested black-background treatment.
   - Fix: scoped the CrowdSift sidebar, top bar, main canvas, navigation, footer, and active state to the Inbox dark theme.
   - Post-fix evidence: final 1440 × 1024 browser screenshot shows a continuous near-black application frame.

2. Responsive comparison
   - [P2] At 390 px, the existing five-column product navigation forced the document to 664 px wide.
   - Fix: constrained the sidebar and converted the navigation to an independently scrollable flex row below 820 px.
   - Post-fix evidence: `document.scrollWidth` and viewport width both measure 390 px.

3. Asset fidelity comparison
   - [P2] The first implementation always used initial-based avatar fallbacks and omitted stored video imagery.
   - Fix: render stored author avatar and video thumbnail URLs with accessible alt text; retain initials only when source imagery is absent.
   - Post-fix evidence: component test verifies both source-provided profile and thumbnail images render.

## Open Questions

- Reply publishing remains intentionally out of scope. When YouTube reply posting and evidence storage are implemented, the locked composer can be upgraded without changing the current thread layout.

## Follow-up Polish

- [P3] A production workspace with real avatar and thumbnail URLs will visually approach the concept image more closely than the intentionally image-free QA fixture.
- [P3] The concept keeps a full reply composer above the fold; the implementation prioritizes truthful locked-state messaging until the backend capability exists.

## Implementation Checklist

- [x] Three-column desktop workspace
- [x] Stored reply counts and reply thread
- [x] Protected harmful source
- [x] Real correction and moderation controls preserved
- [x] Honest locked reply composer
- [x] Full dark CrowdSift shell
- [x] Tablet and mobile overflow checks
- [x] Console error check
- [x] Source-provided avatar and thumbnail support

final result: passed
