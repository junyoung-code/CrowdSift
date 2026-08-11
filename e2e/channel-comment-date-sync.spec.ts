import { expect, test, type Page } from "@playwright/test";

import { FIXTURE_CHANNEL_NAME, FIXTURE_LABEL } from "./fixtures/providers";
import { requestAndOpenMagicLink } from "./helpers/supabase-mail";

const START_DATE = "2026-08-01";
const blockedExternalHosts = [
  "googleapis.com",
  "youtube.googleapis.com",
  "openai.com",
];

const connectFixtureYouTube = async (page: Page) => {
  const email = `channel-date-sync-${Date.now()}@example.com`;
  await page.goto("/auth/sign-in");
  await requestAndOpenMagicLink(page, email);
  await page.goto("/app/connect/youtube");
  await expect(page.getByRole("status").getByText(FIXTURE_LABEL)).toBeVisible();
  await page.getByRole("link", { name: "Google에서 연결하기" }).click();
  await expect(page).toHaveURL(/\/app\/connect\/youtube\?connected=1$/);
  await page
    .getByRole("radio", { name: new RegExp(FIXTURE_CHANNEL_NAME) })
    .check();
  await page.getByRole("button", { name: "이 채널 사용하기" }).click();
  await expect(
    page.getByRole("heading", { name: FIXTURE_CHANNEL_NAME }),
  ).toBeVisible();
};

test("backfills fixture channel comments to a date and re-runs without duplicate Inbox rows", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium-1440",
    "The stateful channel-sync vertical slice runs once.",
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

  await connectFixtureYouTube(page);
  await page.getByLabel("언제의 댓글부터 가져올까요?").fill(START_DATE);
  await page.getByRole("button", { name: "댓글 가져오기 시작" }).click();

  await expect(
    page.getByRole("heading", { name: "초기 댓글 수집 완료" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".channel-sync-live-status")).toHaveText(
    "채널의 새 댓글을 자동으로 확인합니다.",
    { timeout: 60_000 },
  );
  await expect(page.getByText("2026-08-01")).toBeVisible();

  await page.goto(
    "/app/inbox?levels=safe&levels=caution&levels=risk&analysis=analyzed",
  );
  await expect(page.getByRole("heading", { name: "Comment Inbox" })).toBeVisible();
  const inboxCards = page.locator(".inbox-queue-item");
  await expect(
    inboxCards.filter({ hasText: "2026-08-08 최신 채널 댓글" }),
  ).toHaveCount(1);
  await expect(
    inboxCards.filter({ hasText: "2026-08-01 시작 날짜 경계 댓글" }),
  ).toHaveCount(1);
  await expect(
    inboxCards.filter({ hasText: "2026-07-31 경계 이전 댓글" }),
  ).toHaveCount(0);
  const initialCardCount = await inboxCards.count();
  expect(initialCardCount).toBeGreaterThan(0);

  await page.goto("/app/connect/youtube");
  await page.getByRole("button", { name: "지금 동기화" }).click();
  const repeatResponse = await page.request.post(
    "/api/channel-comment-sync/process",
  );
  expect(repeatResponse.ok()).toBe(true);
  await page.reload();
  const storedMetric = page.locator(".channel-sync-metrics > div").filter({
    hasText: "신규 저장",
  });
  await expect(storedMetric.locator("dd")).toHaveText("0");

  await page.goto(
    "/app/inbox?levels=safe&levels=caution&levels=risk&analysis=analyzed",
  );
  await expect(inboxCards).toHaveCount(initialCardCount);
  expect(externalRequests).toEqual([]);
});
