import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  GooglePublicYouTubeReadProvider,
  PublicYouTubeProviderError,
} from "./google-public-read-provider";

const VIDEO_ID = "dQw4w9WgXcQ";

const createClient = () => ({
  videos: {
    list: vi.fn(),
  },
  commentThreads: {
    list: vi.fn(),
  },
  comments: {
    list: vi.fn(),
  },
});

describe("GooglePublicYouTubeReadProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the server API key to map a public video preview", async () => {
    const client = createClient();
    client.videos.list.mockResolvedValue({
      data: {
        items: [
          {
            id: VIDEO_ID,
            snippet: {
              title: "Public test video",
              channelId: "channel-1",
              channelTitle: "Creator",
              thumbnails: {
                high: { url: "https://i.ytimg.com/example.jpg" },
              },
            },
            statistics: {
              commentCount: "42",
            },
          },
        ],
      },
    });
    const clientFactory = vi.fn(() => client);
    const provider = new GooglePublicYouTubeReadProvider({
      apiKey: "server-secret",
      createClient: clientFactory,
    });

    await expect(provider.getPublicVideo(VIDEO_ID)).resolves.toEqual({
      videoId: VIDEO_ID,
      canonicalUrl: `https://www.youtube.com/watch?v=${VIDEO_ID}`,
      title: "Public test video",
      channelId: "channel-1",
      channelTitle: "Creator",
      thumbnailUrl: "https://i.ytimg.com/example.jpg",
      commentsAvailable: true,
      commentCount: 42,
      quotaUnitsUsed: 1,
    });
    expect(clientFactory).toHaveBeenCalledWith("server-secret");
    expect(client.videos.list).toHaveBeenCalledWith({
      part: ["snippet", "statistics"],
      id: [VIDEO_ID],
      maxResults: 1,
    });
    expect("setModerationStatus" in provider).toBe(false);
    expect("deleteComment" in provider).toBe(false);
  });

  it("marks comments unavailable when YouTube omits commentCount", async () => {
    const client = createClient();
    client.videos.list.mockResolvedValue({
      data: {
        items: [
          {
            id: VIDEO_ID,
            snippet: {
              title: "Comments disabled",
              channelId: "channel-1",
              channelTitle: "Creator",
            },
            statistics: {},
          },
        ],
      },
    });
    const provider = new GooglePublicYouTubeReadProvider({
      apiKey: "server-secret",
      createClient: () => client,
    });

    await expect(provider.getPublicVideo(VIDEO_ID)).resolves.toEqual(
      expect.objectContaining({
        commentsAvailable: false,
        commentCount: null,
      }),
    );
  });

  it("maps an empty video response to a stable not-found error", async () => {
    const client = createClient();
    client.videos.list.mockResolvedValue({ data: { items: [] } });
    const provider = new GooglePublicYouTubeReadProvider({
      apiKey: "server-secret",
      createClient: () => client,
    });

    await expect(provider.getPublicVideo(VIDEO_ID)).rejects.toMatchObject({
      name: "PublicYouTubeProviderError",
      code: "VIDEO_NOT_FOUND",
    });
  });

  it.each([
    ["commentsDisabled", "COMMENTS_DISABLED"],
    ["quotaExceeded", "QUOTA_EXCEEDED"],
    ["dailyLimitExceeded", "QUOTA_EXCEEDED"],
    ["backendError", "TRANSIENT_PROVIDER_ERROR"],
  ] as const)("maps %s without leaking the provider body", async (reason, code) => {
    const client = createClient();
    client.commentThreads.list.mockRejectedValue({
      response: {
        status: reason === "backendError" ? 503 : 403,
        data: {
          error: {
            errors: [{ reason }],
            message: "raw provider body must not escape",
          },
        },
      },
    });
    const provider = new GooglePublicYouTubeReadProvider({
      apiKey: "server-secret",
      createClient: () => client,
    });

    const error = await provider
      .listCommentThreads({
        videoId: VIDEO_ID,
        maxResults: 20,
        pageToken: null,
        order: "time",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PublicYouTubeProviderError);
    expect(error).toMatchObject({ code });
    expect(JSON.stringify(error)).not.toContain("raw provider body");
    expect(JSON.stringify(error)).not.toContain("server-secret");
  });

  it("maps thread and reply pages into application-owned comment DTOs", async () => {
    const client = createClient();
    client.commentThreads.list.mockResolvedValue({
      data: {
        nextPageToken: "thread-page-2",
        items: [
          {
            snippet: {
              totalReplyCount: 2,
              topLevelComment: {
                id: "parent-1",
                snippet: {
                  textDisplay: "부모 댓글",
                  textOriginal: "부모 댓글",
                  authorDisplayName: "작성자",
                  publishedAt: "2026-07-24T00:00:00Z",
                },
              },
            },
            replies: {
              comments: [
                {
                  id: "reply-1",
                  snippet: {
                    parentId: "parent-1",
                    textDisplay: "첫 답글",
                    publishedAt: "2026-07-24T01:00:00Z",
                  },
                },
              ],
            },
          },
        ],
      },
    });
    client.comments.list.mockResolvedValue({
      data: {
        nextPageToken: null,
        items: [
          {
            id: "reply-2",
            snippet: {
              parentId: "parent-1",
              textDisplay: "둘째 답글",
              publishedAt: "2026-07-24T02:00:00Z",
            },
          },
        ],
      },
    });
    const provider = new GooglePublicYouTubeReadProvider({
      apiKey: "server-secret",
      createClient: () => client,
    });

    await expect(
      provider.listCommentThreads({
        videoId: VIDEO_ID,
        maxResults: 20,
        pageToken: null,
        order: "time",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        nextPageToken: "thread-page-2",
        quotaUnitsUsed: 1,
        items: [
          expect.objectContaining({
            topLevelComment: expect.objectContaining({ id: "parent-1" }),
            inlineReplies: [
              expect.objectContaining({
                id: "reply-1",
                parentId: "parent-1",
              }),
            ],
            totalReplyCount: 2,
          }),
        ],
      }),
    );
    await expect(
      provider.listReplies({
        parentCommentId: "parent-1",
        maxResults: 100,
        pageToken: null,
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        nextPageToken: null,
        quotaUnitsUsed: 1,
        items: [
          expect.objectContaining({
            id: "reply-2",
            parentId: "parent-1",
          }),
        ],
      }),
    );
  });
});
