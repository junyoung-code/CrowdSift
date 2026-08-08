import { describe, expect, it } from "vitest";

import { parseChannelSyncStartDate } from "./channel-sync-contract";

describe("parseChannelSyncStartDate", () => {
  it("accepts a real Korean calendar date", () => {
    expect(parseChannelSyncStartDate("2026-08-01")).toBe("2026-08-01");
  });

  it.each(["2026-02-30", "2026/08/01", "", null])(
    "rejects invalid input: %s",
    (value) => expect(() => parseChannelSyncStartDate(value)).toThrow(),
  );

  it("rejects a date after today in Asia/Seoul", () => {
    expect(() =>
      parseChannelSyncStartDate("2026-08-09", new Date("2026-08-08T10:00:00Z")),
    ).toThrow("future_start_date");
  });
});
