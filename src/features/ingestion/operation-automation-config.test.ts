import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

describe("production comment automation configuration", () => {
  it("uses Supabase for the five-minute wake-up on Vercel Hobby", () => {
    const configuration = JSON.parse(
      readFileSync(resolve(process.cwd(), "vercel.json"), "utf8"),
    ) as {
      crons?: Array<{ path?: string; schedule?: string }>;
    };
    const runbook = readFileSync(
      resolve(process.cwd(), "docs/operation-automation-verification.md"),
      "utf8",
    );

    expect(configuration.crons).toBeUndefined();
    expect(runbook).toContain("'crowdsift-worker-five-minutes'");
    expect(runbook).toContain("'*/5 * * * *'");
    expect(runbook).toContain("crowdsift_cron_secret");
  });

  it("keeps the product sync interval fixed at sixty minutes in the database", () => {
    const migration = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/202608050033_channel_comment_sync.sql",
      ),
      "utf8",
    );

    expect(migration).toMatch(
      /sync_interval_minutes integer not null default 60\s+check \(sync_interval_minutes = 60\)/,
    );
  });
});
