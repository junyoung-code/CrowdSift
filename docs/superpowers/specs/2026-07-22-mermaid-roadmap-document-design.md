# CommentHawk Mermaid Roadmap Document Design

## Goal

Move the CommentHawk development roadmap out of the customer-facing Next.js page and make one GitHub-rendered Markdown document its source of truth.

The public `/` route must contain only customer-facing product content. Engineering plans must no longer be shipped as an interactive web feature.

## Source of truth

Create `docs/development-roadmap.md` with:

- a short explanation that the diagram describes planned work, not completion status;
- one GitHub-compatible fenced `mermaid` block;
- one top-level CommentHawk roadmap node;
- four implementation lanes: Frontend, Backend, AI, and Security;
- the existing ordered tasks under each lane;
- one integrated MVP goal where all four lanes converge;
- brief editing guidance explaining that changes are reviewed through normal Git commits or pull requests.

The document is the only editable roadmap. No browser storage or duplicated application data remains.

## Public application

`src/app/page.tsx` renders only the existing CommentHawk landing page. It must not import, render, or link to the internal development roadmap.

The roadmap remains discoverable to repository collaborators through a link in the README under the project documentation section. It is not exposed through a customer-facing navigation element.

## Removed web implementation

Delete the complete `src/components/development-map/` directory, including:

- the React coordinator and plan editor;
- the Mermaid canvas renderer;
- localStorage persistence;
- seeded application data and Mermaid source builder;
- all component, storage, and builder tests.

Remove the `mermaid` runtime dependency because GitHub performs the rendering. Remove map-specific full-screen and backdrop CSS that no longer has a consumer. Keep the existing Vitest and Testing Library setup because the landing-page regression test remains useful and these development dependencies do not affect the customer bundle.

## README and documentation

Update the README to:

- describe the repository as an initial customer landing page rather than a landing page plus in-app development map;
- link to `docs/development-roadmap.md`;
- remove instructions for browser-local plan editing, Mermaid copying, and full-screen viewing.

Existing historical design and implementation documents remain in `docs/superpowers/`. They record why the earlier web version existed and are not treated as the current roadmap source.

## Testing and verification

Update `src/app/page.test.tsx` so it:

- verifies the customer headline and YouTube connection entry remain present;
- verifies no development-map heading or region is rendered;
- does not mock a removed component.

Run the following checks after implementation:

```text
npm test
npm run lint
npm run build
```

Also inspect the Mermaid block for GitHub-compatible syntax and confirm that `mermaid` is absent from runtime dependencies and the production bundle.

## Error handling

There is no runtime diagram renderer and therefore no customer-facing diagram failure state. If Mermaid syntax becomes invalid, GitHub will fail to render the diagram while preserving the source text for correction through a follow-up commit.

## Out of scope

- A private Next.js roadmap route.
- Password, SSO, or other roadmap authentication.
- Browser-based roadmap editing or localStorage persistence.
- Automatic synchronization with GitHub Projects, Issues, Notion, or Jira.
- Completion percentages, owners, due dates, or live project status.
