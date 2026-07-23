export type ChannelSelectionRepository = {
  selectOnly(workspaceId: string, channelId: string): Promise<void>;
};

export const selectChannel = async ({
  channelId,
  repository,
  workspaceId,
}: {
  workspaceId: string;
  channelId: string;
  repository: ChannelSelectionRepository;
}) => {
  if (!workspaceId || !channelId) {
    throw new Error("Exactly one channel is required");
  }

  await repository.selectOnly(workspaceId, channelId);
};
