import type {
  ProviderComment,
  ProviderCommentThread,
} from "@/features/ingestion/comment-mapper";

import type { YouTubeVideo } from "./video-service";

export type ChannelCommentThread = ProviderCommentThread & {
  youtubeVideoId: string;
};

export type ChannelCommentPage = {
  items: ChannelCommentThread[];
  nextPageToken: string | null;
  quotaUnitsUsed: number;
  invalidItemCount: number;
};

export interface ChannelCommentProvider {
  listChannelCommentThreads(input: {
    youtubeChannelId: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<ChannelCommentPage>;
  listReplies(input: {
    parentYoutubeCommentId: string;
    maxResults: number;
    pageToken?: string;
  }): Promise<{
    items: ProviderComment[];
    nextPageToken: string | null;
    quotaUnitsUsed: number;
  }>;
  listVideosByIds(videoIds: string[]): Promise<YouTubeVideo[]>;
}
