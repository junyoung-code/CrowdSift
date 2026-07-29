# Product Light/Dark Theme Toggle Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 후 `/app/*` 전체에서 라이트 모드와 다크 모드를 선택하고, 우측 상단의 작은 토글로 즉시 전환하며, 새로고침과 앱 내부 이동 후에도 선택을 유지한다.

**Architecture:** 루트 레이아웃의 초기화 스크립트가 첫 화면이 그려지기 전에 브라우저 저장값을 읽어 `<html data-theme>`을 설정한다. 앱 셸의 Client Component 토글은 같은 값을 변경하고 `localStorage`에 저장하며, 모든 제품 화면은 `.product-shell` 아래의 의미 기반 CSS 토큰을 사용한다. 랜딩과 로그인 화면에는 제품 테마 토큰을 적용하지 않고, 서버·Supabase·사용자 프로필 스키마는 변경하지 않는다.

**Tech Stack:** Next.js 16.2.11 App Router, React 19.2.4, TypeScript 5, Vitest, Testing Library, Playwright, Phosphor Icons, global CSS

## Global Constraints

- 적용 범위는 로그인 후 `/app/*` 전체이며 랜딩·로그인 화면은 현재 라이트 스타일을 유지한다.
- 선택지는 `light`와 `dark` 두 개뿐이며 시스템 테마 자동 추종은 추가하지 않는다.
- 최초 방문과 유효하지 않은 저장값의 기본 테마는 `light`다.
- 선택값은 `localStorage`의 `crowdsift-product-theme` 키에만 저장하며 DB, 쿠키, Supabase 사용자 프로필은 변경하지 않는다.
- 데스크톱의 우측 상단 토글은 기존 연결 상태 또는 `TEST FIXTURE` 표시를 대체하거나 숨기지 않으며, 모바일에서는 최소한 `TEST FIXTURE` 배지를 보존한다.
- 토글은 아이콘만 보여도 `aria-label`, `aria-pressed`, 키보드 포커스 표시를 제공한다.
- 초기화 스크립트는 Next.js 16 로컬 가이드 `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md`의 theme 패턴을 따른다.
- 기존 Inbox의 유해 댓글 원문 숨김, 사용자 확인, 조치 확인 흐름은 변경하지 않는다.
- 새 런타임 의존성을 설치하지 않는다.
- 완료 보고 전 `npm run lint`와 `npm run build`를 실행한다.

## 화면·상호작용 명세

- 데스크톱: `product-topbar` 오른쪽의 연결 상태 표시 다음에 폭 약 68px, 높이 32px인 2분할 토글을 배치한다.
- 각 선택지는 해와 달 아이콘을 사용한다. 선택된 버튼만 CrowdSift 파란색 배경과 높은 대비를 사용한다.
- 라이트 버튼 레이블은 `라이트 모드 사용`, 다크 버튼 레이블은 `다크 모드 사용`으로 고정한다.
- 클릭 즉시 앱 셸, 사이드바, 카드, 입력창, Comment Inbox가 같은 테마로 바뀐다.
- 앱 내부 링크 이동과 새로고침 후에도 선택을 유지한다.
- 모바일(`max-width: 820px`): 기존 상단 바의 텍스트 영역은 접되 토글은 화면 우측 상단에 작게 유지한다. Fixture 모드라면 `TEST FIXTURE` 배지도 함께 보존한다.
- 테마 변경은 색상과 그림자만 바꾸며 레이아웃, 댓글 데이터, 필터 상태, 선택된 대화, 원문 공개 상태에는 영향을 주지 않는다.

## 파일 구조

