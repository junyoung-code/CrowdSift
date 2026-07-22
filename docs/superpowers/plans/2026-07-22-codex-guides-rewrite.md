# Codex Guides Rewrite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Rewrite the CommentHawk 1-8 Codex guides into clear Korean documentation with copy-ready English prompts and the approved six-layer personalization architecture.

**Architecture:** Keep product truth in `docs/product-context.md`, navigation in `docs/codex-guides/README.md`, preparation guidance in documents 1-3, copy-ready workflow prompts in documents 4-7, and durable guardrails in document 8. The runtime design uses one shared model, creator policies, creator-specific feedback retrieval, deterministic rules, explicit confirmation, and optional future shared fine-tuning.

**Tech Stack:** Markdown, CommentHawk product documentation, shell-based content verification, npm project validation.

## Global Constraints

- Korean is the primary explanatory language.
- Only prompts intended to be pasted into Codex remain in English.
- The first real vertical slice is YouTube connection → choose one video → import 20-50 comments → AI classification → separate database storage → Comment Inbox.
- Never present mock data, example metrics, or disconnected integrations as real data.
- Keep raw comments, AI analyses, sanitized feedback, creator preferences, creator feedback, user actions, evidence records, training datasets, model versions, and audit logs structurally separate.
- AI recommends moderation; irreversible actions require explicit user confirmation.
- Fine-tuning is optional and follows prompt/profile personalization, feedback retrieval, and evaluation.
- Use the repository's actual `npm` commands and do not claim uninstalled libraries are already configured.

---

### Task 1: Update product truth and guide navigation

**Files:**
- Modify: `docs/product-context.md`
- Modify: `docs/codex-guides/README.md`

**Interfaces:**
- Consumes: `docs/superpowers/specs/2026-07-22-codex-guides-rewrite-design.md`
- Produces: The durable personalization policy and the ordered index used by all eight guides.

- [x] **Step 1: Add the approved personalization architecture to product context**

Document the six layers, the distinction between stable shared capabilities and mutable creator preferences, the consent requirement for training data, and the optional fine-tuning gate.

- [x] **Step 2: Rewrite the README as a usage sequence**

List documents 1-8 with one-sentence purposes and state that the prompts must be used in order against the current repository.

- [x] **Step 3: Verify product terminology**

Run: `rg -n "공통 OpenAI 모델|크리에이터별 정책|피드백 RAG|규칙 엔진|사용자 확인|Fine-tuning" docs/product-context.md docs/codex-guides/README.md`

Expected: All six approved layers are represented without claiming that fine-tuning is part of the first vertical slice.

### Task 2: Rewrite preparation guides 1-3

**Files:**
- Modify: `docs/codex-guides/01-codex에-넣기-전에-준비할-자료.md`
- Modify: `docs/codex-guides/02-먼저-설치하면-좋은-codex용-기능.md`
- Modify: `docs/codex-guides/03-실제로-사용할-github-저장소.md`

**Interfaces:**
- Consumes: Current repository package metadata, product context, provided PDF intent.
- Produces: Non-overlapping preparation, optional tooling, and dependency guidance.

- [x] **Step 1: Rewrite guide 1**

Explain required product documents, visual references, environment preparation, secret handling, and the pre-work checklist. Preserve the BrandBastion screenshot list while clearly forbidding asset or layout copying.

- [x] **Step 2: Rewrite guide 2**

Describe shadcn and Next.js development integrations as optional tools whose current installation instructions must be verified before use. Use `npm` for this repository and keep global Codex configuration separate from project dependencies.

- [x] **Step 3: Rewrite guide 3**

Present approved libraries in a Markdown table with purpose, adoption point, and warning. Mark currently uninstalled packages as candidates rather than active dependencies.

- [x] **Step 4: Check boundaries between guides**

Run: `rg -n "GitHub 저장소|기본 UI|TanStack|Recharts|Google APIs|Supabase|OpenAI" docs/codex-guides/0[1-3]-*.md`

Expected: Detailed library selection lives in guide 3 and is not duplicated in guide 2.

### Task 3: Rewrite planning and implementation prompts 4-7

**Files:**
- Modify: `docs/codex-guides/04-첫-번째-codex-ask-모드-프롬프트.md`
- Create: `docs/codex-guides/05-승인된-계획-실행-프롬프트.md`
- Create: `docs/codex-guides/06-youtube-연결과-댓글-가져오기-프롬프트.md`
- Create: `docs/codex-guides/07-ai-분류와-개인화-comment-inbox-프롬프트.md`

**Interfaces:**
- Consumes: Product truth, project rules, and guides 1-3.
- Produces: Four copy-ready English prompts covering planning, approved execution, YouTube ingestion, and AI/personalization/Comment Inbox.

- [x] **Step 1: Rewrite guide 4 planning prompt**

Require repository inspection, product-context precedence, planning only, the first real vertical slice, the six-layer personalization architecture, data separation, safety boundaries, and a concrete acceptance checklist.

- [x] **Step 2: Rewrite guide 5 execution prompt**

Implement only the approved foundation and repository-aligned work. Require server-side secrets, truthful UI states, service boundaries, migrations, tests, and npm-based verification without pretending external credentials are connected.

- [x] **Step 3: Rewrite guide 6 YouTube prompt**

Cover Google OAuth, channel and video selection, controlled import of 20-50 comments, Supabase persistence, idempotency, synchronization/error states, minimal scopes, and evidence-first confirmation for moderation actions.

- [x] **Step 4: Rewrite guide 7 AI and personalization prompt**

Cover structured classification, creator policies, phrase rules, creator-specific feedback retrieval, correction capture, raw/derived data separation, Comment Inbox integration, evaluation fixtures, and a future fine-tuning data path without implementing fine-tuning now.

- [x] **Step 5: Verify prompt language and fences**

Run: `rg -n '^```text$|^```$|^## 복사용 영문 프롬프트|You are|Implement' docs/codex-guides/0[4-7]-*.md`

Expected: Each guide contains Korean explanation and exactly one complete English prompt block.

### Task 4: Rewrite final guardrails and verify the documentation set

**Files:**
- Modify: `docs/codex-guides/08-가장-중요한-수정점.md`
- Verify: `docs/product-context.md`
- Verify: `docs/codex-guides/*.md`

**Interfaces:**
- Consumes: All rewritten guides.
- Produces: A concise final checklist and a validated documentation set.

- [x] **Step 1: Rewrite guide 8**

Summarize visual originality, truthful data presentation, data separation, creator-specific personalization, confirmation boundaries, fine-tuning gates, and the correct development order.

- [x] **Step 2: Scan for PDF extraction artifacts**

Run: `rg -n "^[[:space:]]+[1-8]\\. .* [0-9]+$|component[[:space:]]*$|curren[[:space:]]*$|classific[[:space:]]*$|ì|ë|ê" docs/codex-guides`

Expected: No page headers, mojibake, or words split by PDF line wrapping.

- [x] **Step 3: Check Markdown formatting**

Run a script that verifies balanced code fences and exactly eight numbered guide links in `README.md`.

Expected: Every file has balanced fences and the README links all eight guides once.

- [x] **Step 4: Run project verification**

Run: `npm test && npm run lint && npm run build`

Expected: Tests, lint, TypeScript compilation, and production build all pass.
