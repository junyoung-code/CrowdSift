import { describe, expect, it, vi } from "vitest";

import type { ChannelCommentProvider } from "@/features/youtube/channel-comment-contracts";

import type { ProviderComment } from "./comment-mapper";
import { collectChannelCommentPage } from "./channel-comment-page-collector";

const comment = (
  id: string,
  {
    parentId = null,
    publishedAt = "2026-08-02T00:00:00.000Z",
  }: {
    parentId?: string | null;
    publishedAt?: string | null;
  } = {},
): ProviderComment => ({
  id,
  parentId,
  textDisplay: `text-${id}`,
  textOriginal: `original-${id}`,
  authorChannelId: `author-${id}`,
  authorDisplayName: `Author ${id}`,
  authorAvatarUrl: null,
  likeCount: 0,
  moderationStatus: "published",
  publishedAt,
  updatedAt: publishedAt,
  rawPayload: { id },
});

const provider = (
  overrides: Partial<ChannelCommentProvider>,
): ChannelCommentProvider => ({
  listChannelCommentThreads: vi.fn(),
  listReplies: vi.fn(),
  listVideosByIds: vi.fn(),
  ...overrides,
});

describe("collectChannelCommentPage", () => {
  it("keeps the selected Korean boundary instant and stops at an older top-level comment", async () => {
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("new-1", {
              publishedAt: "2026-07-31T15:00:01.000Z",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
          {
            youtubeVideoId: "video-2",
            topLevelComment: comment("boundary-1", {
              publishedAt: "2026-07-31T15:00:00.000Z",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
          {
            youtubeVideoId: "video-3",
            topLevelComment: comment("older-1", {
              publishedAt: "2026-07-31T14:59:59.999Z",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        nextPageToken: "provider-next",
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 0,
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "new-1",
      "boundary-1",
    ]);
    expect([...result.groups.keys()]).toEqual(["video-1", "video-2"]);
    expect(result).toMatchObject({
      observedCount: 2,
      topLevelCount: 2,
      replyCount: 0,
      invalidCount: 0,
      quotaUnitsUsed: 1,
      reachedBoundary: true,
      nextPageToken: null,
    });
  });

  it("preserves the provider token when every top-level comment is newer", async () => {
    const listChannelCommentThreads = vi.fn().mockResolvedValue({
      items: [
        {
          youtubeVideoId: "video-1",
          topLevelComment: comment("new-1"),
          inlineReplies: [],
          totalReplyCount: 0,
        },
      ],
      nextPageToken: "provider-next",
      quotaUnitsUsed: 2,
      heldItems: [],
      invalidItemCount: 1,
    });
    const source = provider({ listChannelCommentThreads });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: "provider-current",
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(result).toMatchObject({
      nextPageToken: "provider-next",
      reachedBoundary: false,
      invalidCount: 1,
      quotaUnitsUsed: 2,
    });
    expect(listChannelCommentThreads).toHaveBeenCalledWith({
      youtubeChannelId: "channel-1",
      maxResults: 100,
      pageToken: "provider-current",
    });
  });

  it("keeps missing and invalid timestamps without falsely reaching the cutoff", async () => {
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("missing-date", { publishedAt: null }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("invalid-date", {
              publishedAt: "not-a-date",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("new-1"),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        nextPageToken: "provider-next",
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 2,
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "missing-date",
      "invalid-date",
      "new-1",
    ]);
    expect(result).toMatchObject({
      observedCount: 5,
      invalidCount: 2,
      reachedBoundary: false,
      nextPageToken: "provider-next",
    });
  });

  it.each([
    "2026-08-01",
    "2026-02-30T00:00:00+09:00",
    "2026-08-01T24:00:00Z",
    "2026-08-01T00:00:00+24:00",
    "not-a-date",
  ])("rejects an invalid boundary before reading provider data: %s", async (boundaryAt) => {
    const source = provider({
      listChannelCommentThreads: vi.fn(async () => {
        throw new Error("provider_called_before_boundary_validation");
      }),
    });

    await expect(
      collectChannelCommentPage({
        provider: source,
        youtubeChannelId: "channel-1",
        pageToken: null,
        boundaryAt,
        kind: "backfill_recent",
      }),
    ).rejects.toThrow("invalid_channel_comment_boundary");
  });

  it("keeps parseable but impossible or non-RFC published timestamps as unknown candidates", async () => {
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("impossible-calendar", {
              publishedAt: "2026-02-30T00:00:00.000Z",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("non-rfc", {
              publishedAt: "2026-03-01 00:00:00Z",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        nextPageToken: "provider-next",
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 0,
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-03-03T00:00:00.000Z",
      kind: "backfill_recent",
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "impossible-calendar",
      "non-rfc",
    ]);
    expect(result).toMatchObject({
      reachedBoundary: false,
      nextPageToken: "provider-next",
    });
  });

  it("fetches every missing reply page, deduplicates replies, and groups them after their parent", async () => {
    const listReplies = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          comment("reply-inline", { parentId: "wrong-parent" }),
          comment("reply-api-1", { parentId: null }),
        ],
        nextPageToken: "reply-next",
        quotaUnitsUsed: 2,
      })
      .mockResolvedValueOnce({
        items: [comment("reply-api-2", { parentId: "another-parent" })],
        nextPageToken: null,
        quotaUnitsUsed: 3,
      });
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "real-video-id",
            topLevelComment: comment("parent-1", {
              parentId: "not-a-parent",
            }),
            inlineReplies: [
              comment("reply-inline", {
                parentId: "parent-1",
                publishedAt: "2026-07-01T00:00:00.000Z",
              }),
            ],
            totalReplyCount: 4,
          },
        ],
        nextPageToken: null,
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 0,
      }),
      listReplies,
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(
      result.groups
        .get("real-video-id")
        ?.map((item) => [item.youtubeCommentId, item.parentYoutubeCommentId]),
    ).toEqual([
      ["parent-1", null],
      ["reply-inline", "parent-1"],
      ["reply-api-1", "parent-1"],
      ["reply-api-2", "parent-1"],
    ]);
    expect(result).toMatchObject({
      observedCount: 4,
      topLevelCount: 1,
      replyCount: 3,
      quotaUnitsUsed: 6,
    });
    expect(listReplies).toHaveBeenNthCalledWith(1, {
      parentYoutubeCommentId: "parent-1",
      maxResults: 100,
      pageToken: undefined,
    });
    expect(listReplies).toHaveBeenNthCalledWith(2, {
      parentYoutubeCommentId: "parent-1",
      maxResults: 100,
      pageToken: "reply-next",
    });
  });

  it("merges duplicate top-level threads before collecting their deduplicated replies", async () => {
    const listReplies = vi.fn().mockResolvedValue({
      items: [
        comment("reply-1", { parentId: "parent-1" }),
        comment("reply-3", { parentId: "parent-1" }),
      ],
      nextPageToken: null,
      quotaUnitsUsed: 2,
    });
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("parent-1"),
            inlineReplies: [
              comment("reply-1", { parentId: "parent-1" }),
            ],
            totalReplyCount: 1,
          },
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("parent-1"),
            inlineReplies: [
              comment("reply-1", { parentId: "parent-1" }),
              comment("reply-2", { parentId: "parent-1" }),
            ],
            totalReplyCount: 3,
          },
        ],
        nextPageToken: null,
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 0,
      }),
      listReplies,
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(
      result.groups
        .get("video-1")
        ?.map((item) => item.youtubeCommentId),
    ).toEqual(["parent-1", "reply-1", "reply-2", "reply-3"]);
    expect(result).toMatchObject({
      observedCount: 4,
      topLevelCount: 1,
      replyCount: 3,
      quotaUnitsUsed: 3,
    });
    expect(listReplies).toHaveBeenCalledTimes(1);
  });

  it("does not read reply pages when every reply is already inline", async () => {
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("parent-1"),
            inlineReplies: [
              comment("reply-1", { parentId: "parent-1" }),
              comment("reply-2", { parentId: "parent-1" }),
            ],
            totalReplyCount: 2,
          },
        ],
        nextPageToken: null,
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 0,
      }),
      listReplies: vi.fn(async () => {
        throw new Error("complete inline replies must not be fetched again");
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "parent-1",
      "reply-1",
      "reply-2",
    ]);
    expect(result.quotaUnitsUsed).toBe(1);
  });

  it("never collects an orphan reply from a top-level comment beyond the boundary", async () => {
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("old-parent", {
              publishedAt: "2026-07-31T14:59:59.999Z",
            }),
            inlineReplies: [comment("new-reply", { parentId: "old-parent" })],
            totalReplyCount: 2,
          },
        ],
        nextPageToken: "provider-next",
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 0,
      }),
      listReplies: vi.fn(async () => {
        throw new Error("replies for an excluded parent must not be fetched");
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(result.comments).toEqual([]);
    expect(result.groups.size).toBe(0);
    expect(result).toMatchObject({
      observedCount: 0,
      topLevelCount: 0,
      replyCount: 0,
      reachedBoundary: true,
      nextPageToken: null,
      quotaUnitsUsed: 1,
    });
  });

  it("keeps only incremental candidates strictly newer than the watermark without reply timestamps stopping top-level traversal", async () => {
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("new-parent-1", {
              publishedAt: "2026-08-02T02:00:00.000Z",
            }),
            inlineReplies: [
              comment("old-reply", {
                parentId: "new-parent-1",
                publishedAt: "2026-08-01T23:59:59.999Z",
              }),
              comment("new-reply", {
                parentId: "new-parent-1",
                publishedAt: "2026-08-02T01:01:00.000Z",
              }),
              comment("watermark-reply", {
                parentId: "new-parent-1",
                publishedAt: "2026-08-02T00:00:00.000Z",
              }),
            ],
            totalReplyCount: 3,
          },
          {
            youtubeVideoId: "video-2",
            topLevelComment: comment("new-parent-2", {
              publishedAt: "2026-08-02T01:30:00.000Z",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
          {
            youtubeVideoId: "video-3",
            topLevelComment: comment("watermark-parent", {
              publishedAt: "2026-08-02T00:00:00.000Z",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        nextPageToken: "provider-next",
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 0,
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-02T00:00:00.000Z",
      kind: "incremental",
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "new-parent-1",
      "new-reply",
      "new-parent-2",
    ]);
    expect([...result.groups.keys()]).toEqual(["video-1", "video-2"]);
    expect(result).toMatchObject({
      observedCount: 3,
      topLevelCount: 2,
      replyCount: 1,
      reachedBoundary: true,
      nextPageToken: null,
    });
  });

  it("stops a malformed reply pagination cycle", async () => {
    let replyCalls = 0;
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("parent-1"),
            inlineReplies: [],
            totalReplyCount: 2,
          },
        ],
        nextPageToken: null,
        quotaUnitsUsed: 1,
        heldItems: [],
        invalidItemCount: 0,
      }),
      listReplies: vi.fn(async () => {
        replyCalls += 1;
        if (replyCalls > 2) {
          throw new Error("reply pagination did not stop");
        }
        return {
          items: [comment("reply-1", { parentId: "parent-1" })],
          nextPageToken: "repeated-token",
          quotaUnitsUsed: 1,
        };
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "parent-1",
      "reply-1",
    ]);
    expect(result.quotaUnitsUsed).toBe(3);
    expect(replyCalls).toBe(2);
  });
  it("does not let an old held comment cut the backfill short", async () => {
    /**
     * 보류 댓글은 시간과 무관하게 딸려 온다. 게시 목록과 같은 줄에 세우면 오래된
     * 것 하나가 「경계에 닿았다」로 읽혀 백필 전체가 첫 장에서 끊긴다.
     */
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("new-1"),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        heldItems: [
          {
            youtubeVideoId: "video-2",
            topLevelComment: comment("held-old", {
              publishedAt: "2020-01-01T00:00:00.000Z",
            }),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        nextPageToken: "provider-next",
        quotaUnitsUsed: 2,
        invalidItemCount: 0,
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    // 경계보다 오래된 보류 댓글은 저장하지 않는다. 다만 페이지 넘김은 살아 있어야 한다.
    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "new-1",
    ]);
    expect(result.reachedBoundary).toBe(false);
    expect(result.nextPageToken).toBe("provider-next");
  });

  it("collects a held comment that sits inside the boundary", async () => {
    const source = provider({
      listChannelCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: comment("published-1"),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        heldItems: [
          {
            youtubeVideoId: "video-1",
            topLevelComment: {
              ...comment("held-1"),
              moderationStatus: "heldForReview",
            },
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        nextPageToken: null,
        quotaUnitsUsed: 2,
        invalidItemCount: 0,
      }),
    });

    const result = await collectChannelCommentPage({
      provider: source,
      youtubeChannelId: "channel-1",
      pageToken: null,
      boundaryAt: "2026-08-01T00:00:00+09:00",
      kind: "backfill_recent",
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "published-1",
      "held-1",
    ]);
    expect(
      result.comments.find((item) => item.youtubeCommentId === "held-1")
        ?.sourceModerationStatus,
    ).toBe("heldForReview");
  });
});
