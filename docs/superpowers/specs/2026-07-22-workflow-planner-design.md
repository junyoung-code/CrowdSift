# CommentHawk Workflow Planner Design

## Goal

Add a large, immediately readable workflow section to the CommentHawk home page. The section shows the seven major development stages required to build CommentHawk and lets a user maintain detailed plans for each stage without requiring a backend.

## Approved layout

The workflow is a single horizontal development roadmap on desktop:

```text
기반 준비
→ Front-end 기반
→ 사용자 웹 페이지
→ 대시보드
→ YouTube·데이터
→ AI·댓글 운영
→ QA·배포
```

Each stage is a large selectable card. Selecting a card updates one editor panel directly below the roadmap. This keeps the complete development sequence visible while giving the selected stage enough space for detailed planning.

On small screens, the same pipeline remains horizontal and uses scroll snapping instead of compressing all seven cards. The editor panel stays below it.

## Interaction

- The first stage is selected initially.
- Selecting a stage changes the editor heading and plan list without navigation.
- `계획 추가` opens an inline text field for the selected stage.
- Every plan can be renamed through an inline edit action.
- Every plan can be deleted after a lightweight browser confirmation.
- Empty stages show a clear empty state and an add action.
- Empty or whitespace-only plan names are rejected.

## Development stages and initial plan content

The planner starts with practical implementation plans derived from the approved product context:

1. 기반 준비: maintain the product context, repository, environment contract, Next.js foundation, and core data boundaries.
2. Front-end 기반: define reusable colors, typography, buttons, forms, cards, responsive layout, and loading, error, and empty-state patterns.
3. 사용자 웹 페이지: build the public introduction page, sign-in and onboarding entry, YouTube connection entry, and clear disconnected or permission-denied states.
4. 대시보드: build the application shell, overview, video selection, Comment Inbox, filters, detailed comment review, and clear real-data status indicators.
5. YouTube·데이터: implement Google OAuth, channel and Brand Account selection, video and 20–50 comment import, pagination, duplicate prevention, and raw database storage.
6. AI·댓글 운영: implement structured classification, sanitized feedback, manual correction, user-approved moderation, evidence capture, and action logs.
7. QA·배포: verify accessibility, security boundaries, AI quality, API failures, responsive behavior, production build, Vercel deployment, and the first creator pilot.

These examples are editable and deletable. They are planning content, not claims that the integrations already work.

## Persistence and data model

The browser stores plans under the versioned key `commenthawk.workflow-plans.v1`.

```ts
type PlanItem = {
  id: string;
  title: string;
};

type PlansByStage = Record<string, PlanItem[]>;
```

Only plan items are persisted. Stage identifiers, titles, descriptions, sequence, and visual theme remain defined in application code so the development roadmap cannot be accidentally reordered through local browser data.

On the first visit, the application seeds the approved example plans. If stored JSON is invalid or does not match the expected shape, the planner falls back to the example plans without crashing. A future Supabase implementation can replace the persistence adapter while keeping the same UI model.

## Component structure

- `src/components/workflow-planner/workflow-planner.tsx`: client component that owns selection, add, edit, delete, and persistence behavior.
- `src/components/workflow-planner/workflow-stage-card.tsx`: accessible selectable stage card.
- `src/components/workflow-planner/plan-editor.tsx`: selected-stage plan list and inline forms.
- `src/components/workflow-planner/workflow-data.ts`: immutable stage metadata and default plan content.
- `src/components/workflow-planner/workflow-storage.ts`: validated localStorage read/write boundary.
- `src/app/page.tsx`: renders the planner as the second major section below the existing hero.

## Accessibility

- Stage cards are buttons with an explicit selected state and step number.
- The selected editor heading is connected to the stage selection context.
- Add and edit forms use visible labels and submit with Enter.
- Cancel actions return the interface to a stable non-editing state.
- Focus indicators remain visible, and color is not the only selected-state signal.
- Reduced-motion preferences are respected.

## Failure behavior

- Storage access failures do not block editing in the current session.
- Invalid persisted data is ignored in favor of defaults.
- A plan add or edit never accepts an empty title.
- The UI does not imply that any YouTube, AI, database, or moderation integration is complete.

## Verification

- Unit and interaction tests cover default loading, stage selection, add, edit, delete, persistence, and corrupt storage fallback.
- ESLint and the production Next.js build must pass.
- Browser verification covers desktop readability, 390 px mobile overflow behavior, keyboard-visible controls, and the absence of console errors.

## Out of scope

- Supabase synchronization and multi-user collaboration.
- Drag-and-drop reordering of roadmap stages or plan items.
- Due dates, assignees, comments, attachments, and completion analytics.
- OAuth, YouTube API, AI classification, and moderation actions themselves.
