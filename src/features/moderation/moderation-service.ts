import { randomUUID } from "node:crypto";

import type {
  ActionResult,
  ModerationAction,
  ModerationRequestState,
} from "./contracts";
import { YOUTUBE_QUOTA_UNITS } from "@/features/youtube/quota";
import { isYouTubeOAuthReconnectRequiredError } from "@/features/youtube/oauth-errors";

export const FORCE_SSL_SCOPE =
  "https://www.googleapis.com/auth/youtube.force-ssl";

type ModerationTarget = {
  sourceKind: "owned_oauth" | "public_url";
  sourceImportJobId: string;
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
  sourceImportJobId: string;
  sourceKind: "owned_oauth" | "public_url";
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
  loadSourceObservation(input: {
    workspaceId: string;
    rawCommentId: string;
    sourceImportJobId: string;
  }): Promise<{
    sourceKind: "owned_oauth" | "public_url";
    sourceImportJobId: string;
  }>;
  loadTarget(input: {
    workspaceId: string;
    rawCommentId: string;
    sourceImportJobId: string;
  }): Promise<ModerationTarget>;
  createRequestWithEvidence(input: {
    workspaceId: string;
    rawCommentId: string;
    sourceImportJobId: string;
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
    /** 이 요청이 실제로 태운 YouTube 할당량. 실패해도 나간 것은 나간 것이다. */
    quotaUnitsUsed: number;
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
  }): Promise<{ status: number; quotaUnitsUsed: number }>;
  deleteComment(input: {
    youtubeCommentId: string;
    tokens: {
      accessToken: string;
      refreshToken: string | null;
      expiresAt: string | null;
      connectionId: string;
      connectionUpdatedAt: string;
    };
  }): Promise<{ status: number; quotaUnitsUsed: number }>;
}

/**
 * 이 조치가 태우는 유닛.
 *
 * 보류·승인·거절은 모두 같은 `setModerationStatus` 호출이라 값이 같다.
 */
const unitsForAction = (action: string) =>
  action === "delete"
    ? YOUTUBE_QUOTA_UNITS.deleteComment
    : YOUTUBE_QUOTA_UNITS.setModerationStatus;

export class PublicSourceReadOnlyError extends Error {
  readonly code = "PUBLIC_SOURCE_READ_ONLY";

  constructor() {
    super("Public-source comments are read-only");
  }
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
    sourceImportJobId: string;
    action: ModerationAction;
    actorUserId: string;
  }) {
    const observation = await repository.loadSourceObservation({
      workspaceId: input.workspaceId,
      rawCommentId: input.rawCommentId,
      sourceImportJobId: input.sourceImportJobId,
    });
    if (observation.sourceImportJobId !== input.sourceImportJobId) {
      throw new Error("SOURCE_OBSERVATION_MISMATCH");
    }
    if (observation.sourceKind === "public_url") {
      throw new PublicSourceReadOnlyError();
    }

    const target = await repository.loadTarget({
      workspaceId: input.workspaceId,
      rawCommentId: input.rawCommentId,
      sourceImportJobId: input.sourceImportJobId,
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
    if (request.sourceKind === "public_url") {
      throw new PublicSourceReadOnlyError();
    }
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
        // 이미 끝난 요청을 그대로 돌려주는 길이다. 유닛은 그때 기록됐다.
        quotaUnitsUsed: 0,
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
          quotaUnitsUsed: 0,
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

    let providerResult: { status: number; quotaUnitsUsed: number };
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
      const reconnectRequired = isYouTubeOAuthReconnectRequiredError(error);
      const hasDefiniteClientResponse =
        providerStatus !== null &&
        providerStatus >= 400 &&
        providerStatus < 500;
      const errorCode = reconnectRequired
        ? "youtube_oauth_reconnect_required"
        : hasDefiniteClientResponse
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
        // 실패해도 요청이 구글에 닿았으면 유닛은 나갔다. 예산은 넉넉히 잡는 쪽이 안전하다.
        quotaUnitsUsed: reconnectRequired ? 0 : unitsForAction(request.action),
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
      quotaUnitsUsed: providerResult.quotaUnitsUsed,
    });
  },
});
