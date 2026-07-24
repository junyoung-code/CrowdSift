import { randomUUID } from "node:crypto";

import type {
  ActionResult,
  ModerationAction,
  ModerationRequestState,
} from "./contracts";

export const FORCE_SSL_SCOPE =
  "https://www.googleapis.com/auth/youtube.force-ssl";

type ModerationTarget = {
  youtubeCommentId: string;
  connectionId: string;
  connectionUpdatedAt: string;
  authorChannelId: string | null;
  selectedChannelId: string;
  grantedScopes: string[];
  sourceSnapshot: Record<string, unknown>;
  analysisSnapshot: Record<string, unknown>;
};

type StoredModerationRequest = {
  requestId: string;
  workspaceId: string;
  rawCommentId: string;
  youtubeCommentId: string;
  requestedBy: string;
  action: ModerationAction;
  state: ModerationRequestState;
  grantedScopes: string[];
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
  connectionId: string;
  connectionUpdatedAt: string;
  bindingValid: boolean;
  deleteEligible: boolean;
  result: ActionResult | null;
};

export interface ModerationRepository {
  loadTarget(input: {
    workspaceId: string;
    rawCommentId: string;
  }): Promise<ModerationTarget>;
  createRequestWithEvidence(input: {
    workspaceId: string;
    rawCommentId: string;
    actorUserId: string;
    action: ModerationAction;
    state: "pending_confirmation" | "awaiting_scope";
    idempotencyKey: string;
    evidence: {
      source: Record<string, unknown>;
      analysis: Record<string, unknown>;
    };
    connectionId: string;
    connectionUpdatedAt: string;
    selectedChannelId: string;
  }): Promise<{
    requestId: string;
    state: "pending_confirmation" | "awaiting_scope";
  }>;
  loadRequest(input: {
    workspaceId: string;
    requestId: string;
    actorUserId: string;
  }): Promise<StoredModerationRequest>;
  claimRequest(input: {
    workspaceId: string;
    requestId: string;
    actorUserId: string;
    confirmedAt: string;
  }): Promise<boolean>;
  completeRequest(input: {
    workspaceId: string;
    requestId: string;
    actorUserId: string;
    state: "succeeded" | "failed";
    providerStatus: number | null;
    executedAt: string;
    errorCode: string | null;
  }): Promise<ActionResult>;
  reconcileStaleRequest(input: {
    workspaceId: string;
    requestId: string;
    actorUserId: string;
    staleBefore: string;
    reconciledAt: string;
  }): Promise<ActionResult | null>;
}

export interface YouTubeModerationProvider {
  setModerationStatus(input: {
    youtubeCommentId: string;
    moderationStatus: "heldForReview" | "published" | "rejected";
    tokens: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
      connectionId: string;
      connectionUpdatedAt: string;
    };
  }): Promise<{ status: number }>;
  deleteComment(input: {
    youtubeCommentId: string;
    tokens: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
      connectionId: string;
      connectionUpdatedAt: string;
    };
  }): Promise<{ status: number }>;
}

const MODERATION_STATUS = {
  hold_for_review: "heldForReview",
  publish: "published",
  reject: "rejected",
} as const;

const hasModerationScope = (scopes: string[]) =>
  scopes.includes(FORCE_SSL_SCOPE);

const getProviderErrorStatus = (error: unknown) => {
  if (
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    typeof error.response === "object" &&
    error.response !== null &&
    "status" in error.response &&
    typeof error.response.status === "number"
  ) {
    return error.response.status;
  }
  return null;
};

const completeWithRetry = async (
  repository: ModerationRepository,
  input: Parameters<ModerationRepository["completeRequest"]>[0],
) => {
  let lastError: unknown;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      return await repository.completeRequest(input);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError;
};

