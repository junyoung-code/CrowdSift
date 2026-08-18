import { describe, expect, it } from "vitest";

import {
  assertRefreshTokenAvailable,
  isYouTubeOAuthReconnectRequiredError,
  YouTubeOAuthReconnectRequiredError,
} from "./oauth-errors";

describe("YouTube OAuth reconnect errors", () => {
  it.each(["invalid_grant", "invalid_rapt"])(
    "recognizes the permanent Google token error %s",
    (oauthCode) => {
      expect(
        isYouTubeOAuthReconnectRequiredError({
          response: { status: 400, data: { error: oauthCode } },
        }),
      ).toBe(true);
    },
  );

  it("recognizes YouTube authentication failures without treating quota as auth", () => {
    expect(
      isYouTubeOAuthReconnectRequiredError({
        response: {
          status: 403,
          data: { error: { errors: [{ reason: "insufficientPermissions" }] } },
        },
      }),
    ).toBe(true);
    expect(
      isYouTubeOAuthReconnectRequiredError({
        response: {
          status: 403,
          data: { error: { errors: [{ reason: "quotaExceeded" }] } },
        },
      }),
    ).toBe(false);
  });

  it("requires reconnection before using an expired access token with no refresh token", () => {
    expect(() =>
      assertRefreshTokenAvailable({
        expiresAt: "2026-08-17T00:00:00.000Z",
        refreshToken: null,
        now: Date.parse("2026-08-17T00:00:01.000Z"),
      }),
    ).toThrow(YouTubeOAuthReconnectRequiredError);
  });

  it("allows a current access token and an expired token that can be refreshed", () => {
    expect(() =>
      assertRefreshTokenAvailable({
        expiresAt: "2026-08-17T00:10:00.000Z",
        refreshToken: null,
        now: Date.parse("2026-08-17T00:00:00.000Z"),
      }),
    ).not.toThrow();
    expect(() =>
      assertRefreshTokenAvailable({
        expiresAt: "2026-08-17T00:00:00.000Z",
        refreshToken: "refresh-token",
        now: Date.parse("2026-08-17T00:00:01.000Z"),
      }),
    ).not.toThrow();
  });
});
