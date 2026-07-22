# CommentHawk Workflow Planner Design

## Goal

Add a large, immediately readable workflow section to the CommentHawk home page. The section shows the product's six major implementation stages in order and lets a user maintain detailed plans for each stage without requiring a backend.

## Approved layout

The workflow is a single horizontal pipeline on desktop:

```text
YouTube 연결 → 영상 선택 → 댓글 수집 → AI 분류 → Inbox 검토 → 사용자 조치
```

Each stage is a large selectable card. Selecting a card updates one editor panel directly below the pipeline. This keeps the complete product flow visible while giving the selected stage enough space for detailed planning.

On small screens, the same pipeline remains horizontal and uses scroll snapping instead of compressing all six cards. The editor panel stays below it.

## Interaction

- The first stage is selected initially.
- Selecting a stage changes the editor heading and plan list without navigation.
- `계획 추가` opens an inline text field for the selected stage.
- Every plan can be renamed through an inline edit action.
- Every plan can be deleted after a lightweight browser confirmation.
- Empty stages show a clear empty state and an add action.
- Empty or whitespace-only plan names are rejected.

## Initial plan content

The planner starts with practical examples derived from the approved product context:

1. YouTube 연결: Google Cloud project, OAuth consent and minimum scopes.
2. 영상 선택: fetch the connected channel's videos and keep one selected video.
3. 댓글 수집: import 20–50 comments and handle pagination and duplicate prevention.
4. AI 분류: define the first categories and structured output contract.
5. Inbox 검토: display real comments, filters, and hidden harmful source text.
6. 사용자 조치: preserve source evidence, request confirmation, and record the result.

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

Only plan items are persisted. Stage identifiers, titles, descriptions, sequence, and visual theme remain defined in application code so the product workflow cannot be accidentally reordered through local browser data.

On the first visit, the application seeds the approved example plans. If stored JSON is invalid or does not match the expected shape, the planner falls back to the example plans without crashing. A future Supabase implementation can replace the persistence adapter while keeping the same UI model.

## Component structure

- `src/components/workflow-planner/workflow-planner.tsx`: client component that owns selection, add, edit, delete, and persistence behavior.
- `src/components/workflow-planner/workflow-stage-card.tsx`: accessible selectable stage card.
- `src/components/workflow-planner/plan-editor.tsx`: selected-stage plan list and inline forms.
- `src/components/workflow-planner/workflow-data.ts`: immutable stage metadata and default plan content.
- `src/components/workflow-planner/workflow-storage.ts`: validated localStorage read/write boundary.
- `src/app/page.tsx`: renders the planner as the second major section below the existing hero.

## Accessibility

- Stage cards are buttons with an explicit selected state.
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
- Drag-and-drop reordering of stages or plan items.
- Due dates, assignees, comments, attachments, and completion analytics.
- OAuth, YouTube API, AI classification, and moderation actions themselves.
