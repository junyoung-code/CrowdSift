import "server-only";

import { google } from "googleapis";
import type { Credentials } from "google-auth-library";

import type {
  OAuthTokens,
  YouTubeChannel,
  YouTubeProvider,
} from "./contracts";
import { YOUTUBE_QUOTA_UNITS } from "./quota";
import type {
  ProviderComment,
  ProviderCommentThread,
} from "@/features/ingestion/comment-mapper";
import type {
  ChannelCommentPage,
  ChannelCommentProvider,
  ChannelCommentThread,
  OwnerReadTokens,
} from "./channel-comment-contracts";
import type { YouTubeVideo } from "./video-service";
import {
  assertRefreshTokenAvailable,
  isYouTubeOAuthReconnectRequiredError,
  YouTubeOAuthReconnectRequiredError,
} from "./oauth-errors";

export type RefreshedGoogleTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  expiresAt: string | null;
};

export type TokenRefreshContext = {
  connectionId: string;
  connectionUpdatedAt: string;
};

type TokenRefreshHandler = (
  tokens: RefreshedGoogleTokens,
  context: TokenRefreshContext | null,
) => Promise<void> | void;

const toExpiresAt = (expiryDate?: number | null) =>
  expiryDate ? new Date(expiryDate).toISOString() : null;

const toRefreshPayload = (credentials: Credentials): RefreshedGoogleTokens => ({
  accessToken: credentials.access_token ?? null,
  refreshToken: credentials.refresh_token ?? null,
  expiresAt: toExpiresAt(credentials.expiry_date),
});

const YOUTUBE_FORCE_SSL_SCOPE =
  "https://www.googleapis.com/auth/youtube.force-ssl";

const canReadHeldComments = (tokens?: OwnerReadTokens) =>
  tokens?.grantedScopes?.includes(YOUTUBE_FORCE_SSL_SCOPE) ?? false;

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

/**
 * 게시된 댓글에는 유튜브가 `moderationStatus` 를 실어 주지 않는다. 값이 붙는 것은
 * 게시가 아닐 때뿐이다. 그래서 「없음」을 「모름」으로 두면 아무것도 모르는 것이 된다.
 *
 * 소유자로 읽을 때는 모르는 것이 아니다. 기본 목록은 게시된 것만 주고, 보류된 것은
 * 따로 불러 왔다. 여기서 우리가 아는 것을 적어 둔다 — 지어내는 것이 아니라 **어느
 * 목록에서 왔는지**를 옮기는 것이다.
 *
 * 소유자가 아니면 적지 않는다. 공개 읽기로는 게시 여부 말고 알 수 있는 것이 없다.
 */
const withKnownModerationStatus = (
  comment: ProviderComment,
  { asOwner, fromHeld }: { asOwner: boolean; fromHeld: boolean },
): ProviderComment => {
  if (comment.moderationStatus || !asOwner) return comment;
  return {
    ...comment,
    moderationStatus: fromHeld ? "heldForReview" : "published",
  };
};

