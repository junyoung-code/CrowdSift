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
  await expect(
    page.getByRole("link", { name: "개요", exact: true }),
  ).toHaveCSS(
    "background-color",
    "rgba(75, 111, 255, 0.16)",
  );
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("crowdsift-product-theme")),
    )
    .toBe("dark");

  const hydrationMessages: string[] = [];
  page.on("console", (message) => {
    if (/hydration|server rendered|did not match/i.test(message.text())) {
      hydrationMessages.push(message.text());
    }
  });

  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => localStorage.getItem("crowdsift-product-theme")),
    )
    .toBe("dark");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("button", { name: "다크 모드 사용" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(hydrationMessages).toEqual([]);

  await page.goto("/app/inbox");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(
    page.getByRole("heading", { name: "Comment Inbox" }),
  ).toBeVisible();

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
