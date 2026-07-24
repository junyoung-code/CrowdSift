import { expect, test } from "@playwright/test";

import { FIXTURE_LABEL } from "./fixtures/providers";
import { requestAndOpenMagicLink } from "./helpers/supabase-mail";

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

  const email = `public-flow-${Date.now()}@example.com`;
  await page.goto("/auth/sign-in");
  await requestAndOpenMagicLink(page, email);

  await page.goto("/app/connect/youtube");
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
    page.locator(".public-video-preview-state").getByText(FIXTURE_LABEL),
  ).toBeVisible();
  await expect(page.getByText("공개 댓글 1,107개")).toBeVisible();

  await page
    .getByRole("button", { name: "댓글 가져오기 및 분석 시작" })
    .click();

  const progress = page.getByRole("region", {
    name: "공개 댓글 가져오기 진행 상태",
  });
  await expect(progress.getByRole("heading", { name: "댓글 분석 완료" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(progress.getByText("확인 20")).toBeVisible();
  await expect(progress.getByText("최상위 16")).toBeVisible();
  await expect(progress.getByText("답글 4")).toBeVisible();

  await progress
    .getByRole("link", { name: "Comment Inbox에서 보기" })
    .click();
  await expect(page.getByRole("heading", { name: "Comment Inbox" })).toBeVisible();
  await expect(page.getByText("공개 URL").first()).toBeVisible();
  await expect(page.getByText("읽기 전용").first()).toBeVisible();
  await expect(
    page.getByText(
      "공개 URL 댓글에서 YouTube 조치는 사용할 수 없습니다. 숨김·삭제는 해당 채널 소유자의 권한이 필요합니다.",
    ).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "거절하여 숨기기" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "내 댓글 영구 삭제" }),
  ).toHaveCount(0);
  expect(externalRequests).toEqual([]);
});
