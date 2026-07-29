# CrowdSift Landing Design QA

## Comparison Target

- Source visual truth:
  - `references/brandbastion/01-hero-desktop.png`
  - `references/brandbastion/02-problem-section.png`
  - `references/brandbastion/03-solutions-overview.png`
  - `references/brandbastion/06-ai-processing.png`
  - `references/brandbastion/07-integrations.png`
  - `references/brandbastion/09-dashboard-hero-detail.png`
- Implementation URL: `http://127.0.0.1:3000/`
- Browser-rendered implementation:
  - `docs/qa/landing-1440x900.png`
  - `docs/qa/landing-1280x800.png`
  - `docs/qa/landing-sections-1.png`
  - `docs/qa/landing-sections-2.png`
  - `docs/qa/landing-ai-dark.png`
- Combined comparison evidence:
  - `docs/qa/landing-reference-comparison.png`
- State: public, unauthenticated landing page with clearly labeled example product data.

## Normalization

- Primary source image: 3456 × 1918 px.
- Primary implementation image: 1440 × 900 px at a 1440 × 900 CSS viewport.
- Secondary implementation image: 1280 × 800 px at a 1280 × 800 CSS viewport.
- Browser device scale factor: 1.
- Combined comparison: both primary images were proportionally fit into separate 720 × 450 px regions on one 1460 × 450 px canvas. The source is an inspiration target rather than a pixel-identical clone, so comparison focuses on hierarchy, rhythm, density, and finish.
- Browser measurements:
  - 1440 viewport: document width 1440 px, document scroll width 1440 px.
  - 1280 viewport: document width 1280 px, document scroll width 1280 px.

## Required Fidelity Surfaces

### Fonts and typography

- The implementation preserves the source hierarchy: compact uppercase eyebrow, oversized high-weight hero, quieter body copy, and dense small product-UI labels.
- Korean display copy uses the project’s Pretendard/SUIT/system fallback stack with intentional negative tracking and word-safe wrapping.
- At 1440 px and 1280 px the hero wraps without colliding with the product preview. Small dashboard labels remain readable.

### Spacing and layout rhythm

- The source’s header → split hero → principle strip → centered problem cards → solution cards → dark AI section → integration → CTA rhythm is preserved.
- The hero remains a two-column composition at both required desktop widths.
- Card padding, section gaps, rounded surfaces, borders, and elevation form a consistent hierarchy.
- No horizontal overflow was detected at either required viewport.

### Colors and visual tokens

- The pale blue canvas, navy display type, vivid blue action color, white surfaces, and dark navy AI section match the reference direction without copying BrandBastion branding.
- `안전 / 주의 / 위험` use separate semantic colors and always include text and explanatory copy, so color is not the only signal.
- Focus styling and reduced-motion rules are defined globally.

### Image quality and asset fidelity

- The source’s hero visual is a product interface, so the implementation uses real React interface components rather than a raster screenshot.
- All visible interface icons use one consistent Phosphor icon family; no emoji, inline handcrafted SVG, or placeholder illustration is used.
- BrandBastion logos, customer logos, customer claims, and promotional metrics were intentionally omitted because the approved specification requires original CrowdSift assets and copy.

### Copy and content

- Every section explains CrowdSift’s approved behavior: YouTube first, 20–50 top-level threads, two-stage analysis, creator policy and feedback retrieval, source preservation, and confirmation before moderation.
- Example metrics are visibly labeled `제품 예시 화면` and are isolated inside the landing feature.
- Unsupported platforms are not presented as available.

## Full-view Comparison Evidence

- `docs/qa/landing-reference-comparison.png` shows the source and implementation in one image.
- The implementation preserves the source’s above-the-fold balance: large left-side promise, right-side product preview, calm pale canvas, compact navigation, and a slim trust/principle strip.
- Differences in logo, copy, metrics, customer logos, and exact geometry are intentional product constraints, not fidelity regressions.

## Focused Region Evidence

- `docs/qa/landing-1440x900.png`: hero typography, product-preview density, label visibility, CTAs, and principle strip.
- `docs/qa/landing-sections-1.png`: problem cards, icon alignment, card rhythm, and section boundary.
- `docs/qa/landing-sections-2.png`: solution cards and four-step analysis flow.
- `docs/qa/landing-ai-dark.png`: AI facts, YouTube integration, final CTA, and footer.
- The focused captures are readable at native resolution, so no additional crop was required.

## Findings

- No actionable P0, P1, or P2 visual findings remain.
- [P3] The exact Korean glyph shape can vary when Pretendard or SUIT is not installed.
  - Location: global font stack in `src/app/globals.css`.
  - Evidence: the browser used a locally available Korean sans-serif fallback.
  - Impact: small optical differences may appear across operating systems, without changing layout or usability.
  - Follow-up: self-host a licensed Korean variable font when a final brand font is selected.

## Interaction and Accessibility Checks

- Primary section navigation was tested by selecting `문제`; the URL changed to `#problems` and the intended section was reached.
- Header, preview, sections, cards, lists, and footer expose semantic landmarks and headings.
- Product example data has an accessible region name.
- Required landing links point to the planned `/auth/sign-in` route.
- Browser console errors and warnings checked: none.
- Automated landing tests and ESLint passed.

## Comparison History

### Pass 1

- Evidence: `docs/qa/landing-reference-comparison.png` plus focused section screenshots.
- Earlier P0/P1/P2 findings: none.
- Fixes made after comparison: none required.
- Post-fix evidence: not applicable; the first comparison passed.

## Implementation Checklist

- [x] Preserve BrandBastion-inspired information rhythm without copying brand assets.
- [x] Mark all landing metrics as example product data.
- [x] Keep YouTube as the only supported integration in current copy.
- [x] Display `안전 / 주의 / 위험` with text, icons, and explanations.
- [x] Verify 1440 × 900 and 1280 × 800 without horizontal overflow.
- [x] Check a primary navigation interaction and browser console.

final result: passed
