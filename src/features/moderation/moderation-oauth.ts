import type { OAuthTokens } from "@/features/youtube/contracts";

import { FORCE_SSL_SCOPE } from "./moderation-service";

export type ModerationConnectionBinding = {
  connectionId: string;
  connectionUpdatedAt: string;
  selectedChannelId: string;
};

export interface ModerationOAuthRepository {
  loadAwaitingRequest(input: {
    workspaceId: string;
    actorUserId: string;
    requestId: string;
  }): Promise<ModerationConnectionBinding | null>;
  completeGrant(input: {
    workspaceId: string;
    actorUserId: string;
    requestId: string;
    tokens: OAuthTokens;
    expectedBinding: ModerationConnectionBinding;
  }): Promise<boolean>;
}

export const completeModerationOAuth = async (
  input: {
    workspaceId: string;
    actorUserId: string;
    requestId: string;
    code: string;
  },
  dependencies: {
    provider: {
      exchangeCode(code: string): Promise<OAuthTokens>;
      listOwnedChannels(tokens: OAuthTokens): Promise<Array<{ id: string }>>;
    };
    repository: ModerationOAuthRepository;
  },
) => {
  const expectedBinding =
    await dependencies.repository.loadAwaitingRequest(input);
  if (!expectedBinding) {
    throw new Error("Moderation request is not awaiting scope");
  }

  const tokens = await dependencies.provider.exchangeCode(input.code);
  if (!tokens.grantedScopes.includes(FORCE_SSL_SCOPE)) {
    throw new Error("Google grant is missing the moderation scope");
  }
  const ownedChannels = await dependencies.provider.listOwnedChannels(tokens);
  if (
    !ownedChannels.some(
      (channel) => channel.id === expectedBinding.selectedChannelId,
    )
  ) {
    throw new Error("Google grant does not own the selected channel");
  }

  const completed = await dependencies.repository.completeGrant({
    workspaceId: input.workspaceId,
    actorUserId: input.actorUserId,
    requestId: input.requestId,
    tokens,
    expectedBinding,
  });

  if (!completed) {
    throw new Error("Moderation request could not return to confirmation");
  }

  return { requestId: input.requestId };
};
