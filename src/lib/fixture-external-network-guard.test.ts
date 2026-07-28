import { describe, expect, it, vi } from "vitest";

import { installFixtureExternalNetworkGuard } from "./fixture-external-network-guard";

describe("installFixtureExternalNetworkGuard", () => {
  it.each([
    "https://api.openai.com/v1/responses",
    "https://youtube.googleapis.com/youtube/v3/commentThreads",
    "https://www.googleapis.com/youtube/v3/videos",
  ])("blocks external provider traffic in fixture mode: %s", async (url) => {
    const originalFetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("ok"),
    );
    const target = { fetch: originalFetch } as {
      fetch: typeof globalThis.fetch;
      [key: symbol]: unknown;
    };
    const restore = installFixtureExternalNetworkGuard({
      allowFixtureProviders: true,
      externalProviderMode: "fixture",
      target,
    });

    await expect(target.fetch(url)).rejects.toThrow(
      "Fixture external network guard blocked",
    );
    expect(originalFetch).not.toHaveBeenCalled();

    restore();
    await expect(target.fetch(url)).resolves.toBeInstanceOf(Response);
  });

  it("allows local application and Supabase traffic", async () => {
    const originalFetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("ok"),
    );
    const target = { fetch: originalFetch } as {
      fetch: typeof globalThis.fetch;
      [key: symbol]: unknown;
    };
    const restore = installFixtureExternalNetworkGuard({
      allowFixtureProviders: true,
      externalProviderMode: "fixture",
      target,
    });

    await target.fetch("http://127.0.0.1:54321/rest/v1/workspaces");
    await target.fetch("http://localhost:3000/api/import-jobs/job-1/status");

    expect(originalFetch).toHaveBeenCalledTimes(2);
    restore();
  });

  it("does not install unless fixture mode is explicitly allowed", () => {
    const originalFetch = vi.fn<typeof globalThis.fetch>(
      async () => new Response("ok"),
    );
    const target = { fetch: originalFetch } as {
      fetch: typeof globalThis.fetch;
      [key: symbol]: unknown;
    };

    installFixtureExternalNetworkGuard({
      allowFixtureProviders: false,
      externalProviderMode: "fixture",
      target,
    });

    expect(target.fetch).toBe(originalFetch);
  });
});
