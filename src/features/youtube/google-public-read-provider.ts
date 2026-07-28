import "server-only";

import { google } from "googleapis";

import type {
  ProviderComment,
  ProviderCommentThread,
} from "@/features/ingestion/comment-mapper";

import type {
  PublicReplyPage,
  PublicReplyPageRequest,
  PublicThreadPage,
  PublicThreadPageRequest,
  PublicVideoPreview,
  PublicYouTubeReadProvider,
} from "./public-read-contracts";

type PublicProviderErrorCode =
  | "VIDEO_NOT_FOUND"
  | "COMMENTS_DISABLED"
  | "QUOTA_EXCEEDED"
  | "TRANSIENT_PROVIDER_ERROR"
  | "PROVIDER_REQUEST_FAILED";

export class PublicYouTubeProviderError extends Error {
  readonly name = "PublicYouTubeProviderError";

  constructor(
    readonly code: PublicProviderErrorCode,
    message: string,
  ) {
    super(message);
  }
}

type ThumbnailResource = {
  url?: string | null;
};

type CommentResource = {
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
};

type ThreadResource = {
  snippet?: {
    totalReplyCount?: number | null;
    topLevelComment?: CommentResource | null;
  } | null;
  replies?: {
    comments?: CommentResource[] | null;
  } | null;
};

type VideoResource = {
  id?: string | null;
  snippet?: {
    title?: string | null;
    channelId?: string | null;
    channelTitle?: string | null;
    thumbnails?: {
      default?: ThumbnailResource | null;
      medium?: ThumbnailResource | null;
      high?: ThumbnailResource | null;
      standard?: ThumbnailResource | null;
      maxres?: ThumbnailResource | null;
    } | null;
  } | null;
  statistics?: {
    commentCount?: string | null;
  } | null;
};

type PublicYouTubeApiClient = {
  videos: {
    list(input: {
      part: string[];
      id: string[];
      maxResults: number;
    }): Promise<{ data: { items?: VideoResource[] | null } }>;
  };
  commentThreads: {
    list(input: {
      part: string[];
      videoId: string;
      maxResults: number;
      order: "time";
      textFormat: "plainText";
      pageToken?: string;
    }): Promise<{
      data: {
        items?: ThreadResource[] | null;
        nextPageToken?: string | null;
      };
    }>;
  };
  comments: {
    list(input: {
      part: string[];
      parentId: string;
      maxResults: number;
      textFormat: "plainText";
      pageToken?: string;
    }): Promise<{
      data: {
        items?: CommentResource[] | null;
        nextPageToken?: string | null;
      };
    }>;
  };
};

type PublicProviderConfiguration = {
  apiKey: string;
  createClient?: (apiKey: string) => PublicYouTubeApiClient;
};

const createGoogleClient = (apiKey: string) =>
  google.youtube({
    version: "v3",
    auth: apiKey,
  }) as unknown as PublicYouTubeApiClient;

const getProviderErrorDetails = (error: unknown) => {
  if (
    typeof error !== "object" ||
    error === null ||
    !("response" in error) ||
    typeof error.response !== "object" ||
    error.response === null
  ) {
    return { status: null, reason: null };
  }

  const response = error.response;
  const status =
    "status" in response && typeof response.status === "number"
      ? response.status
      : null;

  if (
    !("data" in response) ||
    typeof response.data !== "object" ||
    response.data === null ||
    !("error" in response.data) ||
    typeof response.data.error !== "object" ||
    response.data.error === null ||
    !("errors" in response.data.error) ||
    !Array.isArray(response.data.error.errors)
  ) {
    return { status, reason: null };
  }

  const firstError = response.data.error.errors[0];
  const reason =
    typeof firstError === "object" &&
    firstError !== null &&
    "reason" in firstError &&
    typeof firstError.reason === "string"
      ? firstError.reason
      : null;

  return { status, reason };
};

const mapProviderError = (error: unknown): PublicYouTubeProviderError => {
  const { status, reason } = getProviderErrorDetails(error);

  if (reason === "commentsDisabled") {
    return new PublicYouTubeProviderError(
      "COMMENTS_DISABLED",
      "이 영상에서는 댓글을 가져올 수 없습니다.",
    );
  }

  if (reason === "quotaExceeded" || reason === "dailyLimitExceeded") {
    return new PublicYouTubeProviderError(
      "QUOTA_EXCEEDED",
      "YouTube API 할당량을 초과했습니다.",
    );
  }

  if (status !== null && status >= 500) {
    return new PublicYouTubeProviderError(
      "TRANSIENT_PROVIDER_ERROR",
      "YouTube에서 일시적인 오류가 발생했습니다.",
    );
  }

  return new PublicYouTubeProviderError(
    "PROVIDER_REQUEST_FAILED",
    "YouTube 요청을 완료하지 못했습니다.",
  );
};

