# CommentHawk Real Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BrandBastion 레퍼런스의 시각적 완성도를 참고한 CommentHawk 데스크톱 랜딩부터 실제 YouTube 채널 연결, 영상 선택, 댓글 20–50개 수집, 2단계 AI·크리에이터별 RAG 분석, 실제 대시보드·Comment Inbox, 사용자 확인형 moderation까지 하나의 동작하는 수직 슬라이스로 구현한다.

**Architecture:** Next.js 16 App Router 한 앱 안에서 React 화면과 server-only 도메인 서비스를 분리한다. Supabase Auth/Postgres/RLS가 사용자 세션과 테넌트 데이터를 담당하고, Google/YouTube와 OpenAI SDK는 교체 가능한 provider 인터페이스 뒤에서만 호출한다. 원본 댓글, 규칙 결과, 모델 실행, 최종 분석, 정제 피드백, 사용자 수정, 조치 전 증거, 실제 조치와 감사 로그를 각각 별도 레코드로 보존한다.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5, Tailwind CSS 4, Supabase Auth/Postgres/pgvector/RLS, Google OAuth 2.0, YouTube Data API v3, OpenAI Responses API Structured Outputs, OpenAI Embeddings API, Zod, Vitest/Testing Library, Playwright, Supabase CLI.

## Global Constraints

- 요구사항 우선순위는 `docs/product-context.md` → `docs/CommentHawk_Project_Context_v0.1.pdf` → `AGENTS.md` → `docs/codex-guides/` → `references/brandbastion/` 순서다.
- 현재의 최소 랜딩 페이지를 유지하지 않는다. `/`를 CommentHawk 고유 문구·자산으로 전면 재구축한다.
- BrandBastion의 정보 리듬과 품질만 참고하고 자산, 문구, 고객 로고, 수치, 소스, 일러스트, 정확한 기하 구조는 복제하지 않는다.
- 1차 지원 화면은 데스크톱 `1440x900`, `1280x800`이며 모바일 전용 내비게이션·테이블·드로어는 후속 범위다.
- 인증된 화면에는 저장된 실제 데이터만 표시한다. 랜딩의 예시 대시보드는 반드시 `제품 예시 화면`으로 표시하고 실제 데이터 경로를 공유하지 않는다.
- CommentHawk 로그인은 Supabase magic link, YouTube 연결은 별도의 Google OAuth로 분리한다.
- 한 workspace에는 이번 범위에서 활성 YouTube 채널을 정확히 하나만 선택한다.
- 초기 가져오기 수량 `20–50`은 상위 댓글 스레드 수다. 선택된 스레드의 사용 가능한 답글은 추가로 저장하며, 이 수치는 제품의 영구 상한이 아니다.
- 모든 원본 댓글과 원본 API payload를 AI 결과·정제 문장과 분리하고 원본을 수정하지 않는다.
- 사용자 표시는 `안전 / 주의 / 위험`, 저장값은 `safe / caution / risk`다. `안전`은 법적·절대적 안전 보장이 아니라 낮은 검토 우선순위다.
- 기본 Comment Inbox는 `주의`와 `위험`을 먼저 보여준다.
- Stage 2 기준은 `주의 또는 위험`, Stage 1 confidence `< 0.85`, 정책 문구 일치, 동일 workspace RAG similarity `>= 0.78`, 혼합 신호, 비꼼·은어·띄어쓰기 변형 등이다.
- RAG는 현재 workspace의 `use_for_personalization = true` 피드백만 최대 5개 반환한다.
- 개인화 동의와 향후 학습 동의를 분리한다. Fine-tuning은 이번 범위에서 수행하지 않는다.
- 분석 결과를 법적 결론이나 법적 성공 가능성으로 표현하지 않는다.
- AI와 규칙은 조치를 추천할 뿐이다. YouTube 조치는 증거 생성과 사용자의 명시적 확인 이후에만 실행한다.
- YouTube 읽기 권한은 최소 `youtube.readonly`, moderation 시점의 증분 권한은 `youtube.force-ssl`을 사용한다.
- `comments.setModerationStatus`의 실제 상태 `heldForReview / published / rejected`만 사용한다. `markAsSpam`은 사용하지 않는다.
- `comments.delete`는 연결 채널이 해당 댓글 작성자인 경우에만 UI에 노출한다. 다른 사용자의 댓글은 `rejected`로 moderation한다.
- 모든 비밀키와 provider token은 server-only이며 `.env`는 커밋하지 않는다.
- Next.js 16 구현 전 관련 로컬 문서 `node_modules/next/dist/docs/`를 읽고 `middleware.ts`가 아닌 `src/proxy.ts`, 비동기 `cookies()`를 사용한다.
- 구현 완료 보고 전 `npm test`, `npm run lint`, `npm run build`, `npm run test:e2e`, `npm run test:eval`을 실행한다.

---

## Delivery Map

```text
Task 1  실행 기반·환경 검증
  ├─ Task 2  전체 랜딩 페이지
  ├─ Task 3  Supabase 스키마·RLS
  │    └─ Task 4  앱 인증·workspace·앱 셸
  │         └─ Task 5  Google OAuth·채널 선택
  │              └─ Task 6  영상 선택·댓글 수집
  ├─ Task 7  규칙 엔진·크리에이터 정책
  └─ Task 8  공통 분석 계약
       ├─ Task 9  Stage 1
       └─ Task 10 RAG·Stage 2
            ├─ Task 11 Comment Inbox·사용자 수정
            ├─ Task 12 실제 대시보드
            └─ Task 13 증거·확인형 YouTube 조치
Task 14 한국어 평가 세트
Task 15 통합·브라우저·접근성 테스트
Task 16 실제 API 검증·릴리스 게이트
```

## File Responsibility Map

### Application and shared infrastructure

- `package.json`: Supabase, Google, OpenAI, Zod, Playwright와 검증 스크립트.
- `.env.example`: 공개/서버 비밀 환경변수 이름과 설명.
- `src/lib/env.ts`: server 환경변수의 단일 런타임 검증 지점.
- `src/lib/result.ts`: provider/domain 오류의 판별 가능한 `Result` 계약.
- `src/lib/retry.ts`: transient 오류만 최대 3회 지수 backoff.
- `src/lib/supabase/browser.ts`: 브라우저용 anon Supabase client.
- `src/lib/supabase/server.ts`: 비동기 cookie 기반 서버 Supabase client.
- `src/lib/supabase/admin.ts`: authorization 확인 뒤 domain mutation에만 쓰는 server-only service-role client.
- `src/lib/supabase/proxy.ts`: 세션 cookie 갱신.
- `src/proxy.ts`: `/app/:path*` 낙관적 세션 경계.
- `src/types/database.ts`: Supabase가 생성한 DB 타입. 손으로 수정하지 않는다.

### Public landing

- `src/app/page.tsx`: 랜딩 조합만 담당.
- `src/features/landing/landing-page.tsx`: 전체 섹션 구조.
- `src/features/landing/landing-copy.ts`: 한국어 마케팅 문구와 예시 수치의 단일 원천.
- `src/features/landing/product-preview.tsx`: `제품 예시 화면`으로 명시된 순수 예시 컴포넌트.
- `src/features/landing/landing-page.test.tsx`: 섹션, 레이블, CTA, 지원 플랫폼 표현 검증.
- `src/app/globals.css`: CommentHawk 토큰, 포커스, reduced-motion, 데스크톱 레이아웃.

### Database

- `supabase/config.toml`: local Supabase 구성.
- `supabase/migrations/202607230001_identity_ingestion.sql`: workspace, YouTube 연결, 영상, 수집 job, immutable source.
- `supabase/migrations/202607230002_policy_analysis_actions.sql`: 정책, 규칙, 모델 실행, 분석, 피드백, embeddings, 조치·증거·감사.
- `supabase/migrations/202607230003_rls_and_functions.sql`: RLS, helper, dashboard/inbox/RAG RPC.
- `supabase/seed.sql`: 자동 테스트용으로만 사용하는 식별 가능한 fixture workspace.
- `supabase/tests/rls.sql`: 동일 workspace 허용, 다른 workspace 차단, 원본 update 차단.

### Authentication and app shell

- `src/app/auth/sign-in/page.tsx`: magic-link 입력 화면.
- `src/app/auth/sign-in/actions.ts`: email 검증과 OTP 요청.
- `src/app/auth/callback/route.ts`: auth code를 session으로 교환.
- `src/app/(product)/app/layout.tsx`: 인증된 앱 셸.
- `src/app/(product)/app/page.tsx`: 실제 dashboard route.
- `src/features/auth/require-viewer.ts`: user/workspace 조회와 미인증 redirect.
- `src/features/auth/workspace-deletion-service.ts`: token 제거와 확인형 workspace data 삭제.
- `src/features/app-shell/app-shell.tsx`: 내비게이션과 계정 메뉴.

### YouTube

- `src/features/youtube/contracts.ts`: 채널·영상·댓글 provider-owned 타입.
- `src/features/youtube/google-youtube-provider.ts`: Google SDK adapter.
- `src/features/youtube/provider-factory.ts`: production/fixture provider 선택.
- `src/features/youtube/token-crypto.ts`: AES-256-GCM token 암복호화.
- `src/features/youtube/oauth-state.ts`: OAuth state 생성·검증.
- `src/app/api/youtube/oauth/start/route.ts`: 최소 read scope OAuth 시작.
- `src/app/api/youtube/oauth/callback/route.ts`: code 교환과 후보 채널 저장.
- `src/app/api/youtube/oauth/moderation/route.ts`: `youtube.force-ssl` 증분 동의 시작.
- `src/features/youtube/channel-service.ts`: 후보 중 정확히 한 채널 선택.
- `src/app/(product)/app/connect/youtube/page.tsx`: 연결·채널 선택·재연결·해제 화면.
- `src/app/(product)/app/connect/youtube/actions.ts`: 채널 선택과 해제 action.
- `src/features/youtube/video-service.ts`: 선택 채널의 최신 영상 조회·저장.
- `src/app/(product)/app/videos/page.tsx`: 영상 하나와 20–50 수량 선택.
- `src/app/(product)/app/videos/actions.ts`: 수집 job 생성.
- `src/features/ingestion/comment-mapper.ts`: Google resource를 immutable source DTO로 변환.
- `src/features/ingestion/comment-import-service.ts`: page token 기반 top-level/reply 수집과 item별 결과 저장.
- `src/app/api/import-jobs/[jobId]/process/route.ts`: idempotent import 실행 endpoint.

### Rules, AI, and personalization

- `src/features/rules/types.ts`: deterministic signal 계약.
- `src/features/rules/normalize-korean.ts`: NFKC, 공백·반복문자·URL 정규화.
- `src/features/rules/evaluate-comment.ts`: blocked/allowed/context, 반복, URL, phishing 신호.
- `src/features/rules/route-review-level.ts`: 규칙 기반 초기 review level.
- `src/features/policies/policy-service.ts`: versioned creator policy와 phrase rule 저장·조회.
- `src/app/(product)/app/settings/moderation/page.tsx`: 크리에이터 정책 편집.
- `src/app/(product)/app/settings/moderation/actions.ts`: 정책 새 버전 생성.
- `src/features/analysis/contracts.ts`: category/review level/input/output 인터페이스.
- `src/features/analysis/schemas.ts`: OpenAI Structured Output Zod schema.
- `src/features/analysis/prompts.ts`: 영어 system prompt와 prompt version.
- `src/features/analysis/analysis-provider.ts`: model/embedding 추상화.
- `src/features/analysis/openai-analysis-provider.ts`: Responses API와 Embeddings API adapter.
- `src/features/analysis/idempotency.ts`: 분석 idempotency key.
- `src/features/analysis/second-pass.ts`: Stage 2 trigger 순수 함수.
- `src/features/analysis/rag-service.ts`: 동일 workspace top-5 검색과 provenance.
- `src/features/analysis/analysis-service.ts`: job/item/model run/Stage 1·2 저장 orchestration.
- `src/app/api/analysis-jobs/[jobId]/process/route.ts`: 최대 5개 item 처리 endpoint.

### Dashboard, Inbox, feedback, actions

- `src/features/dashboard/dashboard-query.ts`: 실제 aggregate read model.
- `src/features/dashboard/dashboard-summary-service.ts`: 최종 분석 10개 이상일 때만 저장되는 AI summary.
- `src/features/dashboard/dashboard-view.tsx`: disconnected/empty/running/real data 상태.
- `src/features/inbox/inbox-query.ts`: default `caution,risk`와 필터·검색.
- `src/features/inbox/comment-inbox.tsx`: 리스트와 detail 조합.
- `src/features/inbox/source-reveal.tsx`: 경고 후 원문 요청.
- `src/app/api/comments/[commentId]/source/route.ts`: 권한 확인 후 원문 반환.
- `src/app/(product)/app/inbox/page.tsx`: URL search params 기반 Inbox.
- `src/app/(product)/app/inbox/actions.ts`: creator correction 저장.
- `src/features/feedback/feedback-service.ts`: correction과 personalization embedding 생성.
- `src/features/moderation/contracts.ts`: 지원 조치와 상태 계약.
- `src/features/moderation/moderation-service.ts`: 증거 → 확인 → provider → audit 순서.
- `src/app/(product)/app/inbox/moderation-actions.ts`: request/confirm server actions.
- `src/features/moderation/moderation-dialog.tsx`: 결과·영향·scope를 표시하는 확인 UI.

### Evaluation and end-to-end verification

- `src/evaluation/korean-comment-cases.json`: 최소 60개 익명·합성 평가 fixture.
- `src/evaluation/schema.ts`: human review 메타데이터와 expected output schema.
- `src/evaluation/run-evaluation.ts`: 실제 configured provider 또는 recorded output 평가.
- `src/evaluation/run-evaluation.test.ts`: 릴리스 게이트 계산 검증.
- `playwright.config.ts`: desktop Chromium과 local web server.
- `e2e/helpers/supabase-mail.ts`: local Inbucket magic link 추출.
- `e2e/fixtures/providers.ts`: 외부 provider fixture 데이터.
- `e2e/vertical-slice.spec.ts`: landing부터 확인형 moderation까지.
- `docs/manual-verification.md`: 실제 Supabase/Google/OpenAI 연결 절차와 증거 기록.

