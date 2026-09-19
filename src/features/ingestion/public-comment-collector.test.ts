import { describe, expect, it, vi } from "vitest";

import type { ProviderComment } from "./comment-mapper";
import { collectPublicComments } from "./public-comment-collector";
import type { PublicYouTubeReadProvider } from "@/features/youtube/public-read-contracts";

const comment = (
  id: string,
  {
    parentId = null,
    publishedAt = "2026-07-24T00:00:00.000Z",
  }: {
    parentId?: string | null;
    publishedAt?: string | null;
  } = {},
): ProviderComment => ({
  id,
  parentId,
  textDisplay: `text-${id}`,
  textOriginal: `text-${id}`,
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
  overrides: Partial<PublicYouTubeReadProvider>,
): PublicYouTubeReadProvider => ({
  getPublicVideo: vi.fn(),
  listCommentThreads: vi.fn(),
  listReplies: vi.fn(),
  ...overrides,
});

describe("collectPublicComments", () => {
  it("includes top-level comments that have no replies", async () => {
    const source = provider({
      listCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            topLevelComment: comment("parent-without-replies"),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        nextPageToken: null,
        quotaUnitsUsed: 1,
      }),
    });

    const result = await collectPublicComments({
      provider: source,
      videoId: "dQw4w9WgXcQ",
      requestedTotalCount: 20,
    });

    expect(result.comments).toEqual([
      expect.objectContaining({
        youtubeCommentId: "parent-without-replies",
        parentYoutubeCommentId: null,
      }),
    ]);
    expect(result.topLevelCount).toBe(1);
    expect(result.replyCount).toBe(0);
  });

  it("caps parents and replies together and chooses the newest replies", async () => {
    const replies = Array.from({ length: 20 }, (_, index) =>
      comment(`reply-${index + 1}`, {
        parentId: "parent-1",
        publishedAt: `2026-07-24T${String(index + 1).padStart(2, "0")}:00:00.000Z`,
      }),
    );
    const source = provider({
      listCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            topLevelComment: comment("parent-1"),
            inlineReplies: [replies[0]!],
            totalReplyCount: replies.length,
          },
          {
            topLevelComment: comment("parent-2"),
            inlineReplies: [],
            totalReplyCount: 0,
          },
        ],
        nextPageToken: null,
        quotaUnitsUsed: 1,
      }),
      listReplies: vi.fn().mockResolvedValue({
        items: replies,
        nextPageToken: null,
        quotaUnitsUsed: 1,
      }),
    });

    const result = await collectPublicComments({
      provider: source,
      videoId: "dQw4w9WgXcQ",
      requestedTotalCount: 20,
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      "parent-1",
      ...Array.from({ length: 19 }, (_, index) => `reply-${20 - index}`),
    ]);
    expect(result.topLevelCount).toBe(1);
    expect(result.replyCount).toBe(19);
    expect(result.youtubeQuotaUnitsUsed).toBe(2);
  });

  it("never returns an orphan reply and normalizes its parent id", async () => {
    const source = provider({
      listCommentThreads: vi.fn().mockResolvedValue({
        items: [
          {
            topLevelComment: comment("parent-1"),
            inlineReplies: [comment("reply-1")],
            totalReplyCount: 1,
          },
        ],
        nextPageToken: null,
        quotaUnitsUsed: 1,
      }),
    });

    const result = await collectPublicComments({
      provider: source,
      videoId: "dQw4w9WgXcQ",
      requestedTotalCount: 20,
    });

    expect(result.comments).toEqual([
      expect.objectContaining({
        youtubeCommentId: "parent-1",
        parentYoutubeCommentId: null,
      }),
      expect.objectContaining({
        youtubeCommentId: "reply-1",
        parentYoutubeCommentId: "parent-1",
      }),
    ]);
  });

  it("continues through thread and reply pagination only while capacity remains", async () => {
    const listCommentThreads = vi
      .fn()
      .mockResolvedValueOnce({
        items: Array.from({ length: 18 }, (_, index) => ({
          topLevelComment: comment(`parent-${index + 1}`),
          inlineReplies: [],
          totalReplyCount: 0,
        })),
        nextPageToken: "thread-page-2",
        quotaUnitsUsed: 1,
      })
      .mockResolvedValueOnce({
        items: [
          {
            topLevelComment: comment("parent-19"),
            inlineReplies: [],
            totalReplyCount: 2,
          },
        ],
        nextPageToken: "unused-thread-page",
        quotaUnitsUsed: 1,
      });
    const listReplies = vi
      .fn()
      .mockResolvedValueOnce({
        items: [
          comment("reply-1", {
            parentId: "parent-19",
            publishedAt: "2026-07-24T01:00:00.000Z",
          }),
        ],
        nextPageToken: "reply-page-2",
        quotaUnitsUsed: 1,
      })
      .mockResolvedValueOnce({
        items: [
          comment("reply-2", {
            parentId: "parent-19",
            publishedAt: "2026-07-24T02:00:00.000Z",
          }),
        ],
        nextPageToken: null,
        quotaUnitsUsed: 1,
      });
    const source = provider({ listCommentThreads, listReplies });

    const result = await collectPublicComments({
      provider: source,
      videoId: "dQw4w9WgXcQ",
      requestedTotalCount: 20,
    });

    expect(result.comments.map((item) => item.youtubeCommentId)).toEqual([
      ...Array.from({ length: 18 }, (_, index) => `parent-${index + 1}`),
      "parent-19",
      "reply-2",
    ]);
    expect(result.youtubeQuotaUnitsUsed).toBe(4);
    expect(result.nextPageToken).toBe("unused-thread-page");
    expect(listCommentThreads).toHaveBeenCalledTimes(2);
    expect(listReplies).toHaveBeenCalledTimes(2);
  });

  it("collects every thread and reply page beyond 1000 without trusting metadata", async () => {
    const listCommentThreads = vi.fn(async ({ pageToken }: { pageToken: string | null }) => {
      const page = Number(pageToken ?? 0);
      return {
        items: Array.from({ length: page === 10 ? 5 : 100 }, (_, index) => {
          const id = `all-parent-${page * 100 + index}`;
          return {
            topLevelComment: comment(id),
            inlineReplies: id === "all-parent-0" ? [comment("reply-0", { parentId: id })] : [],
            totalReplyCount: id === "all-parent-0" ? 101 : 0,
          };
        }),
        nextPageToken: page < 10 ? String(page + 1) : null,
        quotaUnitsUsed: 1,
      };
    });
    const listReplies = vi.fn(async ({ pageToken }: { pageToken: string | null }) => ({
      items: pageToken ? [comment("reply-100", { parentId: "all-parent-0" })]
        : Array.from({ length: 100 }, (_, i) => comment(`reply-${i}`, { parentId: "all-parent-0" })),
      nextPageToken: pageToken ? null : "last-reply-page",
      quotaUnitsUsed: 1,
    }));
    const source = provider({ listCommentThreads, listReplies });
    const result = await collectPublicComments({ provider: source, videoId: "dQw4w9WgXcQ", requestedTotalCount: 0 });
    expect(result.comments).toHaveLength(1106);
    expect(new Set(result.comments.map(c => c.youtubeCommentId)).size).toBe(1106);
    expect(result.topLevelCount).toBe(1005);
    expect(result.replyCount).toBe(101);
    expect(result.nextPageToken).toBeNull();
    expect(listCommentThreads).toHaveBeenCalledTimes(11);
    expect(listReplies).toHaveBeenCalledTimes(2);
    expect(source.getPublicVideo).not.toHaveBeenCalled();
    expect(listCommentThreads).toHaveBeenLastCalledWith(expect.objectContaining({ maxResults: 100, pageToken: "10" }));
    const ids = result.comments.map(c => c.youtubeCommentId);
    expect(ids.indexOf("all-parent-0")).toBeLessThan(ids.indexOf("reply-100"));
  });

  it("finishes an empty all-comments video without inventing data", async () => {
    const result = await collectPublicComments({
      provider: provider({ listCommentThreads: vi.fn().mockResolvedValue({ items: [], nextPageToken: null, quotaUnitsUsed: 1 }) }),
      videoId: "dQw4w9WgXcQ", requestedTotalCount: 0,
    });
    expect(result.comments).toEqual([]);
    expect(result.nextPageToken).toBeNull();
  });

  it.each([-1, 19, 21, 1001])(
    "rejects an unsupported requested total: %s",
    async (requestedTotalCount) => {
      await expect(
        collectPublicComments({
          provider: provider({}),
          videoId: "dQw4w9WgXcQ",
          requestedTotalCount,
        }),
      ).rejects.toThrow();
    },
  );
});
