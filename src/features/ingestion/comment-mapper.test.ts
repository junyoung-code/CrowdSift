import { describe, expect, it, vi } from "vitest";

import {
  fetchSourceCommentPage,
  type YouTubeCommentCollectionProvider,
} from "./comment-mapper";

const providerComment = (
  id: string,
  textDisplay: string,
  parentId: string | null = null,
) => ({
  id,
  parentId,
  textDisplay,
  textOriginal: undefined,
  authorChannelId: `author-${id}`,
  authorDisplayName: `Author ${id}`,
  authorAvatarUrl: null,
  likeCount: 0,
  moderationStatus: "published",
  publishedAt: "2026-07-23T00:00:00.000Z",
  updatedAt: "2026-07-23T00:00:00.000Z",
  rawPayload: { id, textDisplay },
});

describe("fetchSourceCommentPage", () => {
  it("keeps the top-level limit separate and fetches replies omitted inline", async () => {
    const provider: YouTubeCommentCollectionProvider = {
      listCommentThreads: vi.fn(async () => ({
        items: [
          {
            topLevelComment: providerComment("top-1", "첫 댓글"),
            inlineReplies: [
              providerComment("reply-1", "첫 답글", "top-1"),
            ],
            totalReplyCount: 3,
          },
          {
            topLevelComment: providerComment("top-2", "둘째 댓글"),
            inlineReplies: [
              providerComment("reply-4", "넷째 답글", "top-2"),
            ],
            totalReplyCount: 1,
          },
        ],
        nextPageToken: "next-1",
      })),
      listReplies: vi
        .fn()
        .mockResolvedValueOnce({
          items: [providerComment("reply-2", "둘째 답글", "top-1")],
          nextPageToken: "reply-next",
        })
        .mockResolvedValueOnce({
          items: [providerComment("reply-3", "셋째 답글", "top-1")],
          nextPageToken: null,
        }),
    };

    const result = await fetchSourceCommentPage({
      provider,
      youtubeVideoId: "video-1",
      topLevelLimit: 20,
    });

    expect(provider.listCommentThreads).toHaveBeenCalledWith({
      youtubeVideoId: "video-1",
      maxResults: 20,
      pageToken: undefined,
    });
    expect(provider.listReplies).toHaveBeenCalledTimes(2);
    expect(result.comments.map((comment) => comment.youtubeCommentId)).toEqual([
      "top-1",
      "reply-1",
      "reply-2",
      "reply-3",
      "top-2",
      "reply-4",
    ]);
    expect(result.comments[0]).toMatchObject({
      youtubeCommentId: "top-1",
      parentYoutubeCommentId: null,
      textDisplay: "첫 댓글",
      textOriginal: null,
    });
    expect(result.nextPageToken).toBe("next-1");
  });
});
