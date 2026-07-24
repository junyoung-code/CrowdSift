import { NextResponse } from "next/server";

import { requireViewer } from "@/features/auth/require-viewer";
import { completeModerationOAuth } from "@/features/moderation/moderation-oauth";
import { consumeOAuthState } from "@/features/youtube/oauth-state-cookie";
import { createYouTubeProvider } from "@/features/youtube/provider-factory";
import { encryptToken } from "@/features/youtube/token-crypto";
import { getServerEnv } from "@/lib/env";
import { createAdminSupabaseClient } from "@/lib/supabase/admin";

const getEncryptionKey = (encodedKey: string) =>
  Buffer.from(encodedKey, "base64");

const errorRedirect = (origin: string, reason: string) =>
  NextResponse.redirect(
    new URL(`/app/connect/youtube?error=${encodeURIComponent(reason)}`, origin),
  );

const moderationErrorRedirect = (origin: string, reason: string) =>
  NextResponse.redirect(
    new URL(`/app/inbox?moderationError=${encodeURIComponent(reason)}`, origin),
  );

export const GET = async (request: Request) => {
  const environment = getServerEnv();
  const requestUrl = new URL(request.url);
  const appOrigin = new URL(environment.APP_ORIGIN).origin;
  const configuredCallback = new URL(environment.GOOGLE_REDIRECT_URI);

  if (
    requestUrl.origin !== appOrigin ||
    configuredCallback.origin !== appOrigin ||
    requestUrl.pathname !== configuredCallback.pathname
  ) {
    return errorRedirect(environment.APP_ORIGIN, "invalid_callback");
  }

  const code = requestUrl.searchParams.get("code");
  const state = requestUrl.searchParams.get("state");

  if (!code || !state) {
    return errorRedirect(environment.APP_ORIGIN, "missing_code");
  }

  let statePayload: Awaited<ReturnType<typeof consumeOAuthState>>;
  try {
    statePayload = await consumeOAuthState(state);
    if (
      statePayload.purpose === "moderation" &&
      !statePayload.actionRequestId
    ) {
      return moderationErrorRedirect(
        environment.APP_ORIGIN,
        "invalid_state",
      );
    }
  } catch {
    return errorRedirect(environment.APP_ORIGIN, "invalid_state");
  }

  const { userId, workspaceId } = await requireViewer();
  const admin = createAdminSupabaseClient();
  const encryptionKey = getEncryptionKey(
    environment.YOUTUBE_TOKEN_ENCRYPTION_KEY,
  );

  const persistRefreshedTokens = async (tokens: {
    accessToken: string | null;
    refreshToken: string | null;
    expiresAt: string | null;
  }) => {
    const updates: {
      encrypted_access_token?: string;
      encrypted_refresh_token?: string;
      token_expires_at?: string | null;
      updated_at: string;
    } = {
      updated_at: new Date().toISOString(),
    };

    if (tokens.accessToken) {
      updates.encrypted_access_token = encryptToken(
        tokens.accessToken,
        encryptionKey,
      );
    }
    if (tokens.refreshToken) {
      updates.encrypted_refresh_token = encryptToken(
        tokens.refreshToken,
        encryptionKey,
      );
    }
    if (tokens.expiresAt !== null) {
      updates.token_expires_at = tokens.expiresAt;
    }

    const { error } = await admin
      .from("youtube_connections")
      .update(updates)
      .eq("workspace_id", workspaceId);

    if (error) {
      throw new Error("Refreshed Google tokens could not be stored");
    }
  };

  try {
    const provider = createYouTubeProvider({
      onTokenRefresh: persistRefreshedTokens,
    });

    if (
      statePayload.purpose === "moderation" &&
      statePayload.actionRequestId
    ) {
      const actionRequestId = statePayload.actionRequestId;
      await completeModerationOAuth(
        {
          workspaceId,
          actorUserId: userId,
          requestId: actionRequestId,
          code,
        },
        {
          provider,
          repository: {
            async loadAwaitingRequest(input) {
              const { data: actionRequest, error } = await admin
                .from("moderation_action_requests")
                .select(
                  "id, youtube_connection_id, youtube_channel_id, connection_updated_at",
                )
                .eq("id", input.requestId)
                .eq("workspace_id", input.workspaceId)
                .eq("requested_by", input.actorUserId)
                .eq("state", "awaiting_scope")
                .maybeSingle();
              if (error) throw error;
              if (
                !actionRequest?.youtube_connection_id ||
                !actionRequest.youtube_channel_id ||
                !actionRequest.connection_updated_at
              ) {
                return null;
              }

              const [
                { data: connection, error: connectionError },
                { data: selectedChannel, error: channelError },
              ] = await Promise.all([
                admin
                  .from("youtube_connections")
                  .select("id, updated_at")
                  .eq("id", actionRequest.youtube_connection_id)
                  .eq("workspace_id", input.workspaceId)
                  .eq("status", "connected")
                  .eq(
                    "updated_at",
                    actionRequest.connection_updated_at,
                  )
                  .maybeSingle(),
                admin
                  .from("youtube_channel_candidates")
                  .select("connection_id, youtube_channel_id")
                  .eq("connection_id", actionRequest.youtube_connection_id)
                  .eq("workspace_id", input.workspaceId)
                  .eq(
                    "youtube_channel_id",
                    actionRequest.youtube_channel_id,
                  )
                  .eq("selected", true)
                  .maybeSingle(),
              ]);

              if (
                connectionError ||
                channelError ||
                !connection ||
                !selectedChannel
              ) {
                return null;
              }

              return {
                connectionId: connection.id,
                connectionUpdatedAt: connection.updated_at,
                selectedChannelId: selectedChannel.youtube_channel_id,
              };
            },
            async completeGrant({
              actorUserId: targetActorUserId,
              expectedBinding,
              requestId: targetRequestId,
              tokens,
              workspaceId: targetWorkspaceId,
            }) {
              const { data: existingConnection, error: existingError } =
                await admin
                  .from("youtube_connections")
                  .select(
                    "id, encrypted_refresh_token, granted_scopes, google_subject, updated_at",
                  )
                  .eq("id", expectedBinding.connectionId)
                  .eq("workspace_id", targetWorkspaceId)
                  .eq("status", "connected")
                  .eq(
                    "updated_at",
                    expectedBinding.connectionUpdatedAt,
                  )
                  .maybeSingle();

              if (existingError || !existingConnection) {
                throw (
                  existingError ??
                  new Error("Existing YouTube connection was not found")
                );
              }

              const grantedScopes = Array.from(
                new Set([
                  ...existingConnection.granted_scopes,
                  ...tokens.grantedScopes,
                ]),
              );
              const updatedAt = new Date().toISOString();
              const { data, error: updateError } = await admin.rpc(
                "complete_moderation_scope_grant",
                {
                  target_workspace_id: targetWorkspaceId,
                  target_request_id: targetRequestId,
                  target_actor_user_id: targetActorUserId,
                  target_connection_id: expectedBinding.connectionId,
                  target_channel_id: expectedBinding.selectedChannelId,
                  target_expected_updated_at:
                    expectedBinding.connectionUpdatedAt,
                  target_new_updated_at: updatedAt,
                  target_encrypted_access_token: encryptToken(
                    tokens.accessToken,
                    encryptionKey,
                  ),
                  target_encrypted_refresh_token: (tokens.refreshToken
                    ? encryptToken(tokens.refreshToken, encryptionKey)
                    : existingConnection.encrypted_refresh_token) as string,
                  target_token_expires_at: tokens.expiresAt as string,
                  target_granted_scopes: grantedScopes,
                  target_google_subject: (tokens.googleSubject ??
                    existingConnection.google_subject) as string,
                },
              );

              if (updateError || !data) {
                throw (
                  updateError ??
                  new Error("YouTube moderation grant could not be stored")
                );
              }

              return true;
            },
          },
        },
      );

      return NextResponse.redirect(
        new URL(
          `/app/inbox?moderation=${encodeURIComponent(actionRequestId)}&scope=connected`,
          environment.APP_ORIGIN,
        ),
      );
    }

    const tokens = await provider.exchangeCode(code);
    const { data: existingConnection, error: existingError } = await admin
      .from("youtube_connections")
      .select("encrypted_refresh_token")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (existingError) {
      throw new Error("Existing YouTube connection could not be loaded");
    }

    const { data: connection, error: connectionError } = await admin
      .from("youtube_connections")
      .upsert(
        {
          workspace_id: workspaceId,
          status: "pending_channel_selection",
          encrypted_access_token: encryptToken(
            tokens.accessToken,
            encryptionKey,
          ),
          encrypted_refresh_token: tokens.refreshToken
            ? encryptToken(tokens.refreshToken, encryptionKey)
            : (existingConnection?.encrypted_refresh_token ?? null),
          token_expires_at: tokens.expiresAt,
          granted_scopes: tokens.grantedScopes,
          google_subject: tokens.googleSubject,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" },
      )
      .select("id")
      .single();

    if (connectionError) {
      throw new Error("YouTube connection could not be stored");
    }

    const channels = await provider.listOwnedChannels(tokens);
    const { error: deleteCandidatesError } = await admin
      .from("youtube_channel_candidates")
      .delete()
      .eq("workspace_id", workspaceId);

    if (deleteCandidatesError) {
      throw new Error("Old YouTube channel candidates could not be cleared");
    }

    if (channels.length > 0) {
      const { error: candidateError } = await admin
        .from("youtube_channel_candidates")
        .insert(
          channels.map((channel) => ({
            connection_id: connection.id,
            workspace_id: workspaceId,
            youtube_channel_id: channel.id,
            title: channel.title,
            handle: channel.handle,
            thumbnail_url: channel.thumbnailUrl,
            selected: channels.length === 1,
          })),
        );

      if (candidateError) {
        throw new Error("YouTube channel candidates could not be stored");
      }
    }

    const status =
      channels.length === 0
        ? "error"
        : channels.length === 1
          ? "connected"
          : "pending_channel_selection";
    const { error: statusError } = await admin
      .from("youtube_connections")
      .update({
        status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", connection.id);

    if (statusError) {
      throw new Error("YouTube connection status could not be updated");
    }

    return NextResponse.redirect(
      new URL("/app/connect/youtube?connected=1", environment.APP_ORIGIN),
    );
  } catch {
    if (statePayload.purpose === "read") {
      await admin
        .from("youtube_connections")
        .update({ status: "error", updated_at: new Date().toISOString() })
        .eq("workspace_id", workspaceId);

      return errorRedirect(environment.APP_ORIGIN, "oauth_failed");
    }

    return moderationErrorRedirect(
      environment.APP_ORIGIN,
      "scope_connection_failed",
    );
  }
};