export const createModerationService = ({
  provider,
  repository,
}: {
  provider: YouTubeModerationProvider;
  repository: ModerationRepository;
}) => ({
  async requestModeration(input: {
    workspaceId: string;
    rawCommentId: string;
    action: ModerationAction;
    actorUserId: string;
  }) {
    const target = await repository.loadTarget({
      workspaceId: input.workspaceId,
      rawCommentId: input.rawCommentId,
    });

    if (
      input.action === "delete" &&
      target.authorChannelId !== target.selectedChannelId
    ) {
      throw new Error(
        "Delete is available only for a comment authored by the connected channel",
      );
    }

    const state = hasModerationScope(target.grantedScopes)
      ? "pending_confirmation"
      : "awaiting_scope";

    return repository.createRequestWithEvidence({
      ...input,
      state,
      idempotencyKey: randomUUID(),
      connectionId: target.connectionId,
      connectionUpdatedAt: target.connectionUpdatedAt,
      selectedChannelId: target.selectedChannelId,
      evidence: {
        source: target.sourceSnapshot,
        analysis: target.analysisSnapshot,
      },
    });
  },

  async confirmModeration(input: {
    workspaceId: string;
    requestId: string;
    actorUserId: string;
    confirmation: "I_UNDERSTAND";
  }): Promise<ActionResult> {
    if (input.confirmation !== "I_UNDERSTAND") {
      throw new Error("Explicit confirmation required");
    }

    const request = await repository.loadRequest(input);
    if (
      (request.state === "succeeded" || request.state === "failed") &&
      request.result
    ) {
      return completeWithRetry(repository, {
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        state: request.result.state,
        providerStatus: request.result.providerStatus,
        executedAt: request.result.executedAt ?? new Date().toISOString(),
        errorCode: request.result.errorCode,
      });
    }
    if (!request.bindingValid) {
      throw new Error("Moderation connection changed before confirmation");
    }
    if (request.action === "delete" && !request.deleteEligible) {
      throw new Error("Delete eligibility changed before confirmation");
    }
    if (!hasModerationScope(request.grantedScopes)) {
      throw new Error("YouTube moderation scope required");
    }

    const executedAt = new Date().toISOString();
    const claimed = await repository.claimRequest({
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      actorUserId: input.actorUserId,
      confirmedAt: executedAt,
    });
    if (!claimed) {
      const reconciledAt = new Date().toISOString();
      const reconciled = await repository.reconcileStaleRequest({
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        staleBefore: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        reconciledAt,
      });
      if (reconciled) {
        return reconciled;
      }

      const current = await repository.loadRequest(input);
      if (
        (current.state === "succeeded" || current.state === "failed") &&
        current.result
      ) {
        return completeWithRetry(repository, {
          workspaceId: input.workspaceId,
          requestId: input.requestId,
          actorUserId: input.actorUserId,
          state: current.result.state,
          providerStatus: current.result.providerStatus,
          executedAt: current.result.executedAt ?? reconciledAt,
          errorCode: current.result.errorCode,
        });
      }
      throw new Error("Moderation request is already being processed");
    }

    const tokens = {
      accessToken: request.accessToken,
      refreshToken: request.refreshToken,
      expiresAt: request.expiresAt,
      connectionId: request.connectionId,
      connectionUpdatedAt: request.connectionUpdatedAt,
    };

    let providerResult: { status: number };
    try {
      providerResult =
        request.action === "delete"
          ? await provider.deleteComment({
              youtubeCommentId: request.youtubeCommentId,
              tokens,
            })
          : await provider.setModerationStatus({
              youtubeCommentId: request.youtubeCommentId,
              moderationStatus: MODERATION_STATUS[request.action],
              tokens,
            });
    } catch (error) {
      const providerStatus = getProviderErrorStatus(error);
      const hasDefiniteClientResponse =
        providerStatus !== null &&
        providerStatus >= 400 &&
        providerStatus < 500;
      const errorCode = hasDefiniteClientResponse
        ? "youtube_moderation_failed"
        : "provider_result_unknown";

      return completeWithRetry(repository, {
        workspaceId: input.workspaceId,
        requestId: input.requestId,
        actorUserId: input.actorUserId,
        state: "failed",
        providerStatus,
        executedAt,
        errorCode,
      });
    }

    return completeWithRetry(repository, {
      workspaceId: input.workspaceId,
      requestId: input.requestId,
      actorUserId: input.actorUserId,
      state: "succeeded",
      providerStatus: providerResult.status,
      executedAt,
      errorCode: null,
    });
  },
});
