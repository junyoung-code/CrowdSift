import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  createProviderFactory,
  createYouTubeProvider,
} from "./provider-factory";

describe("YouTube provider factory", () => {
  it("refuses fixture providers outside test mode", () => {
    expect(() =>
      createProviderFactory({
        externalProviderMode: "fixture",
        nodeEnv: "production",
        allowFixtureProviders: true,
        google: {
          clientId: "client",
          clientSecret: "secret",
          redirectUri: "http://localhost:3000/callback",
        },
      }),
    ).toThrow("Fixture providers are test-only");
  });

  it("requires an explicit fixture-provider opt in", () => {
    expect(() =>
      createProviderFactory({
        externalProviderMode: "fixture",
        nodeEnv: "test",
        allowFixtureProviders: false,
        google: {
          clientId: "client",
          clientSecret: "secret",
          redirectUri: "http://localhost:3000/callback",
        },
      }),
    ).toThrow("Fixture providers are disabled");
  });

  it("returns the deterministic fixture only in an allowed non-production process", async () => {
    const provider = createProviderFactory({
      externalProviderMode: "fixture",
      nodeEnv: "test",
      allowFixtureProviders: true,
      google: {
        clientId: "client",
        clientSecret: "secret",
        redirectUri: "http://localhost:3000/callback",
      },
    });

    const channels = await provider.listOwnedChannels({
      accessToken: "test-access",
      refreshToken: "test-refresh",
      expiresAt: null,
      grantedScopes: [],
      googleSubject: "fixture-subject",
    });

    expect(channels).toHaveLength(2);
    expect(channels[0]?.title).toBe("테스트 크리에이터 채널");
  });

  it("keeps the environment-backed entry point available", () => {
    expect(createYouTubeProvider).toBeTypeOf("function");
  });

  it("keeps fixture OAuth callbacks on the configured local app origin", () => {
    const provider = createProviderFactory({
      externalProviderMode: "fixture",
      nodeEnv: "test",
      allowFixtureProviders: true,
      google: {
        clientId: "client",
        clientSecret: "secret",
        redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
        appOrigin: "http://localhost:3000",
      },
    });

    expect(
      provider.getAuthorizationUrl({
        state: "signed-state",
        scopes: [],
        includeGrantedScopes: true,
        accessType: "offline",
        prompt: "consent",
      }),
    ).toBe(
      "http://localhost:3000/api/youtube/oauth/callback?code=fixture-authorization-code&state=signed-state",
    );
  });
});
