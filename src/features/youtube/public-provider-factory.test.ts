import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { GooglePublicYouTubeReadProvider } from "./google-public-read-provider";
import { createPublicProviderFactory } from "./public-provider-factory";

describe("createPublicProviderFactory", () => {
  it("creates the live read-only provider only for an enabled development mode", () => {
    expect(
      createPublicProviderFactory({
        nodeEnv: "development",
        enabled: true,
        apiKey: "server-secret",
      }),
    ).toBeInstanceOf(GooglePublicYouTubeReadProvider);
  });

  it("rejects an unconfigured API key", () => {
    expect(() =>
      createPublicProviderFactory({
        nodeEnv: "development",
        enabled: true,
      }),
    ).toThrow("YOUTUBE_PUBLIC_API_KEY");
  });

  it("rejects use when the development feature is disabled", () => {
    expect(() =>
      createPublicProviderFactory({
        nodeEnv: "development",
        enabled: false,
        apiKey: "server-secret",
      }),
    ).toThrow("disabled");
  });

  it("rejects production initialization", () => {
    expect(() =>
      createPublicProviderFactory({
        nodeEnv: "production",
        enabled: true,
        apiKey: "server-secret",
      }),
    ).toThrow(/production/i);
  });
});
