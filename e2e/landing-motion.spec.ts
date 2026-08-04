import { expect, test } from "@playwright/test";

test("keeps analysis controls before the result panel at 390px", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const controls = page.locator(".analysis-story-steps");
  const resultPanel = page.locator(".analysis-story-visual");
  await expect(controls).toBeVisible();
  await expect(resultPanel).toBeVisible();

  const controlsBox = await controls.boundingBox();
  const resultBox = await resultPanel.boundingBox();
  expect(controlsBox).not.toBeNull();
  expect(resultBox).not.toBeNull();
  expect(controlsBox!.y).toBeLessThan(resultBox!.y);
});

test("keeps inactive desktop analysis stage text at full opacity", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/");

  const inactiveStage = page
    .getByRole("button", { name: /크리에이터 문맥/ })
    .first();
  await expect(inactiveStage).toBeVisible();
  await expect(inactiveStage).toHaveCSS("opacity", "1");
});