- Create: `src/features/theme/product-theme.ts` — 테마 타입, 저장 키, DOM 적용 함수
- Create: `src/features/theme/product-theme.test.ts` — 유효성, DOM 반영, 저장 실패 안전성 테스트
- Create: `src/features/theme/product-theme-script.tsx` — 첫 페인트 전 초기화 스크립트
- Create: `src/features/theme/product-theme-script.test.tsx` — 저장값과 기본값 초기화 테스트
- Create: `src/features/theme/theme-toggle.tsx` — 우측 상단 라이트·다크 선택 UI
- Create: `src/features/theme/theme-toggle.test.tsx` — 접근성 상태와 클릭 동작 테스트
- Modify: `src/app/layout.tsx` — 기본 테마 속성, hydration 경고 억제, 초기화 스크립트 연결
- Modify: `src/features/app-shell/app-shell.tsx` — 상태 표시와 토글을 함께 담는 우측 액션 영역
- Modify: `src/features/app-shell/app-shell.test.tsx` — 앱 셸에서 토글 노출 검증
- Modify: `src/app/globals.css` — 제품 전역 테마 토큰, 토글, 반응형, Inbox 테마화
- Create: `e2e/product-theme.spec.ts` — 실제 앱 이동·새로고침·모바일 노출 검증

---

### Task 1: 테마 계약과 첫 페인트 초기화

**Files:**
- Create: `src/features/theme/product-theme.ts`
- Create: `src/features/theme/product-theme.test.ts`
- Create: `src/features/theme/product-theme-script.tsx`
- Create: `src/features/theme/product-theme-script.test.tsx`
- Modify: `src/app/layout.tsx`

**Interfaces:**
- Produces: `ProductTheme = "light" | "dark"`
- Produces: `PRODUCT_THEME_STORAGE_KEY = "crowdsift-product-theme"`
- Produces: `isProductTheme(value: unknown): value is ProductTheme`
- Produces: `readProductTheme(root?: HTMLElement): ProductTheme`
- Produces: `applyProductTheme(theme: ProductTheme, root?: HTMLElement, storage?: Storage): void`
- Produces: `PRODUCT_THEME_BOOTSTRAP_SCRIPT: string`
- Produces: `ProductThemeScript(): JSX.Element`

- [ ] **Step 1: 테마 계약의 실패 테스트 작성**

`src/features/theme/product-theme.test.ts`를 다음 동작으로 작성한다.

```ts
import { beforeEach, describe, expect, it } from "vitest";

import {
  applyProductTheme,
  isProductTheme,
  PRODUCT_THEME_STORAGE_KEY,
  readProductTheme,
} from "./product-theme";

describe("product theme", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.clear();
  });

  it("accepts only the supported themes", () => {
    expect(isProductTheme("light")).toBe(true);
    expect(isProductTheme("dark")).toBe(true);
    expect(isProductTheme("system")).toBe(false);
    expect(isProductTheme(null)).toBe(false);
  });

  it("reads the current valid document theme and otherwise falls back to light", () => {
    document.documentElement.dataset.theme = "dark";
    expect(readProductTheme()).toBe("dark");

    document.documentElement.dataset.theme = "unexpected";
    expect(readProductTheme()).toBe("light");
  });

  it("applies and persists the selected theme", () => {
    applyProductTheme("dark");

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      window.localStorage.getItem(PRODUCT_THEME_STORAGE_KEY),
    ).toBe("dark");
  });

  it("still applies the theme when browser storage is unavailable", () => {
    const unavailableStorage = {
      setItem() {
        throw new Error("storage unavailable");
      },
    } as Storage;

    expect(() =>
      applyProductTheme("dark", document.documentElement, unavailableStorage),
    ).not.toThrow();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
```

- [ ] **Step 2: 계약 테스트가 실패하는지 확인**

Run:

```bash
npx vitest run src/features/theme/product-theme.test.ts
```

Expected: `./product-theme` 모듈을 찾을 수 없어 FAIL.

- [ ] **Step 3: 최소 테마 계약 구현**

`src/features/theme/product-theme.ts`에 다음 구현을 추가한다.

```ts
export const PRODUCT_THEMES = ["light", "dark"] as const;
export type ProductTheme = (typeof PRODUCT_THEMES)[number];

export const PRODUCT_THEME_STORAGE_KEY = "crowdsift-product-theme";

export function isProductTheme(value: unknown): value is ProductTheme {
  return value === "light" || value === "dark";
}

export function readProductTheme(
  root: HTMLElement = document.documentElement,
): ProductTheme {
  return isProductTheme(root.dataset.theme) ? root.dataset.theme : "light";
}

export function applyProductTheme(
  theme: ProductTheme,
  root: HTMLElement = document.documentElement,
  storage: Storage = window.localStorage,
): void {
  root.dataset.theme = theme;

  try {
    storage.setItem(PRODUCT_THEME_STORAGE_KEY, theme);
  } catch {
    // DOM theme switching must keep working when storage is blocked.
  }
}
```

