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

  it("uses the next Korean calendar day across a UTC date crossover", () => {
    const now = new Date("2026-08-08T16:00:00Z");

    expect(parseChannelSyncStartDate("2026-08-09", now)).toBe("2026-08-09");
    expect(() => parseChannelSyncStartDate("2026-08-10", now)).toThrow(
      "future_start_date",
    );
  });
});
