import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { collectPublicComments } from "@/features/ingestion/public-comment-collector";

import { GooglePublicYouTubeReadProvider } from "./google-public-read-provider";
import { FixturePublicYouTubeReadProvider } from "./fixture-youtube-provider";
import { createPublicProviderFactory } from "./public-provider-factory";

describe("createPublicProviderFactory", () => {
  it("creates the live read-only provider only for an enabled development mode", () => {
    expect(
      createPublicProviderFactory({
        nodeEnv: "development",
        enabled: true,
        externalProviderMode: "live",
        allowFixtureProviders: false,
        apiKey: "server-secret",
      }),
    ).toBeInstanceOf(GooglePublicYouTubeReadProvider);
  });

  it("rejects an unconfigured API key", () => {
    expect(() =>
      createPublicProviderFactory({
        nodeEnv: "development",
        enabled: true,
        externalProviderMode: "live",
        allowFixtureProviders: false,
      }),
    ).toThrow("YOUTUBE_PUBLIC_API_KEY");
  });

  it("rejects use when the development feature is disabled", () => {
    expect(() =>
      createPublicProviderFactory({
        nodeEnv: "development",
        enabled: false,
        externalProviderMode: "live",
        allowFixtureProviders: false,
        apiKey: "server-secret",
      }),
    ).toThrow("disabled");
  });

  it("rejects production initialization", () => {
    expect(() =>
      createPublicProviderFactory({
        nodeEnv: "production",
        enabled: true,
        externalProviderMode: "live",
        allowFixtureProviders: false,
        apiKey: "server-secret",
      }),
    ).toThrow(/production/i);
  });

  it("creates the deterministic public fixture only with an explicit local opt in", async () => {
    const provider = createPublicProviderFactory({
      nodeEnv: "test",
      enabled: true,
      externalProviderMode: "fixture",
      allowFixtureProviders: true,
    });

    expect(provider).toBeInstanceOf(FixturePublicYouTubeReadProvider);
    await expect(provider.getPublicVideo("fixture0001")).resolves.toEqual(
      expect.objectContaining({
        fixtureLabel: "TEST FIXTURE",
        title: "TEST FIXTURE · 공개 댓글 테스트 영상",
      }),
    );
  });

  it("rejects a fixture without an explicit local opt in", () => {
    expect(() =>
      createPublicProviderFactory({
        nodeEnv: "test",
        enabled: true,
        externalProviderMode: "fixture",
        allowFixtureProviders: false,
      }),
    ).toThrow("Fixture providers are disabled");
  });

  it.each([20, 50, 100, 1000])(
    "returns exactly %s unique fixture comments while keeping every reply with its parent",
    async (requestedTotalCount) => {
    const provider = createPublicProviderFactory({
      nodeEnv: "test",
      enabled: true,
      externalProviderMode: "fixture",
      allowFixtureProviders: true,
    });
    const result = await collectPublicComments({
      provider,
      videoId: "fixture0001",
      requestedTotalCount,
    });
    const commentIds = new Set(
      result.comments.map((comment) => comment.youtubeCommentId),
    );

    expect(result.comments).toHaveLength(requestedTotalCount);
    expect(commentIds.size).toBe(requestedTotalCount);
    expect(result.topLevelCount + result.replyCount).toBe(
      requestedTotalCount,
    );
    expect(
      result.comments
        .filter((comment) => comment.parentYoutubeCommentId)
        .every((comment) =>
          commentIds.has(comment.parentYoutubeCommentId as string),
        ),
    ).toBe(true);
    expect(result.replyCount).toBeGreaterThan(0);
    },
  );
});
