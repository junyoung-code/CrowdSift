import type {
  ProviderComment,
  ProviderCommentThread,
} from "@/features/ingestion/comment-mapper";

export type PublicVideoPreview = {
  videoId: string;
  canonicalUrl: string;
  title: string;
  channelId: string;
  channelTitle: string;
  thumbnailUrl: string | null;
  commentsAvailable: boolean;
  commentCount: number | null;
  quotaUnitsUsed: number;
  fixtureLabel?: "TEST FIXTURE";
};

export type PublicThreadPageRequest = {
  videoId: string;
  pageToken: string | null;
  maxResults: number;
  order: "time";
};

export type PublicThreadPage = {
  items: ProviderCommentThread[];
  nextPageToken: string | null;
  quotaUnitsUsed: number;
};

export type PublicReplyPageRequest = {
  parentCommentId: string;
  pageToken: string | null;
  maxResults: number;
};

export type PublicReplyPage = {
  items: ProviderComment[];
  nextPageToken: string | null;
  quotaUnitsUsed: number;
};

export interface PublicYouTubeReadProvider {
  getPublicVideo(videoId: string): Promise<PublicVideoPreview>;
  listCommentThreads(
    input: PublicThreadPageRequest,
  ): Promise<PublicThreadPage>;
  listReplies(input: PublicReplyPageRequest): Promise<PublicReplyPage>;
}
