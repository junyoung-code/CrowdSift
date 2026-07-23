import "server-only";

import { google } from "googleapis";
import type { Credentials } from "google-auth-library";

import type {
  OAuthTokens,
  YouTubeChannel,
  YouTubeProvider,
} from "./contracts";
import type {
  ProviderComment,
  ProviderCommentThread,
} from "@/features/ingestion/comment-mapper";
import type { YouTubeVideo } from "./video-service";

export type RefreshedGoogleTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
};

type TokenRefreshHandler = (
  tokens: RefreshedGoogleTokens,
) => Promise<void> | void;

const toExpiresAt = (expiryDate?: number | null) =>
  expiryDate ? new Date(expiryDate).toISOString() : null;

const toRefreshPayload = (credentials: Credentials): RefreshedGoogleTokens => ({
  accessToken: credentials.access_token ?? null,
  refreshToken: credentials.refresh_token ?? null,
  expiresAt: toExpiresAt(credentials.expiry_date),
});

const getResponseStatus = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response
  ) {
    return error.response.status;
  }

  return null;
};

const mapGoogleComment = (
  comment: {
    id?: string | null;
    snippet?: {
      parentId?: string | null;
      textDisplay?: string | null;
      textOriginal?: string | null;
      authorChannelId?: { value?: string | null } | null;
      authorDisplayName?: string | null;
      authorProfileImageUrl?: string | null;
      likeCount?: number | null;
      moderationStatus?: string | null;
      publishedAt?: string | null;
      updatedAt?: string | null;
    } | null;
  },
  rawPayload: unknown,
): ProviderComment | null => {
  if (!comment.id || !comment.snippet?.textDisplay) {
    return null;
  }

  return {
    id: comment.id,
    parentId: comment.snippet.parentId ?? null,
    textDisplay: comment.snippet.textDisplay,
    textOriginal: comment.snippet.textOriginal ?? null,
    authorChannelId: comment.snippet.authorChannelId?.value ?? null,
    authorDisplayName: comment.snippet.authorDisplayName ?? null,
    authorAvatarUrl: comment.snippet.authorProfileImageUrl ?? null,
    likeCount: comment.snippet.likeCount ?? 0,
    moderationStatus: comment.snippet.moderationStatus ?? null,
    publishedAt: comment.snippet.publishedAt ?? null,
    updatedAt: comment.snippet.updatedAt ?? null,
    rawPayload,
  };
};