- [ ] **Step 4: 계약 테스트 통과 확인**

Run:

```bash
npx vitest run src/features/theme/product-theme.test.ts
```

Expected: 4 tests PASS.

- [ ] **Step 5: 초기화 스크립트 실패 테스트 작성**

`src/features/theme/product-theme-script.test.tsx`를 다음 동작으로 작성한다.

```tsx
import { beforeEach, describe, expect, it } from "vitest";

import { PRODUCT_THEME_STORAGE_KEY } from "./product-theme";
import { PRODUCT_THEME_BOOTSTRAP_SCRIPT } from "./product-theme-script";

describe("product theme bootstrap script", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.clear();
  });

  it("applies a stored dark theme before React hydrates", () => {
    window.localStorage.setItem(PRODUCT_THEME_STORAGE_KEY, "dark");

    new Function(PRODUCT_THEME_BOOTSTRAP_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("uses light for missing or invalid stored values", () => {
    window.localStorage.setItem(PRODUCT_THEME_STORAGE_KEY, "system");

    new Function(PRODUCT_THEME_BOOTSTRAP_SCRIPT)();

    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
```

- [ ] **Step 6: 초기화 스크립트 테스트가 실패하는지 확인**

Run:

```bash
npx vitest run src/features/theme/product-theme-script.test.tsx
```

Expected: `./product-theme-script` 모듈을 찾을 수 없어 FAIL.

- [ ] **Step 7: 초기화 스크립트와 루트 레이아웃 연결**

`src/features/theme/product-theme-script.tsx`를 생성한다.

```tsx
import { PRODUCT_THEME_STORAGE_KEY } from "./product-theme";

export const PRODUCT_THEME_BOOTSTRAP_SCRIPT = `(function(){try{var t=localStorage.getItem("${PRODUCT_THEME_STORAGE_KEY}");document.documentElement.dataset.theme=t==="dark"?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}})();`;

export function ProductThemeScript() {
  return (
    <script
      data-product-theme-bootstrap=""
      dangerouslySetInnerHTML={{ __html: PRODUCT_THEME_BOOTSTRAP_SCRIPT }}
    />
  );
}
```

`src/app/layout.tsx`에서 `ProductThemeScript`를 import하고 `<html>`과 `<head>`를 다음과 같이 구성한다. 기존 `lang`과 `data-scroll-behavior`는 보존한다.

```tsx
<html
  lang="ko"
  data-scroll-behavior="smooth"
  data-theme="light"
  suppressHydrationWarning
>
  <head>
    <ProductThemeScript />
  </head>
  <body>{children}</body>
</html>
```

- [ ] **Step 8: 초기화와 기존 루트 레이아웃 테스트 통과 확인**

Run:

