# CrowdSift Four-Part Development Map Design

## Goal

Add one large Mermaid-style flowchart that answers a practical question at a glance: "CrowdSift를 만들기 위해 우리가 무엇을 해야 하는가?"

The map separates the work into four implementation parts—Frontend, Backend, AI, and Security—then shows the concrete tasks that belong to each part. Users can add, rename, and delete detailed tasks, and the flowchart redraws immediately without requiring a backend.

## Approved visual direction

The chart follows the supplied reference image rather than the earlier horizontal card pipeline:

- one large, light canvas with generous whitespace;
- thin connector lines and compact rectangular nodes;
- a top root node that branches into four implementation parts;
- each part branches into its detailed work items;
- all four parts converge on one integrated MVP goal;
- a full-screen control and a Mermaid-source copy control in the canvas corner;
- horizontal and vertical canvas scrolling when the graph is larger than the viewport.

The diagram uses `flowchart TD`. Each implementation part is rendered as a visually distinct subgraph with a restrained color accent, while detail nodes remain light and readable.

## Fixed four-part structure

The four top-level parts are fixed in application code so local edits cannot erase the overall project structure.

### 1. Frontend

- Front-end foundation: color, typography, shared controls, forms, cards, and responsive layout.
- User web page: product introduction, sign-in and onboarding entry, YouTube connection entry, and permission states.
- Dashboard: application shell, overview, video selection, Comment Inbox, filters, and detailed review.
- Product states: loading, empty, disconnected, permission-denied, quota, and partial-failure states.
- Accessibility: keyboard use, visible focus, reduced motion, and harmful-source-text hiding.

### 2. Backend

- Supabase schema: users, channels, videos, comments, imports, analyses, evidence, actions, and logs.
- Authentication boundary: application session separated from Google and YouTube authorization.
- Google OAuth: consent, minimum scopes, refresh, revocation, and Brand Account selection.
- YouTube import: channel videos, 20–50 comments, replies, pagination, deduplication, and resume.
- Data services: raw-data preservation, derived-data separation, retries, idempotency, and audit logging.

### 3. AI

- Classification contract: first comment categories, confidence, uncertainty, and action recommendation.
- Structured output: versioned prompt, model, schema, runtime validation, and retry behavior.
- Safe presentation: sanitized feedback that preserves meaning without inventing content.
- Insight features: repeated-question clustering, Q&A Radar, and Signal Digest.
- Quality operations: Korean evaluation data, human correction, class metrics, latency, and cost limits.

### 4. Security

- Secret handling: server-only keys, encrypted refresh tokens, and rotation boundaries.
- Access control: tenant isolation, Supabase RLS, least privilege, and minimum OAuth scopes.
- Moderation safety: preserve source evidence, require confirmation, then apply reversible actions where possible.
- Evidence policy: timestamps, hashes, retention, export, deletion requests, and careful legal wording.
- Operational safety: audit logs without unnecessary harmful content, rate limits, and failure recovery.

All four part-completion nodes converge on `통합 MVP`, defined as:

```text
YouTube 연결 → 영상 선택 → 댓글 20–50개 수집
→ AI 분류 → DB 저장 → Inbox 검토 → 사용자 승인 조치
```

## Interaction model

- The chart itself is the primary overview and remains visible while editing.
- Four part tabs below the chart select the part whose details are being edited.
- `계획 추가` creates a new task node in the selected part.
- Every user-created or seeded task can be renamed inline.
- Every task can be deleted after a lightweight browser confirmation.
- Empty or whitespace-only task names are rejected.
- Every successful edit regenerates the Mermaid source and rerenders the SVG.
- The chart provides full-screen and `Mermaid 복사` controls similar to the reference.

## Persistence and data model

Plans are stored under the versioned browser key `crowdsift.development-map.v1`.

```ts
type DevelopmentPartId = "frontend" | "backend" | "ai" | "security";

type PlanItem = {
  id: string;
  title: string;
};

type PlansByPart = Record<DevelopmentPartId, PlanItem[]>;
```

Only plan items are persisted. Part identifiers, labels, colors, ordering, root node, and integrated MVP goal remain immutable application metadata. On first visit, the chart uses the approved seeded tasks above. Invalid stored JSON falls back to the seeded tasks without crashing.

## Mermaid rendering and input safety

- The application uses the Mermaid browser package and renders the generated definition into an SVG.
- Mermaid runs with `securityLevel: "strict"` and HTML labels disabled.
- Node IDs are generated internally and never derived from user text.
- User task labels are normalized to a single line and escaped before being inserted into Mermaid source.
- The renderer clears stale SVG output before applying a new successful render.
- If Mermaid rendering fails, the last valid chart remains visible and a concise error appears near the editor.

## Component structure

- `src/components/development-map/development-map.tsx`: client component coordinating plans, selected part, persistence, and render state.
- `src/components/development-map/mermaid-canvas.tsx`: Mermaid initialization, SVG rendering, copy, full-screen, loading, and render failure UI.
- `src/components/development-map/plan-editor.tsx`: four part tabs and add, rename, and delete interactions.
- `src/components/development-map/development-data.ts`: immutable part metadata, colors, descriptions, and seeded plan items.
- `src/components/development-map/build-mermaid-source.ts`: pure, escaped Mermaid definition builder.
- `src/components/development-map/development-storage.ts`: validated localStorage read and write boundary.
- `src/app/page.tsx`: renders the development map below the existing hero.

## Responsive behavior

- The page section fills the available width rather than constraining the chart to article width.
- The diagram canvas has a large minimum width so labels do not collapse on small screens.
- Mobile users pan through the canvas with normal two-axis scrolling.
- The editor becomes a single-column panel beneath the canvas.
- Full-screen mode provides the preferred way to inspect the complete graph on smaller displays.

## Accessibility

- Full-screen and copy controls have visible text or accessible names.
- Part selection uses real buttons with an explicit selected state.
- Add and rename forms have visible labels and submit with Enter.
- Cancel actions return to a stable non-editing state.
- Focus indicators remain visible, and part colors are never the only identifying signal.
- Reduced-motion preferences disable nonessential transitions.

## Verification

- Pure unit tests cover Mermaid label escaping and the generated four-part graph structure.
- Storage tests cover seeded defaults, successful persistence, invalid data, and unavailable storage.
- Interaction tests cover part selection, add, rename, delete, copy feedback, and error messaging.
- ESLint and a production Next.js build must pass.
- Browser verification covers the full graph, desktop and 390 px mobile scrolling, full-screen controls, user edits surviving refresh, and the absence of console errors.

## Out of scope

- Supabase synchronization and multi-user editing.
- Drag-and-drop positioning or reordering of Mermaid nodes.
- Editing or deleting the four top-level parts.
- Due dates, assignees, attachments, and completion analytics.
- The actual OAuth, YouTube API, AI, evidence, and moderation implementations represented by the planning nodes.