---

### Task 1: 실행 기반, 환경 계약, 공통 오류 모델

**Files:**
- Modify: `package.json`
- Modify: `.env.example`
- Modify: `vitest.config.ts`
- Create: `src/lib/env.ts`
- Create: `src/lib/result.ts`
- Create: `src/lib/retry.ts`
- Test: `src/lib/env.test.ts`
- Test: `src/lib/retry.test.ts`

**Interfaces:**
- Produces: `getServerEnv(): ServerEnv`, `AppError`, `Result<T, AppError>`, `withRetry<T>(operation, options): Promise<T>`.
- Consumes: 없음.

- [ ] **Step 1: Next.js 16의 현재 로컬 규칙을 읽는다**

Run:

```bash
sed -n '1,220p' node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md
sed -n '1,220p' node_modules/next/dist/docs/01-app/03-api-reference/04-functions/cookies.md
sed -n '1,260p' node_modules/next/dist/docs/01-app/02-guides/authentication.md
```

Expected: Route Handler는 `app/**/route.ts`, Next.js 16은 `proxy.ts`, `cookies()`는 async임을 확인한다.

- [ ] **Step 2: 의존성과 스크립트를 추가한다**

Run:

```bash
npm install @supabase/ssr @supabase/supabase-js googleapis openai server-only zod
npm install -D @playwright/test supabase tsx
```

`package.json` scripts를 다음 계약으로 변경한다.

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "test:eval": "vitest run src/evaluation",
    "db:start": "supabase start",
    "db:reset": "supabase db reset",
    "db:test": "supabase test db",
    "db:types": "supabase gen types typescript --local > src/types/database.ts"
  }
}
```

Expected: `package-lock.json`이 갱신되고 install command가 exit 0.

- [ ] **Step 3: 환경 검증과 retry의 실패 테스트를 작성한다**

```ts
// src/lib/env.test.ts
import { describe, expect, it } from "vitest";
import { parseServerEnv } from "./env";

describe("parseServerEnv", () => {
  it("rejects a missing token encryption key", () => {
    expect(() =>
      parseServerEnv({
        NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
        SUPABASE_SERVICE_ROLE_KEY: "service",
        GOOGLE_CLIENT_ID: "client",
        GOOGLE_CLIENT_SECRET: "secret",
        GOOGLE_REDIRECT_URI: "http://localhost:3000/api/youtube/oauth/callback",
        OPENAI_API_KEY: "openai",
        OPENAI_ANALYSIS_MODEL: "configured-model",
        OPENAI_EMBEDDING_MODEL: "text-embedding-3-small",
      }),
    ).toThrow(/YOUTUBE_TOKEN_ENCRYPTION_KEY/);
  });
});
```

```ts
// src/lib/retry.test.ts
import { describe, expect, it, vi } from "vitest";
import { withRetry } from "./retry";