```bash
npx vitest run src/features/theme/product-theme-script.test.tsx src/app/layout-scroll.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 9: Task 1 커밋**

```bash
git add src/app/layout.tsx src/features/theme/product-theme.ts src/features/theme/product-theme.test.ts src/features/theme/product-theme-script.tsx src/features/theme/product-theme-script.test.tsx
git commit -m "feat: bootstrap persistent product theme"
```

---

### Task 2: 우측 상단 라이트·다크 토글

**Files:**
- Create: `src/features/theme/theme-toggle.tsx`
- Create: `src/features/theme/theme-toggle.test.tsx`
- Modify: `src/features/app-shell/app-shell.tsx`
- Modify: `src/features/app-shell/app-shell.test.tsx`

**Interfaces:**
- Consumes: `ProductTheme`, `readProductTheme()`, `applyProductTheme()`
- Produces: `ThemeToggle(): JSX.Element`
- Produces: `.product-topbar-actions`, `.theme-toggle`, `.theme-toggle-button`, `.is-selected`

- [ ] **Step 1: 토글의 실패 테스트 작성**

`src/features/theme/theme-toggle.test.tsx`를 작성한다.

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";

import { PRODUCT_THEME_STORAGE_KEY } from "./product-theme";
import { ThemeToggle } from "./theme-toggle";

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.documentElement.dataset.theme = "light";
    window.localStorage.clear();
  });

  it("exposes the current theme as an accessible pressed state", () => {
    render(<ThemeToggle />);

    expect(
      screen.getByRole("button", { name: "라이트 모드 사용" }),
    ).toHaveAttribute("aria-pressed", "true");
    expect(
      screen.getByRole("button", { name: "다크 모드 사용" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("applies and stores the selected theme", async () => {
    const user = userEvent.setup();
    render(<ThemeToggle />);

    await user.click(
      screen.getByRole("button", { name: "다크 모드 사용" }),
    );

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(
      window.localStorage.getItem(PRODUCT_THEME_STORAGE_KEY),
    ).toBe("dark");
    expect(
      screen.getByRole("button", { name: "다크 모드 사용" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 2: 토글 테스트가 실패하는지 확인**

Run:

```bash
npx vitest run src/features/theme/theme-toggle.test.tsx
```

Expected: `./theme-toggle` 모듈을 찾을 수 없어 FAIL.

- [ ] **Step 3: 최소 토글 컴포넌트 구현**

`src/features/theme/theme-toggle.tsx`를 작성한다.

```tsx
"use client";

import { Moon, Sun } from "@phosphor-icons/react";
import { useState } from "react";

import {
  applyProductTheme,
  type ProductTheme,
  readProductTheme,
} from "./product-theme";

const options = [
  { theme: "light", label: "라이트 모드 사용", icon: Sun },
  { theme: "dark", label: "다크 모드 사용", icon: Moon },
] as const;

