import { describe, expect, it } from "vitest";

import { getPublicYouTubeDevMode } from "./public-dev-mode";

describe("getPublicYouTubeDevMode", () => {
  it("enables the feature only outside production when explicitly requested", () => {
    expect(
      getPublicYouTubeDevMode({
        NODE_ENV: "development",
        ENABLE_PUBLIC_YOUTUBE_DEV_MODE: "true",
        YOUTUBE_PUBLIC_API_KEY: "server-secret",
      }),
    ).toEqual({
      enabled: true,
      configured: true,
    });
  });

  it("keeps the setup panel available when the API key is missing", () => {
    expect(
      getPublicYouTubeDevMode({
        NODE_ENV: "development",
        ENABLE_PUBLIC_YOUTUBE_DEV_MODE: "true",
      }),
    ).toEqual({
      enabled: true,
      configured: false,
    });
  });

  it("treats an explicitly allowed local fixture as configured without an API key", () => {
    expect(
      getPublicYouTubeDevMode({
        NODE_ENV: "test",
        ENABLE_PUBLIC_YOUTUBE_DEV_MODE: "true",
        EXTERNAL_PROVIDER_MODE: "fixture",
        ALLOW_FIXTURE_PROVIDERS: true,
      }),
    ).toEqual({
      enabled: true,
      configured: true,
    });
  });

  it("rejects public mode in production even when the flag is true", () => {
    expect(() =>
      getPublicYouTubeDevMode({
        NODE_ENV: "production",
        ENABLE_PUBLIC_YOUTUBE_DEV_MODE: "true",
        YOUTUBE_PUBLIC_API_KEY: "server-secret",
      }),
    ).toThrow(/production/i);
  });

  it("does not enable the feature when the flag is absent", () => {
    expect(
      getPublicYouTubeDevMode({
        NODE_ENV: "development",
        YOUTUBE_PUBLIC_API_KEY: "server-secret",
      }),
    ).toEqual({
      enabled: false,
      configured: true,
    });
  });
});
