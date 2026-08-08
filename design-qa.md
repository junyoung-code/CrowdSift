# Comment Inbox Design QA

## Evidence

- Queue spacing reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-8104de14-09a7-4c1d-bd8c-8dc147514789.png` (630 × 990 px)
- Current queue reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-ed8bf1ca-3928-434b-8154-04ff58b37539.png` (728 × 1376 px)
- Conversation spacing reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-1bff0ba7-eb91-4198-bbef-ca0965f41ee6.png` (954 × 622 px)
- Queue density feedback reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-28124fd7-690c-4ed9-bfdf-15d6c0cdabc4.png` (776 × 480 px)
- Author-to-badge spacing reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-bcb5c178-3297-4caf-8d6a-3fa85d04ded9.png` (340 × 166 px)
- Center conversation density reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-3e824989-75ba-49fd-a590-fd78e90fccd7.png` (1078 × 850 px)
- Rendered implementation: `/private/tmp/crowdsift-comment-inbox-balanced-b.png` (1280 × 1812 px)
- Final 1440 px render: `/private/tmp/crowdsift-comment-inbox-balanced-1440.png` (1440 × 1822 px)
- Full comparison board: `/private/tmp/crowdsift-balanced-full-comparison.png` (1320 × 936 px)
- Half-spacing implementation viewport: `/private/tmp/crowdsift-comment-inbox-half-spacing-viewport.png` (1280 × 720 px)
- Half-spacing focused comparison: `/private/tmp/crowdsift-comment-inbox-half-spacing-comparison.png` (1466 × 584 px)
- Author-to-badge implementation viewport: `/private/tmp/crowdsift-comment-inbox-author-badge-3px.png` (1280 × 720 px)
- Author-to-badge focused comparison: `/private/tmp/crowdsift-comment-inbox-author-badge-comparison.png` (950 × 256 px)
- Center half-spacing implementation viewport: `/private/tmp/crowdsift-comment-inbox-center-half-spacing.png` (1280 × 720 px)
- Center half-spacing focused comparison: `/private/tmp/crowdsift-comment-inbox-center-half-spacing-comparison.png` (2252 × 968 px)
- Route: `http://localhost:3000/app/inbox?levels=caution&levels=risk&selected=ef26cc73-f022-40ab-b73d-c9799b57ce48&page=1`
- State: authenticated light theme, real connected comments, risk item selected, harmful source protected and collapsed
- Browser checks: 800, 1100, 1280, and 1440 CSS px

## Findings

No actionable P0, P1, or P2 findings remain.

- Typography: the queue uses 14/20 px author and summary text with 12/18 px metadata. The conversation uses 15/22 px author text, 17/27 px summary text, and 13/20 px warning text. The analysis panel uses a 12–14 px operational scale instead of the earlier 10–11 px controls.
- Spacing: queue content follows a single 48 px rail derived from a 36 px avatar and 12 px gap. Queue rows use 10 px vertical and 20 px horizontal padding. In the conversation, the outer thread padding is 12 px, the main card uses 12 px padding and an 8 px grid gap, the warning row uses 6/7 px padding, reactions start after 8 px, and the empty state starts after 10 px.
- Alignment: the conversation card, reactions, reply thread, and empty state use `calc(100% - 32px)`, `max-width: 680px`, and automatic side margins. This preserves centered alignment while halving the former 32 px side gutters to 16 px.
- Column balance: desktop uses the approved 30/42/28 queue, conversation, and insight hierarchy with practical minimum widths of 270/420/290 px.
- Right-panel legibility: insight title/body/status text is 14/13/12 px; facts are 12/13 px; correction and moderation labels are at least 12 px and action buttons are at least 40 px high.
- Visual system: semantic caution and risk colors are retained. Revealed source content remains neutral, so the source container does not imply that harmful text is safe.
- Assets and copy: real stored avatars and YouTube thumbnails remain intact. No sample engagement values or placeholder connected data were introduced.

## Comparison History

1. Left queue hierarchy
   - [P2] The author, context, summary, thumbnail, and reaction rows used inconsistent indents and dense vertical gaps.
   - Fix: introduced a 48 px text rail, 36 px avatar, 20 px row padding, and 12/12/16/14 px content spacing.

2. Center conversation placement
   - [P2] The main analysis card was visually biased toward one side and its text scale differed from the queue and analysis panel.
   - Fix: centered all primary conversation surfaces with equal 32 px side space at the 1280 px render, added a 680 px maximum width, and standardized the 15/17/13 px type hierarchy.