describe("withRetry", () => {
  it("retries transient failures and returns the successful value", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(Object.assign(new Error("rate limited"), { status: 429 }))
      .mockResolvedValue("ok");

    await expect(
      withRetry(operation, { maxAttempts: 3, baseDelayMs: 0 }),
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-transient 400", async () => {
    const operation = vi
      .fn<() => Promise<string>>()
      .mockRejectedValue(Object.assign(new Error("invalid"), { status: 400 }));

    await expect(
      withRetry(operation, { maxAttempts: 3, baseDelayMs: 0 }),
    ).rejects.toThrow("invalid");
    expect(operation).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 4: 실패를 확인한다**

Run: `npm test -- src/lib/env.test.ts src/lib/retry.test.ts`

Expected: FAIL because `./env` and `./retry` do not exist.

- [ ] **Step 5: 환경·오류·retry 최소 구현을 추가한다**

```ts
// src/lib/result.ts
export type AppErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "INVALID_INPUT"
  | "PROVIDER_PERMISSION"
  | "PROVIDER_QUOTA"
  | "PROVIDER_TRANSIENT"
  | "SCHEMA_INVALID"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INTERNAL";

export type AppError = {
  code: AppErrorCode;
  message: string;
  retryable: boolean;
  providerStatus?: number;
};

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };
```

```ts
// src/lib/retry.ts
type RetryOptions = {
  maxAttempts: number;
  baseDelayMs: number;
  isTransient?: (error: unknown) => boolean;
};

const defaultTransient = (error: unknown) => {
  const status =
    typeof error === "object" && error !== null && "status" in error
      ? Number(error.status)
      : 0;
  return status === 429 || status >= 500;
};

export async function withRetry<T>(
  operation: () => Promise<T>,
  {
    maxAttempts,
    baseDelayMs,
    isTransient = defaultTransient,
  }: RetryOptions,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isTransient(error) || attempt === maxAttempts) throw error;
      await new Promise((resolve) =>
        setTimeout(resolve, baseDelayMs * 2 ** (attempt - 1)),
      );
    }
  }
  throw lastError;
}
```

```ts
// src/lib/env.ts
import "server-only";
import { z } from "zod";

const serverEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.url(),
  YOUTUBE_TOKEN_ENCRYPTION_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, {
      message: "YOUTUBE_TOKEN_ENCRYPTION_KEY must decode to 32 bytes",
    }),
  DELETION_AUDIT_PEPPER: z.string().min(32),
  OPENAI_API_KEY: z.string().min(1),
  OPENAI_ANALYSIS_MODEL: z.string().min(1),
  OPENAI_EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),
  EXTERNAL_PROVIDER_MODE: z.enum(["live", "fixture"]).default("live"),
  ALLOW_FIXTURE_PROVIDERS: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
  APP_ORIGIN: z.url(),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;
export const parseServerEnv = (source: NodeJS.ProcessEnv) =>
  serverEnvSchema.parse(source);
export const getServerEnv = () => parseServerEnv(process.env);
```

`.env.example`에는 값 대신 다음 키와 안전한 local URL만 둔다.

```dotenv
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/youtube/oauth/callback
YOUTUBE_TOKEN_ENCRYPTION_KEY=
DELETION_AUDIT_PEPPER=
OPENAI_API_KEY=
OPENAI_ANALYSIS_MODEL=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
EXTERNAL_PROVIDER_MODE=live
ALLOW_FIXTURE_PROVIDERS=false
APP_ORIGIN=http://localhost:3000
```

- [ ] **Step 6: 단위 테스트와 기존 검증을 통과시킨다**

Run:

```bash
npm test -- src/lib/env.test.ts src/lib/retry.test.ts
npm run lint
```

Expected: 3 tests PASS, lint exit 0.

- [ ] **Step 7: 커밋한다**

```bash
git add package.json package-lock.json .env.example vitest.config.ts src/lib
git commit -m "chore: add vertical slice runtime foundations"
```

---

### Task 2: BrandBastion 레퍼런스 기반 전체 데스크톱 랜딩 재구축

**Files:**
- Modify: `src/app/page.tsx`
- Modify: `src/app/page.test.tsx`
- Modify: `src/app/globals.css`
- Create: `src/features/landing/landing-copy.ts`
- Create: `src/features/landing/landing-page.tsx`
- Create: `src/features/landing/product-preview.tsx`
- Test: `src/features/landing/landing-page.test.tsx`

**Interfaces:**
- Produces: `<LandingPage />`, `<ProductPreview />`, `landingCopy`.
- Consumes: `/auth/sign-in` 링크 계약.

- [ ] **Step 1: 완성 랜딩의 실패 테스트를 작성한다**

```tsx
// src/features/landing/landing-page.test.tsx
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LandingPage } from "./landing-page";

describe("LandingPage", () => {
  it("renders the complete product story and clearly labels example data", () => {
    render(<LandingPage />);

    expect(screen.getByRole("banner")).toHaveTextContent("CommentHawk");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "댓글의 소음은 줄이고",
    );
    const preview = screen.getByRole("region", { name: "제품 예시 화면" });
    expect(within(preview).getByText("제품 예시 화면")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "댓글이 많아질수록 중요한 신호는 더 쉽게 묻힙니다" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "두 번 분석하고, 마지막 판단은 크리에이터가 합니다" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "먼저 YouTube에서 시작합니다" })).toBeInTheDocument();
    expect(screen.getByText("YouTube 지원")).toBeInTheDocument();
    expect(screen.queryByText(/Instagram 지원|TikTok 지원/)).not.toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /시작하기|로그인/ }).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 테스트가 현재 최소 랜딩에서 실패하는지 확인한다**

Run: `npm test -- src/features/landing/landing-page.test.tsx`

Expected: FAIL because `landing-page.tsx` does not exist.

- [ ] **Step 3: 문구와 예시 데이터의 경계를 만든다**

```ts
// src/features/landing/landing-copy.ts
export const landingCopy = {
  hero: {
    eyebrow: "CREATOR COMMENT OPERATIONS",
    title: "댓글의 소음은 줄이고, 중요한 목소리는 더 선명하게.",
    description:
      "CommentHawk는 YouTube 댓글을 안전·주의·위험으로 정리하고, 크리에이터마다 다른 기준과 과거 판단을 반영해 검토할 댓글을 먼저 보여줍니다.",
  },
  problems: [
    ["유해한 표현에 반복 노출", "원문을 직접 훑는 시간을 줄이고 필요한 순간에만 경고 후 확인합니다."],
    ["유용한 피드백의 손실", "거친 표현 안에 남아 있는 질문과 개선 신호를 분리해 보존합니다."],
    ["사람마다 달라지는 판단", "정책·규칙·과거 수정을 함께 사용해 판단 근거를 일관되게 남깁니다."],
  ],
  solutions: [
    ["검토 우선순위", "모든 댓글을 보존하되 주의와 위험을 먼저 검토합니다."],
    ["크리에이터별 기준", "금지어 하나가 아니라 허용어, 문맥 예외, 과거 결정을 함께 봅니다."],
    ["사람이 승인하는 조치", "AI는 추천하고 실제 moderation은 증거 확인 뒤 사용자가 실행합니다."],
  ],
} as const;

export const previewMetrics = [
  ["가져온 댓글", "248"],
  ["분석 완료", "241"],
  ["주의", "17"],
  ["위험", "6"],
] as const;
```

`previewMetrics`는 오직 landing feature에서 import하고 app/dashboard에서는 import하지 않는다.

- [ ] **Step 4: 레퍼런스의 정보 리듬을 반영한 독자 컴포넌트를 구현한다**

`landing-page.tsx`는 다음처럼 모든 섹션을 실제 요소로 렌더한다.

```tsx
import Link from "next/link";
import { landingCopy } from "./landing-copy";
import { ProductPreview } from "./product-preview";

const processSteps = [
  ["1차 분석", "모든 댓글에 공통 규칙과 AI 분류를 적용합니다."],
  ["크리에이터 문맥", "정책과 같은 채널의 과거 수정 사례를 최대 5개 찾습니다."],
  ["2차 분석", "주의·위험·낮은 신뢰도 댓글만 문맥과 함께 다시 봅니다."],
] as const;

export function LandingPage() {
  return (
    <main className="landing">
      <header className="landing-header">
        <Link className="brand" href="/" aria-label="CommentHawk 홈">
          <span aria-hidden="true">CH</span>
          <strong>CommentHawk</strong>
        </Link>
        <nav aria-label="제품 소개">
          <a href="#problems">문제</a>
          <a href="#solutions">해결 방식</a>
          <a href="#analysis">AI 분석</a>
          <a href="#integration">연결</a>
        </nav>
        <div className="header-actions">
          <Link href="/auth/sign-in">로그인</Link>
          <Link className="button button-primary" href="/auth/sign-in">
            시작하기
          </Link>
        </div>
      </header>

      <section className="landing-hero">
        <div className="hero-copy">
          <p className="eyebrow">{landingCopy.hero.eyebrow}</p>
          <h1>{landingCopy.hero.title}</h1>
          <p>{landingCopy.hero.description}</p>
          <div className="hero-actions">
            <Link className="button button-primary" href="/auth/sign-in">
              YouTube 댓글 관리 시작하기
            </Link>
            <a className="button button-secondary" href="#analysis">
              분석 방식 보기
            </a>
          </div>
        </div>
        <ProductPreview />
      </section>

      <section id="problems" aria-labelledby="problem-title">
        <p className="eyebrow">THE PROBLEM</p>
        <h2 id="problem-title">
          댓글이 많아질수록 중요한 신호는 더 쉽게 묻힙니다
        </h2>
        <div className="card-grid card-grid-three">
          {landingCopy.problems.map(([title, description], index) => (
            <article key={title}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="solutions" aria-labelledby="solution-title">
        <p className="eyebrow">THE SOLUTION</p>
        <h2 id="solution-title">삭제보다 먼저, 이해하고 분리합니다</h2>
        <div className="card-grid card-grid-three">
          {landingCopy.solutions.map(([title, description]) => (
            <article key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="analysis" aria-labelledby="two-stage-title">
        <p className="eyebrow">TWO-STAGE ANALYSIS</p>
        <h2 id="two-stage-title">
          두 번 분석하고, 마지막 판단은 크리에이터가 합니다
        </h2>
        <ol className="process-grid">
          {processSteps.map(([title, description]) => (
            <li key={title}>
              <h3>{title}</h3>
              <p>{description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section
        className="landing-ai-dark"
        aria-labelledby="ai-process-title"
      >
        <div>
          <p className="eyebrow">SOURCE-PRESERVING AI</p>
          <h2 id="ai-process-title">원문은 보존하고, 검토할 의미만 정리합니다</h2>
          <p>
            원본 댓글, 규칙 신호, AI 결과, 정제 피드백, 사용자 수정,
            moderation 이력을 서로 다른 기록으로 남깁니다.
          </p>
        </div>
        <dl className="ai-facts">
          <div><dt>분류</dt><dd>안전 · 주의 · 위험</dd></div>
          <div><dt>개인화</dt><dd>정책 · 허용어 · 과거 수정</dd></div>
          <div><dt>실행</dt><dd>사용자 확인 후에만</dd></div>
        </dl>
      </section>

      <section id="integration" aria-labelledby="youtube-title">
        <p className="eyebrow">FIRST INTEGRATION</p>
        <h2 id="youtube-title">먼저 YouTube에서 시작합니다</h2>
        <p>
          크리에이터가 소유한 채널 하나를 연결하고 영상 하나의 실제 댓글부터
          안전하게 검증합니다.
        </p>
        <span className="supported-platform">YouTube 지원</span>
      </section>

      <section className="final-cta" aria-labelledby="final-cta-title">
        <h2 id="final-cta-title">첫 20개 댓글부터 검토해 보세요</h2>
        <p>연결과 조치는 분리되어 있으며, 원문과 이력은 덮어쓰지 않습니다.</p>
        <Link className="button button-primary" href="/auth/sign-in">
          CommentHawk 시작하기
        </Link>
      </section>

      <footer>
        <strong>CommentHawk</strong>
        <p>크리에이터를 위한 사람 중심의 AI 댓글 운영 도구</p>
      </footer>
    </main>
  );
}
```

`product-preview.tsx`는 예시 label과 상태 text를 실제 DOM에 둔다.

```tsx
import { previewMetrics } from "./landing-copy";

export function ProductPreview() {
  return (
    <section className="product-preview" aria-label="제품 예시 화면">
      <p className="preview-label">제품 예시 화면</p>
      <div className="preview-browser">
        <div className="preview-browser-bar" aria-hidden="true">
          <i /><i /><i />
        </div>
        <div className="preview-metrics">
          {previewMetrics.map(([label, value]) => (
            <article key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </div>
        <div className="preview-status">
          <span><i className="safe-dot" />안전 218</span>
          <span><i className="caution-dot" />주의 17</span>
          <span><i className="risk-dot" />위험 6</span>
        </div>
        <aside>
          <strong>AI 요약</strong>
          <p>반복 질문과 배송 관련 개선 의견이 늘었습니다.</p>
        </aside>
      </div>
    </section>
  );
}
```

`src/app/page.tsx`는 `<LandingPage />`만 반환한다. 레퍼런스 PNG는 브라우저에 직접 노출하지 않고 구현 시각 기준으로만 사용한다.

- [ ] **Step 5: 시각 토큰과 접근성 CSS를 구현한다**

`globals.css`에 다음 토큰을 추가하고 모든 랜딩 색상은 이 토큰을 사용한다.

```css
:root {
  --ch-ink: #071936;
  --ch-muted: #5b6b84;
  --ch-blue: #246bfe;
  --ch-blue-soft: #eaf2ff;
  --ch-surface: #ffffff;
  --ch-canvas: #f4f8ff;
  --ch-caution: #b45309;
  --ch-risk: #c9374f;
  --ch-safe: #16794a;
  --ch-border: #dce6f5;
  --ch-radius-card: 24px;
  --ch-shadow: 0 24px 70px rgb(35 76 140 / 14%);
}

:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--ch-blue) 75%, white);
  outline-offset: 3px;
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    scroll-behavior: auto !important;
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

1440px에서는 hero를 2열, 1280px에서는 preview가 잘리지 않는 최소 폭으로 구성한다. color만으로 상태를 표현하지 않고 각 상태에 텍스트와 아이콘을 함께 둔다.

- [ ] **Step 6: 랜딩 테스트와 두 desktop viewport의 수동 screenshot을 확인한다**

Run:

```bash
npm test -- src/app/page.test.tsx src/features/landing/landing-page.test.tsx
npm run dev
```

Expected: tests PASS. 브라우저에서 `1440x900`, `1280x800` 모두 수평 스크롤이 없고 `제품 예시 화면` 레이블이 보인다.

- [ ] **Step 7: 커밋한다**

```bash
git add src/app/page.tsx src/app/page.test.tsx src/app/globals.css src/features/landing
git commit -m "feat: rebuild the full CommentHawk landing page"
```

---

### Task 3: Supabase 스키마, immutable source, RLS

**Files:**
- Create: `supabase/config.toml`
- Create: `supabase/migrations/202607230001_identity_ingestion.sql`
- Create: `supabase/migrations/202607230002_policy_analysis_actions.sql`
- Create: `supabase/migrations/202607230003_rls_and_functions.sql`
- Create: `supabase/tests/rls.sql`
- Create: `src/types/database.ts` via generation

**Interfaces:**
- Produces: 모든 tenant table의 `workspace_id`, `match_creator_feedback`, `get_dashboard_summary`, `get_inbox_page`.
- Consumes: `auth.users`.

- [ ] **Step 1: local Supabase를 초기화하고 migration 파일을 만든다**

Run:

```bash
npx supabase init
npx supabase start
```

Expected: local API, DB, Studio, Inbucket URLs가 출력된다.

- [ ] **Step 2: identity·ingestion migration을 작성한다**

핵심 enum과 제약은 다음과 같이 고정한다.

```sql
create extension if not exists vector;
create type public.job_status as enum
  ('pending', 'running', 'partially_succeeded', 'succeeded', 'failed');
create type public.connection_status as enum
  ('pending_channel_selection', 'connected', 'revoked', 'disconnected', 'error');
create type public.item_status as enum
  ('pending', 'running', 'succeeded', 'failed');

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default '내 CommentHawk',
  created_at timestamptz not null default now(),
  unique (owner_user_id)
);

create table public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role = 'owner'),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.youtube_connections (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  status public.connection_status not null,
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  granted_scopes text[] not null default '{}',
  google_subject text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id)
);

create table public.youtube_channel_candidates (
  connection_id uuid not null references public.youtube_connections(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_channel_id text not null,
  title text not null,
  handle text,
  thumbnail_url text,
  selected boolean not null default false,
  primary key (connection_id, youtube_channel_id)
);

create unique index one_selected_channel_per_workspace
  on public.youtube_channel_candidates(workspace_id) where selected;

create table public.youtube_videos (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_channel_id text not null,
  youtube_video_id text not null,
  title text not null,
  thumbnail_url text,
  published_at timestamptz,
  comments_enabled boolean,
  captured_at timestamptz not null default now(),
  unique (workspace_id, youtube_video_id)
);

create table public.comment_import_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_video_id text not null,
  requested_top_level_count integer not null check (requested_top_level_count between 20 and 50),
  next_page_token text,
  status public.job_status not null default 'pending',
  fetched_count integer not null default 0,
  stored_count integer not null default 0,
  duplicate_count integer not null default 0,
  failed_count integer not null default 0,
  attempt_count integer not null default 0,
  last_error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.raw_comments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_video_id text not null,
  youtube_comment_id text not null,
  parent_youtube_comment_id text,
  author_channel_id text,
  author_display_name text,
  author_avatar_url text,
  text_display text not null,
  text_original text,
  like_count integer not null default 0,
  source_moderation_status text,
  published_at timestamptz,
  updated_at timestamptz,
  captured_at timestamptz not null default now(),
  source_deleted_at timestamptz,
  first_import_job_id uuid not null references public.comment_import_jobs(id),
  unique (workspace_id, youtube_comment_id)
);

create table public.raw_comment_payloads (
  raw_comment_id uuid primary key references public.raw_comments(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  payload jsonb not null,
  captured_at timestamptz not null default now()
);

create table public.comment_import_items (
  import_job_id uuid not null references public.comment_import_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  youtube_comment_id text not null,
  status public.item_status not null,
  raw_comment_id uuid references public.raw_comments(id),
  error_code text,
  created_at timestamptz not null default now(),
  primary key (import_job_id, youtube_comment_id)
);

create or replace function public.protect_raw_comment_source()
returns trigger language plpgsql
set search_path = public
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
    or new.youtube_video_id is distinct from old.youtube_video_id
    or new.youtube_comment_id is distinct from old.youtube_comment_id
    or new.parent_youtube_comment_id is distinct from old.parent_youtube_comment_id
    or new.author_channel_id is distinct from old.author_channel_id
    or new.author_display_name is distinct from old.author_display_name
    or new.author_avatar_url is distinct from old.author_avatar_url
    or new.text_display is distinct from old.text_display
    or new.text_original is distinct from old.text_original
    or new.like_count is distinct from old.like_count
    or new.source_moderation_status is distinct from old.source_moderation_status
    or new.published_at is distinct from old.published_at
    or new.updated_at is distinct from old.updated_at
    or new.captured_at is distinct from old.captured_at
    or new.first_import_job_id is distinct from old.first_import_job_id
  then
    raise exception 'raw comment source fields are immutable';
  end if;
  return new;
end;
$$;

create trigger raw_comment_source_is_immutable
before update on public.raw_comments
for each row execute function public.protect_raw_comment_source();

create or replace function public.reject_raw_payload_update()
returns trigger language plpgsql
as $$
begin
  raise exception 'raw comment payload is immutable';
end;
$$;

create trigger raw_comment_payload_is_immutable
before update on public.raw_comment_payloads
for each row execute function public.reject_raw_payload_update();
```

`raw_comments`에는 UPDATE/DELETE를 허용하는 user policy를 만들지 않는다. `source_deleted_at` 변경은 검증된 server-side RPC만 사용한다.

- [ ] **Step 3: policy·analysis·action migration을 작성한다**

다음 enum을 exact 저장값으로 사용한다.

```sql
create type public.review_level as enum ('safe', 'caution', 'risk');
create type public.comment_category as enum (
  'positive', 'neutral', 'question', 'constructive_feedback',
  'toxic_but_actionable', 'abusive_no_signal', 'spam_advertisement',
  'phishing', 'harassment', 'threat_or_serious_risk', 'uncertain'
);
create type public.moderation_action as enum
  ('hold_for_review', 'publish', 'reject', 'delete');
create type public.action_state as enum
  ('pending_confirmation', 'awaiting_scope', 'running', 'succeeded', 'failed', 'cancelled');
create type public.recommended_action as enum
  ('none', 'review', 'hold_for_review', 'publish', 'reject');
create type public.rule_kind as enum
  ('blocked', 'allowed', 'context_exception');
```

두 번째 migration에는 다음 table과 제약을 실제 SQL로 추가한다.

```sql
create table public.creator_policies (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  version integer not null check (version > 0),
  category_sensitivity jsonb not null default '{}',
  preferred_actions jsonb not null default '{}',
  harmful_text_hidden boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (workspace_id, version)
);

create table public.phrase_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  policy_id uuid not null references public.creator_policies(id) on delete cascade,
  kind public.rule_kind not null,
  phrase text not null,
  normalized_phrase text not null,
  context_note text,
  enabled boolean not null default true,
  version integer not null check (version > 0),
  created_at timestamptz not null default now()
);

create table public.rule_evaluations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null references public.raw_comments(id) on delete cascade,
  policy_version integer not null,
  rule_engine_version text not null,
  normalized_text text not null,
  signals jsonb not null,
  initial_review_level public.review_level not null,
  created_at timestamptz not null default now(),
  unique (raw_comment_id, rule_engine_version, policy_version)
);

create table public.analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  import_job_id uuid references public.comment_import_jobs(id) on delete set null,
  configuration_key text not null,
  status public.job_status not null default 'pending',
  total_count integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  unique (import_job_id, configuration_key)
);

create table public.analysis_job_items (
  id uuid primary key default gen_random_uuid(),
  analysis_job_id uuid not null references public.analysis_jobs(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null references public.raw_comments(id) on delete cascade,
  status public.item_status not null default 'pending',
  attempt_count integer not null default 0,
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  unique (analysis_job_id, raw_comment_id)
);

create table public.model_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null references public.raw_comments(id) on delete cascade,
  analysis_job_item_id uuid references public.analysis_job_items(id) on delete set null,
  stage smallint not null check (stage in (1, 2)),
  provider text not null,
  model_identifier text not null,
  provider_response_id text,
  idempotency_key text not null unique,
  prompt_version text not null,
  schema_version text not null,
  policy_version integer not null,
  latency_ms integer check (latency_ms >= 0),
  usage jsonb not null default '{}',
  status text not null check (status in ('succeeded', 'failed', 'refused')),
  error_code text,
  created_at timestamptz not null default now()
);

create table public.comment_analyses (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null references public.raw_comments(id) on delete cascade,
  analysis_job_item_id uuid references public.analysis_job_items(id) on delete set null,
  model_run_id uuid not null unique references public.model_runs(id) on delete restrict,
  rule_evaluation_id uuid references public.rule_evaluations(id) on delete set null,
  stage smallint not null check (stage in (1, 2)),
  stage_one_analysis_id uuid references public.comment_analyses(id) on delete restrict,
  category public.comment_category not null,
  confidence real not null check (confidence between 0 and 1),
  review_level public.review_level not null,
  toxicity real not null check (toxicity between 0 and 1),
  spam real not null check (spam between 0 and 1),
  phishing real not null check (phishing between 0 and 1),
  actionable_feedback boolean not null,
  recommended_action public.recommended_action not null,
  manual_review boolean not null,
  evidence_review boolean not null,
  explanation text not null,
  policy_version integer not null,
  retrieved_feedback jsonb not null default '[]',
  provenance jsonb not null,
  created_at timestamptz not null default now(),
  check (
    (stage = 1 and stage_one_analysis_id is null)
    or (stage = 2 and stage_one_analysis_id is not null)
  )
);

create table public.sanitized_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  analysis_id uuid not null unique references public.comment_analyses(id) on delete cascade,
  neutral_text text,
  normalized_question text,
  no_signal boolean not null,
  created_at timestamptz not null default now(),
  check (no_signal = (neutral_text is null and normalized_question is null))
);

create table public.creator_feedback (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null references public.raw_comments(id) on delete cascade,
  analysis_id uuid not null references public.comment_analyses(id) on delete restrict,
  actor_user_id uuid not null references auth.users(id),
  decision text not null check (decision in ('approved', 'rejected', 'corrected')),
  corrected_category public.comment_category,
  corrected_review_level public.review_level,
  corrected_recommended_action public.recommended_action,
  edited_sanitized_feedback text,
  use_for_personalization boolean not null default false,
  use_for_training boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.feedback_embeddings (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  creator_feedback_id uuid not null unique references public.creator_feedback(id) on delete cascade,
  embedding vector(1536) not null,
  embedding_model text not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.workspace_analysis_summaries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  analysis_job_id uuid not null unique references public.analysis_jobs(id) on delete cascade,
  source_analysis_count integer not null check (source_analysis_count >= 10),
  summary_text text not null,
  provider text not null,
  model_identifier text not null,
  provider_response_id text,
  prompt_version text not null,
  schema_version text not null,
  usage jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.evaluation_cases (
  id text primary key,
  locale text not null check (locale = 'ko-KR'),
  fixture jsonb not null,
  expected jsonb not null,
  reviewed_by text not null,
  reviewed_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table public.moderation_action_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  raw_comment_id uuid not null references public.raw_comments(id) on delete restrict,
  requested_by uuid not null references auth.users(id),
  action public.moderation_action not null,
  idempotency_key text not null unique,
  state public.action_state not null,
  confirmed_at timestamptz,
  executed_at timestamptz,
  provider_result jsonb,
  error_code text,
  created_at timestamptz not null default now()
);

create table public.evidence_records (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  action_request_id uuid not null unique
    references public.moderation_action_requests(id) on delete restrict,
  raw_comment_id uuid not null references public.raw_comments(id) on delete restrict,
  source_snapshot jsonb not null,
  captured_at timestamptz not null default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.deletion_audit_logs (
  id uuid primary key default gen_random_uuid(),
  deleted_workspace_id uuid not null,
  actor_fingerprint text not null,
  event_type text not null check (event_type = 'workspace_data_deleted'),
  created_at timestamptz not null default now()
);

create view public.current_comment_analyses
with (security_invoker = true)
as
select ranked.*
from (
  select
    ca.*,
    row_number() over (
      partition by ca.workspace_id, ca.raw_comment_id
      order by ca.created_at desc, ca.stage desc, ca.id desc
    ) as current_rank
  from public.comment_analyses ca
) ranked
where ranked.current_rank = 1;
```

`creator_feedback`은 `raw_comments` 또는 `comment_analyses`를 update하지 않고 새 row만 추가한다.

- [ ] **Step 4: RLS 실패 테스트를 먼저 작성한다**

`supabase/tests/rls.sql`은 pgTAP으로 다음 네 계약을 검사한다.

```sql
select plan(4);
select lives_ok(
  $$ select public.get_dashboard_summary('11111111-1111-1111-1111-111111111111') $$,
  'member can read own workspace'
);
select throws_ok(
  $$ select public.get_dashboard_summary('22222222-2222-2222-2222-222222222222') $$,
  '42501',
  'workspace access denied',
  'member cannot read another workspace'
);
select throws_ok(
  $$ update public.raw_comments set text_display = 'changed' $$,
  '42501',
  null,
  'raw source cannot be updated by user'
);
select is(
  (select count(*)::int from public.match_creator_feedback(
    '11111111-1111-1111-1111-111111111111',
    array_fill(0::real, array[1536])::vector,
    0.78,
    5
  )),
  0,
  'RAG never crosses workspace boundary'
);
select * from finish();
```

- [ ] **Step 5: RLS helper와 RPC를 구현한다**

모든 tenant table에 RLS를 enable하고 다음 helper와 workspace bootstrap을 사용한다.

```sql
create or replace function public.is_workspace_member(target uuid)
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = target and user_id = auth.uid()
  );
$$;

create or replace function public.ensure_owner_workspace()
returns uuid language plpgsql security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  target_workspace_id uuid;
begin
  if current_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select id into target_workspace_id
  from public.workspaces
  where owner_user_id = current_user_id;

  if target_workspace_id is null then
    insert into public.workspaces (owner_user_id)
    values (current_user_id)
    returning id into target_workspace_id;

    insert into public.workspace_members (workspace_id, user_id, role)
    values (target_workspace_id, current_user_id, 'owner');

    insert into public.creator_policies (
      workspace_id, version, category_sensitivity,
      preferred_actions, harmful_text_hidden, created_by
    )
    values (
      target_workspace_id, 1, '{}', '{}', true, current_user_id
    );
  end if;

  return target_workspace_id;
end;
$$;

grant execute on function public.ensure_owner_workspace() to authenticated;
```

모든 tenant table에는 `for select using (public.is_workspace_member(workspace_id))` policy를 만든다. 브라우저가 provider/source/job table을 직접 변경하지 못하도록 direct INSERT/UPDATE/DELETE policy는 만들지 않는다. 모든 mutation은 `src/lib/supabase/admin.ts`를 사용하는 server-only domain service에서 `requireViewer()`의 workspace ID와 대상 row의 workspace ID를 다시 비교한 뒤 수행한다. `raw_comments`와 `raw_comment_payloads`는 service-role 경로에서도 import/evidence service 외에는 repository method를 노출하지 않는다.

`match_creator_feedback`은 다음 signature와 guard를 그대로 사용한다.

```sql
create or replace function public.match_creator_feedback(
  target_workspace_id uuid,
  query_embedding vector(1536),
  match_threshold real default 0.78,
  match_count integer default 5
)
returns table (
  feedback_id uuid,
  similarity real,
  decision text,
  corrected_category public.comment_category,
  corrected_review_level public.review_level,
  edited_sanitized_feedback text
)
language plpgsql stable security invoker
set search_path = public
as $$
begin
  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'workspace access denied' using errcode = '42501';
  end if;

  return query
  select
    cf.id,
    (1 - (fe.embedding <=> query_embedding))::real,
    cf.decision,
    cf.corrected_category,
    cf.corrected_review_level,
    cf.edited_sanitized_feedback
  from public.feedback_embeddings fe
  join public.creator_feedback cf on cf.id = fe.creator_feedback_id
  where fe.workspace_id = target_workspace_id
    and cf.workspace_id = target_workspace_id
    and cf.use_for_personalization
    and fe.deleted_at is null
    and (1 - (fe.embedding <=> query_embedding)) >= match_threshold
  order by fe.embedding <=> query_embedding
  limit least(greatest(match_count, 0), 5);
end;
$$;
```

- [ ] **Step 6: migration, RLS 테스트, 타입 생성을 실행한다**

Run:

```bash
npm run db:reset
npm run db:test
npm run db:types
```

Expected: migrations apply, pgTAP 4/4 PASS, `src/types/database.ts` generated.

- [ ] **Step 7: 커밋한다**

```bash
git add supabase src/types/database.ts package.json package-lock.json
git commit -m "feat: add tenant-safe CommentHawk data model"
```

---

### Task 4: Supabase magic-link 인증, workspace bootstrap, 실제 앱 셸

**Files:**
- Create: `src/lib/supabase/browser.ts`
- Create: `src/lib/supabase/server.ts`
- Create: `src/lib/supabase/admin.ts`
- Create: `src/lib/supabase/proxy.ts`
- Create: `src/proxy.ts`
- Create: `src/features/auth/require-viewer.ts`
- Create: `src/features/auth/workspace-deletion-service.ts`
- Create: `src/app/auth/sign-in/page.tsx`
- Create: `src/app/auth/sign-in/actions.ts`
- Create: `src/app/auth/callback/route.ts`
- Create: `src/app/(product)/app/layout.tsx`
- Create: `src/app/(product)/app/settings/data/page.tsx`
- Create: `src/app/(product)/app/settings/data/actions.ts`
- Create: `src/features/app-shell/app-shell.tsx`
- Test: `src/features/auth/require-viewer.test.ts`
- Test: `src/features/auth/workspace-deletion-service.test.ts`
- Test: `src/app/auth/sign-in/actions.test.ts`

**Interfaces:**
- Produces: `requireViewer(): Promise<{ userId: string; workspaceId: string }>`, `deleteWorkspaceData(input)`, authenticated app layout.
- Consumes: generated `Database` type와 Task 1 `getServerEnv()`.

- [ ] **Step 1: auth 실패 테스트를 작성한다**

```ts
it("redirects unauthenticated viewers to sign-in", async () => {
  mockGetUser.mockResolvedValue({ data: { user: null }, error: null });
  await expect(requireViewer()).rejects.toMatchObject({
    digest: expect.stringContaining("/auth/sign-in"),
  });
});

it("creates the owner workspace once after first authentication", async () => {
  mockGetUser.mockResolvedValue({ data: { user: { id: "user-1" } }, error: null });
  mockRpc.mockResolvedValue({
    data: "workspace-1",
    error: null,
  });
  await expect(requireViewer()).resolves.toEqual({
    userId: "user-1",
    workspaceId: "workspace-1",
  });
  expect(mockRpc).toHaveBeenCalledWith("ensure_owner_workspace");
});
```

- [ ] **Step 2: 테스트 실패를 확인한다**

Run: `npm test -- src/features/auth/require-viewer.test.ts src/app/auth/sign-in/actions.test.ts`

Expected: FAIL because auth modules do not exist.

- [ ] **Step 3: Next.js 16 방식의 Supabase clients와 proxy를 구현한다**

`createServerClient<Database>`의 cookie adapter는 반드시 `const cookieStore = await cookies()` 후 `getAll/setAll`을 사용한다. `src/proxy.ts` matcher는 정적 asset을 제외하고 `/app/:path*`와 auth cookie refresh에 적용한다. Proxy는 redirect용 낙관적 체크만 하고 실제 authorization은 모든 server page/action/service의 `requireViewer()`가 수행한다.

```ts
export async function requireViewer() {
  const supabase = await createServerSupabaseClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/auth/sign-in");

  const { data: workspaceId, error } = await supabase.rpc("ensure_owner_workspace");
  if (error || !workspaceId) throw new Error("Workspace bootstrap failed");
  return { userId: user.id, workspaceId };
}
```

- [ ] **Step 4: magic-link form과 callback을 구현한다**

`requestMagicLink(previousState, formData)`는 Zod email 검증 후:

```ts
const { APP_ORIGIN } = getServerEnv();
await supabase.auth.signInWithOtp({
  email,
  options: { emailRedirectTo: `${APP_ORIGIN}/auth/callback?next=/app` },
});
```

callback은 `code`를 `exchangeCodeForSession(code)`로 교환하고 `next`가 `/`로 시작하는 내부 path인지 검증한 뒤 `/app`으로 redirect한다. provider error나 만료는 `/auth/sign-in?error=expired`로 보낸다.

- [ ] **Step 5: 앱 셸과 disconnected dashboard route를 만든다**

`/app` layout은 `requireViewer()` 결과 없이는 렌더하지 않는다. 좌측 내비게이션은 `개요`, `댓글 Inbox`, `영상`, `YouTube 연결`, `운영 기준`만 포함한다. 아직 연결되지 않은 `/app`은 수치 카드 대신 다음 상태를 보여준다.

```tsx
<EmptyConnectionState
  title="YouTube 채널을 연결해 첫 댓글을 가져오세요"
  description="CommentHawk 로그인과 YouTube 권한은 별도로 관리됩니다."
  href="/app/connect/youtube"
/>
```

- [ ] **Step 6: 별도의 명시적 확인이 필요한 workspace data 삭제를 구현한다**

설정 화면은 사용자가 `COMMENTHAWK 데이터 삭제`를 직접 입력한 경우에만 action을 호출한다. service는 owner 여부 확인 → Google token revoke best-effort → encrypted token 즉시 null 처리 → transaction에서 content-free `deletion_audit_logs` insert → workspace delete cascade 순서다. `deletion_audit_logs.actor_fingerprint`는 server pepper와 user ID의 HMAC이며 email, channel ID, comment text를 저장하지 않는다. 이 작업은 Supabase Auth account 자체를 삭제하지 않는다.

```ts
it("deletes tenant data only after the exact confirmation", async () => {
  await expect(
    deleteWorkspaceData({
      userId: "u1",
      workspaceId: "w1",
      confirmation: "삭제",
    }, dependencies),
  ).rejects.toThrow("Exact deletion confirmation required");

  await deleteWorkspaceData({
    userId: "u1",
    workspaceId: "w1",
    confirmation: "COMMENTHAWK 데이터 삭제",
  }, dependencies);

  expect(repository.insertContentFreeDeletionAudit).toHaveBeenCalledBefore(
    repository.deleteWorkspace,
  );
  expect(repository.deleteWorkspace).toHaveBeenCalledWith("w1");
});
```

- [ ] **Step 7: auth 테스트, lint, build를 실행한다**

Run:

```bash
npm test -- src/features/auth src/app/auth
npm run lint
npm run build
```

Expected: auth tests PASS, lint/build exit 0.

- [ ] **Step 8: 커밋한다**

```bash
git add src/proxy.ts src/lib/supabase src/features/auth src/features/app-shell src/app/auth "src/app/(product)"
git commit -m "feat: add authenticated CommentHawk application shell"
```

---

### Task 5: 별도 Google OAuth, token 암호화, 채널 하나 선택

**Files:**
- Create: `src/features/youtube/contracts.ts`
- Create: `src/features/youtube/token-crypto.ts`
- Create: `src/features/youtube/oauth-state.ts`
- Create: `src/features/youtube/google-youtube-provider.ts`
- Create: `src/features/youtube/provider-factory.ts`
- Create: `src/features/youtube/channel-service.ts`
- Create: `src/app/api/youtube/oauth/start/route.ts`
- Create: `src/app/api/youtube/oauth/callback/route.ts`
- Create: `src/app/(product)/app/connect/youtube/page.tsx`
- Create: `src/app/(product)/app/connect/youtube/actions.ts`
- Test: `src/features/youtube/token-crypto.test.ts`
- Test: `src/features/youtube/channel-service.test.ts`

**Interfaces:**
- Produces:

```ts
type YouTubeChannel = {
  id: string;
  title: string;
  handle: string | null;
  thumbnailUrl: string | null;
};

type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  grantedScopes: string[];
  googleSubject: string | null;
};

interface YouTubeProvider {
  getAuthorizationUrl(input: {
    state: string;
    scopes: string[];
    includeGrantedScopes: boolean;
    accessType: "offline";
    prompt: "consent";
  }): string;
  exchangeCode(code: string): Promise<OAuthTokens>;
  listOwnedChannels(tokens: OAuthTokens): Promise<YouTubeChannel[]>;
}
```

- Consumes: `requireViewer`, `getServerEnv()`, `youtube_connections`, `youtube_channel_candidates`.

- [ ] **Step 1: token round-trip·tamper와 one-channel 제약 테스트를 작성한다**

```ts
it("encrypts and decrypts a token without storing plaintext", () => {
  const sealed = encryptToken("refresh-secret", key);
  expect(sealed).not.toContain("refresh-secret");
  expect(decryptToken(sealed, key)).toBe("refresh-secret");
});

it("rejects tampered ciphertext", () => {
  const sealed = encryptToken("refresh-secret", key);
  expect(() => decryptToken(`${sealed}x`, key)).toThrow();
});

it("selects exactly one candidate and clears an older selection", async () => {
  await selectChannel({ workspaceId: "w1", channelId: "channel-b", repository });
  expect(repository.selectOnly).toHaveBeenCalledWith("w1", "channel-b");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/youtube`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: AES-256-GCM과 OAuth state를 구현한다**

token wire format은 `v1.<iv-base64url>.<tag-base64url>.<ciphertext-base64url>`이다. `randomBytes(12)`, `createCipheriv("aes-256-gcm", key, iv)`를 사용한다. OAuth state는 32-byte random value와 `purpose: "read" | "moderation"`, optional `actionRequestId`를 httpOnly, sameSite=lax, secure-in-production cookie에 10분 저장한다. callback은 request URL origin이 configured `APP_ORIGIN`, redirect URI가 configured `GOOGLE_REDIRECT_URI`인지 확인하고 `timingSafeEqual`로 state를 검증한 뒤 cookie를 즉시 삭제한다.

- [ ] **Step 4: 최소 read scope OAuth와 callback을 구현한다**

start route:

```ts
const scopes = ["https://www.googleapis.com/auth/youtube.readonly"];
return NextResponse.redirect(
  provider.getAuthorizationUrl({
    state,
    scopes,
    includeGrantedScopes: true,
    accessType: "offline",
    prompt: "consent",
  }),
);
```

callback은 origin/state 검증 → code 교환 → token 암호화 → `channels.list({ part:["snippet"], mine:true, maxResults:50 })` → 후보 upsert 순서를 지킨다. 새 token response에 refresh token이 없으면 기존 encrypted refresh token을 보존한다. OAuth client의 token refresh event가 발생하면 새 access token/expiry를 즉시 다시 암호화해 저장한다. 후보 0개는 connection `error`, 1개는 자동 선택 후 `connected`, 2개 이상은 `pending_channel_selection`으로 저장한다.

- [ ] **Step 5: 채널 선택·연결 해제 UI를 구현한다**

여러 후보가 있으면 radio group을 표시하고 정확히 하나를 선택해야 제출할 수 있다. 연결 해제는 Google token revoke를 시도하고, 성공·이미 revoked이면 암호화 token column을 null로 만들고 connection을 `disconnected`로 바꾼다. 이미 수집한 원본과 분석은 삭제하지 않으며 UI에 이 사실을 명시한다.

- [ ] **Step 6: tests와 build를 실행한다**

Run:

```bash
npm test -- src/features/youtube
npm run lint
npm run build
```

Expected: token/channel tests PASS, secrets absent from rendered HTML snapshots.

- [ ] **Step 7: 커밋한다**

```bash
git add src/features/youtube src/app/api/youtube "src/app/(product)/app/connect"
git commit -m "feat: connect one creator-owned YouTube channel"
```

---

### Task 6: 영상 하나 선택, 20–50 top-level 댓글과 답글을 idempotent 수집

**Files:**
- Create: `src/features/youtube/video-service.ts`
- Create: `src/features/ingestion/comment-mapper.ts`
- Create: `src/features/ingestion/comment-import-service.ts`
- Create: `src/app/(product)/app/videos/page.tsx`
- Create: `src/app/(product)/app/videos/actions.ts`
- Create: `src/app/api/import-jobs/[jobId]/process/route.ts`
- Test: `src/features/ingestion/comment-mapper.test.ts`
- Test: `src/features/ingestion/comment-import-service.test.ts`

**Interfaces:**
- Produces:

```ts
type ImportRequest = {
  workspaceId: string;
  youtubeVideoId: string;
  topLevelLimit: number;
  pageToken?: string;
};

type SourceComment = {
  youtubeCommentId: string;
  parentYoutubeCommentId: string | null;
  textDisplay: string;
  textOriginal: string | null;
  rawPayload: unknown;
  publishedAt: string | null;
  updatedAt: string | null;
};

interface CommentImportService {
  process(jobId: string): Promise<{
    requested: number;
    fetched: number;
    stored: number;
    duplicates: number;
    failed: number;
    nextPageToken: string | null;
  }>;
}
```

- Consumes: selected channel/token, `comment_import_jobs`, immutable source tables.

- [x] **Step 1: mapping·pagination·중복·부분 실패 테스트를 작성한다**

테스트 fixture는 top-level 2개, 첫 댓글 inline reply 1개, `totalReplyCount=3`, 중복 comment ID 1개, 저장 실패 1개를 포함한다. 기대값은 top-level limit을 reply가 소비하지 않고, 누락 reply를 `comments.list(parentId)`로 추가 조회하며, 한 item 실패가 성공 item을 rollback하지 않는 것이다.

```ts
expect(result).toMatchObject({
  requested: 20,
  stored: 4,
  duplicates: 1,
  failed: 1,
  nextPageToken: "next-1",
});
expect(repository.upsertSource).toHaveBeenCalledWith(
  expect.objectContaining({ youtubeCommentId: "top-1" }),
);
```

- [x] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/ingestion`

Expected: FAIL because import modules do not exist.

- [x] **Step 3: 영상 목록과 import job 생성을 구현한다**

최신 영상은 uploads playlist를 조회해 `youtube_videos`에 upsert한다. form schema는 video ID 하나와 `z.coerce.number().int().min(20).max(50)`만 허용한다. action은 membership과 selected channel ownership을 다시 확인한 뒤 `pending` job 하나를 생성한다.

- [x] **Step 4: YouTube 수집 adapter를 구현한다**

top-level은:

```ts
youtube.commentThreads.list({
  part: ["id", "snippet", "replies"],
  videoId,
  maxResults: Math.min(100, remainingTopLevel),
  order: "time",
  textFormat: "plainText",
  pageToken,
});
```

`totalReplyCount`가 inline replies 수보다 크면:

```ts
youtube.comments.list({
  part: ["id", "snippet"],
  parentId: topLevelCommentId,
  maxResults: 100,
  textFormat: "plainText",
  pageToken: replyPageToken,
});
```

을 page token이 끝날 때까지 호출한다. `textOriginal`이 provider response에 없으면 `null`로 저장하고 `textDisplay`를 원문이라고 거짓 표기하지 않는다.

- [x] **Step 5: item별 transaction과 idempotency를 구현한다**

각 comment는 `(workspace_id, youtube_comment_id)`에 `insert ... on conflict do nothing`을 사용해 기존 source column을 덮어쓰지 않는다. 신규이면 payload를 함께 insert하고 성공 item을 기록한다. 기존이면 duplicate item을 기록한다. 실패하면 해당 item만 `failed`로 기록하고 다음 item을 계속한다. job 최종 상태는 `failed_count=0 → succeeded`, 성공과 실패가 함께 있으면 `partially_succeeded`, 성공 0이면 `failed`다.

import가 terminal 상태가 되면 이 job에서 성공·중복으로 확인된 모든 raw comment 중 현재 `policy/prompt/model/schema` idempotency key의 분석이 없는 comment를 대상으로 `analysis_jobs` 하나와 `analysis_job_items`를 생성한다. `configuration_key`는 현재 policy/prompt/model/schema 조합의 SHA-256이다. 같은 import job을 다시 처리해도 `(import_job_id, configuration_key)`, `(analysis_job_id, raw_comment_id)`, model-run idempotency constraint 때문에 중복 job/item/run이 생기지 않는다.

- [x] **Step 6: progress UI와 retry 상태를 구현한다**

영상 화면은 requested/fetched/stored/duplicate/failed를 분리해 표시한다. `commentsDisabled`, `quotaExceeded`, revoked permission을 서로 다른 한국어 상태로 보여준다. route handler는 membership과 job workspace를 확인하고 이미 `succeeded`면 같은 summary를 반환한다.

- [x] **Step 7: tests를 실행한다**

Run:

```bash
npm test -- src/features/ingestion src/features/youtube/video-service.test.ts
npm run lint
```

Expected: pagination, replies, idempotency, partial failure tests PASS.

- [x] **Step 8: 커밋한다**

```bash
git add src/features/ingestion src/features/youtube/video-service.ts "src/app/(product)/app/videos" src/app/api/import-jobs
git commit -m "feat: import real YouTube comments idempotently"
```

---

### Task 7: 크리에이터 정책과 deterministic 규칙 엔진

**Files:**
- Create: `src/features/rules/types.ts`
- Create: `src/features/rules/normalize-korean.ts`
- Create: `src/features/rules/evaluate-comment.ts`
- Create: `src/features/rules/route-review-level.ts`
- Create: `src/features/policies/policy-service.ts`
- Create: `src/app/(product)/app/settings/moderation/page.tsx`
- Create: `src/app/(product)/app/settings/moderation/actions.ts`
- Test: `src/features/rules/normalize-korean.test.ts`
- Test: `src/features/rules/evaluate-comment.test.ts`

**Interfaces:**
- Produces:

```ts
type RuleSignalKind =
  | "blocked_phrase"
  | "allowed_phrase"
  | "context_exception"
  | "repetition"
  | "suspicious_url"
  | "phishing_pattern";

type PhraseRule = {
  id: string;
  kind: "blocked" | "allowed" | "context_exception";
  normalizedPhrase: string;
  contextNote: string | null;
  enabled: boolean;
  version: number;
};

type RuleEvaluation = {
  normalizedText: string;
  signals: Array<{
    kind: RuleSignalKind;
    ruleId: string | null;
    severity: 0 | 1 | 2 | 3;
  }>;
  initialReviewLevel: "safe" | "caution" | "risk";
};

evaluateComment(input: {
  text: string;
  phraseRules: PhraseRule[];
  engineVersion: string;
}): RuleEvaluation;

applyReviewFloor(
  modelLevel: "safe" | "caution" | "risk",
  signals: RuleEvaluation["signals"],
): "safe" | "caution" | "risk";
```

- Consumes: versioned policies/phrase rules.

- [x] **Step 1: 한국어 변형과 정책 충돌 실패 테스트를 작성한다**

```ts
it.each([
  ["사 기", "사기"],
  ["시이이이발", "시발"],
  ["ＳＰＡＭ", "spam"],
])("normalizes %s to %s", (input, expected) => {
  expect(normalizeForMatching(input)).toContain(expected);
});

it("routes blocked + allowed context to caution instead of destructive risk", () => {
  const result = evaluateComment({
    text: "우리끼리는 이 표현을 칭찬으로 써요",
    engineVersion: "rules-v1",
    phraseRules: [
      blocked("이 표현"),
      contextException("우리끼리는 이 표현을 칭찬"),
    ],
  });
  expect(result.initialReviewLevel).toBe("caution");
});

it("does not allow a model to downgrade a phishing rule to safe", () => {
  expect(
    applyReviewFloor("safe", [
      { kind: "phishing_pattern", ruleId: null, severity: 3 },
    ]),
  ).toBe("risk");
});
```

- [x] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/rules`

Expected: FAIL because rule modules do not exist.

- [x] **Step 3: 정규화·신호·초기 routing을 구현한다**

정규화는 표시용 원문을 절대 변경하지 않고 matching용 문자열만 생성한다. 순서는 `NFKC → lowercase → URL canonical marker → 한글/영문 반복 3회 초과를 2회로 축약 → matching copy에서만 공백 제거`다. exact URL, 반복 광고, credential 요청/단축 URL 조합은 신호로 저장한다.

blocked phrase만으로 `risk`를 확정하지 않는다. phishing pattern은 `risk`, blocked phrase는 `caution`, allowed/context exception은 최소 `caution` Stage 2 경로로 보낸다. `applyReviewFloor`는 `safe=0, caution=1, risk=2` 순위를 사용해 model level과 deterministic floor 중 높은 값을 반환한다. Stage 1과 Stage 2 저장 직전에 모두 이 함수를 적용한다.

- [x] **Step 4: versioned 정책 편집 UI를 구현한다**

정책 저장 시 기존 row update가 아니라 `max(version)+1`의 새 `creator_policies`와 해당 버전의 phrase rules를 transaction으로 생성한다. form은 `blocked`, `allowed`, `context_exception`, 민감도, 추천 조치를 분리하고 “금지어 일치만으로 자동 삭제하지 않음”을 명시한다.

- [x] **Step 5: 테스트와 커밋을 수행한다**

Run:

```bash
npm test -- src/features/rules src/features/policies
npm run lint
git add src/features/rules src/features/policies "src/app/(product)/app/settings"
git commit -m "feat: add creator policies and deterministic comment rules"
```

Expected: rules/policy tests PASS, commit succeeds.

---

### Task 8: 공통 분석 계약, Structured Output schema, idempotency

**Files:**
- Create: `src/features/analysis/contracts.ts`
- Create: `src/features/analysis/schemas.ts`
- Create: `src/features/analysis/prompts.ts`
- Create: `src/features/analysis/analysis-provider.ts`
- Create: `src/features/analysis/idempotency.ts`
- Test: `src/features/analysis/schemas.test.ts`
- Test: `src/features/analysis/idempotency.test.ts`

**Interfaces:**
- Produces: `Stage1Output`, `Stage2Output`, `AnalysisProvider`, `buildAnalysisIdempotencyKey`.
- Consumes: Task 7 `RuleEvaluation`.

- [x] **Step 1: schema와 key 실패 테스트를 작성한다**

```ts
it("rejects a confidence outside 0..1", () => {
  expect(() => Stage1OutputSchema.parse({
    category: "neutral",
    confidence: 1.1,
    reviewLevel: "safe",
    toxicity: 0,
    spam: 0,
    phishing: 0,
    actionableFeedback: false,
    needsSecondPass: false,
    secondPassReasons: [],
    recommendedAction: "none",
    explanation: "근거 없음",
  })).toThrow();
});

it("changes the key when policy version changes", () => {
  expect(buildAnalysisIdempotencyKey(base)).not.toBe(
    buildAnalysisIdempotencyKey({ ...base, policyVersion: 2 }),
  );
});
```

- [x] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/analysis/schemas.test.ts src/features/analysis/idempotency.test.ts`

Expected: FAIL because analysis contracts do not exist.

- [x] **Step 3: exact category·level·output schema를 구현한다**

```ts
export const CommentCategorySchema = z.enum([
  "positive", "neutral", "question", "constructive_feedback",
  "toxic_but_actionable", "abusive_no_signal", "spam_advertisement",
  "phishing", "harassment", "threat_or_serious_risk", "uncertain",
]);
export const ReviewLevelSchema = z.enum(["safe", "caution", "risk"]);
export const RecommendedActionSchema = z.enum([
  "none", "review", "hold_for_review", "publish", "reject",
]);

export const Stage1OutputSchema = z.object({
  category: CommentCategorySchema,
  confidence: z.number().min(0).max(1),
  reviewLevel: ReviewLevelSchema,
  toxicity: z.number().min(0).max(1),
  spam: z.number().min(0).max(1),
  phishing: z.number().min(0).max(1),
  actionableFeedback: z.boolean(),
  needsSecondPass: z.boolean(),
  secondPassReasons: z.array(z.string()).max(8),
  recommendedAction: RecommendedActionSchema,
  explanation: z.string().min(1).max(600),
});

export const Stage2OutputSchema = Stage1OutputSchema.omit({
  needsSecondPass: true,
  secondPassReasons: true,
}).extend({
  sanitizedFeedback: z.string().min(1).max(1000).nullable(),
  normalizedQuestion: z.string().min(1).max(500).nullable(),
  manualReview: z.boolean(),
  evidenceReview: z.boolean(),
});

export const DashboardSummaryOutputSchema = z.object({
  summary: z.string().min(1).max(500),
});
```

- [x] **Step 4: provider와 idempotency 계약을 구현한다**

```ts
export type Stage1Input = {
  rawCommentId: string;
  sourceText: string;
  videoTitle: string;
  threadContext: string[];
  ruleEvaluation: RuleEvaluation;
  creatorPolicy: CreatorPolicySnapshot;
};

export type RetrievedFeedback = {
  feedbackId: string;
  similarity: number;
  decision: "approved" | "rejected" | "corrected";
  correctedCategory: CommentCategory | null;
  correctedReviewLevel: ReviewLevel | null;
  editedSanitizedFeedback: string | null;
};

export type Stage2Input = Stage1Input & {
  stage1: Stage1Output;
  retrievedFeedback: RetrievedFeedback[];
  triggerReasons: string[];
};

export type ModelResult<T> = {
  output: T;
  provider: "openai";
  modelIdentifier: string;
  providerResponseId: string;
  latencyMs: number;
  usage: Record<string, number>;
};

export interface AnalysisProvider {
  classifyStage1(input: Stage1Input): Promise<ModelResult<Stage1Output>>;
  classifyStage2(input: Stage2Input): Promise<ModelResult<Stage2Output>>;
  embed(text: string): Promise<{ vector: number[]; model: string }>;
  summarizeDashboard(input: {
    analysisCount: number;
    distribution: Record<ReviewLevel, number>;
    sanitizedSignals: string[];
  }): Promise<ModelResult<{ summary: string }>>;
}

export function buildAnalysisIdempotencyKey(input: {
  rawCommentId: string;
  policyVersion: number;
  promptVersion: string;
  modelVersion: string;
  schemaVersion: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
}
```

prompt 파일은 영어로 작성하고 다음 불변식을 명시한다: 원문을 고치지 않음, 욕설만 있고 유용한 신호가 없으면 sanitized feedback을 만들지 않음, `safe`를 법적 안전으로 표현하지 않음, category enum 밖의 값을 생성하지 않음. prompt version은 Stage 1 `commenthawk-stage1-v1`, Stage 2 `commenthawk-stage2-v1`로 분리한다.

- [x] **Step 5: 테스트와 커밋을 수행한다**

Run:

```bash
npm test -- src/features/analysis/schemas.test.ts src/features/analysis/idempotency.test.ts
git add src/features/analysis
git commit -m "feat: define versioned comment analysis contracts"
```

Expected: schema/key tests PASS.

---

### Task 9: 모든 댓글의 Stage 1 분석과 모델 실행 이력

**Files:**
- Create: `src/features/analysis/openai-analysis-provider.ts`
- Create: `src/features/analysis/analysis-service.ts`
- Create: `src/app/api/analysis-jobs/[jobId]/process/route.ts`
- Test: `src/features/analysis/openai-analysis-provider.test.ts`
- Test: `src/features/analysis/analysis-service.test.ts`

**Interfaces:**
- Produces: `processAnalysisChunk(jobId: string, maxItems = 5): Promise<AnalysisJobProgress>`.
- Consumes: `AnalysisProvider`, raw source, rule evaluation, current policy, job tables.

- [x] **Step 1: structured response·retry·run preservation 실패 테스트를 작성한다**

```ts
it("persists the model run and stage-one analysis separately", async () => {
  provider.classifyStage1.mockResolvedValue(stage1ModelResult);
  await service.processAnalysisChunk("job-1", 5);
  expect(repository.insertModelRun).toHaveBeenCalledWith(
    expect.objectContaining({ stage: 1, promptVersion: "commenthawk-stage1-v1" }),
  );
  expect(repository.insertAnalysis).toHaveBeenCalledWith(
    expect.objectContaining({ stage: 1, reviewLevel: "caution" }),
  );
  expect(repository.updateRawComment).not.toHaveBeenCalled();
});

it("retries one schema failure then records a per-item failure", async () => {
  provider.classifyStage1
    .mockRejectedValueOnce(schemaError)
    .mockRejectedValueOnce(schemaError);
  await service.processAnalysisChunk("job-1", 1);
  expect(provider.classifyStage1).toHaveBeenCalledTimes(2);
  expect(repository.failItem).toHaveBeenCalledWith("item-1", "SCHEMA_INVALID");
});
```

- [x] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/analysis/openai-analysis-provider.test.ts src/features/analysis/analysis-service.test.ts`

Expected: FAIL because provider/service do not exist.

- [x] **Step 3: OpenAI Structured Outputs adapter를 구현한다**

공식 SDK 형태를 그대로 사용한다.

```ts
const { OPENAI_ANALYSIS_MODEL } = getServerEnv();
const response = await client.responses.parse({
  model: OPENAI_ANALYSIS_MODEL,
  input: [
    { role: "system", content: STAGE_1_SYSTEM_PROMPT },
    { role: "user", content: JSON.stringify(input) },
  ],
  text: {
    format: zodTextFormat(Stage1OutputSchema, "comment_stage_1"),
  },
});

if (!response.output_parsed) {
  throw new AnalysisSchemaError("Missing parsed stage-one output");
}
```

raw comment를 logger에 포함하지 않는다. `response.id`, model, usage, latency, refusal/schema error만 model run에 기록한다.

- [x] **Step 4: chunk orchestration과 상태 전이를 구현한다**

한 요청에서 pending item 최대 5개를 claim한다. 각 item은 source 보존 확인 → 규칙 평가 저장 → current policy 조회 → Stage 1 실행 → `applyReviewFloor` 적용 → model run 저장 → analysis 저장 순서다. Stage 1의 `manual_review`는 `needsSecondPass`, `evidence_review`는 final review level이 `risk`인지로 저장한다. schema failure는 정확히 1회 다시 호출하고, 429/5xx는 Task 1 `withRetry`로 전체 최대 3회다. item들이 일부 성공하면 job은 `partially_succeeded`, pending이 남으면 `running`, 전부 성공하면 `succeeded`다.

- [x] **Step 5: route authorization과 polling response를 구현한다**

`POST /api/analysis-jobs/[jobId]/process`는 `requireViewer()`와 job workspace 일치를 검사한다. 반환값:

```ts
type AnalysisJobProgress = {
  status: "pending" | "running" | "partially_succeeded" | "succeeded" | "failed";
  total: number;
  completed: number;
  failed: number;
  remaining: number;
};
```

- [x] **Step 6: tests와 커밋을 수행한다**

Run:

```bash
npm test -- src/features/analysis
npm run lint
git add src/features/analysis src/app/api/analysis-jobs
git commit -m "feat: analyze every imported comment with stage one"
```

Expected: Stage 1, schema retry, per-item failure tests PASS.

---

### Task 10: same-workspace RAG, Stage 2 trigger, 최종 분석

**Files:**
- Create: `src/features/analysis/second-pass.ts`
- Create: `src/features/analysis/rag-service.ts`
- Modify: `src/features/analysis/openai-analysis-provider.ts`
- Modify: `src/features/analysis/analysis-service.ts`
- Test: `src/features/analysis/second-pass.test.ts`
- Test: `src/features/analysis/rag-service.test.ts`
- Test: `src/features/analysis/stage-two.integration.test.ts`

**Interfaces:**
- Produces:

```ts
shouldRunSecondPass(input: {
  stage1: Stage1Output;
  ruleSignals: RuleEvaluation["signals"];
  bestSimilarity: number | null;
  contextSensitive: boolean;
}): { run: boolean; reasons: string[] };

retrieveCreatorExamples(input: {
  workspaceId: string;
  text: string;
  threshold: 0.78;
  limit: 5;
}): Promise<RetrievedFeedback[]>;
```

- Consumes: pgvector RPC, `AnalysisProvider.embed`, Stage 1 result.

- [ ] **Step 1: 여섯 trigger와 tenant isolation 테스트를 작성한다**

각 조건을 독립 test case로 만든다: `caution/risk`, confidence `0.849`, phrase signal, similarity `0.78`, `toxic_but_actionable`, context-sensitive pattern. `safe`, confidence `0.95`, signal 없음, similarity `0.77`은 false여야 한다.

```ts
expect(
  shouldRunSecondPass({
    stage1: safeHighConfidence,
    ruleSignals: [],
    bestSimilarity: 0.77,
    contextSensitive: false,
  }),
).toEqual({ run: false, reasons: [] });
```

RAG mock repository가 다른 workspace row를 반환하면 service가 방어적으로 reject하도록 테스트한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/analysis/second-pass.test.ts src/features/analysis/rag-service.test.ts`

Expected: FAIL because modules do not exist.

- [ ] **Step 3: embedding과 retrieval을 구현한다**

```ts
const { OPENAI_EMBEDDING_MODEL } = getServerEnv();
const embedding = await client.embeddings.create({
  model: OPENAI_EMBEDDING_MODEL,
  input: text.replaceAll("\n", " "),
  encoding_format: "float",
});
```

vector 길이가 1536이 아니면 저장하지 않고 명시적 schema error를 반환한다. RPC에는 authenticated workspace ID, threshold `0.78`, limit `5`를 전달한다. 반환 예시마다 feedback ID와 similarity를 Stage 2 provenance에 저장한다.

- [ ] **Step 4: Stage 2 Structured Output과 최종 결과 저장을 구현한다**

Stage 2 input은 source, thread/video context, Stage 1, rule signals, policy version, 최대 5개 retrieved examples만 포함한다. provider는 `Stage2OutputSchema`와 `zodTextFormat(..., "comment_stage_2")`를 사용한다. 응답 review level에는 다시 `applyReviewFloor`를 적용한다. Stage 1 row를 update하지 않고 새 stage-2 `model_runs`, `comment_analyses`, `sanitized_feedback` row를 만든다.

pure abuse가 `abusive_no_signal`이면 `sanitizedFeedback=null`; 유용한 의미가 확인된 경우만 neutral text를 저장한다.

- [ ] **Step 5: tests와 커밋을 수행한다**

Run:

```bash
npm test -- src/features/analysis
npm run db:test
git add src/features/analysis supabase
git commit -m "feat: personalize caution and risk analysis with creator RAG"
```

Expected: all trigger, top-5, threshold, tenant isolation, Stage 1 preservation tests PASS.

---

### Task 11: Comment Inbox, 원문 숨김, creator correction과 embedding

**Files:**
- Create: `src/features/inbox/inbox-query.ts`
- Create: `src/features/inbox/comment-inbox.tsx`
- Create: `src/features/inbox/source-reveal.tsx`
- Create: `src/app/api/comments/[commentId]/source/route.ts`
- Create: `src/app/(product)/app/inbox/page.tsx`
- Create: `src/app/(product)/app/inbox/actions.ts`
- Create: `src/features/feedback/feedback-service.ts`
- Test: `src/features/inbox/inbox-query.test.ts`
- Test: `src/features/inbox/source-reveal.test.tsx`
- Test: `src/features/feedback/feedback-service.test.ts`

**Interfaces:**
- Produces: `getInboxPage(filters)`, `saveCreatorCorrection(input)`, protected source endpoint.
- Consumes: final analysis, sanitized feedback, raw source, embedding provider.

- [ ] **Step 1: default filter·hidden source·append-only correction 실패 테스트를 작성한다**

```ts
it("defaults to caution and risk", async () => {
  await getInboxPage({ workspaceId: "w1", searchParams: {} }, repository);
  expect(repository.query).toHaveBeenCalledWith(
    expect.objectContaining({ reviewLevels: ["caution", "risk"] }),
  );
});

it("does not render harmful source before confirmation", () => {
  render(<SourceReveal commentId="c1" />);
  expect(screen.queryByText("source harmful text")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "원문 확인" })).toBeInTheDocument();
});

it("inserts feedback without changing historical analysis", async () => {
  await saveCreatorCorrection(correction, dependencies);
  expect(repository.insertFeedback).toHaveBeenCalled();
  expect(repository.updateAnalysis).not.toHaveBeenCalled();
  expect(repository.updateRawComment).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/inbox src/features/feedback`

Expected: FAIL because inbox/feedback modules do not exist.

- [ ] **Step 3: URL 기반 Inbox query와 화면을 구현한다**

허용 filter는 review level, category, video, analysis state, action state, confidence range, search다. `current_comment_analyses` view를 사용해 Stage 2가 있으면 Stage 2, 없으면 최신 Stage 1을 comment의 현재 결과로 사용한다. search param 누락 시 levels는 `caution,risk`. list row에는 sanitized feedback, level text+icon, category, confidence, recommendation을 표시하고 source text는 HTML에 포함하지 않는다.

- [ ] **Step 4: 경고 후 source를 요청하는 endpoint를 구현한다**

`POST /api/comments/[commentId]/source`만 제공한다. route는 `requireViewer`, comment workspace, `acknowledged=true` body를 검증하고 `{ textDisplay, textOriginal, capturedAt }`를 반환한다. client는 경고 dialog에서 “유해한 표현이 포함될 수 있습니다”를 보여주고 사용자가 확인한 뒤에만 POST한다.

- [ ] **Step 5: correction·personalization을 구현한다**

correction form은 category, review level, recommended action, sanitized feedback, `use_for_personalization`, `use_for_training`을 분리한다. feedback row insert 후 personalization=true인 경우에만 `source comment text + creator decision + corrected category/level + edited sanitized feedback`으로 retrieval document를 만들고 embedding해 `feedback_embeddings`에 저장한다. 이 document는 OpenAI request 외의 log에 남기지 않고 DB에는 vector와 model ID만 저장한다. training=true는 표시만 저장하고 어떤 training API도 호출하지 않는다.

- [ ] **Step 6: tests, accessibility query, commit을 수행한다**

Run:

```bash
npm test -- src/features/inbox src/features/feedback
npm run lint
git add src/features/inbox src/features/feedback "src/app/(product)/app/inbox" src/app/api/comments
git commit -m "feat: add a personalized and source-safe Comment Inbox"
```

Expected: default queue, source absence, correction immutability, consent separation tests PASS.

---

### Task 12: 실제 creator dashboard와 연결·job 상태

**Files:**
- Create: `src/features/dashboard/dashboard-query.ts`
- Create: `src/features/dashboard/dashboard-summary-service.ts`
- Create: `src/features/dashboard/dashboard-view.tsx`
- Modify: `src/features/analysis/openai-analysis-provider.ts`
- Modify: `src/app/(product)/app/page.tsx`
- Test: `src/features/dashboard/dashboard-query.test.ts`
- Test: `src/features/dashboard/dashboard-summary-service.test.ts`
- Test: `src/features/dashboard/dashboard-view.test.tsx`

**Interfaces:**
- Produces:

```ts
type DashboardData =
  | { state: "disconnected" }
  | { state: "connected_empty"; channel: ChannelSummary }
  | {
      state: "ready";
      channel: ChannelSummary;
      video: VideoSummary | null;
      metrics: {
        imported: number;
        analyzed: number;
        caution: number;
        risk: number;
      };
      latestImport: JobSummary | null;
      latestAnalysis: JobSummary | null;
      priorityComments: InboxSummary[];
      recentCorrections: FeedbackSummary[];
      recentActions: ActionSummary[];
      aiSummary: string | null;
    };
```

- Consumes: persisted Supabase data only.

- [ ] **Step 1: fake metric 방지 실패 테스트를 작성한다**

```tsx
it("shows no metrics when disconnected", () => {
  render(<DashboardView data={{ state: "disconnected" }} />);
  expect(screen.queryByText("가져온 댓글")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "YouTube 연결하기" })).toBeInTheDocument();
});

it("renders only repository metrics when ready", () => {
  render(<DashboardView data={readyData({ imported: 37, analyzed: 35, caution: 8, risk: 2 })} />);
  expect(screen.getByText("37")).toBeInTheDocument();
  expect(screen.getByText("35")).toBeInTheDocument();
  expect(screen.queryByText("25,627")).not.toBeInTheDocument();
});

it("does not create an AI summary before ten final analyses", async () => {
  repository.countFinalAnalyses.mockResolvedValue(9);
  await summaryService.createForCompletedJob("job-1");
  expect(provider.summarizeDashboard).not.toHaveBeenCalled();
  expect(repository.insertSummary).not.toHaveBeenCalled();
});

it("stores a model-backed summary from real derived signals", async () => {
  repository.countFinalAnalyses.mockResolvedValue(10);
  repository.getSummaryInputs.mockResolvedValue({
    distribution: { safe: 6, caution: 3, risk: 1 },
    sanitizedSignals: ["배송 안내 질문이 반복됨", "자막 크기 개선 요청"],
  });
  provider.summarizeDashboard.mockResolvedValue(summaryModelResult);
  await summaryService.createForCompletedJob("job-1");
  expect(repository.insertSummary).toHaveBeenCalledWith(
    expect.objectContaining({
      analysisJobId: "job-1",
      sourceAnalysisCount: 10,
      summaryText: summaryModelResult.output.summary,
    }),
  );
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/dashboard`

Expected: FAIL because dashboard modules do not exist.

- [ ] **Step 3: 실제 derived data만 사용하는 AI summary를 구현한다**

analysis job이 terminal 상태가 된 뒤 final analysis가 10개 이상이고 해당 job summary가 없을 때만 `summarizeDashboard`를 호출한다. 입력은 `safe/caution/risk` count와 `sanitized_feedback.neutral_text` 최대 20개이며 raw harmful source는 보내지 않는다. Structured Output은 `DashboardSummaryOutputSchema`, prompt version은 `commenthawk-dashboard-summary-v1`이다. provider/model/response/prompt/schema/usage를 `workspace_analysis_summaries`에 함께 저장한다.

final analysis가 10개 미만이면 provider 호출 없이 `null`을 반환한다. 같은 `analysis_job_id` 재호출은 unique constraint로 기존 summary를 반환한다.

- [ ] **Step 4: 한 RPC read model과 dashboard states를 구현한다**

`get_dashboard_summary(workspace_id)`는 RLS membership을 확인하고 `current_comment_analyses` 기준 imported/analyzed/caution/risk, latest jobs, selected channel/video를 같은 persisted snapshot에서 반환한다. AI summary는 final analyses가 10개 이상일 때만 생성·저장된 summary를 사용하며 즉석에서 임의 문장을 만들지 않는다. 10개 미만이면 `null`과 “분석이 더 쌓이면 요약이 표시됩니다”를 렌더한다.

- [ ] **Step 5: BrandBastion 느낌의 실제 dashboard를 구현한다**

브라우저형 landing preview와 달리 app dashboard는 조밀한 4개 metric card, channel health, selected video, import/analysis progress, 안전·주의·위험 분포, priority comments, recent corrections/actions, Inbox CTA를 렌더한다. 모든 card에는 실제 query result만 전달한다.

- [ ] **Step 6: tests와 커밋을 수행한다**

Run:

```bash
npm test -- src/features/dashboard
npm run lint
git add src/features/dashboard "src/app/(product)/app/page.tsx" supabase
git commit -m "feat: show the creator dashboard from persisted data"
```

Expected: disconnected/empty/ready states PASS and no example metric appears in authenticated UI.

---

### Task 13: 증거 보존, 명시적 확인, 실제 YouTube moderation

**Files:**
- Create: `src/features/moderation/contracts.ts`
- Create: `src/features/moderation/moderation-service.ts`
- Create: `src/features/moderation/moderation-dialog.tsx`
- Create: `src/app/(product)/app/inbox/moderation-actions.ts`
- Create: `src/app/api/youtube/oauth/moderation/route.ts`
- Test: `src/features/moderation/moderation-service.test.ts`
- Test: `src/features/moderation/moderation-dialog.test.tsx`

**Interfaces:**
- Produces:

```ts
type ModerationAction = "hold_for_review" | "publish" | "reject" | "delete";
type ActionResult = {
  requestId: string;
  state: "succeeded" | "failed";
  providerStatus: number | null;
  executedAt: string | null;
  errorCode: string | null;
};

requestModeration(input: {
  workspaceId: string;
  rawCommentId: string;
  action: ModerationAction;
  actorUserId: string;
}): Promise<{ requestId: string; state: "pending_confirmation" | "awaiting_scope" }>;

confirmModeration(input: {
  workspaceId: string;
  requestId: string;
  actorUserId: string;
  confirmation: "I_UNDERSTAND";
}): Promise<ActionResult>;
```

- Consumes: raw source, granted scopes, selected channel, YouTube provider.

- [ ] **Step 1: 순서·확인·권한·delete eligibility 실패 테스트를 작성한다**

```ts
it("creates evidence before calling YouTube", async () => {
  await service.requestModeration(requestInput);
  await service.confirmModeration(confirmedInput);
  expect(repository.insertEvidence.mock.invocationCallOrder[0]).toBeLessThan(
    provider.setModerationStatus.mock.invocationCallOrder[0],
  );
});

it("never calls YouTube without exact confirmation", async () => {
  await expect(
    service.confirmModeration({ ...confirmedInput, confirmation: "NO" as never }),
  ).rejects.toThrow("Explicit confirmation required");
  expect(provider.setModerationStatus).not.toHaveBeenCalled();
});

it("does not allow deleting a comment written by another channel", async () => {
  await expect(service.requestModeration(otherAuthorDelete)).rejects.toThrow(
    "Delete is available only for a comment authored by the connected channel",
  );
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npm test -- src/features/moderation`

Expected: FAIL because moderation modules do not exist.

- [ ] **Step 3: action mapping과 incremental authorization을 구현한다**

provider mapping:

```ts
const moderationStatus = {
  hold_for_review: "heldForReview",
  publish: "published",
  reject: "rejected",
} as const;
```

이 세 action은 `comments.setModerationStatus`, delete는 `comments.delete`를 사용한다. `youtube.force-ssl` scope가 없으면 action request를 `awaiting_scope`로 저장하고 `/api/youtube/oauth/moderation?requestId=...`로 보낸다. callback 이후 같은 request를 자동 실행하지 않고 다시 confirmation 화면으로 돌아온다.

- [ ] **Step 4: evidence → confirmation → execution → audit를 transaction 경계로 구현한다**

request 단계는 raw source와 현재 analysis를 snapshot한 evidence row를 생성하고 `pending_confirmation` request를 반환한다. confirm 단계는 actor/workspace/state/idempotency를 확인한 뒤 provider를 호출한다. 성공·실패 모두 provider response의 비민감 메타데이터와 content-free audit event를 기록한다. 성공한 request 재호출은 provider를 다시 호출하지 않고 저장 결과를 반환한다.

- [ ] **Step 5: 정확한 한국어 조치 UI를 구현한다**

버튼은 `검토 대기로 이동`, `게시 승인`, `거절하여 숨기기`, eligibility가 있는 경우만 `내 댓글 영구 삭제`로 표시한다. dialog는 원문 표시 여부와 무관하게 조치 대상 ID, 결과, 되돌림 제약, 필요한 scope, “AI 추천이며 최종 실행은 본인 결정”을 보여주고 explicit checkbox가 선택되어야 confirm button이 활성화된다.

- [ ] **Step 6: tests와 커밋을 수행한다**

Run:

```bash
npm test -- src/features/moderation
npm run lint
git add src/features/moderation "src/app/(product)/app/inbox/moderation-actions.ts" src/app/api/youtube/oauth/moderation
git commit -m "feat: require evidence and confirmation for YouTube moderation"
```

Expected: evidence order, missing confirmation, scope, idempotency, delete eligibility tests PASS.

---

### Task 14: 최소 60개 한국어 평가 세트와 자동 릴리스 게이트

**Files:**
- Create: `src/evaluation/schema.ts`
- Create: `src/evaluation/korean-comment-cases.json`
- Create: `src/evaluation/run-evaluation.ts`
- Create: `src/evaluation/run-evaluation.test.ts`

**Interfaces:**
- Produces: `evaluateCases(cases, outputs): EvaluationReport`.
- Consumes: `Stage2OutputSchema`.

- [ ] **Step 1: 평가 파일 schema와 gate 실패 테스트를 작성한다**

```ts
export const EvaluationCaseSchema = z.object({
  id: z.string().regex(/^ko-\d{3}$/),
  text: z.string().min(1),
  context: z.string(),
  expectedCategories: z.array(CommentCategorySchema).min(1),
  forbiddenReviewLevels: z.array(ReviewLevelSchema),
  expectActionableFeedback: z.boolean(),
  expectedSanitizedFeedback: z.enum(["required", "forbidden", "optional"]),
  reviewedBy: z.string().min(1),
  reviewedAt: z.iso.datetime(),
});
```

테스트는 다음 gate를 exact 0으로 요구한다.

```ts
expect(report.rawSourceMutations).toBe(0);
expect(report.crossWorkspaceLeaks).toBe(0);
expect(report.unconfirmedModerationCalls).toBe(0);
expect(report.fabricatedFeedbackOnPureAbuse).toBe(0);
expect(report.clearlyRiskyMarkedSafe).toBe(0);
expect(report.schemaFailuresAfterRetry).toBe(0);
```

- [ ] **Step 2: 60개 평가 case를 균형 있게 작성하고 사람 검토를 받는다**

exact 분포:

| 범주 | 개수 |
|---|---:|
| 긍정·중립 | 8 |
| 질문 | 6 |
| 건설적 피드백 | 8 |
| 욕설이 섞인 유용한 피드백 | 8 |
| 순수 악성 | 8 |
| 비꼼·간접 공격 | 6 |
| 친근한 은어·채널 문맥 | 4 |
| 띄어쓰기·반복문자 변형 | 4 |
| 광고·반복·phishing | 5 |
| harassment·threat | 3 |
| **합계** | **60** |

모든 문장은 실제 사용자의 댓글을 복사하지 않은 합성 fixture로 작성한다. `reviewedBy`와 `reviewedAt`은 한국어 화자 검토가 끝난 뒤에만 입력한다. 값이 비어 있으면 `test:eval`이 실패하게 해 “human-reviewed”를 거짓으로 표시하지 않는다.

- [ ] **Step 3: runner와 recorded/live 두 mode를 구현한다**

기본 CI는 deterministic recorded output을 검증하고, `RUN_LIVE_OPENAI_EVAL=true`일 때만 configured OpenAI provider를 호출한다. live 결과는 production RAG에 insert하지 않는다. report에는 category 허용 여부, review-level 금지 위반, actionable flag, sanitized feedback 존재 규칙을 case별로 기록한다.

- [ ] **Step 4: 평가를 실행한다**

Run: `npm run test:eval`

Expected: 60 cases parsed, human review fields present, six zero-tolerance gates PASS. 품질 지표가 기준을 못 넘으면 모델이나 prompt를 임의로 숨기지 않고 report와 prompt/model version을 남긴다.

- [ ] **Step 5: 커밋한다**

```bash
git add src/evaluation package.json
git commit -m "test: add reviewed Korean comment evaluation gates"
```

---

### Task 15: integration, Playwright vertical slice, 접근성·desktop 검증

**Files:**
- Create: `playwright.config.ts`
- Create: `e2e/helpers/supabase-mail.ts`
- Create: `e2e/fixtures/providers.ts`
- Create: `e2e/vertical-slice.spec.ts`
- Create: `src/features/youtube/fixture-youtube-provider.ts`
- Create: `src/features/analysis/fixture-analysis-provider.ts`
- Modify: `src/features/youtube/provider-factory.ts`
- Modify: `src/features/analysis/analysis-provider.ts`

**Interfaces:**
- Produces: local-only deterministic external providers and full browser proof.
- Consumes: all previous tasks.

- [ ] **Step 1: fixture provider 안전 경계를 테스트한다**

```ts
it("refuses fixture providers outside test mode", () => {
  expect(() =>
    createProviderFactory({
      externalProviderMode: "fixture",
      nodeEnv: "production",
      allowFixtureProviders: true,
    }),
  ).toThrow("Fixture providers are test-only");
});
```

- [ ] **Step 2: Playwright config와 local magic-link helper를 구현한다**

Playwright는 Chromium `1440x900`과 `1280x800` 두 project를 사용한다. `webServer.command`는 `ALLOW_FIXTURE_PROVIDERS=true EXTERNAL_PROVIDER_MODE=fixture npm run dev`, base URL은 `http://127.0.0.1:3000`이다. provider factory는 `NODE_ENV=production`이면 이 flag와 무관하게 fixture를 거부한다. helper는 local Inbucket API에서 test recipient의 최신 email을 읽어 callback link를 반환한다. production Supabase나 실제 email을 사용하지 않는다.

- [ ] **Step 3: 외부 fixture를 정확한 contract로 구현한다**

fixture YouTube는 후보 채널 2개, 영상 2개, top-level 20개, reply 3개, `주의`와 `위험`이 섞인 payload를 반환한다. fixture OpenAI는 Stage 1/2 Zod schema를 통과하는 deterministic output과 1536-dimension embedding을 반환한다. 화면 또는 test log에는 `TEST FIXTURE` 표식을 둔다.

- [ ] **Step 4: full vertical slice browser test를 작성한다**

```ts
test("landing to confirmed moderation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("region", { name: "제품 예시 화면" })).toBeVisible();
  await page.getByRole("link", { name: "시작하기" }).first().click();

  await requestAndOpenMagicLink(page, "creator@example.com");
  await expect(page.getByRole("heading", { name: "YouTube 채널을 연결해 첫 댓글을 가져오세요" })).toBeVisible();

  await page.getByRole("link", { name: "YouTube 연결하기" }).click();
  await page.getByRole("radio", { name: "테스트 크리에이터 채널" }).check();
  await page.getByRole("button", { name: "이 채널 사용" }).click();

  await page.getByRole("link", { name: "영상" }).click();
  await page.getByRole("radio", { name: /첫 번째 테스트 영상/ }).check();
  await page.getByLabel("가져올 상위 댓글 수").fill("20");
  await page.getByRole("button", { name: "댓글 가져오기" }).click();
  await expect(page.getByText("가져오기 완료")).toBeVisible();
  await expect(page.getByText("분석 완료")).toBeVisible();

  await page.getByRole("link", { name: "댓글 Inbox" }).click();
  await expect(page.getByRole("heading", { name: "검토 필요" })).toBeVisible();
  await expect(page.getByText("source harmful text")).not.toBeVisible();
  await page.getByRole("button", { name: "원문 확인" }).click();
  await page.getByRole("button", { name: "경고를 이해하고 확인" }).click();

  await page.getByLabel("검토 단계").selectOption("caution");
  await page.getByRole("button", { name: "수정 저장" }).click();
  await page.getByRole("button", { name: "거절하여 숨기기" }).click();
  await page.getByLabel("조치 결과를 이해했습니다").check();
  await page.getByRole("button", { name: "확인하고 실행" }).click();
  await expect(page.getByText("YouTube 조치가 기록되었습니다")).toBeVisible();
});
```

- [ ] **Step 5: keyboard·focus·fake metric assertions를 추가한다**

Tab만으로 landing CTA, channel radio, video radio, Inbox filters, reveal dialog, confirmation dialog를 이동한다. `안전/주의/위험`은 text가 존재하는지, disconnected dashboard에 숫자 card가 없는지, 1280 viewport에서 horizontal scroll이 없는지 검사한다.

- [ ] **Step 6: 모든 오류 상태의 provider fixture와 browser assertion을 추가한다**

각 fixture mode와 화면 문구를 다음처럼 고정한다.

| Fixture state | Expected user-visible text | Retry |
|---|---|---|
| no channel | `연결 가능한 YouTube 채널을 찾지 못했습니다` | reconnect |
| no video | `가져올 수 있는 영상이 없습니다` | no |
| comments disabled | `이 영상은 댓글이 사용 중지되어 있습니다` | no |
| revoked token | `YouTube 권한이 만료되었거나 취소되었습니다` | reconnect |
| quota exhausted | `YouTube API 할당량을 모두 사용했습니다` | state change 후 |
| partial import | `일부 댓글만 가져왔습니다` | failed items |
| OpenAI 429 | `분석 요청이 지연되고 있습니다` | 최대 3회 |
| schema invalid twice | `일부 댓글의 분석 형식을 확인하지 못했습니다` | manual retry |
| moderation scope missing | `댓글 조치 권한이 추가로 필요합니다` | incremental OAuth |

각 상태가 다른 상태의 문구나 fake metric을 렌더하지 않는지도 assertion한다.

- [ ] **Step 7: 전체 자동 검증을 실행한다**

Run:

```bash
npm run db:reset
npm test
npm run db:test
npm run test:eval
npm run test:e2e
npm run lint
npm run build
```

Expected: all unit/integration/RLS/eval/browser tests PASS; lint/build exit 0.

- [ ] **Step 8: 커밋한다**

```bash
git add playwright.config.ts e2e src/features/youtube src/features/analysis
git commit -m "test: verify the complete CommentHawk vertical slice"
```

---

### Task 16: 실제 Supabase·Google·YouTube·OpenAI 수동 검증과 릴리스 판정

**Files:**
- Create: `docs/manual-verification.md`
- Modify: `README.md`

**Interfaces:**
- Produces: 실제 channel/video/comment batch 검증 기록과 배포 전 체크리스트.
- Consumes: 전체 구현, 사용자 소유 테스트 채널, 실제 server credentials.

- [ ] **Step 1: manual verification 문서를 작성한다**

문서는 다음 설정과 예상 결과를 exact 순서로 기록한다.

```text
1. Supabase project URL/anon/service role을 배포 환경에만 설정
2. Google Cloud에서 YouTube Data API v3 활성화
3. OAuth callback을 /api/youtube/oauth/callback으로 등록
4. 처음에는 youtube.readonly만 승인
5. creator-controlled channel 하나 선택
6. 영상 하나와 20개 top-level 댓글 import
7. raw_comments와 raw_comment_payloads 수가 UI 결과와 일치하는지 확인
8. Stage 1은 모든 comment, Stage 2는 trigger comment만 실행됐는지 확인
9. Dashboard와 Inbox가 동일 persisted records를 표시하는지 확인
10. 원문 reveal 전 DOM에 source가 없는지 확인
11. moderation 선택 시 youtube.force-ssl 증분 동의가 발생하는지 확인
12. evidence가 action보다 먼저 생성됐는지 확인
13. 명시적 확인 후에만 rejected/heldForReview가 실제 YouTube에 반영되는지 확인
14. disconnect 후 token material은 사라지고 imported data는 유지되는지 확인
```

- [ ] **Step 2: 실제 20개 batch를 검증한다**

테스트용 creator-owned channel과 되돌릴 수 있는 test comment를 사용한다. 실제 channel ID, video ID, comment text, token은 문서나 git에 기록하지 않는다. 기록하는 값은 실행 시간, job ID, count, 상태, model/prompt/schema version, moderation action ID뿐이다.

Expected:

```text
requested_top_level_count = 20
duplicate raw rows after repeat import = 0
raw source mutation count = 0
cross-workspace leak count = 0
unconfirmed provider action count = 0
dashboard/inbox count mismatch = 0
```

- [ ] **Step 3: 공식 API 동작과 문구를 최종 대조한다**

- YouTube `commentThreads.list`: `maxResults` 1–100, `pageToken`, `textFormat=plainText`.
- YouTube moderation: `comments.setModerationStatus`와 `youtube.force-ssl`.
- YouTube delete: 연결 채널이 작성한 comment만 노출.
- OpenAI: `responses.parse` + `zodTextFormat`; embeddings는 configured embedding model과 1536 dimension 계약.

공식 문서:

- https://developers.google.com/youtube/v3/docs/commentThreads/list
- https://developers.google.com/youtube/v3/docs/comments/setModerationStatus
- https://developers.google.com/youtube/v3/docs/comments/delete
- https://developers.openai.com/api/docs/guides/structured-outputs
- https://developers.openai.com/api/docs/guides/embeddings

- [ ] **Step 4: 최종 자동 검증을 새로 실행한다**

Run:

```bash
npm test
npm run db:test
npm run test:eval
npm run test:e2e
npm run lint
npm run build
git status --short
```

Expected: 모든 command exit 0. `git status --short`에는 의도한 README/manual verification 변경만 남는다.

- [ ] **Step 5: README에 실제 지원 범위와 후속 범위를 기록한다**

README의 “현재 구현”은 YouTube 한 채널/한 영상/20–50 top-level 댓글/Stage 1·2/Comment Inbox/확인형 moderation만 열거한다. 모바일, 다중 플랫폼, billing, Q&A Radar, Signal Digest, full Evidence Vault, production fine-tuning은 “후속”으로 분리한다.

- [ ] **Step 6: 최종 문서 커밋을 만든다**

```bash
git add README.md docs/manual-verification.md
git commit -m "docs: add real provider verification and release gates"
```

---

## Final Self-Review Checklist

- [ ] Spec 1–16절의 각 요구사항이 Task 1–16 중 하나에 연결되어 있다.
- [ ] 랜딩은 최소 화면 유지가 아니라 완전한 데스크톱 재구축으로 적혀 있다.
- [ ] landing preview와 authenticated dashboard의 데이터 경로가 분리되어 있다.
- [ ] raw source, raw payload, rule evaluation, model run, analysis, sanitized feedback, creator feedback, embedding, evidence, action, audit가 분리되어 있다.
- [ ] top-level 20–50과 추가 reply의 count 의미가 명시되어 있다.
- [ ] `safe/caution/risk`와 `안전/주의/위험` mapping이 일치한다.
- [ ] Stage 2의 `0.85`, `0.78`, top 5 기준이 모든 task와 type에서 일치한다.
- [ ] OpenAI model은 환경변수로 선택하고 model/prompt/schema/policy version을 저장한다.
- [ ] personalization과 training consent가 분리되고 training API 호출은 없다.
- [ ] same-workspace RAG와 cross-workspace denial이 SQL·unit·browser에서 검증된다.
- [ ] evidence가 YouTube 호출보다 먼저이며 confirmation 없이는 provider가 호출되지 않는다.
- [ ] YouTube API가 지원하지 않는 `markAsSpam` 또는 모호한 `hide` 동작을 사용하지 않는다.
- [ ] disconnected authenticated 화면에 예시 수치가 없다.
- [ ] 모바일, billing, 다중 플랫폼, 후속 dashboard가 이번 구현에 섞이지 않는다.
- [ ] `npm test`, `db:test`, `test:eval`, `test:e2e`, `lint`, `build`가 release gate에 포함된다.
