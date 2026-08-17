import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { commentThreadsList, commentsList, videosList, youtubeClient } =
  vi.hoisted(() => {
    const commentThreadsList = vi.fn<
      (input: { moderationStatus?: string }) => Promise<unknown>
    >(async () => ({
      data: { items: [], nextPageToken: null },
    }));
    const commentsList = vi.fn<() => Promise<unknown>>(async () => ({
      data: { items: [], nextPageToken: null },
    }));
    const videosList = vi.fn<() => Promise<unknown>>(async () => ({
      data: { items: [] },
    }));
    const youtubeClient = vi.fn(() => ({
      channels: { list: vi.fn() },
      playlistItems: { list: vi.fn() },
      commentThreads: { list: commentThreadsList },
      comments: { list: commentsList },
      videos: { list: videosList },
    }));

    return { commentThreadsList, commentsList, videosList, youtubeClient };
  });

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: class {
        on() {}
        setCredentials() {}
      },
    },
    youtube: youtubeClient,
  },
}));

import { GoogleYouTubeProvider } from "./google-youtube-provider";

const oauthTokens = {
  accessToken: "owner-access-token",
  refreshToken: "owner-refresh-token",
  expiresAt: null,
  grantedScopes: ["https://www.googleapis.com/auth/youtube.readonly"],
  googleSubject: null,
};

