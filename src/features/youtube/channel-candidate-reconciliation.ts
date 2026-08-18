import type { YouTubeChannel } from "./contracts";

type ExistingChannelCandidate = {
  youtube_channel_id: string;
  selected: boolean;
};

type CandidateConnectionStatus =
  | "connected"
  | "error"
  | "pending_channel_selection";

export const planChannelCandidateReconciliation = ({
  channels,
  configuredChannelId,
  existingCandidates,
}: {
  channels: YouTubeChannel[];
  configuredChannelId: string | null;
  existingCandidates: ExistingChannelCandidate[];
}) => {
  const currentChannelIds = new Set(channels.map((channel) => channel.id));

  if (
    configuredChannelId &&
    !currentChannelIds.has(configuredChannelId)
  ) {
    throw new Error("configured_youtube_channel_not_owned");
  }

  const selectedChannelId =
    configuredChannelId ??
    existingCandidates.find(
      (candidate) =>
        candidate.selected &&
        currentChannelIds.has(candidate.youtube_channel_id),
    )?.youtube_channel_id ??
    (channels.length === 1 ? channels[0]?.id : null);

  const status: CandidateConnectionStatus =
    channels.length === 0
      ? "error"
      : selectedChannelId
        ? "connected"
        : "pending_channel_selection";

  return {
    candidates: channels.map((channel) => ({
      youtube_channel_id: channel.id,
      title: channel.title,
      handle: channel.handle,
      thumbnail_url: channel.thumbnailUrl,
      selected: channel.id === selectedChannelId,
    })),
    staleChannelIds: existingCandidates
      .filter(
        (candidate) => !currentChannelIds.has(candidate.youtube_channel_id),
      )
      .map((candidate) => candidate.youtube_channel_id),
    status,
  };
};
