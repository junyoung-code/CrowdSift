import type { OAuthTokens } from "./contracts";

export type YouTubeVideo = {
  id: string;
  title: string;
  thumbnailUrl: string | null;
  publishedAt: string | null;
};

export interface VideoSyncProvider {
  listChannelVideos(
    channelId: string,
    tokens: OAuthTokens,
  ): Promise<YouTubeVideo[]>;
}

export interface VideoSyncRepository {
  upsertVideos(
    workspaceId: string,
    channelId: string,
    videos: YouTubeVideo[],
  ): Promise<void>;
}

export const syncChannelVideos = async ({
  channelId,
  provider,
  repository,
  tokens,
  workspaceId,
}: {
  workspaceId: string;
  channelId: string;
  tokens: OAuthTokens;
  provider: VideoSyncProvider;
  repository: VideoSyncRepository;
}) => {
  const videos = await provider.listChannelVideos(channelId, tokens);
  await repository.upsertVideos(workspaceId, channelId, videos);

  return videos;
};