export function ThemeToggle() {
  const [theme, setTheme] = useState<ProductTheme>(() => readProductTheme());

  const selectTheme = (nextTheme: ProductTheme) => {
    applyProductTheme(nextTheme);
    setTheme(nextTheme);
  };

  return (
    <div className="theme-toggle" role="group" aria-label="화면 테마">
      {options.map(({ theme: optionTheme, label, icon: Icon }) => {
        const selected = theme === optionTheme;

        return (
          <button
            aria-label={label}
            aria-pressed={selected}
            className={`theme-toggle-button${selected ? " is-selected" : ""}`}
            key={optionTheme}
            onClick={() => selectTheme(optionTheme)}
            title={label}
            type="button"
          >
            <Icon aria-hidden="true" weight={selected ? "fill" : "regular"} />
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 4: 토글 테스트 통과 확인**

Run:

```bash
npx vitest run src/features/theme/theme-toggle.test.tsx
```

Expected: 2 tests PASS.

- [ ] **Step 5: 앱 셸 노출 실패 테스트 추가**

`src/features/app-shell/app-shell.test.tsx`의 첫 테스트에 다음 검증을 추가한다.

```tsx
expect(
  screen.getByRole("group", { name: "화면 테마" }),
).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "라이트 모드 사용" }),
).toBeInTheDocument();
expect(
  screen.getByRole("button", { name: "다크 모드 사용" }),
).toBeInTheDocument();
```

- [ ] **Step 6: 앱 셸 테스트가 실패하는지 확인**

Run:

```bash
npx vitest run src/features/app-shell/app-shell.test.tsx
```

Expected: `화면 테마` 그룹을 찾지 못해 FAIL.

- [ ] **Step 7: 앱 셸 우측 액션 영역에 토글 연결**

`src/features/app-shell/app-shell.tsx`에 `ThemeToggle`을 import한다. 기존 fixture/실제 연결 상태 분기를 삭제하지 말고 다음 구조로 감싼다.

```tsx
<div className="product-topbar-actions">
  {fixtureMode ? (
    <div className="product-fixture-status" role="status">
      <strong>TEST FIXTURE</strong>
      <span>로컬 테스트 데이터 · 실제 YouTube 데이터 아님</span>
    </div>
  ) : (
    <span className="product-status">
      <span aria-hidden="true" />
      실제 연결 데이터만 표시
    </span>
  )}
  <ThemeToggle />
</div>
```

- [ ] **Step 8: 테마·앱 셸 단위 테스트 통과 확인**

Run:

```bash
npx vitest run src/features/theme/theme-toggle.test.tsx src/features/app-shell/app-shell.test.tsx
```

Expected: 모든 테스트 PASS.

- [ ] **Step 9: Task 2 커밋**

```bash
git add src/features/theme/theme-toggle.tsx src/features/theme/theme-toggle.test.tsx src/features/app-shell/app-shell.tsx src/features/app-shell/app-shell.test.tsx
git commit -m "feat: add compact product theme toggle"
```

---

### Task 3: `/app/*` 전체의 의미 기반 색상 토큰 전환

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `<html data-theme="light|dark">`
- Consumes: `.product-topbar-actions`, `.theme-toggle`, `.theme-toggle-button`, `.is-selected`
- Produces: 제품 화면 전용 `--app-*` 토큰
- Produces: `[data-theme="dark"] .product-shell` 토큰 재정의
- Produces: Inbox가 공유 토큰에서 파생하는 `--inbox-*` 토큰

- [ ] **Step 1: 현재 Inbox 전용 테마 결합을 검출하는 실패 기준 기록**

Run:

```bash
rg -n "\\.product-shell:has\\(\\.inbox-page\\)|--inbox-bg: #070a10" src/app/globals.css
```

Expected: Inbox가 앱 셸 전체를 강제로 어둡게 만드는 기존 선택자와 하드코딩된 다크 토큰이 출력됨.

- [ ] **Step 2: 제품 셸의 라이트 토큰 정의**

기존 전역 `:root`는 랜딩·로그인용으로 유지하고, `.product-shell` 시작 부분에 다음 제품 전용 토큰을 추가한다.

```css
.product-shell {
  --app-canvas: #f4f8ff;
  --app-canvas-strong: #eef4fc;
  --app-surface: #ffffff;
  --app-surface-raised: #f9fbff;
  --app-surface-hover: #f2f6fc;
  --app-border: #dce6f5;
  --app-border-soft: #e8eef7;
  --app-text: #071936;
  --app-text-soft: #163154;
  --app-muted: #5b6b84;
  --app-shadow: 0 20px 58px rgb(35 76 140 / 10%);
  --app-topbar: rgb(255 255 255 / 88%);
  --app-blue-soft: #eaf2ff;
  --app-violet-soft: #f0ecff;
  --app-safe-soft: #e8f8f0;
  --app-caution-soft: #fff3dd;
  --app-risk-soft: #fff0f2;

  --ch-ink: var(--app-text);
  --ch-ink-soft: var(--app-text-soft);
  --ch-muted: var(--app-muted);
  --ch-surface: var(--app-surface);
  --ch-canvas: var(--app-canvas);
  --ch-border: var(--app-border);
  --ch-border-strong: var(--app-border);
  --ch-blue-soft: var(--app-blue-soft);
  --ch-violet-soft: var(--app-violet-soft);
  --ch-safe-soft: var(--app-safe-soft);
  --ch-caution-soft: var(--app-caution-soft);
  --ch-risk-soft: var(--app-risk-soft);

  color-scheme: light;
}
```

기존 `.product-shell`의 `display`, grid, 높이, background 선언은 같은 블록에 보존한다.

- [ ] **Step 3: 다크 제품 토큰 정의**

라이트 `.product-shell` 블록 바로 뒤에 다음 재정의를 추가한다.

```css
[data-theme="dark"] .product-shell {
  --app-canvas: #070a10;
  --app-canvas-strong: #0a0f17;
  --app-surface: #0d121b;
  --app-surface-raised: #121824;
  --app-surface-hover: #171e2a;
  --app-border: #252c38;
  --app-border-soft: #1b2230;
  --app-text: #f3f5f9;
  --app-text-soft: #c0c7d4;
  --app-muted: #7f8999;
  --app-shadow: 0 24px 72px rgb(0 0 0 / 34%);
  --app-topbar: rgb(9 13 20 / 90%);
  --app-blue-soft: rgb(75 111 255 / 16%);
  --app-violet-soft: rgb(155 135 245 / 14%);
  --app-safe-soft: rgb(22 121 74 / 18%);
  --app-caution-soft: rgb(167 91 9 / 20%);
  --app-risk-soft: rgb(201 55 79 / 18%);

  color-scheme: dark;
}
```

- [ ] **Step 4: 앱 셸의 중립색을 제품 토큰으로 치환**

다음 선택자의 중립 배경·테두리·텍스트를 지정된 토큰으로 치환한다. 브랜드 블루, YouTube 레드, 안전·주의·위험 의미색은 유지한다.

```css
.product-shell { background: var(--app-canvas); color: var(--app-text); }
.product-sidebar { border-color: var(--app-border); background: var(--app-surface); }
.product-brand { color: var(--app-text); }
.product-navigation a { color: var(--app-muted); }
.product-navigation a:hover { background: var(--app-surface-hover); color: var(--app-text-soft); }
.product-navigation a.is-active { background: var(--app-blue-soft); }
.product-sidebar-footer { border-color: var(--app-border); background: var(--app-surface-raised); }
.sign-out-control button { border-color: var(--app-border); background: var(--app-surface); color: var(--app-text-soft); }
.sign-out-control button:hover { background: var(--app-surface-hover); }
.product-topbar { border-color: var(--app-border); background: var(--app-topbar); }
.product-topbar strong { color: var(--app-text); }
.product-topbar p,
.product-status,
.product-fixture-status span { color: var(--app-muted); }
.product-main { background: var(--app-canvas); }
```

`product-topbar-actions`는 상태와 토글을 한 줄에 유지한다.

```css
.product-topbar-actions {
  display: flex;
  align-items: center;
  gap: 14px;
}
```

- [ ] **Step 5: 토글 스타일과 접근성 상태 구현**

다음 스타일을 앱 셸 스타일 근처에 추가한다.

```css
.theme-toggle {
  display: inline-grid;
  grid-template-columns: repeat(2, 28px);
  gap: 2px;
  border: 1px solid var(--app-border);
  border-radius: 999px;
  padding: 2px;
  background: var(--app-surface-raised);
  box-shadow: 0 8px 20px rgb(0 0 0 / 8%);
}

.theme-toggle-button {
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 0;
  border-radius: 999px;
  padding: 0;
  background: transparent;
  color: var(--app-muted);
  cursor: pointer;
}

.theme-toggle-button:hover {
  background: var(--app-surface-hover);
  color: var(--app-text);
}

.theme-toggle-button.is-selected {
  background: var(--ch-blue);
  color: white;
  box-shadow: 0 5px 12px rgb(36 107 254 / 24%);
}

.theme-toggle-button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--ch-blue) 50%, transparent);
  outline-offset: 2px;
}

.theme-toggle-button svg {
  width: 15px;
  height: 15px;
}
```

- [ ] **Step 6: 제품 카드와 입력 요소의 하드코딩된 중립색 치환**

`src/app/globals.css`의 제품 영역에서 다음 그룹을 토큰으로 통일한다.

- 기본 카드·패널: `.connection-empty-state`, `.dashboard-activity-grid > article`, `.data-deletion-form`, `.connected-channel-card`, `.public-video-panel`, `.video-empty-state`, `.video-import-card`, `.import-progress-card`, `.moderation-settings-card`, `.policy-form`, `.inbox-toolbar`, `.inbox-workspace`
  - 배경 `var(--app-surface)`, 테두리 `var(--app-border)`, 그림자 `var(--app-shadow)`
- 보조 카드·행·입력: `.empty-state-steps`, `.dashboard-video`, `.dashboard-job-facts span`, `.dashboard-list-empty`, `.deletion-boundary`, `.public-video-preview`, `.public-video-estimate > div`, `.public-import-progress`, `.video-options label`, `.import-explanation`, `.import-progress-grid > div`
  - 배경 `var(--app-surface-raised)`, 테두리 `var(--app-border-soft)`
- `input`, `select`, `textarea`, 보조 버튼의 제품 화면 규칙
  - 배경 `var(--app-surface-raised)`, 테두리 `var(--app-border)`, 텍스트 `var(--app-text)`, placeholder `var(--app-muted)`
- 구분선과 목록 경계
  - `#edf1f7`, `#eef3fa`, `#dce6f5` 같은 중립 경계를 `var(--app-border-soft)` 또는 `var(--app-border)`로 치환
- 상태 카드
  - 안전·주의·위험의 의미색과 `--app-safe-soft`, `--app-caution-soft`, `--app-risk-soft`를 사용하고 텍스트 의미는 바꾸지 않는다.

치환 후 제품 영역의 잔여 중립 하드코딩을 확인한다.

Run:

```bash
sed -n '1800,6300p' src/app/globals.css | rg -n "background: (white|#f[0-9a-f]{5}|#0[0-9a-f]{5})|color: #(0[0-9a-f]{5}|[789][0-9a-f]{5})|border[^;]*#[0-9a-f]{6}"
```

Expected: 브랜드색과 안전·주의·위험 의미색만 남고, 테마에 따라 바뀌어야 하는 중립색은 출력되지 않음.

- [ ] **Step 7: Inbox를 공용 테마 토큰으로 전환**

기존 `.product-shell:has(.inbox-page)` 블록 전체를 삭제한다. `.inbox-page`의 하드코딩된 다크 토큰은 다음처럼 공용 토큰에서 파생하도록 바꾼다.

```css
.inbox-page {
  --inbox-bg: var(--app-canvas-strong);
  --inbox-panel: var(--app-surface);
  --inbox-panel-raised: var(--app-surface-raised);
  --inbox-line: var(--app-border);
  --inbox-line-soft: var(--app-border-soft);
  --inbox-text: var(--app-text);
  --inbox-text-soft: var(--app-text-soft);
  --inbox-muted: var(--app-muted);
  --inbox-blue: var(--ch-blue);
  --inbox-blue-soft: var(--app-blue-soft);
  --inbox-violet: var(--ch-violet);
  --inbox-violet-soft: var(--app-violet-soft);
}
```

Inbox 컨테이너의 border와 shadow도 각각 `var(--app-border-soft)`, `var(--app-shadow)`를 사용한다. 기존 3열 workspace, 답글 수 표시, 상세 대화, 인사이트 패널의 레이아웃은 변경하지 않는다.

- [ ] **Step 8: 모바일 우측 상단 노출 구현**

기존 `@media (max-width: 820px)`의 `.product-topbar { display: none; }`를 제거하고 다음 compact 규칙으로 교체한다.

```css
@media (max-width: 820px) {
  .product-topbar {
    position: fixed;
    z-index: 40;
    top: 12px;
    right: 12px;
    min-height: 0;
    border: 0;
    padding: 0;
    background: transparent;
    backdrop-filter: none;
  }

  .product-topbar > div:first-child,
  .product-status,
  .product-fixture-status span {
    display: none;
  }

  .product-topbar-actions {
    gap: 8px;
  }

  .product-fixture-status {
    display: block;
  }
}
```

Fixture 모드에서는 `TEST FIXTURE`의 `<strong>` 배지를 보존한다. 실제 연결 상태 문구는 모바일에서 시각적으로 숨겨도 DOM의 의미를 변경하지 않는다.

- [ ] **Step 9: Inbox 전용 다크 결합이 제거됐는지 확인**

Run:

```bash
rg -n "\\.product-shell:has\\(\\.inbox-page\\)|--inbox-bg: #070a10" src/app/globals.css
```

Expected: 출력 없음, exit code 1.

- [ ] **Step 10: Task 3 커밋**

```bash
git add src/app/globals.css
git commit -m "feat: theme all product surfaces"
```

---

### Task 4: 브라우저 흐름과 회귀 검증

**Files:**
- Create: `e2e/product-theme.spec.ts`

**Interfaces:**
- Consumes: 접근 가능한 `화면 테마` 그룹
- Consumes: `data-theme="light|dark"`
- Consumes: `crowdsift-product-theme` localStorage 키
- Produces: 앱 이동, 새로고침, 모바일 노출에 대한 회귀 테스트

- [ ] **Step 1: 테마 E2E 테스트 작성**

`e2e/product-theme.spec.ts`를 작성한다.

```ts
import { expect, test } from "@playwright/test";

import { requestAndOpenMagicLink } from "./helpers/supabase-mail";

test("selects and persists a product theme across app pages", async ({
  page,
}) => {
  const email = `product-theme-${Date.now()}@example.com`;
  await page.goto("/auth/sign-in");
  await requestAndOpenMagicLink(page, email);

  await page.goto("/app");
  const themeGroup = page.getByRole("group", { name: "화면 테마" });
  await expect(themeGroup).toBeVisible();
  await expect(
    page.getByRole("button", { name: "라이트 모드 사용" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("button", { name: "다크 모드 사용" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "다크 모드 사용" }),
  ).toHaveAttribute("aria-pressed", "true");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.goto("/app/inbox");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.getByRole("heading", { name: "Comment Inbox" })).toBeVisible();

  await page.getByRole("button", { name: "라이트 모드 사용" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
});

test("keeps the compact theme control visible on a mobile viewport", async ({
  page,
}) => {
  const email = `product-theme-mobile-${Date.now()}@example.com`;
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/auth/sign-in");
  await requestAndOpenMagicLink(page, email);

  await page.goto("/app");
  await expect(
    page.getByRole("group", { name: "화면 테마" }),
  ).toBeVisible();
});
```

- [ ] **Step 2: 테마 E2E 테스트 실행**

로컬 Supabase가 실행 중인 상태에서 실행한다.

Run:

```bash
npx playwright test e2e/product-theme.spec.ts --project=chromium-1440
```

Expected: 2 tests PASS.

- [ ] **Step 3: 테마 관련 단위 테스트 전체 실행**

Run:

```bash
npx vitest run src/features/theme/product-theme.test.ts src/features/theme/product-theme-script.test.tsx src/features/theme/theme-toggle.test.tsx src/features/app-shell/app-shell.test.tsx src/app/layout-scroll.test.ts
```

Expected: 모든 테스트 PASS.

- [ ] **Step 4: 전체 단위 테스트 실행**

Run:

```bash
npm test
```

Expected: 모든 테스트 PASS.

- [ ] **Step 5: 정적 검사 실행**

Run:

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 6: 프로덕션 빌드 실행**

Run:

```bash
npm run build
```

Expected: Next.js production build 성공, TypeScript 오류 없음.

- [ ] **Step 7: 수동 시각 검증**

개발 서버에서 `/app`, `/app/inbox`, `/app/videos`, `/app/connect/youtube`, `/app/settings/moderation`, `/app/settings/data`를 각각 확인한다.

- 라이트와 다크에서 텍스트·카드·입력창·경계선의 대비가 유지된다.
- 우측 상단 토글이 연결 상태와 겹치지 않는다.
- 390px, 820px, 1280px, 1440px 너비에서 토글이 잘리거나 콘텐츠를 가리지 않는다.
- 다크에서 새로고침해도 밝은 화면이 먼저 번쩍이지 않는다.
- Inbox의 답글 수 표시와 대화 선택 동작이 두 테마에서 동일하다.
- 주의·위험 댓글의 원문은 테마 변경 전후 모두 기본적으로 숨겨져 있다.
- Fixture 모드에서는 `TEST FIXTURE` 표시가 데스크톱과 모바일 모두 보인다.

- [ ] **Step 8: Task 4 커밋**

```bash
git add e2e/product-theme.spec.ts
git commit -m "test: cover product theme persistence"
```

## 완료 기준

- `/app/*`의 모든 화면에서 한 번의 토글 선택으로 앱 전체 테마가 전환된다.
- 기본 테마는 라이트이며 다크 선택은 동일 브라우저의 새로고침과 앱 이동 후에도 유지된다.
- 라이트·다크 버튼은 보조기술이 현재 선택 상태를 알 수 있다.
- Inbox 진입 여부가 앱 셸 테마를 강제하지 않는다.
- 랜딩과 로그인은 제품 테마 선택에 영향받지 않는다.
- 테마 선택을 위해 DB 마이그레이션, 서버 API, 새 패키지를 추가하지 않는다.
- 관련 단위 테스트, E2E, 전체 테스트, lint, production build가 모두 통과한다.