3. Right analysis density
   - [P2] The summary, facts, correction form, and moderation actions mixed 10–14 px text and undersized controls.
   - Fix: standardized titles/body/metadata to 14/13/12 px, used 18 px card padding, and raised action controls to a 40 px minimum height.

4. Shared workspace rhythm
   - [P2] The three column headers and their internal spacing did not share one baseline.
   - Fix: standardized workspace headers to a 76 px minimum height, 16 × 20 px padding, 18/26 px titles, and 10/16 px eyebrow labels.

5. Queue vertical density
   - [P2] The selected queue card still left too much vertical space between the author, risk label, summary, video, and reaction row.
   - Fix: halved only the vertical whitespace—20 px row padding became 10 px vertically, and the 12/12/16/14 px gaps became 6/6/8/7 px. The 48 px alignment rail and readable type scale were preserved.
   - Post-fix evidence: `/private/tmp/crowdsift-comment-inbox-half-spacing-comparison.png`; the rendered first-row height is 213.45 CSS px with no horizontal overflow.

6. Author-to-risk badge spacing
   - [P2] After the first density pass, the 6 px space between the author row and risk badge still appeared too loose in the focused crop.
   - Fix: reduced that single margin from 6 px to 3 px without changing the 48 px rail, badge size, typography, or neighboring gaps.
   - Post-fix evidence: `/private/tmp/crowdsift-comment-inbox-author-badge-comparison.png`; computed margin is 3 px, first-row height is 210.45 CSS px, and no horizontal overflow is present.

7. Center conversation whitespace
   - [P2] The conversation column still used 24 px outer/card padding, 24 px author-to-card spacing, 16 px internal gaps, and 16–20 px spacing before reactions and the empty reply state.
   - Fix: halved the visible spacing to 12 px outer/card padding, 12 px author-to-card spacing, 8 px internal/reaction spacing, and 10 px before replies or the empty state. Horizontal gutters and icon-to-text gaps were halved as well; typography and 40 px reveal-button height were preserved.
   - Post-fix evidence: `/private/tmp/crowdsift-comment-inbox-center-half-spacing-comparison.png`; computed card padding/gap is 12/8 px, warning padding is 6/7 px, and no horizontal overflow is present.

## Responsive and Interaction Checks

- 1440 px: three columns, no horizontal overflow.
- 1100 px: two columns, no horizontal overflow.
- 800 px: one column, no horizontal overflow; centered surfaces expand safely to the available width.
- Harmful source stays protected and collapsed by default.
- Queue selection, risk labeling, real thumbnail display, and analysis detail controls remain available.
- Final browser console contained no warnings or errors.

## Verification

- Focused inbox CSS tests: 17 passed
- Full test suite: 110 files passed, 4 skipped; 522 tests passed, 4 skipped
- Lint: passed with `.worktrees/**` excluded
- Production build: passed with Next.js 16.2.11
- `git diff --check`: passed
- Responsive browser checks: passed at 800, 1100, 1280, and 1440 px
- Browser console check: no warnings or errors

final result: passed

---

## Shifty Identity Update QA — 2026-08-08

### Evidence

- Full mascot source: `/Users/junyoung/Downloads/ChatGPT Image 2026년 8월 8일 오전 12_52_33.png` (1254 × 1254 px)
- Avatar source: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-20d41f55-13f3-4ac6-afda-3c8c2e141e7b.png`
- Saved mascot: `/Users/junyoung/Desktop/CrowdSift/public/brand/shifty-mascot.png` (1254 × 1254 px)
- Saved profile avatar: `/Users/junyoung/Desktop/CrowdSift/public/brand/shifty-owl-profile.png` (256 × 256 px)
- Copy and queue reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-5408e9a4-46fd-46cb-a2c7-c96d31ba2584.png` (754 × 1496 px)
- Conversation reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-91b570c9-cd0b-4959-988d-900d0da3a968.png` (1096 × 452 px)
- Rendered risk state: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-inbox-implementation.png` (1280 × 1570 px)
- Rendered positive-feedback state: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-positive-feedback-implementation.png` (1280 × 1570 px)
- Full comparison: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-inbox-full-comparison.png` (1974 × 1496 px)
- Focused comparison: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-inbox-focused-comparison.png` (1774 × 452 px)
- Route: `http://localhost:3000/app/inbox`
- State: authenticated light theme, real connected comments, risk and positive-feedback items checked

