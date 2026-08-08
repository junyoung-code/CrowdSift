import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { commentThreadsList, commentsList, videosList, youtubeClient } =
  vi.hoisted(() => {
    const commentThreadsList = vi.fn<() => Promise<unknown>>(async () => ({
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

  it("uses the server API key instead of owner OAuth for published comments", async () => {
    const configuration = {
      clientId: "client-id",
      clientSecret: "client-secret",
      redirectUri: "http://localhost:3000/api/youtube/oauth/callback",
      commentReadApiKey: "server-api-key",
    } as ConstructorParameters<typeof GoogleYouTubeProvider>[0] & {
      commentReadApiKey: string;
    };
    const provider = new GoogleYouTubeProvider(configuration);

    await provider.listCommentThreads({
      youtubeVideoId: "video-1",
      maxResults: 20,
      tokens: oauthTokens,
    });
    await provider.listReplies({
      parentYoutubeCommentId: "comment-1",
      tokens: oauthTokens,
    });

    expect(youtubeClient).toHaveBeenCalledTimes(2);
    expect(youtubeClient).toHaveBeenNthCalledWith(1, {
      version: "v3",
      auth: "server-api-key",
    });
    expect(youtubeClient).toHaveBeenNthCalledWith(2, {
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
    expect(commentsList).toHaveBeenCalledWith({
      part: ["id", "snippet"],
      parentId: "comment-1",
      maxResults: 100,
      textFormat: "plainText",
      pageToken: undefined,
    });
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
      nextPageToken: "page-3",
      quotaUnitsUsed: 1,
      invalidItemCount: 1,
    });
    expect(JSON.stringify(result)).not.toContain("server-api-key");
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
      maxResults: 50,
    });
    expect(videosList).toHaveBeenNthCalledWith(2, {
      part: ["snippet"],
      id: ["video-51"],
      maxResults: 1,
    });
  });
});
