import { expect, test } from "@playwright/test";

import {
  E2E_DEVELOPER_EMAIL,
  E2E_DEVELOPER_USER_ID,
  FIXTURE_LABEL,
} from "./fixtures/providers";
import {
  resetLocalAuthUser,
  requestAndOpenMagicLink,
} from "./helpers/supabase-mail";

const FIXTURE_PUBLIC_VIDEO_URL =
  "https://www.youtube.com/watch?v=fixture0001";
const blockedExternalHosts = [
  "googleapis.com",
  "youtube.googleapis.com",
  "openai.com",
];

test("imports and reviews 20 public comments without YouTube OAuth", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    testInfo.project.name !== "chromium-1440",
    "The public vertical slice runs once; responsive states are covered separately.",
  );

  const externalRequests: string[] = [];
  await page.route("**/*", async (route) => {
    const hostname = new URL(route.request().url()).hostname;
    if (
      blockedExternalHosts.some(
        (host) => hostname === host || hostname.endsWith(`.${host}`),
      )
    ) {
      externalRequests.push(route.request().url());
      await route.abort("blockedbyclient");
      return;
    }
    await route.continue();
  });

  await resetLocalAuthUser({
    email: E2E_DEVELOPER_EMAIL,
    id: E2E_DEVELOPER_USER_ID,
  });
  await page.goto("/auth/sign-in");
  await expect(
    page.getByRole("button", { name: "Google로 계속하기" }),
  ).toBeVisible();
  await requestAndOpenMagicLink(page, E2E_DEVELOPER_EMAIL);

  await page.goto("/app/developer-tools");
  await expect(page.getByRole("status").getByText(FIXTURE_LABEL)).toBeVisible();

  await page
    .getByLabel("공개 YouTube 영상 URL")
    .fill(FIXTURE_PUBLIC_VIDEO_URL);
  await expect(page.getByLabel("댓글 수")).toHaveValue("20");
  await page.getByRole("button", { name: "영상 확인" }).click();

  await expect(
    page.getByRole("heading", {
      name: "TEST FIXTURE · 공개 댓글 테스트 영상",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("article").getByText(FIXTURE_LABEL, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("공개 댓글 1,107개")).toBeVisible();

  await page
    .getByRole("button", { name: "댓글 가져오기 및 분석 시작" })
    .click();

  const progress = page.getByRole("region", {
    name: "공개 댓글 가져오기 진행 상태",
  });
  await expect(progress.getByText("완료", { exact: true })).toBeVisible({
    timeout: 60_000,
  });
  await expect(progress.getByText("확인 20")).toBeVisible();
  await expect(progress.getByText("최상위 18")).toBeVisible();
  await expect(progress.getByText("답글 2")).toBeVisible();

  await progress
    .getByRole("link", { name: "Comment Inbox에서 보기" })
    .click();
  await expect(page.getByRole("heading", { name: "Comment Inbox" })).toBeVisible();
  await expect(page.getByRole("link", { name: "댓글 Inbox" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page.getByText("공개 URL").first()).toBeVisible();
  await expect(page.getByText("읽기 전용").first()).toBeVisible();
  await expect(
    page.getByRole("button", { name: "거절하여 숨기기" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "내 댓글 영구 삭제" }),
  ).toHaveCount(0);

  await page.goto(
    "/app/inbox?levels=safe&levels=caution&levels=risk&analysis=analyzed",
  );
  await expect(
    page.getByText("오늘 영상도 편안하게 잘 봤어요."),
  ).toBeVisible();

  const protectedCard = page.getByRole("article").filter({ has: page.getByText("테스트 작성자 fixture-public-comment-4", { exact: true }) });
  await protectedCard.getByLabel("댓글 검토 및 조치", { exact: true }).click();
  await expect(
    protectedCard.getByText(
      "공개 URL 댓글에서 YouTube 조치는 사용할 수 없습니다. 채널 소유자 권한이 필요합니다.",
    ).first(),
  ).toBeVisible();
  await protectedCard.getByText("판단 과정", { exact: true }).click();
  await expect(protectedCard.getByText("의미 분석과 피드백 보존 기준")).toBeVisible();
  await expect(protectedCard.getByText("공격 제거 후 전달할 피드백이 남지 않음")).toBeVisible();
  await expect(
    protectedCard.getByText("테스트 작성자 fixture-public-comment-4", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(protectedCard).toBeVisible();
  await expect(
    protectedCard.getByText("source harmful text"),
  ).toHaveCount(0);
  await protectedCard.getByRole("button", { name: "원문 보기", exact: true }).click();
  await protectedCard
    .getByRole("button", { name: "경고를 확인하고 원문 보기" })
    .click();
  await expect(
    protectedCard.getByText("source harmful text"),
  ).toBeVisible();
  await expect(
    protectedCard.getByRole("button", { name: "원문 접기" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "로그아웃" }).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);

  await page.goto("/app");
  await expect(page).toHaveURL(/\/auth\/sign-in\?next=%2Fapp$/);
  await expect(
    page.getByRole("heading", { name: "CrowdSift에 로그인" }),
  ).toBeVisible();
  expect(externalRequests).toEqual([]);
});
