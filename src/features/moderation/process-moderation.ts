import "server-only";

import type { Json } from "@/types/database";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";
import { decryptToken, encryptToken } from "@/features/youtube/token-crypto";

import type {
  ActionResult,
  ModerationAction,
  ModerationRequestState,
} from "./contracts";
import {
  createModerationService,
  type ModerationRepository,
  type YouTubeModerationProvider,
} from "./moderation-service";

const asRecord = (value: Json | null): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value
    : {};

const getProviderStatus = (value: Json | null) => {
  const status = asRecord(value).status;
  return typeof status === "number" ? status : null;
};

const createModerationDependencies = (workspaceId: string) => {
  const environment = getServerEnv();
  const admin = createAdminSupabaseClient();
  const encryptionKey = Buffer.from(
    environment.YOUTUBE_TOKEN_ENCRYPTION_KEY,
    "base64",
  );

  const repository: ModerationRepository = {
    async loadTarget(input) {
      const [
        { data: rawComment, error: rawError },
        { data: analysis, error: analysisError },
        { data: connection, error: connectionError },
        { data: selectedChannel, error: channelError },
      ] = await Promise.all([
        admin
          .from("raw_comments")
          .select(
            "id, youtube_comment_id, author_channel_id, text_display, text_original, source_moderation_status, published_at, updated_at, captured_at, source_deleted_at",
          )
          .eq("workspace_id", input.workspaceId)
          .eq("id", input.rawCommentId)
          .maybeSingle(),
        admin
          .from("current_comment_analyses")
          .select(
            "id, category, review_level, confidence, recommended_action, explanation, provenance, created_at",
          )
          .eq("workspace_id", input.workspaceId)
          .eq("raw_comment_id", input.rawCommentId)
          .maybeSingle(),
        admin
          .from("youtube_connections")
          .select("id, status, granted_scopes, updated_at")
          .eq("workspace_id", input.workspaceId)
          .maybeSingle(),
        admin
          .from("youtube_channel_candidates")
          .select("connection_id, youtube_channel_id")
          .eq("workspace_id", input.workspaceId)
          .eq("selected", true)
          .maybeSingle(),
      ]);

      if (
        rawError ||
        analysisError ||
        connectionError ||
        channelError ||
        !rawComment ||
        rawComment.source_deleted_at ||
        !connection ||
        connection.status !== "connected" ||
        !selectedChannel ||
        selectedChannel.connection_id !== connection.id
      ) {
        throw (
          rawError ??
          analysisError ??
          connectionError ??
          channelError ??
          new Error("Moderation target is unavailable")
        );
      }

      return {
        youtubeCommentId: rawComment.youtube_comment_id,
        connectionId: connection.id,
        connectionUpdatedAt: connection.updated_at,
        authorChannelId: rawComment.author_channel_id,
        selectedChannelId: selectedChannel.youtube_channel_id,
        grantedScopes: connection.granted_scopes,
        sourceSnapshot: {
          youtubeCommentId: rawComment.youtube_comment_id,
          authorChannelId: rawComment.author_channel_id,
          textDisplay: rawComment.text_display,
          textOriginal: rawComment.text_original,
          moderationStatus: rawComment.source_moderation_status,
          publishedAt: rawComment.published_at,
          updatedAt: rawComment.updated_at,
          capturedAt: rawComment.captured_at,
        },
        analysisSnapshot: analysis
          ? {
              analysisId: analysis.id,
              category: analysis.category,
              reviewLevel: analysis.review_level,
              confidence: analysis.confidence,
              recommendedAction: analysis.recommended_action,
              explanation: analysis.explanation,
              provenance: analysis.provenance,
              createdAt: analysis.created_at,
            }
          : { analysisId: null },
      };
    },
    async createRequestWithEvidence(input) {
      const { data, error } = await admin
        .rpc("create_moderation_request_with_evidence", {
          target_workspace_id: input.workspaceId,
          target_raw_comment_id: input.rawCommentId,
          target_requested_by: input.actorUserId,
          target_action: input.action,
          target_state: input.state,
          target_idempotency_key: input.idempotencyKey,
          target_evidence: input.evidence as Json,
          target_connection_id: input.connectionId,
          target_connection_updated_at: input.connectionUpdatedAt,
          target_channel_id: input.selectedChannelId,
        })
        .single();
      if (error || !data) {
        throw error ?? new Error("Moderation request was not stored");
      }
      return {
        requestId: data.request_id,
        state: data.request_state as
          | "pending_confirmation"
          | "awaiting_scope",
      };
    },
    async loadRequest(input) {
      const { data: request, error: requestError } = await admin
        .from("moderation_action_requests")
        .select(
          "id, workspace_id, raw_comment_id, requested_by, action, state, executed_at, provider_result, error_code, youtube_connection_id, youtube_channel_id, connection_updated_at",
        )
        .eq("id", input.requestId)
        .eq("workspace_id", input.workspaceId)
        .eq("requested_by", input.actorUserId)
        .maybeSingle();
      if (requestError || !request) {
        throw requestError ?? new Error("Moderation request not found");
      }

      const state = request.state as ModerationRequestState;
      const isFinal = state === "succeeded" || state === "failed";
      const { data: rawComment, error: rawError } = await admin
        .from("raw_comments")
        .select("youtube_comment_id, author_channel_id")
        .eq("workspace_id", input.workspaceId)
        .eq("id", request.raw_comment_id)
        .maybeSingle();
      if (rawError || !rawComment) {
        throw rawError ?? new Error("Moderation source was not found");
      }

      if (isFinal) {
        return {
          requestId: request.id,
          workspaceId: request.workspace_id,
          rawCommentId: request.raw_comment_id,
          youtubeCommentId: rawComment.youtube_comment_id,
          requestedBy: request.requested_by,
          action: request.action as ModerationAction,
          state,
          grantedScopes: [],
          accessToken: "",
          refreshToken: null,
          expiresAt: null,
          connectionId: request.youtube_connection_id ?? "",
          connectionUpdatedAt: request.connection_updated_at ?? "",
          bindingValid: true,
          deleteEligible: true,
          result: {
            requestId: request.id,
            state,
            providerStatus: getProviderStatus(request.provider_result),
            executedAt: request.executed_at,
            errorCode: request.error_code,
          },
        };
      }

      const [
        { data: connection, error: connectionError },
        { data: selectedChannel, error: channelError },
      ] = await Promise.all([
        admin
          .from("youtube_connections")
          .select(
            "id, status, encrypted_access_token, encrypted_refresh_token, token_expires_at, granted_scopes, updated_at",
          )
          .eq("workspace_id", input.workspaceId)
          .maybeSingle(),
        admin
          .from("youtube_channel_candidates")
          .select("connection_id, youtube_channel_id")
          .eq("workspace_id", input.workspaceId)
          .eq("selected", true)
          .maybeSingle(),
      ]);
      if (
        connectionError ||
        channelError ||
        !connection?.encrypted_access_token ||
        connection.status !== "connected" ||
        !selectedChannel
      ) {
        throw (
          connectionError ??
          channelError ??
          new Error("YouTube moderation connection unavailable")
        );
      }

      const bindingValid =
        request.youtube_connection_id !== null &&
        request.youtube_channel_id !== null &&
        request.connection_updated_at !== null &&
        connection.id === request.youtube_connection_id &&
        connection.updated_at === request.connection_updated_at &&
        selectedChannel.connection_id === connection.id &&
        selectedChannel.youtube_channel_id === request.youtube_channel_id;

      return {
        requestId: request.id,
        workspaceId: request.workspace_id,
        rawCommentId: request.raw_comment_id,
        youtubeCommentId: rawComment.youtube_comment_id,
        requestedBy: request.requested_by,
        action: request.action as ModerationAction,
        state,
        grantedScopes: connection.granted_scopes,
        accessToken: decryptToken(
          connection.encrypted_access_token,
          encryptionKey,
        ),
        refreshToken: connection.encrypted_refresh_token
          ? decryptToken(connection.encrypted_refresh_token, encryptionKey)
          : null,
        expiresAt: connection.token_expires_at,
        connectionId: connection.id,
        connectionUpdatedAt: connection.updated_at,
        bindingValid,
        deleteEligible:
          bindingValid &&
          rawComment.author_channel_id === selectedChannel.youtube_channel_id,
        result: null,
      };
    },
    async claimRequest(input) {
      const { data, error } = await admin.rpc("claim_moderation_request", {
        target_workspace_id: input.workspaceId,
        target_request_id: input.requestId,
        target_actor_user_id: input.actorUserId,
        target_confirmed_at: input.confirmedAt,
      });
      if (error) throw error;
      return data;
    },
    async completeRequest(input) {
      const { data, error } = await admin.rpc(
        "complete_moderation_request",
        {
          target_workspace_id: input.workspaceId,
          target_request_id: input.requestId,
          target_actor_user_id: input.actorUserId,
          target_state: input.state,
          target_provider_status: input.providerStatus as number,
          target_executed_at: input.executedAt,
          target_error_code: input.errorCode as string,
        },
      );
      if (error || !data) {
        throw error ?? new Error("Moderation request was not completed");
      }
      return {
        requestId: input.requestId,
        state: input.state,
        providerStatus: input.providerStatus,
        executedAt: input.executedAt,
        errorCode: input.errorCode,
      };
    },
    async reconcileStaleRequest(input) {
      const { data, error } = await admin.rpc(
        "reconcile_stale_moderation_request",
        {
          target_workspace_id: input.workspaceId,
          target_request_id: input.requestId,
          target_actor_user_id: input.actorUserId,
          target_stale_before: input.staleBefore,
          target_reconciled_at: input.reconciledAt,
        },
      );
      if (error) throw error;
      if (!data) return null;

      return {
        requestId: input.requestId,
        state: "failed",
        providerStatus: null,
        executedAt: input.reconciledAt,
        errorCode: "provider_result_unknown",
      };
    },
  };

  const provider = createYouTubeProvider({
    async onTokenRefresh(refreshed, refreshContext) {
      if (!refreshContext) {
        return;
      }

      const update: {
        encrypted_access_token?: string;
        encrypted_refresh_token?: string;
        token_expires_at?: string | null;
        updated_at: string;
      } = { updated_at: new Date().toISOString() };

      if (refreshed.accessToken) {
        update.encrypted_access_token = encryptToken(
          refreshed.accessToken,
          encryptionKey,
        );
      }
      if (refreshed.refreshToken) {
        update.encrypted_refresh_token = encryptToken(
          refreshed.refreshToken,
          encryptionKey,
        );
      }
      if (refreshed.expiresAt !== null) {
        update.token_expires_at = refreshed.expiresAt;
      }

      const { data, error } = await admin
        .from("youtube_connections")
        .update(update)
        .eq("id", refreshContext.connectionId)
        .eq("workspace_id", workspaceId)
        .eq("status", "connected")
        .eq("updated_at", refreshContext.connectionUpdatedAt)
        .select("id")
        .maybeSingle();
      if (error || !data) {
        throw (
          error ??
          new Error("Refreshed moderation token binding is no longer valid")
        );
      }
    },
  });

  return {
    provider: provider as YouTubeModerationProvider,
    repository,
  };
};

export const requestYouTubeModeration = async (input: {
  workspaceId: string;
  rawCommentId: string;
  action: ModerationAction;
  actorUserId: string;
}) =>
  createModerationService(
    createModerationDependencies(input.workspaceId),
  ).requestModeration(input);

export const confirmYouTubeModeration = async (input: {
  workspaceId: string;
  requestId: string;
  actorUserId: string;
  confirmation: "I_UNDERSTAND";
}): Promise<ActionResult> =>
  createModerationService(
    createModerationDependencies(input.workspaceId),
  ).confirmModeration(input);