### Findings

No actionable P0, P1, P2, or P3 findings remain for the requested identity update.

- The Shifty avatar is displayed at 16 px in queue badges and 18 px in the conversation result, preserving the existing row density and alignment.
- “위험 댓글 · 내용 보호됨” keeps its semantic risk color while the former exclamation icon is replaced by Shifty.
- Positive feedback now reads “시프티가 찾은 긍정적 피드백” in both the queue and selected conversation state.
- The uncertain category now reads “시프티가 보기에 안전해요!” and the conversation heading reads “시프티 분석 결과”.
- Harmful source content remains protected and collapsed by default.

### Interaction and Verification

- Selecting a positive-feedback queue item updates the conversation heading correctly.
- All Shifty images loaded successfully at their intended rendered sizes.
- Browser console contained no warnings or errors.
- Focused inbox test: 20 passed.
- Lint: passed; only pre-existing generated `.worktrees/**` warnings were reported.
- Production build: passed with Next.js 16.2.11.
- `git diff --check`: passed.

final result: passed

---

## Shifty Owl Profile Replacement QA — 2026-08-08

### Evidence

- Source visual truth: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-19940a15-20bf-48e5-bd21-eafb740887de.png` (928 × 980 px)
- Requested slot reference: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-aa9edccf-b82b-475f-be66-b4c6b5740733.png`
- Final square profile asset: `/Users/junyoung/Desktop/CrowdSift/public/brand/shifty-owl-profile.png` (256 × 256 px)
- Browser implementation screenshot: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-owl-profile-final.png` (1280 × 1570 px)
- Focused implementation crop: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-owl-profile-focused-final.png` (1000 × 360 px)
- Focused source/implementation comparison: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-owl-profile-comparison-final.png` (1341 × 360 px)
- CSS viewport: 1280 × 720 px, device pixel ratio 2
- State: authenticated light theme, risk comment selected, harmful source protected and collapsed

### Findings

No actionable P0, P1, or P2 findings remain.

- The supplied full-body owl photo replaces the previous logo mark in every Shifty badge.
- The profile asset is padded to a square rather than cropped, preserving the owl's head, body, name badge, and feet.
- Queue badges render the owl at 16 × 16 CSS px and the conversation heading renders it at 18 × 18 CSS px without stretching.
- Typography, spacing, semantic risk color, and protected-content behavior remain unchanged.

### Verification

- All six Shifty profile images loaded successfully from `/brand/shifty-owl-profile.png`.
- Focused Inbox test: 20 passed.
- Lint: passed with `.worktrees/**` excluded; the unrestricted command was stopped after it remained in pre-existing generated worktree files.
- Production build: passed with Next.js 16.2.11.
- Browser console: no warnings or errors.
- Focused visual comparison: passed.

final result: passed

---

## Shifty Safe Badge QA — 2026-08-08

### Evidence

- Source visual truth: `/var/folders/7h/pzbct4xn2zz74jxfyclfsn2w0000gn/T/codex-clipboard-ce490782-dbcd-4cc4-a1bf-d47c44b5148a.png` (324 × 74 px)
- Browser implementation screenshot: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-safe-badge-implementation.png` (1280 × 1395 px)
- Focused implementation crop: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-safe-badge-focused.png` (840 × 300 px)
- Focused source/implementation comparison: `/Users/junyoung/Desktop/CrowdSift/tmp/shifty-safe-badge-comparison.png` (2154 × 300 px)
- CSS viewport: 1280 × 720 px, device pixel ratio 2
- Route and state: `http://localhost:3000/app/inbox?levels=safe`, authenticated light theme, four safe comments visible

### Findings

No actionable P0, P1, or P2 findings remain.

- Every “시프티가 보기에 안전해요!” queue badge now includes the same full-body Shifty profile image.
- The 16 × 16 px avatar is vertically centered within the existing 26 px badge; typography, blue safe-state color, padding, and row density remain unchanged.
- The source image is loaded as a real raster asset rather than an emoji or code-drawn approximation.

### Verification

- Four safe queue badges were present and all four contained `img[alt="시프티 프로필"]`.
- Focused Inbox test: 20 passed.
- Lint: passed with `.worktrees/**` excluded.
- Production build: passed with Next.js 16.2.11.
- Browser console: no warnings or errors.
- Focused visual comparison: passed.

final result: passed
