# CrowdSift Bootstrap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a minimal, runnable CrowdSift Next.js project in the current workspace and connect it to the empty GitHub repository.

**Architecture:** A single Next.js App Router application owns the initial UI. Product decisions stay in `docs`, secrets are represented only by empty environment variable names, and the YouTube action remains a clearly disabled placeholder until OAuth is implemented.

**Tech Stack:** Next.js 16.2.11, React 19.2.4, TypeScript, Tailwind CSS, ESLint, npm

## Global Constraints

- Preserve `docs/CrowdSift_Project_Context_v1.0.pdf`.
- Do not implement Google OAuth, Supabase, OpenAI, or YouTube API behavior in this bootstrap.
- Do not display fake connected data or imply that the disabled YouTube action works.
- Do not push to GitHub in this task.
- Verify with `npm run lint` and `npm run build`.

---

### Task 1: Repository and Next.js foundation

**Files:**
- Create: `package.json`
- Create: `package-lock.json`
- Create: `next.config.ts`
- Create: `tsconfig.json`
- Create: `postcss.config.mjs`
- Create: `eslint.config.mjs`
- Create: `.gitignore`

**Interfaces:**
- Consumes: the current non-Git workspace and the empty GitHub repository URL.
- Produces: an npm-installable Next.js App Router project on local branch `main` with `origin` configured.

- [ ] **Step 1: Initialize the local repository and configure the remote**

Run:

```bash
git init -b main
git remote add origin https://github.com/junyoung-code/CrowdSift.git
git remote -v
```

Expected: fetch and push URLs both point to the provided repository.

- [ ] **Step 2: Generate the standard Next.js foundation in an isolated temporary directory**

Run:

```bash
CROWDSIFT_TMP=$(mktemp -d /tmp/crowdsift-next.XXXXXX)
npx create-next-app@16.2.11 "$CROWDSIFT_TMP/app" --typescript --tailwind --eslint --app --use-npm --import-alias "@/*" --yes
rsync -a --exclude .git --exclude README.md "$CROWDSIFT_TMP/app/" ./
```

Expected: `package.json`, configuration files, `app`, `public`, and `package-lock.json` exist while the existing `docs` directory remains in place.

- [ ] **Step 3: Confirm the generated dependency graph**

Run:

```bash
npm install
npm ls --depth=0
```

Expected: npm exits successfully with Next.js 16.2.11 and React 19.2.4 installed.

### Task 2: Minimal CrowdSift screen

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: the generated App Router root layout and Tailwind CSS foundation.
- Produces: a responsive Korean start screen with a disabled YouTube connection action.

- [ ] **Step 1: Set CrowdSift metadata and language**

Use `lang="ko"`, title `CrowdSift`, and the description `크리에이터를 위한 AI 댓글 관리 도구` in `src/app/layout.tsx`.

- [ ] **Step 2: Implement the minimal page**

Render a compact header, an eyebrow reading `AI COMMENT OPERATIONS`, the headline `중요한 댓글은 놓치지 않고, 악성 댓글에는 끌려가지 않도록.`, supporting copy, a disabled `YouTube 연결하기` button, and a visible `OAuth 연동 준비 중` status. Do not add navigation routes or fake metrics.

- [ ] **Step 3: Apply the visual foundation**

Use Tailwind utilities for layout and keep `src/app/globals.css` limited to Tailwind import, light color variables, font smoothing, and body defaults.

- [ ] **Step 4: Verify the page statically**

Run:

```bash
npm run lint
```

Expected: ESLint exits with code 0 and reports no errors.

### Task 3: Repository documentation and environment contract

**Files:**
- Create: `README.md`
- Create: `AGENTS.md`
- Create: `docs/product-context.md`
- Create: `.env.example`

**Interfaces:**
- Consumes: the approved bootstrap design and `docs/CrowdSift_Project_Context_v1.0.pdf`.
- Produces: setup instructions, future-agent boundaries, concise product context, and non-secret integration variable names.

- [ ] **Step 1: Document local setup and current scope**

`README.md` must include `npm install`, `npm run dev`, `npm run lint`, and `npm run build`, plus links to the Markdown product context and source PDF.

- [ ] **Step 2: Define agent rules**

`AGENTS.md` must prioritize the vertical slice `YouTube 연결 → 영상 선택 → 댓글 20~50개 수집 → AI 분류 → DB 저장 → Inbox 표시`, prohibit fake integration states, require raw data to remain separate from AI output and user actions, and require lint/build before completion.

- [ ] **Step 3: Summarize the product context**

`docs/product-context.md` must describe the product goal, target users, first vertical slice, core safety principles, planned feature order, technical direction, and explicitly deferred scope.

- [ ] **Step 4: Define environment variable names without secrets**

Create `.env.example` with `NEXT_PUBLIC_APP_URL`, Supabase URL and keys, Google client credentials, OAuth redirect URI, and `OPENAI_API_KEY`, all with empty values or safe localhost defaults.

- [ ] **Step 5: Verify the complete bootstrap**

Run:

```bash
npm run lint
npm run build
git status --short
git remote -v
```

Expected: lint and build exit successfully; Git lists only intended project files; `origin` points to the provided GitHub repository.