const mapGoogleComment = (
  comment: CommentResource,
  rawPayload: unknown,
): ProviderComment | null => {
  const textDisplay =
    comment.snippet?.textDisplay ?? comment.snippet?.textOriginal;

  if (!comment.id || !textDisplay) {
    return null;
  }

  return {
    id: comment.id,
    parentId: comment.snippet?.parentId ?? null,
    textDisplay,
    textOriginal: comment.snippet?.textOriginal ?? null,
    authorChannelId: comment.snippet?.authorChannelId?.value ?? null,
    authorDisplayName: comment.snippet?.authorDisplayName ?? null,
    authorAvatarUrl: comment.snippet?.authorProfileImageUrl ?? null,
    likeCount: comment.snippet?.likeCount ?? 0,
    moderationStatus: comment.snippet?.moderationStatus ?? null,
    publishedAt: comment.snippet?.publishedAt ?? null,
    updatedAt: comment.snippet?.updatedAt ?? null,
    rawPayload,
  };
};

const mapThread = (thread: ThreadResource): ProviderCommentThread | null => {
  const topLevelResource = thread.snippet?.topLevelComment;
  const topLevelComment = topLevelResource
    ? mapGoogleComment(topLevelResource, topLevelResource)
    : null;

  if (!topLevelComment) {
    return null;
  }

  return {
    topLevelComment,
    inlineReplies: (thread.replies?.comments ?? []).flatMap((reply) => {
      const mapped = mapGoogleComment(reply, reply);
      return mapped ? [mapped] : [];
    }),
    totalReplyCount: thread.snippet?.totalReplyCount ?? 0,
  };
};

export class GooglePublicYouTubeReadProvider
  implements PublicYouTubeReadProvider
{
  private readonly client: PublicYouTubeApiClient;

  constructor(configuration: PublicProviderConfiguration) {
    this.client = (configuration.createClient ?? createGoogleClient)(
      configuration.apiKey,
    );
  }

  async getPublicVideo(videoId: string): Promise<PublicVideoPreview> {
    let response: Awaited<ReturnType<PublicYouTubeApiClient["videos"]["list"]>>;

    try {
      response = await this.client.videos.list({
        part: ["snippet", "statistics"],
        id: [videoId],
        maxResults: 1,
      });
    } catch (error) {
      throw mapProviderError(error);
    }

    const video = response.data.items?.[0];
    const snippet = video?.snippet;

    if (
      !video?.id ||
      !snippet?.title ||
      !snippet.channelId ||
      !snippet.channelTitle
    ) {
      throw new PublicYouTubeProviderError(
        "VIDEO_NOT_FOUND",
        "공개 영상을 찾을 수 없습니다.",
      );
    }

    const commentCountValue = video.statistics?.commentCount;
    const parsedCommentCount =
      commentCountValue === undefined || commentCountValue === null
        ? null
        : Number.parseInt(commentCountValue, 10);
    const commentCount =
      parsedCommentCount !== null && Number.isFinite(parsedCommentCount)
        ? parsedCommentCount
        : null;
    const thumbnails = snippet.thumbnails;

    return {
      videoId: video.id,
      canonicalUrl: `https://www.youtube.com/watch?v=${video.id}`,
      title: snippet.title,
      channelId: snippet.channelId,
      channelTitle: snippet.channelTitle,
      thumbnailUrl:
        thumbnails?.maxres?.url ??
        thumbnails?.standard?.url ??
        thumbnails?.high?.url ??
        thumbnails?.medium?.url ??
        thumbnails?.default?.url ??
        null,
      commentsAvailable: commentCount !== null,
      commentCount,
      quotaUnitsUsed: 1,
    };
  }

  async listCommentThreads(
    input: PublicThreadPageRequest,
  ): Promise<PublicThreadPage> {
    try {
      const response = await this.client.commentThreads.list({
        part: ["id", "snippet", "replies"],
        videoId: input.videoId,
        maxResults: Math.min(100, Math.max(1, input.maxResults)),
        order: input.order,
        textFormat: "plainText",
        pageToken: input.pageToken ?? undefined,
      });

      return {
        items: (response.data.items ?? []).flatMap((thread) => {
          const mapped = mapThread(thread);
          return mapped ? [mapped] : [];
        }),
        nextPageToken: response.data.nextPageToken ?? null,
        quotaUnitsUsed: 1,
      };
    } catch (error) {
      throw mapProviderError(error);
    }
  }

  async listReplies(input: PublicReplyPageRequest): Promise<PublicReplyPage> {
    try {
      const response = await this.client.comments.list({
        part: ["id", "snippet"],
        parentId: input.parentCommentId,
        maxResults: Math.min(100, Math.max(1, input.maxResults)),
        textFormat: "plainText",
        pageToken: input.pageToken ?? undefined,
      });

      return {
        items: (response.data.items ?? []).flatMap((comment) => {
          const mapped = mapGoogleComment(comment, comment);
          return mapped ? [mapped] : [];
        }),
        nextPageToken: response.data.nextPageToken ?? null,
        quotaUnitsUsed: 1,
      };
    } catch (error) {
      throw mapProviderError(error);
    }
  }
}
