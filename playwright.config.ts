import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

import { E2E_DEVELOPER_USER_ID } from "./e2e/fixtures/providers";

loadEnvConfig(process.cwd());
const port = process.env.E2E_PORT || "3000";
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testIgnore: ["**/*.test.ts"],
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-1440",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-1280",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
  webServer: {
    command:
      `CROWDSIFT_DIST_DIR=.next-e2e APP_ORIGIN=${baseURL} GOOGLE_REDIRECT_URI=${baseURL}/api/youtube/oauth/callback ALLOW_FIXTURE_PROVIDERS=true ENABLE_DEVELOPER_TOOLS=true ENABLE_PUBLIC_YOUTUBE_DEV_MODE=true EXTERNAL_PROVIDER_MODE=fixture DEVELOPER_USER_IDS=${E2E_DEVELOPER_USER_ID} npm run dev -- --port ${port}`,
    url: baseURL,
    reuseExistingServer: process.env.E2E_REUSE_SERVER === "true",
    timeout: 120_000,
  },
});