export class GoogleYouTubeProvider implements YouTubeProvider {
  constructor(
    private readonly configuration: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      onTokenRefresh?: TokenRefreshHandler;
    },
  ) {}

  private createOAuthClient({ listenForRefresh = false } = {}) {
    const client = new google.auth.OAuth2({
      clientId: this.configuration.clientId,
      clientSecret: this.configuration.clientSecret,
      redirectUri: this.configuration.redirectUri,
    });

    if (listenForRefresh && this.configuration.onTokenRefresh) {
      client.on("tokens", (tokens) => {
        void this.configuration.onTokenRefresh?.(toRefreshPayload(tokens));
      });
    }

    return client;
  }

  private createAuthorizedClient(
    tokens: OAuthTokens,
    { listenForRefresh = true } = {},
  ) {
    const client = this.createOAuthClient({ listenForRefresh });
    client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt
        ? new Date(tokens.expiresAt).getTime()
        : undefined,
    });
    return client;
  }

  getAuthorizationUrl(input: {
    state: string;
    scopes: string[];
    includeGrantedScopes: boolean;
    accessType: "offline";
    prompt: "consent";
  }) {
    return this.createOAuthClient().generateAuthUrl({
      state: input.state,
      scope: input.scopes,
      access_type: input.accessType,
      include_granted_scopes: input.includeGrantedScopes,
      prompt: input.prompt,
    });
  }

  async exchangeCode(code: string): Promise<OAuthTokens> {
    const client = this.createOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.access_token) {
      throw new Error("Google did not return an access token");
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? null,
      expiresAt: toExpiresAt(tokens.expiry_date),
      grantedScopes: tokens.scope?.split(/\s+/).filter(Boolean) ?? [],
      googleSubject: null,
    };
  }

  async listOwnedChannels(tokens: OAuthTokens): Promise<YouTubeChannel[]> {
    const client = this.createAuthorizedClient(tokens);

    const youtube = google.youtube({
      version: "v3",
      auth: client,
    });
    const response = await youtube.channels.list({
      part: ["snippet"],
      mine: true,
      maxResults: 50,
    });

    return (response.data.items ?? []).flatMap((channel) => {
      if (!channel.id || !channel.snippet?.title) {
        return [];
      }

      const thumbnails = channel.snippet.thumbnails;

      return [
        {
          id: channel.id,
          title: channel.snippet.title,
          handle: channel.snippet.customUrl ?? null,
          thumbnailUrl:
            thumbnails?.high?.url ??
            thumbnails?.medium?.url ??
            thumbnails?.default?.url ??
            null,
        },
      ];
    });
  }

  async listChannelVideos(
    channelId: string,
    tokens: OAuthTokens,
  ): Promise<YouTubeVideo[]> {
    const client = this.createAuthorizedClient(tokens);
    const youtube = google.youtube({ version: "v3", auth: client });
    const channelResponse = await youtube.channels.list({
      part: ["contentDetails"],
      id: [channelId],
      maxResults: 1,
    });
    const uploadsPlaylistId =
      channelResponse.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;

    if (!uploadsPlaylistId) {
      return [];
    }

    const playlistResponse = await youtube.playlistItems.list({
      part: ["snippet", "contentDetails"],
      playlistId: uploadsPlaylistId,
      maxResults: 50,
    });

    return (playlistResponse.data.items ?? []).flatMap((item) => {
      const videoId =
        item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId;
      const title = item.snippet?.title;

      if (!videoId || !title) {
        return [];
      }

      const thumbnails = item.snippet?.thumbnails;
      return [
        {
          id: videoId,
          title,
          thumbnailUrl:
            thumbnails?.high?.url ??
            thumbnails?.medium?.url ??
            thumbnails?.default?.url ??
            null,
          publishedAt:
            item.contentDetails?.videoPublishedAt ??
            item.snippet?.publishedAt ??
            null,
        },
      ];
    });
  }

  async listCommentThreads({
    maxResults,
    pageToken,
    tokens,
    youtubeVideoId,
  }: {
    youtubeVideoId: string;
    maxResults: number;
    pageToken?: string;
    tokens: OAuthTokens;
  }): Promise<{
    items: ProviderCommentThread[];
    nextPageToken: string | null;
  }> {
    const client = this.createAuthorizedClient(tokens);
    const youtube = google.youtube({ version: "v3", auth: client });
    const response = await youtube.commentThreads.list({
      part: ["id", "snippet", "replies"],
      videoId: youtubeVideoId,
      maxResults: Math.min(100, maxResults),
      order: "time",
      textFormat: "plainText",
      pageToken,
    });

    const items = (response.data.items ?? []).flatMap((thread) => {
      const topLevel = mapGoogleComment(
        thread.snippet?.topLevelComment ?? {},
        thread.snippet?.topLevelComment ?? {},
      );

      if (!topLevel) {
        return [];
      }

      return [
        {
          topLevelComment: topLevel,
          inlineReplies: (thread.replies?.comments ?? []).flatMap((reply) => {
            const mapped = mapGoogleComment(reply, reply);
            return mapped ? [mapped] : [];
          }),
          totalReplyCount: thread.snippet?.totalReplyCount ?? 0,
        },
      ];
    });

    return {
      items,
      nextPageToken: response.data.nextPageToken ?? null,
    };
  }

  async listReplies({
    pageToken,
    parentYoutubeCommentId,
    tokens,
  }: {
    parentYoutubeCommentId: string;
    pageToken?: string;
    tokens: OAuthTokens;
  }): Promise<{
    items: ProviderComment[];
    nextPageToken: string | null;
  }> {
    const client = this.createAuthorizedClient(tokens);
    const youtube = google.youtube({ version: "v3", auth: client });
    const response = await youtube.comments.list({
      part: ["id", "snippet"],
      parentId: parentYoutubeCommentId,
      maxResults: 100,
      textFormat: "plainText",
      pageToken,
    });

    return {
      items: (response.data.items ?? []).flatMap((comment) => {
        const mapped = mapGoogleComment(comment, comment);
        return mapped ? [mapped] : [];
      }),
      nextPageToken: response.data.nextPageToken ?? null,
    };
  }

  async revokeToken(token: string) {
    try {
      await this.createOAuthClient().revokeToken(token);
    } catch (error) {
      if (getResponseStatus(error) === 400) {
        return;
      }

      throw error;
    }
  }
}