export class GoogleYouTubeProvider
  implements YouTubeProvider, ChannelCommentProvider
{
  constructor(
    private readonly configuration: {
      clientId: string;
      clientSecret: string;
      redirectUri: string;
      commentReadApiKey?: string;
      onTokenRefresh?: TokenRefreshHandler;
    },
  ) {}

  private createPublishedCommentReadClient() {
    if (!this.configuration.commentReadApiKey) {
      throw new Error(
        "YouTube public API key is required for published comment reads",
      );
    }

    return google.youtube({
      version: "v3",
      auth: this.configuration.commentReadApiKey,
    });
  }

  private createOAuthClient() {
    return new google.auth.OAuth2({
      clientId: this.configuration.clientId,
      clientSecret: this.configuration.clientSecret,
      redirectUri: this.configuration.redirectUri,
    });
  }

  private async prepareAuthorizedClient(
    tokens: Pick<OAuthTokens, "accessToken" | "refreshToken" | "expiresAt">,
    {
      refreshContext = null,
    }: {
      refreshContext?: TokenRefreshContext | null;
    } = {},
  ) {
    assertRefreshTokenAvailable(tokens);

    const client = this.createOAuthClient();
    client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt
        ? new Date(tokens.expiresAt).getTime()
        : undefined,
    });

    const previous = { ...tokens };
    try {
      // Google auth가 API 요청 안에서 몰래 갱신하도록 두지 않는다. 여기서 먼저
      // 갱신을 끝내야 새 token 저장 실패까지 요청 결과에 포함할 수 있다.
      await client.getAccessToken();
    } catch (error) {
      if (isYouTubeOAuthReconnectRequiredError(error)) {
        throw new YouTubeOAuthReconnectRequiredError(undefined, {
          cause: error,
        });
      }
      throw error;
    }

    const refreshed = toRefreshPayload(client.credentials);
    const changed =
      refreshed.accessToken !== previous.accessToken ||
      refreshed.refreshToken !== previous.refreshToken ||
      refreshed.expiresAt !== previous.expiresAt;

    if (changed) {
      await this.configuration.onTokenRefresh?.(refreshed, refreshContext);
      if (refreshed.accessToken) tokens.accessToken = refreshed.accessToken;
      tokens.refreshToken = refreshed.refreshToken;
      tokens.expiresAt = refreshed.expiresAt;
    }

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
    const client = await this.prepareAuthorizedClient(tokens);

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
    const client = await this.prepareAuthorizedClient(tokens);
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

  /**
   * 내 영상의 댓글을 가져온다.
   *
   * **토큰이 있으면 소유자 권한으로 읽는다.** API 키로 읽으면 `moderationStatus` 가
   * 아예 실려 오지 않고, 게시된 것만 돌아온다. 그래서 유튜브가 먼저 잡아 둔 악플은
   * 우리 인박스에 들어오지도 못했다 — 유해한 것부터 보여 주겠다는 서비스에서
   * 이것이 뒤집혀 있었다.
   *
   * 보류 목록은 **첫 장에서 한 번만** 따로 부른다. 상태마다 페이지 토큰이 따로 놀아
   * 한 줄로 이어 붙일 수 없기 때문이고, 보류된 댓글은 원래 많지 않다. 읽기는 한 번에
   * 1 유닛이라 조치 한 번(50)의 오십분의 일이다.
   */
  async listCommentThreads({
    maxResults,
    pageToken,
    tokens,
    youtubeVideoId,
  }: {
    youtubeVideoId: string;
    maxResults: number;
    pageToken?: string;
    tokens?: Pick<OAuthTokens, "accessToken" | "refreshToken" | "expiresAt">;
  }): Promise<{
    items: ProviderCommentThread[];
    nextPageToken: string | null;
  }> {
    const asOwner = Boolean(tokens?.accessToken);
    const youtube = tokens?.accessToken
      ? google.youtube({
          version: "v3",
          auth: await this.prepareAuthorizedClient(tokens),
        })
      : this.createPublishedCommentReadClient();

    const readPage = (moderationStatus?: "heldForReview") =>
      youtube.commentThreads.list({
        part: ["id", "snippet", "replies"],
        videoId: youtubeVideoId,
        maxResults: Math.min(100, maxResults),
        order: "time",
        textFormat: "plainText",
        // 보류 목록은 페이지를 넘기지 않으므로 토큰을 주지 않는다.
        pageToken: moderationStatus ? undefined : pageToken,
        ...(moderationStatus ? { moderationStatus } : {}),
      });

    const [published, held] = await Promise.all([
      readPage(),
      // readonly scope만으로 보류 목록을 요청하면 403이 난다. force-ssl 승인을
      // 받은 연결에서만, 첫 장에서 한 번 부른다.
      canReadHeldComments(tokens) && !pageToken
        ? readPage("heldForReview")
        : null,
    ]);

    const seen = new Set<string>();
    const items = [
      ...(held?.data.items ?? []).map((thread) => ({ thread, fromHeld: true })),
      ...(published.data.items ?? []).map((thread) => ({
        thread,
        fromHeld: false,
      })),
    ]
      .flatMap(({ fromHeld, thread }) => {
        const mapped = mapGoogleComment(
          thread.snippet?.topLevelComment ?? {},
          thread.snippet?.topLevelComment ?? {},
        );
        const topLevel = mapped
          ? withKnownModerationStatus(mapped, { asOwner, fromHeld })
          : null;

        if (!topLevel || seen.has(topLevel.id)) {
          return [];
        }
        seen.add(topLevel.id);

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
      // 이어 읽기는 게시 목록만 따라간다. 보류는 첫 장에서 끝났다.
      nextPageToken: published.data.nextPageToken ?? null,
    };
  }

  /**
   * 채널 전체의 댓글을 최신순으로 읽는다.
   *
   * 영상 단위 읽기와 같은 규칙이다 — 토큰이 있으면 소유자로 읽고, 보류 목록을
   * 첫 장에서 한 번만 따로 부른다. 다만 결과는 **`heldItems` 로 나눠서** 돌려준다.
   * 수집이 「경계보다 오래된 것을 만나면 멈춘다」로 도는데, 보류 댓글은 시간과
   * 무관하게 딸려 오기 때문이다.
   */
  async listChannelCommentThreads({
    maxResults,
    pageToken,
    tokens,
    youtubeChannelId,
  }: {
    youtubeChannelId: string;
    maxResults: number;
    pageToken?: string;
    tokens?: OwnerReadTokens;
  }): Promise<ChannelCommentPage> {
    const asOwner = Boolean(tokens?.accessToken);
    const youtube = tokens?.accessToken
      ? google.youtube({
          version: "v3",
          auth: await this.prepareAuthorizedClient(tokens),
        })
      : this.createPublishedCommentReadClient();

    const readPage = (moderationStatus?: "heldForReview") =>
      youtube.commentThreads.list({
        part: ["id", "snippet", "replies"],
        allThreadsRelatedToChannelId: youtubeChannelId,
        maxResults: Math.min(100, maxResults),
        order: "time",
        textFormat: "plainText",
        pageToken: moderationStatus ? undefined : pageToken,
        ...(moderationStatus ? { moderationStatus } : {}),
      });

    const [published, held] = await Promise.all([
      readPage(),
      // 채널 전체 읽기도 동일하다. readonly 연결은 게시 댓글을 계속 수집하고,
      // force-ssl 승인이 있는 연결만 보류 목록을 첫 장에서 함께 읽는다.
      canReadHeldComments(tokens) && !pageToken
        ? readPage("heldForReview")
        : null,
    ]);

    let invalidItemCount = 0;
    const toThreads = (
      threads: typeof published.data.items,
      fromHeld: boolean,
    ) => {
      const mappedThreads: ChannelCommentThread[] = [];

      for (const thread of threads ?? []) {
        const youtubeVideoId = thread.snippet?.videoId;
        const mapped = mapGoogleComment(
          thread.snippet?.topLevelComment ?? {},
          thread.snippet?.topLevelComment ?? {},
        );

        if (!youtubeVideoId || !mapped) {
          invalidItemCount += 1;
          continue;
        }

        mappedThreads.push({
          youtubeVideoId,
          topLevelComment: withKnownModerationStatus(mapped, {
            asOwner,
            fromHeld,
          }),
          inlineReplies: (thread.replies?.comments ?? []).flatMap((reply) => {
            const mappedReply = mapGoogleComment(reply, reply);
            return mappedReply ? [mappedReply] : [];
          }),
          totalReplyCount: thread.snippet?.totalReplyCount ?? 0,
        });
      }

      return mappedThreads;
    };

    const items = toThreads(published.data.items, false);
    const publishedIds = new Set(
      items.map((thread) => thread.topLevelComment.id),
    );

    return {
      items,
      // 같은 댓글이 양쪽에 설 수는 없지만, 서면 두 번 저장하려 든다.
      heldItems: toThreads(held?.data.items, true).filter(
        (thread) => !publishedIds.has(thread.topLevelComment.id),
      ),
      nextPageToken: published.data.nextPageToken ?? null,
      // 보류 목록을 따로 부른 만큼 읽기가 한 번 더 나갔다.
      quotaUnitsUsed: held ? 2 : 1,
      invalidItemCount,
    };
  }

  /** 최상위 댓글과 같은 규칙으로 읽는다. 답글도 보류될 수 있다. */
  async listReplies({
    maxResults = 100,
    pageToken,
    parentYoutubeCommentId,
    tokens,
  }: {
    parentYoutubeCommentId: string;
    maxResults?: number;
    pageToken?: string;
    tokens?: Pick<OAuthTokens, "accessToken" | "refreshToken" | "expiresAt">;
  }): Promise<{
    items: ProviderComment[];
    nextPageToken: string | null;
    quotaUnitsUsed: number;
  }> {
    const youtube = tokens?.accessToken
      ? google.youtube({
          version: "v3",
          auth: await this.prepareAuthorizedClient(tokens),
        })
      : this.createPublishedCommentReadClient();
    const response = await youtube.comments.list({
      part: ["id", "snippet"],
      parentId: parentYoutubeCommentId,
      maxResults: Math.min(100, maxResults),
      textFormat: "plainText",
      pageToken,
    });

    return {
      items: (response.data.items ?? []).flatMap((comment) => {
        const mapped = mapGoogleComment(comment, comment);
        return mapped ? [mapped] : [];
      }),
      nextPageToken: response.data.nextPageToken ?? null,
      quotaUnitsUsed: 1,
    };
  }

  async listVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]> {
    if (videoIds.length === 0) {
      return [];
    }

    const youtube = this.createPublishedCommentReadClient();
    const videos: YouTubeVideo[] = [];

    for (let index = 0; index < videoIds.length; index += 50) {
      const ids = videoIds.slice(index, index + 50);
      const response = await youtube.videos.list({
        part: ["snippet"],
        id: ids,
      });

      for (const video of response.data.items ?? []) {
        if (!video.id || !video.snippet?.title) {
          continue;
        }

        const thumbnails = video.snippet.thumbnails;
        videos.push({
          id: video.id,
          title: video.snippet.title,
          thumbnailUrl:
            thumbnails?.high?.url ??
            thumbnails?.medium?.url ??
            thumbnails?.default?.url ??
            null,
          publishedAt: video.snippet.publishedAt ?? null,
        });
      }
    }

    return videos;
  }

  async setModerationStatus({
    moderationStatus,
    tokens,
    youtubeCommentId,
  }: {
    youtubeCommentId: string;
    moderationStatus: "heldForReview" | "published" | "rejected";
    tokens: Pick<OAuthTokens, "accessToken" | "refreshToken" | "expiresAt"> &
      TokenRefreshContext;
  }) {
    const client = await this.prepareAuthorizedClient(tokens, {
      refreshContext: {
        connectionId: tokens.connectionId,
        connectionUpdatedAt: tokens.connectionUpdatedAt,
      },
    });
    const youtube = google.youtube({ version: "v3", auth: client });
    const response = await youtube.comments.setModerationStatus({
      id: [youtubeCommentId],
      moderationStatus,
    });
    // 여기까지 왔으면 유닛은 이미 나갔다. 성공했는지와 별개다.
    return {
      status: response.status,
      quotaUnitsUsed: YOUTUBE_QUOTA_UNITS.setModerationStatus,
    };
  }

  async deleteComment({
    tokens,
    youtubeCommentId,
  }: {
    youtubeCommentId: string;
    tokens: Pick<OAuthTokens, "accessToken" | "refreshToken" | "expiresAt"> &
      TokenRefreshContext;
  }) {
    const client = await this.prepareAuthorizedClient(tokens, {
      refreshContext: {
        connectionId: tokens.connectionId,
        connectionUpdatedAt: tokens.connectionUpdatedAt,
      },
    });
    const youtube = google.youtube({ version: "v3", auth: client });
    const response = await youtube.comments.delete({
      id: youtubeCommentId,
    });
    return {
      status: response.status,
      quotaUnitsUsed: YOUTUBE_QUOTA_UNITS.deleteComment,
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
