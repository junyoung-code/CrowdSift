export type DeveloperToolsAccessInput = {
  allowedUserIds: string;
  enabled: boolean;
  nodeEnv: string | undefined;
  userId: string;
};

const parseAllowedUserIds = (value: string) =>
  value
    .split(",")
    .map((userId) => userId.trim())
    .filter(Boolean);

export const hasDeveloperToolsAccess = ({
  allowedUserIds,
  enabled,
  nodeEnv,
  userId,
}: DeveloperToolsAccessInput) =>
  nodeEnv !== "production" &&
  enabled &&
  parseAllowedUserIds(allowedUserIds).includes(userId);
