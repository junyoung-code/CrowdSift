import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { FixtureYouTubeProvider } from "./fixture-youtube-provider";
import type { ChannelCommentProvider } from "./channel-comment-contracts";

describe("FixtureYouTubeProvider channel comment reads", () => {
  it("returns deterministic newest-first pages across two videos", async () => {
    const provider: ChannelCommentProvider = new FixtureYouTubeProvider();

    const firstPage = await provider.listChannelCommentThreads({
      youtubeChannelId: "fixture-channel-1",
      maxResults: 100,
    });
    const secondPage = await provider.listChannelCommentThreads({
      youtubeChannelId: "fixture-channel-1",
      maxResults: 100,
      pageToken: "next-1",
    });

    expect(firstPage).toMatchObject({
      nextPageToken: "next-1",
      quotaUnitsUsed: 0,
      invalidItemCount: 0,
    });
    expect(
      firstPage.items.map((thread) => ({
        id: thread.topLevelComment.id,
        youtubeVideoId: thread.youtubeVideoId,
        publishedAt: thread.topLevelComment.publishedAt,
      })),
    ).toEqual([
      {
        id: "fixture-channel-comment-1",
        youtubeVideoId: "fixture-video-1",
        publishedAt: "2026-08-08T01:00:00.000Z",
      },
      {
        id: "fixture-channel-comment-2",
        youtubeVideoId: "fixture-video-2",
        publishedAt: "2026-08-07T01:00:00.000Z",
      },
    ]);
    expect(secondPage).toMatchObject({
      nextPageToken: null,
      quotaUnitsUsed: 0,
      invalidItemCount: 0,
    });
    expect(
      secondPage.items.map((thread) => ({
        id: thread.topLevelComment.id,
        youtubeVideoId: thread.youtubeVideoId,
        publishedAt: thread.topLevelComment.publishedAt,
      })),
    ).toEqual([
      {
        id: "fixture-channel-boundary-comment",
        youtubeVideoId: "fixture-video-1",
        publishedAt: "2026-07-31T15:00:00.000Z",
      },
      {
        id: "fixture-channel-older-comment",
        youtubeVideoId: "fixture-video-2",
        publishedAt: "2026-07-31T14:59:59.000Z",
      },
    ]);
  });

  it("paginates replies when only one of three replies is inline", async () => {
    const provider: ChannelCommentProvider = new FixtureYouTubeProvider();
    const page = await provider.listChannelCommentThreads({
      youtubeChannelId: "fixture-channel-1",
      maxResults: 100,
    });
    const thread = page.items[0];

    expect(thread).toMatchObject({
      inlineReplies: [
        expect.objectContaining({ id: "fixture-channel-reply-1" }),
      ],
      totalReplyCount: 3,
    });

    const firstReplyPage = await provider.listReplies({
      parentYoutubeCommentId: "fixture-channel-comment-1",
      maxResults: 2,
    });
    const secondReplyPage = await provider.listReplies({
      parentYoutubeCommentId: "fixture-channel-comment-1",
      maxResults: 2,
      pageToken: firstReplyPage.nextPageToken ?? undefined,
    });

    expect(firstReplyPage).toMatchObject({
      nextPageToken: "fixture-channel-replies-next-1",
      quotaUnitsUsed: 0,
    });
    expect(firstReplyPage.items.map((reply) => reply.id)).toEqual([
      "fixture-channel-reply-1",
      "fixture-channel-reply-2",
    ]);
    expect(secondReplyPage).toMatchObject({
      nextPageToken: null,
      quotaUnitsUsed: 0,
    });
    expect(secondReplyPage.items.map((reply) => reply.id)).toEqual([
      "fixture-channel-reply-3",
    ]);
  });

  it("returns metadata only for requested fixture videos", async () => {
    const provider: ChannelCommentProvider = new FixtureYouTubeProvider();

    await expect(
      provider.listVideosByIds(["fixture-video-2", "missing-video"]),
    ).resolves.toEqual([
      {
        id: "fixture-video-2",
        title: "두 번째 테스트 영상",
        thumbnailUrl: null,
        publishedAt: "2026-07-21T09:00:00.000Z",
      },
    ]);
  });
});
