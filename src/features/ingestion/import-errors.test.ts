import { describe, expect, it } from "vitest";

import { toChannelSyncProcessingError } from "./import-errors";

describe("channel sync provider errors", () => {
  it.each([
    ["quotaExceeded", "quota_exceeded"],
    ["rateLimitExceeded", "youtube_rate_limited"],
    ["authError", "permission_revoked"],
  ] as const)("maps YouTube %s to %s", (reason, expected) => {
    expect(
      toChannelSyncProcessingError({
        response: { data: { error: { errors: [{ reason }] } } },
      }).code,
    ).toBe(expected);
  });

  it("maps invalid_grant from Google's token endpoint to reconnection", () => {
    expect(
      toChannelSyncProcessingError({
        response: { status: 400, data: { error: "invalid_grant" } },
      }).code,
    ).toBe("permission_revoked");
  });

  it("treats HTTP 429 as a short rate limit rather than daily quota", () => {
    expect(
      toChannelSyncProcessingError({ response: { status: 429 } }).code,
    ).toBe("youtube_rate_limited");
  });
});
