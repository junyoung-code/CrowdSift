import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { commentThreadsList, commentsList, youtubeClient } = vi.hoisted(() => {
  const commentThreadsList = vi.fn(async () => ({
    data: { items: [], nextPageToken: null },
  }));
  const commentsList = vi.fn(async () => ({
    data: { items: [], nextPageToken: null },
  }));
  const youtubeClient = vi.fn(() => ({
    channels: { list: vi.fn() },
    playlistItems: { list: vi.fn() },
    commentThreads: { list: commentThreadsList },
    comments: { list: commentsList },
  }));

  return { commentThreadsList, commentsList, youtubeClient };
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
});