describe("GoogleYouTubeProvider comment reads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    commentThreadsList.mockResolvedValue({
      data: { items: [], nextPageToken: null },
    });
    commentsList.mockResolvedValue({
      data: { items: [], nextPageToken: null },
    });
    videosList.mockResolvedValue({ data: { items: [] } });
  });

  /**
   * 8/8 에 이 자리는 API 키로 바뀌어 있었다. 그러자 `moderationStatus` 가 실려 오지
   * 않고 게시된 것만 돌아왔고, 유튜브가 먼저 잡아 둔 악플은 인박스에 들어오지도
   * 못했다. 실제로 226건이 전부 상태 null 이었다. 그래서 소유자 토큰이 있으면
   * 소유자로 읽는 쪽으로 되돌린다.
   */
  it("reads an owned video as the owner and asks for held comments too", async () => {
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    await provider.listCommentThreads({
      youtubeVideoId: "video-1",
      maxResults: 20,
      tokens: oauthTokens,
    });
    await provider.listReplies({
      parentYoutubeCommentId: "comment-1",
      tokens: oauthTokens,
    });

    expect(youtubeClient).not.toHaveBeenCalledWith({
      version: "v3",
      auth: "server-api-key",
    });
    expect(commentThreadsList).toHaveBeenCalledWith({
      part: ["id", "snippet", "replies"],
      videoId: "video-1",
      maxResults: 20,
      order: "time",
      textFormat: "plainText",
      pageToken: undefined,
    });
    // 보류 목록은 따로 부른다. 기본값이 게시된 것뿐이라 한 번으로는 안 온다.
    expect(commentThreadsList).toHaveBeenCalledWith({
      part: ["id", "snippet", "replies"],
      videoId: "video-1",
      maxResults: 20,
      order: "time",
      textFormat: "plainText",
      pageToken: undefined,
      moderationStatus: "heldForReview",
    });
    expect(commentsList).toHaveBeenCalledWith({
      part: ["id", "snippet"],
      parentId: "comment-1",
      maxResults: 100,
      textFormat: "plainText",
      pageToken: undefined,
    });
  });

  it("falls back to the server API key when there is no owner token", async () => {
    // 공개 URL 로 들어온 영상에는 토큰이 없다. 그 길은 그대로 두어야 한다.
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    await provider.listCommentThreads({
      youtubeVideoId: "video-1",
      maxResults: 20,
    });

    expect(youtubeClient).toHaveBeenCalledTimes(1);
    expect(youtubeClient).toHaveBeenCalledWith({
      version: "v3",
      auth: "server-api-key",
    });
    // 권한이 없는데 보류 목록을 물으면 403 이 난다. 묻지 않아야 한다.
    expect(commentThreadsList).not.toHaveBeenCalledWith(
      expect.objectContaining({ moderationStatus: "heldForReview" }),
    );
  });

  it("does not ask for held comments once it is paging", async () => {
    // 상태마다 페이지 토큰이 따로 논다. 보류는 첫 장에서 한 번만 본다.
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    await provider.listCommentThreads({
      youtubeVideoId: "video-1",
      maxResults: 20,
      pageToken: "page-2",
      tokens: oauthTokens,
    });

    expect(commentThreadsList).toHaveBeenCalledTimes(1);
    expect(commentThreadsList).not.toHaveBeenCalledWith(
      expect.objectContaining({ moderationStatus: "heldForReview" }),
    );
  });

  it("records that an owner's published comment is published", async () => {
    // 유튜브는 게시된 댓글에 moderationStatus 를 실어 주지 않는다. 값이 붙는 것은
    // 게시가 아닐 때뿐이다. 어느 목록에서 왔는지는 우리가 알고 있으므로 적어 둔다.
    // 한 댓글이 두 목록에 동시에 있을 수는 없다. 보류 목록은 비어 있어야 한다.
    commentThreadsList.mockImplementation(
      async (input: { moderationStatus?: string }) =>
        input.moderationStatus === "heldForReview"
          ? { data: { nextPageToken: null, items: [] } }
          : {
              data: {
                nextPageToken: null,
                items: [
                  {
                    id: "thread-1",
                    snippet: {
                      totalReplyCount: 0,
                      topLevelComment: {
                        id: "comment-1",
                        snippet: { textDisplay: "그냥 댓글" },
                      },
                    },
                  },
                ],
              },
            },
    );
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    const asOwner = await provider.listCommentThreads({
      youtubeVideoId: "video-1",
      maxResults: 20,
      tokens: oauthTokens,
    });

    expect(asOwner.items[0]?.topLevelComment.moderationStatus).toBe(
      "published",
    );

    const asPublic = await provider.listCommentThreads({
      youtubeVideoId: "video-1",
      maxResults: 20,
    });

    // 공개 읽기로는 알 수 없다. 모르는 것은 모르는 채로 둔다.
    expect(asPublic.items[0]?.topLevelComment.moderationStatus).toBeNull();
  });

  it("keeps a held comment when the published page repeats it", async () => {
    // 두 목록을 이어 붙이므로 같은 댓글이 두 번 들어올 수 있다.
    commentThreadsList.mockResolvedValue({
      data: {
        nextPageToken: null,
        items: [
          {
            id: "thread-1",
            snippet: {
              totalReplyCount: 0,
              topLevelComment: {
                id: "comment-1",
                snippet: {
                  textDisplay: "같은 댓글",
                  moderationStatus: "heldForReview",
                },
              },
            },
          },
        ],
      },
    });
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    const result = await provider.listCommentThreads({
      youtubeVideoId: "video-1",
      maxResults: 20,
      tokens: oauthTokens,
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.topLevelComment.moderationStatus).toBe(
      "heldForReview",
    );
  });

  it("reads channel-wide threads newest first and preserves their video IDs", async () => {
    commentThreadsList.mockResolvedValue({
      data: {
        nextPageToken: "page-3",
        items: [
          {
            id: "thread-1",
            snippet: {
              videoId: "video-1",
              totalReplyCount: 1,
              topLevelComment: {
                id: "comment-1",
                snippet: {
                  textDisplay: "첫 댓글",
                  publishedAt: "2026-08-08T00:00:00.000Z",
                },
              },
            },
            replies: {
              comments: [
                {
                  id: "reply-1",
                  snippet: {
                    parentId: "comment-1",
                    textDisplay: "첫 답글",
                  },
                },
              ],
            },
          },
          {
            id: "thread-without-video",
            snippet: {
              topLevelComment: {
                id: "comment-2",
                snippet: { textDisplay: "영상 ID가 없는 댓글" },
              },
            },
          },
          {
            id: "thread-with-invalid-top-level-comment",
            snippet: {
              videoId: "video-2",
              topLevelComment: {
                id: "comment-without-text",
                snippet: {},
              },
            },
          },
        ],
      },
    });
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    const result = await provider.listChannelCommentThreads({
      youtubeChannelId: "channel-1",
      maxResults: 100,
      pageToken: "page-2",
    });

    expect(commentThreadsList).toHaveBeenCalledWith({
      part: ["id", "snippet", "replies"],
      allThreadsRelatedToChannelId: "channel-1",
      maxResults: 100,
      order: "time",
      textFormat: "plainText",
      pageToken: "page-2",
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({
          youtubeVideoId: "video-1",
          topLevelComment: expect.objectContaining({ id: "comment-1" }),
          inlineReplies: [
            expect.objectContaining({ id: "reply-1", parentId: "comment-1" }),
          ],
          totalReplyCount: 1,
        }),
      ],
      // 토큰 없이 부른 읽기다. 보류 목록은 묻지도 않았다.
      heldItems: [],
      nextPageToken: "page-3",
      quotaUnitsUsed: 1,
      invalidItemCount: 2,
    });
    expect(JSON.stringify(result)).not.toContain("server-api-key");
  });

  it("brings a channel's held comments back in their own list", async () => {
    // 게시 목록과 섞으면 수집이 오래된 보류 댓글에서 백필을 끊는다.
    commentThreadsList.mockImplementation(
      async (input: { moderationStatus?: string }) => ({
        data: {
          nextPageToken: null,
          items: [
            {
              id: `thread-${input.moderationStatus ?? "published"}`,
              snippet: {
                videoId: "video-1",
                totalReplyCount: 0,
                topLevelComment: {
                  id:
                    input.moderationStatus === "heldForReview"
                      ? "held-1"
                      : "published-1",
                  snippet: { textDisplay: "댓글" },
                },
              },
            },
          ],
        },
      }),
    );
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    const result = await provider.listChannelCommentThreads({
      youtubeChannelId: "channel-1",
      maxResults: 100,
      tokens: oauthTokens,
    });

    expect(result.items.map((thread) => thread.topLevelComment.id)).toEqual([
      "published-1",
    ]);
    expect(result.heldItems.map((thread) => thread.topLevelComment.id)).toEqual(
      ["held-1"],
    );
    expect(result.items[0]?.topLevelComment.moderationStatus).toBe("published");
    expect(result.heldItems[0]?.topLevelComment.moderationStatus).toBe(
      "heldForReview",
    );
    // 목록을 두 번 불렀으니 유닛도 둘이다.
    expect(result.quotaUnitsUsed).toBe(2);
  });

  it("caps channel-wide thread pages at 100 items", async () => {
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    await provider.listChannelCommentThreads({
      youtubeChannelId: "channel-1",
      maxResults: 101,
    });

    expect(commentThreadsList).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: 100 }),
    );
  });

  it("returns paginated replies with an explicit one-unit quota cost", async () => {
    commentsList.mockResolvedValue({
      data: {
        nextPageToken: "reply-page-3",
        items: [
          {
            id: "reply-2",
            snippet: {
              parentId: "comment-1",
              textDisplay: "둘째 답글",
            },
          },
        ],
      },
    });
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    const result = await provider.listReplies({
      parentYoutubeCommentId: "comment-1",
      maxResults: 75,
      pageToken: "reply-page-2",
    });

    expect(commentsList).toHaveBeenCalledWith({
      part: ["id", "snippet"],
      parentId: "comment-1",
      maxResults: 75,
      textFormat: "plainText",
      pageToken: "reply-page-2",
    });
    expect(result).toEqual({
      items: [
        expect.objectContaining({ id: "reply-2", parentId: "comment-1" }),
      ],
      nextPageToken: "reply-page-3",
      quotaUnitsUsed: 1,
    });
  });

  it("caps reply pages at 100 items", async () => {
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    await provider.listReplies({
      parentYoutubeCommentId: "comment-1",
      maxResults: 101,
    });

    expect(commentsList).toHaveBeenCalledWith(
      expect.objectContaining({ maxResults: 100 }),
    );
  });

  it("loads video metadata in batches of at most 50 IDs", async () => {
    const videoIds = Array.from(
      { length: 51 },
      (_, index) => `video-${index + 1}`,
    );
    videosList
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "video-1",
              snippet: {
                title: "첫 영상",
                publishedAt: "2026-08-01T00:00:00.000Z",
                thumbnails: { high: { url: "https://example.com/video-1.jpg" } },
              },
            },
          ],
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            {
              id: "video-51",
              snippet: { title: "마지막 영상" },
            },
          ],
        },
      });
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    await expect(provider.listVideosByIds(videoIds)).resolves.toEqual([
      {
        id: "video-1",
        title: "첫 영상",
        thumbnailUrl: "https://example.com/video-1.jpg",
        publishedAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "video-51",
        title: "마지막 영상",
        thumbnailUrl: null,
        publishedAt: null,
      },
    ]);
    expect(videosList).toHaveBeenCalledTimes(2);
    expect(videosList).toHaveBeenNthCalledWith(1, {
      part: ["snippet"],
      id: videoIds.slice(0, 50),
    });
    expect(videosList).toHaveBeenNthCalledWith(2, {
      part: ["snippet"],
      id: ["video-51"],
    });
  });

  it("does not call YouTube when no video IDs are requested", async () => {
    const provider = new GoogleYouTubeProvider({
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    });

    await expect(provider.listVideosByIds([])).resolves.toEqual([]);
    expect(youtubeClient).not.toHaveBeenCalled();
    expect(videosList).not.toHaveBeenCalled();
  });
});
