// @vitest-environment node

import { describe, expect, it } from "vitest";
import { google } from "googleapis";

import { installFixtureNodeExternalNetworkGuard } from "./fixture-node-network-guard";

describe("installFixtureNodeExternalNetworkGuard", () => {
  it.each([
    "https://youtube.googleapis.com/youtube/v3/commentThreads",
    "https://api.openai.com/v1/responses",
  ])("blocks node-fetch provider traffic in fixture mode: %s", async (url) => {
    const restore = installFixtureNodeExternalNetworkGuard({
      allowFixtureProviders: true,
      externalProviderMode: "fixture",
    });

    try {
      const nodeFetch = (await import("node-fetch")).default;
      await expect(nodeFetch(url)).rejects.toThrow(
        "Fixture external network guard blocked",
      );
    } finally {
      restore();
    }
  });

  it("blocks the googleapis gaxios transport, not only global fetch", async () => {
    const restore = installFixtureNodeExternalNetworkGuard({
      allowFixtureProviders: true,
      externalProviderMode: "fixture",
    });

    try {
      const youtube = google.youtube({
        version: "v3",
        auth: "fixture-must-never-leave-process",
      });

      await expect(
        youtube.videos.list({
          id: ["dQw4w9WgXcQ"],
          part: ["snippet"],
        }),
      ).rejects.toThrow("Fixture external network guard blocked");
    } finally {
      restore();
    }
  });
});
