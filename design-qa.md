# CommentHawk Design QA

이전 대시보드 QA 기록은 `design-qa-dashboard.md`에 보존했다.

## Comparison target

- Source visual truth: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-24a99be4-1c26-4574-a3b5-8d1dd7706425.png`
- Supporting BrandBastion references: the eight screenshots listed in the approved product context
- Implementation route: `http://localhost:3000/app/connect/youtube`
- Implementation screenshot: unavailable
- Intended viewport: desktop, 1440 × 900 CSS pixels
- Source pixels: 1430 × 1076 pixels
- Implementation pixels: unavailable
- Density normalization: not performed because the implementation screenshot could not be captured
- State: authenticated local `TEST FIXTURE`, public video preview and import controls visible

## Full-view comparison evidence

Blocked. The in-app browser refused local URL capture under its URL security policy even though the server returned HTTP 200 and the automated fixture E2E completed the interaction flow. Build output, DOM tests, and source code are not substitutes for a browser-rendered visual comparison.

## Focused region comparison evidence

Blocked for the same reason. The required focused comparison would cover:

- `TEST FIXTURE` top-bar status
- public URL input, count selector, and video preview
- quota and OpenAI cost estimate cards
- progress state and Comment Inbox link
- Inbox `공개 URL · 읽기 전용` badges and moderation-disabled notice

## Findings

- [P1] Browser-rendered implementation evidence is missing
  - Location: authenticated public URL flow and Comment Inbox.
  - Evidence: the source screenshot is available, but no same-viewport implementation capture can be opened and combined with it.
  - Impact: typography, spacing, wrapping, colors, icon alignment, image treatment, responsiveness, and visual parity cannot be approved from code or automated behavior alone.
  - Fix: reload `http://localhost:3000/app/connect/youtube` in the user’s in-app browser, sign in if needed, open the fixture preview state, and provide or allow capture of a 1440 × 900 screenshot. Compare it together with the source and repeat after any fixes.

## Required fidelity surfaces

- Fonts and typography: blocked pending rendered evidence.
- Spacing and layout rhythm: blocked pending rendered evidence.
- Colors and visual tokens: blocked pending rendered evidence.
- Image quality and asset fidelity: blocked pending rendered evidence.
- Copy and content: automated tests cover labels and behavior, but visual wrapping and density remain blocked.
- Icons and interactions: Phosphor icons and core interactions are implemented; visual alignment remains blocked.
- Accessibility and responsiveness: semantic unit/E2E coverage exists; visual breakpoint inspection remains blocked.

## Primary interactions tested

- Local Mailpit login
- public video URL validation
- default 20-comment selection
- fixture video preview
- import and staged analysis completion
- Comment Inbox navigation
- read-only source labeling
- absence of moderation buttons
- browser-side and Next.js server-side Google/OpenAI request guards

## Console errors checked

Not checked in the in-app browser because local browser access was blocked. The Playwright E2E completed without a test failure, but this does not replace the required console inspection.

## Comparison history

No visual iteration could begin because the first implementation capture was blocked. No P0/P1/P2 visual fix has been claimed.

## Implementation checklist

- [ ] Capture the authenticated fixture preview at 1440 × 900.
- [ ] Combine the source and implementation captures in one comparison input.
- [ ] Inspect all required fidelity surfaces and focused regions.
- [ ] Fix any P0/P1/P2 findings and recapture.
- [ ] Change the final result to `passed` only after the comparison succeeds.

final result: blocked
