import { describe, expect, it, vi } from "vitest";

import {
  syncChannelVideos,
  type VideoSyncProvider,
  type VideoSyncRepository,
} from "./video-service";

describe("syncChannelVideos", () => {
  it("upserts the latest videos for the selected creator channel", async () => {
    const provider: VideoSyncProvider = {
      listChannelVideos: vi.fn(async () => [
        {
          id: "video-1",
          title: "첫 영상",
          thumbnailUrl: "https://example.test/video-1.jpg",
          publishedAt: "2026-07-22T00:00:00.000Z",
        },
      ]),
    };
    const repository: VideoSyncRepository = {
      upsertVideos: vi.fn(async () => undefined),
    };

    const videos = await syncChannelVideos({
      workspaceId: "w1",
      channelId: "channel-1",
      tokens: {
        accessToken: "access",
        refreshToken: "refresh",
        expiresAt: null,
        grantedScopes: [],
        googleSubject: null,
      },
      provider,
      repository,
    });

    expect(videos).toHaveLength(1);
    expect(provider.listChannelVideos).toHaveBeenCalledWith(
      "channel-1",
      expect.objectContaining({ accessToken: "access" }),
    );
    expect(repository.upsertVideos).toHaveBeenCalledWith("w1", "channel-1", [
      expect.objectContaining({ id: "video-1", title: "첫 영상" }),
    ]);
  });
});
