# 첫 번째 Codex Ask 모드 프롬프트

## 문서 목적

구현을 시작하기 전에 현재 저장소와 제품 기준 문서를 바탕으로 첫 실제 수직 슬라이스의 계획만 작성하게 한다. 이 단계에서는 파일, 패키지와 설정을 변경하지 않는다.

## 적용 시점

[1. 준비 자료](./01-codex에-넣기-전에-준비할-자료.md), [2. 선택적 Codex 기능](./02-먼저-설치하면-좋은-codex용-기능.md), [3. 라이브러리 후보](./03-실제로-사용할-github-저장소.md)를 확인한 뒤 사용한다.

## 복사용 영문 프롬프트

```text
You are the lead product architect and senior full-stack engineer for CrowdSift.

MODE: PLANNING ONLY.

Do not edit files, install packages, change configuration, create migrations, or write implementation code. Inspect the repository and return a detailed implementation plan, then stop for approval.

Read these sources before planning, in this order of precedence:

1. docs/product-context.md
2. docs/CrowdSift_Project_Context_v1.0.pdf
3. AGENTS.md
4. package.json, package-lock.json, the current source tree, tests, and .env.example
5. docs/codex-guides/

The first required real vertical slice is:

YouTube connection
→ select one video
→ import 20-50 real comments
→ classify the comments with AI
→ store source data and derived data separately
→ display the real results in Comment Inbox

Do not prioritize a marketing expansion, a full analytics dashboard, billing, multiple social platforms, Q&A Radar, Signal Digest, or production fine-tuning before this slice works end to end.

Personalization must use this six-layer architecture:

1. One shared OpenAI model analyzes Korean meaning, profanity, sarcasm, questions, spam, and actionable feedback.
2. Creator-specific policies store blocked phrases, allowed phrases, category sensitivity, and preferred recommendations.
3. Creator-specific feedback retrieval supplies only relevant approved, rejected, or corrected examples from the same creator.
4. A deterministic rules engine checks exact phrase rules, repeated advertising, suspicious URLs, and other explicit signals.
5. AI and rules recommend actions; hide, reject, or delete actions require explicit user confirmation.
6. Shared fine-tuning is a future option only after representative Korean eval data proves a measurable improvement.

Plan structural separation for:

- raw YouTube comments and source metadata
- AI analyses
- sanitized feedback
- creator policies and phrase rules
- creator corrections and feedback
- moderation action requests and results
- evidence records
- model and prompt versions
- evaluation and consent-approved training dataset items
- audit logs

Never overwrite a raw comment with sanitized text. Hide harmful source text by default in the UI. Preserve source content and evidence before a moderation action. Never make legal conclusions. Never present mock data, example counts, or disconnected integrations as real connected data.

Inspect the current Next.js version and read the relevant local documentation under node_modules/next/dist/docs before proposing Next.js-specific code. Follow the repository's actual npm scripts and lockfile. Do not assume shadcn/ui, Supabase, Google APIs, OpenAI, TanStack Table, Recharts, Motion, or Playwright are installed; identify only the dependencies that the approved slice truly needs.

Return the following:

1. Current repository assessment
2. Gaps between the repository and the required vertical slice
3. Route and user-flow plan
4. Data model and tenant-isolation plan
5. Service boundaries for YouTube, AI, rules, personalization, and storage
6. Creator policy and feedback-retrieval design
7. Security, OAuth, secret-management, and consent plan
8. Loading, empty, disconnected, permission, quota, partial-failure, and retry states
9. Accessibility and harmful-content display rules
10. Unit, integration, and end-to-end test plan
11. File-by-file implementation plan with small milestones
12. Acceptance checklist for the complete real vertical slice
13. Risks and decisions that require approval

Keep the plan minimal and implementation-ready. Stop after the plan and wait for explicit approval.
```

## 완료 기준

계획이 실제 수직 슬라이스 전체를 다루고, 구현 범위가 파일 단위로 명확하며, 연결되지 않은 데이터를 실제처럼 표시하지 않는다면 다음 단계로 넘어간다.

계획을 검토하고 승인한 뒤 [5. 승인된 계획 실행 프롬프트](./05-승인된-계획-실행-프롬프트.md)를 사용한다.
