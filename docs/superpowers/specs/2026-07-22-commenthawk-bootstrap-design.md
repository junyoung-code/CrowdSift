# CommentHawk Bootstrap Design

## Goal

Create the smallest runnable CommentHawk web project and connect the existing workspace to the empty GitHub repository at `https://github.com/junyoung-code/CommnetHawk.git`.

## Scope

- Keep `docs/CommentHawk_Project_Context_v0.1.pdf` in place.
- Use Next.js App Router, TypeScript, Tailwind CSS, and ESLint.
- Render one responsive landing screen with the CommentHawk name, a short Korean product description, and a visible `YouTube 연결하기` call to action.
- Keep the YouTube action disabled and label it as preparation work; OAuth is outside this bootstrap.
- Add `README.md`, `AGENTS.md`, `docs/product-context.md`, and `.env.example`.
- Connect the local `main` branch to the empty GitHub repository without pushing.

## Structure

- `app/layout.tsx`: global metadata and root document shell.
- `app/page.tsx`: the minimal CommentHawk start screen.
- `app/globals.css`: Tailwind import and the page's global visual foundation.
- `docs/product-context.md`: concise, implementation-facing product context derived from the project PDF.
- `README.md`: setup, commands, project status, and document links.
- `AGENTS.md`: repository-local rules for future Codex work.
- `.env.example`: named placeholders for future Supabase, Google OAuth, and OpenAI integration.

## Visual Direction

The first screen uses a clean light B2B SaaS style with a restrained blue accent, clear Korean copy, and a responsive centered composition. It does not imitate another product's assets or claim that YouTube OAuth works.

## Verification

This is generated bootstrap work, so no separate test framework is introduced. Completion requires a clean ESLint run and a successful production build.
